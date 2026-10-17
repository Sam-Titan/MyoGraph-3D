"""Loads artifacts once and serves features / presets / predictions / metrics."""

import json
import logging
import math
import threading
import time
from collections import OrderedDict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.core.config import ARTIFACTS_DIR, model_version
from app.schemas import (
    BreakdownRow,
    Contribution,
    FeatureInfo,
    FeaturesResponse,
    GroupInfo,
    InputBoundsInfo,
    InputValue,
    Interval,
    IntervalsResponse,
    MetricsResponse,
    ObservedInfo,
    OptionInfo,
    PredictResponse,
    Preset,
    RangeInfo,
    TargetExplanation,
    TargetInfo,
    TargetPrediction,
    TargetRange,
)
from ml.anatomy import ANATOMY_PATH, load_anatomy
from ml.explain import aggregate_to_inputs
from ml.models import Calibration, model_class
from ml.preprocess import inputs_to_matrix
from ml.schema import (
    BinaryFeature,
    CategoryFeature,
    CompositeFeature,
    DerivedFeature,
    Feature,
    FeatureSchema,
    NumberFeature,
    load_schema,
)
from ml.stats import load_feature_stats
from ml.stories import Stories, load_stories, validate_stories
from ml.uncertainty import ReplicateSet, load_uncertainty, replicate_path, verdict

logger = logging.getLogger(__name__)

MODEL_NAME = "xgb"
INTERVALS_CACHE_SIZE = 256


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def _num(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _read(name: str) -> Any:
    return json.loads((ARTIFACTS_DIR / name).read_text())


def anatomy_nodes(path: Path = ANATOMY_PATH) -> dict[str, str]:
    """Target id -> mesh node name."""
    return {n.target: n.name for n in load_anatomy(path).nodes if n.target}


class Predictor:
    def __init__(self) -> None:
        self.schema: FeatureSchema = load_schema()
        self.stats = load_feature_stats()
        self.version = model_version()
        calibration = _read("calibration.json")
        cls = model_class(MODEL_NAME)
        self.models = {
            t: cls.load(ARTIFACTS_DIR / "models" / f"{t}.ubj", Calibration(**calibration[t]))
            for t in self.schema.targets
        }
        self.uncertainty = load_uncertainty()
        # LRU of interval results keyed by the validated inputs (like the summary cache).
        self._intervals_cache: OrderedDict[str, IntervalsResponse] = OrderedDict()
        self._intervals_lock = threading.Lock()
        self.replicates = {t: ReplicateSet.load(replicate_path(t)) for t in self.schema.targets}
        self.thresholds = {t: float(calibration[t]["threshold"]) for t in self.schema.targets}
        nodes = anatomy_nodes()
        self.nodes = {t: nodes[t] for t in self.schema.targets}
        self.where = {n.target: n.where for n in load_anatomy().nodes if n.target and n.where}
        self.presets = [Preset(**p) for p in _read("presets.json")]
        # Fail fast at startup if a story names a missing preset or target or breaks the rules.
        self.stories: Stories = load_stories()
        validate_stories(self.stories, self.schema, {p.id for p in self.presets})
        self.metrics = MetricsResponse(
            **_read("metrics.json"),
            stability=_read("stability.json"),
            excluded_inputs=list(self.schema.excluded_from_inputs),
        )
        self.features = self._build_features()
        self._by_id = {f.id: f for f in self.schema.features}

    # --- features -----------------------------------------------------------------------------
    def _build_features(self) -> FeaturesResponse:
        s = self.schema
        return FeaturesResponse(
            targets=[
                TargetInfo(
                    id=t,
                    label=v.label,
                    plain_label=v.plain_label or v.label,
                    role=v.role,
                    node=self.nodes[t],
                    where=self.where.get(t),
                )
                for t, v in s.targets.items()
            ],
            groups=[GroupInfo(id=g.id, label=g.label) for g in s.groups],
            features=[self._feature_info(f) for f in s.features],
        )

    def _feature_info(self, f: Feature) -> FeatureInfo:
        st = self.stats.get(f.id, {})
        info = FeatureInfo(
            id=f.id,
            label=f.label,
            group=f.group,
            kind=f.kind,
            unit=f.unit,
            unit_singular=f.unit_singular,
            reference=RangeInfo(low=f.reference.low, high=f.reference.high)
            if f.reference
            else None,
        )
        if isinstance(f, NumberFeature):
            info.input = InputBoundsInfo(min=f.input.min, max=f.input.max, step=f.input.step)
        if isinstance(f, CategoryFeature | CompositeFeature):
            info.options = [OptionInfo(value=o.value, label=o.label) for o in f.options]
        if st.get("kind") == "number":
            info.observed = ObservedInfo(min=st["min"], max=st["max"])
            info.default = st["median"]
        elif "mode" in st:
            info.default = st["mode"]
        return info

    # --- predict ------------------------------------------------------------------------------
    def _display(
        self, f: Feature, values: Mapping[str, InputValue], row: Mapping[str, float]
    ) -> str:
        if isinstance(f, CategoryFeature | CompositeFeature):
            labels = {o.value: o.label for o in f.options}
            return labels.get(str(values[f.id]), str(values[f.id]))
        v = row[f.id]
        if isinstance(f, BinaryFeature) or (isinstance(f, DerivedFeature) and v in (0.0, 1.0)):
            return "Yes" if v else "No"
        if not f.unit:
            return _num(v)
        if f.unit == "%":
            return f"{_num(v)}%"
        return f"{_num(v)} {f.unit_singular if v == 1 and f.unit_singular else f.unit}"

    def predict(self, values: Mapping[str, InputValue]) -> PredictResponse:
        t0 = time.perf_counter()
        X = inputs_to_matrix([values], self.schema)
        row: dict[str, float] = {c: float(X[c].iloc[0]) for c in X.columns}
        targets: dict[str, TargetPrediction] = {}
        explanations: dict[str, TargetExplanation] = {}
        per_target: dict[str, dict[str, float]] = {}
        for t, model in self.models.items():
            expl = model.explain(X)
            ids, agg = aggregate_to_inputs(expl, self.schema)
            logit = float(expl.logit[0])
            prob = _sigmoid(logit)
            targets[t] = TargetPrediction(
                probability=prob, positive=prob >= self.thresholds[t], threshold=self.thresholds[t]
            )
            contribs = {i: float(agg[0, k]) for k, i in enumerate(ids)}
            per_target[t] = contribs
            order = sorted(ids, key=lambda i: (-abs(contribs[i]), i))
            explanations[t] = TargetExplanation(
                base_probability=_sigmoid(float(expl.base[0])),
                base_logit=float(expl.base[0]),
                contributions=[
                    Contribution(
                        id=i,
                        label=self._by_id[i].label,
                        display_value=self._display(self._by_id[i], values, row),
                        logit=contribs[i],
                    )
                    for i in order
                ],
            )
        breakdown, warnings = self._breakdown(row, per_target)
        logger.info("predict took %.1f ms", (time.perf_counter() - t0) * 1000)
        return PredictResponse(
            model_version=self.version,
            targets=targets,
            explanations=explanations,
            breakdown=breakdown,
            warnings=warnings,
        )

    def intervals(self, values: Mapping[str, InputValue]) -> IntervalsResponse:
        """Bootstrap ranges and range verdicts (a separate call: /api/predict keeps its latency).

        Cached per input (LRU); `/api/summary` reuses it, so a summary after the live call is free.
        """
        key = json.dumps(values, sort_keys=True, default=str)
        with self._intervals_lock:
            hit = self._intervals_cache.get(key)
            if hit is not None:
                self._intervals_cache.move_to_end(key)
                return hit
        result = self._compute_intervals(values)
        with self._intervals_lock:
            self._intervals_cache[key] = result
            while len(self._intervals_cache) > INTERVALS_CACHE_SIZE:
                self._intervals_cache.popitem(last=False)
        return result

    def _compute_intervals(self, values: Mapping[str, InputValue]) -> IntervalsResponse:
        t0 = time.perf_counter()
        X = inputs_to_matrix([values], self.schema)
        targets: dict[str, TargetRange] = {}
        for t, rs in self.replicates.items():
            lo, hi = (float(v[0]) for v in rs.interval(X, self.uncertainty.level))
            targets[t] = TargetRange(
                interval=Interval(
                    lo=lo,
                    hi=hi,
                    level=self.uncertainty.level,
                    method=self.uncertainty.method,
                    n_models=len(rs),
                ),
                verdict=verdict(lo, hi, self.thresholds[t]),
            )
        logger.info("intervals took %.1f ms", (time.perf_counter() - t0) * 1000)
        return IntervalsResponse(model_version=self.version, targets=targets)

    def _breakdown(
        self, row: Mapping[str, float], per_target: Mapping[str, Mapping[str, float]]
    ) -> tuple[list[BreakdownRow], list[str]]:
        rows: list[BreakdownRow] = []
        warnings: list[str] = []
        for f in self.schema.features:
            if not isinstance(f, NumberFeature | DerivedFeature | BinaryFeature):
                continue
            v = row[f.id]
            st = self.stats.get(f.id, {})
            outside = st.get("kind") == "number" and not st["min"] <= v <= st["max"]
            if outside:
                warnings.append(
                    f"{f.label} {_num(v)} is outside the training data range "
                    f"({_num(st['min'])}–{_num(st['max'])})"
                )
            status = None
            if f.reference:
                status = (
                    "low" if v < f.reference.low else "high" if v > f.reference.high else "normal"
                )
            rows.append(
                BreakdownRow(
                    id=f.id,
                    label=f.label,
                    group=f.group,
                    kind=f.kind,
                    value=v,
                    unit=f.unit,
                    unit_singular=f.unit_singular,
                    reference=RangeInfo(low=f.reference.low, high=f.reference.high)
                    if f.reference
                    else None,
                    status=status,
                    outside_training_range=bool(outside),
                    contribution={t: c[f.id] for t, c in per_target.items()},
                )
            )
        return rows, warnings
