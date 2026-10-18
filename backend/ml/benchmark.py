"""`make benchmark`: same-protocol model comparison and feature-group ablation (Phase 17.5).

Every model/feature-set combination gets the identical split, 5x3 repeated stratified CV on the
train patients, Platt calibration on out-of-fold scores and Youden threshold (inside each
model's `fit`).
Hold-out numbers are reported only; nothing is chosen or ranked by them. Output is deterministic:
fixed seeds, single-threaded models, no timestamps, results assembled in config order.
"""

import logging
import math
import os
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.model_selection import RepeatedStratifiedKFold

from ml.benchmark_config import BenchmarkConfig, dropped_columns, kept_columns
from ml.evaluate import score
from ml.models import baselines as bl
from ml.models import create_model
from ml.preprocess import load_raw, raw_targets, raw_to_matrix
from ml.schema import FeatureSchema, load_schema
from ml.split import SEED, load_split

log = logging.getLogger(__name__)

N_SPLITS, N_REPEATS = 5, 3
METRICS = ("roc_auc", "brier", "recall")  # recall is at each fold's own tuned threshold
TABPFN_NOTE = (
    "Optional and offline only. TabPFN needs PyTorch, which is never installed in the API image. "
    "Check the licence of the pretrained weights before using or redistributing results."
)

Factory = Callable[[], Any]
FACTORIES: dict[str, Factory] = {
    "logreg": bl.logreg,
    "rf": bl.random_forest,
    "xgb": lambda: create_model("xgb"),
    "tabpfn": bl.tabpfn,
}


# --- statistics ---------------------------------------------------------------------------------
def corrected_paired_test(
    diffs: np.ndarray, n_fit: float, n_val: float, level: float
) -> dict[str, float | bool]:
    """Nadeau-Bengio corrected resampled t-test on paired per-fold differences.

    The folds overlap, so the plain variance is too small; the correction multiplies it by
    1/k + n_val/n_fit (k = number of folds). "Within the noise" means the CI contains 0.
    """
    k = len(diffs)
    mean, var = float(np.mean(diffs)), float(np.var(diffs, ddof=1))
    se = math.sqrt((1 / k + n_val / n_fit) * var)
    df = k - 1
    if se == 0:
        return {
            "mean_diff": mean,
            "std_diff": 0.0,
            "ci_lo": mean,
            "ci_hi": mean,
            "p": 1.0 if mean == 0 else 0.0,
            "within_noise": mean == 0,
        }
    half = float(stats.t.ppf(0.5 + level / 2, df)) * se
    p = float(2 * stats.t.sf(abs(mean / se), df))
    return {
        "mean_diff": mean,
        "std_diff": math.sqrt(var),
        "ci_lo": mean - half,
        "ci_hi": mean + half,
        "p": p,
        "within_noise": bool(mean - half <= 0 <= mean + half),
    }


def holm_adjust(p: list[float]) -> list[float]:
    """Holm-Bonferroni adjusted p-values, returned in the input order."""
    m = len(p)
    order = sorted(range(m), key=lambda i: p[i])
    adj = [0.0] * m
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p[i]))
        adj[i] = running
    return adj


def apply_holm(cells: list[dict[str, Any]], level: float) -> None:
    """Add `p_adj` and `clear` to every paired test; one Holm family per metric.

    "Clear" needs the adjusted p below 1 - level and the (unadjusted) corrected CI to exclude 0.
    """
    for m in METRICS:
        tests = [c["vs_reference"][m] for c in cells]
        for t, a in zip(tests, holm_adjust([t["p"] for t in tests]), strict=True):
            t["p_adj"] = a
            t["clear"] = bool(a < 1 - level and not t["within_noise"])


# --- one (model, feature set, target) run ---------------------------------------------------------
@dataclass(frozen=True)
class Task:
    model: str
    feature_set: str
    target: str
    columns: tuple[str, ...]


def _summary(values: list[float]) -> dict[str, float]:
    return {"mean": float(np.mean(values)), "std": float(np.std(values, ddof=1))}


def run_cv(
    factory: Factory, X: pd.DataFrame, y: np.ndarray, X_test: pd.DataFrame, y_test: np.ndarray
) -> dict[str, Any]:
    """Per-fold metrics on the train patients, plus one hold-out evaluation of a full-train fit."""
    cv = RepeatedStratifiedKFold(n_splits=N_SPLITS, n_repeats=N_REPEATS, random_state=SEED)
    folds: dict[str, list[float]] = {m: [] for m in METRICS}
    sizes: list[tuple[int, int]] = []
    for tr, va in cv.split(X, y):
        model = factory()
        model.fit(X.iloc[tr], y[tr])
        p = model.predict_proba(X.iloc[va])
        s = score(y[va], p, model.calibration.threshold)
        for m in METRICS:
            folds[m].append(s[m])
        sizes.append((len(tr), len(va)))
    model = factory()
    model.fit(X, y)
    p_te = model.predict_proba(X_test)
    held = score(y_test, p_te, model.calibration.threshold)
    return {
        "folds": folds,
        "n_fit": float(np.mean([a for a, _ in sizes])),
        "n_val": float(np.mean([b for _, b in sizes])),
        "cv": {m: _summary(folds[m]) for m in METRICS},
        "holdout": {m: held[m] for m in METRICS},
    }


_DATA: dict[str, Any] = {}


def _data() -> dict[str, Any]:
    """Train/test matrices and labels, loaded once per process."""
    if not _DATA:
        schema = load_schema()
        df = load_raw(schema=schema)
        split = load_split()
        X, Y = raw_to_matrix(df, schema), raw_targets(df, schema)
        _DATA.update(
            X_tr=X.iloc[split.train_idx].reset_index(drop=True),
            X_te=X.iloc[split.test_idx].reset_index(drop=True),
            Y_tr=Y.iloc[split.train_idx].reset_index(drop=True),
            Y_te=Y.iloc[split.test_idx].reset_index(drop=True),
        )
    return _DATA


def run_task(task: Task) -> dict[str, Any]:
    d = _data()
    cols = list(task.columns)
    return run_cv(
        FACTORIES[task.model],
        d["X_tr"][cols],
        d["Y_tr"][task.target].to_numpy(),
        d["X_te"][cols],
        d["Y_te"][task.target].to_numpy(),
    )


# --- assembling the report ------------------------------------------------------------------------
def _cell(res: dict[str, Any], ref: dict[str, Any], level: float) -> dict[str, Any]:
    out: dict[str, Any] = {
        "cv": res["cv"],
        "holdout": res["holdout"],
        "vs_reference": {},
    }
    for m in METRICS:
        diffs = np.array(res["folds"][m]) - np.array(ref["folds"][m])
        out["vs_reference"][m] = corrected_paired_test(diffs, res["n_fit"], res["n_val"], level)
    return out


def plan_tasks(cfg: BenchmarkConfig, schema: FeatureSchema, skip: set[str]) -> list[Task]:
    """Models on the baseline feature set, then the reference model on every other set."""
    base = cfg.feature_sets[0]
    tasks: list[Task] = []
    for t in schema.targets:
        cols = tuple(kept_columns(schema, base.drop_groups))
        tasks += [Task(m.id, base.id, t, cols) for m in cfg.models if m.id not in skip]
        for s in cfg.feature_sets[1:]:
            cols = tuple(kept_columns(schema, s.drop_groups))
            tasks.append(Task(cfg.reference_model, s.id, t, cols))
    return tasks


def run_benchmark(
    cfg: BenchmarkConfig, schema: FeatureSchema | None = None, workers: int | None = None
) -> dict[str, Any]:
    schema = schema or load_schema()
    cfg.check_groups(schema)
    skipped = {
        m.id: "the package is not installed (offline-only model)."
        for m in cfg.models
        if m.id == "tabpfn" and not bl.tabpfn_available()
    }
    bad = [m.id for m in cfg.models if m.id not in FACTORIES]
    if bad:
        raise ValueError(f"no factory for models {bad}")
    tasks = plan_tasks(cfg, schema, set(skipped))
    workers = workers or min(os.cpu_count() or 1, len(tasks))
    log.info("%d runs on %d workers", len(tasks), workers)
    if workers > 1:
        with ProcessPoolExecutor(workers) as ex:
            results = list(ex.map(run_task, tasks))  # map keeps task order: deterministic
    else:
        results = [run_task(t) for t in tasks]
    by_key = {(t.model, t.feature_set, t.target): r for t, r in zip(tasks, results, strict=True)}

    base, ref = cfg.feature_sets[0], cfg.reference_model
    level = cfg.confidence_level
    comparison: dict[str, Any] = {}
    ablation: dict[str, Any] = {}
    for t in schema.targets:
        ref_res = by_key[(ref, base.id, t)]
        comparison[t] = {
            m.id: _cell(by_key[(m.id, base.id, t)], ref_res, level)
            for m in cfg.models
            if m.id not in skipped
        }
        ablation[t] = {
            s.id: _cell(by_key[(ref, s.id, t)], ref_res, level) for s in cfg.feature_sets
        }
    # Families: the model comparisons (all targets), and the ablation comparisons (all targets).
    # The reference's own cell is compared with itself (p = 1) and stays out of the family.
    for family, ref_id in ((comparison, ref), (ablation, base.id)):
        cells = [c for t in family.values() for k, c in t.items() if k != ref_id]
        apply_holm(cells, level)
    for family, ref_id in ((comparison, ref), (ablation, base.id)):
        for t in family.values():
            for m in METRICS:
                t[ref_id]["vs_reference"][m].update(p_adj=1.0, clear=False)
    d = _data()
    return {
        "protocol": {
            "seed": SEED,
            "cv": f"{N_SPLITS}x{N_REPEATS} repeated stratified, train patients only",
            "n_folds": N_SPLITS * N_REPEATS,
            "n_train": len(d["X_tr"]),
            "n_test": len(d["X_te"]),
            "calibration": "Platt scaling on out-of-fold scores",
            "threshold": "Youden's J on out-of-fold calibrated probabilities",
            "paired_test": "Nadeau-Bengio corrected resampled t-test",
            "multiplicity": "Holm-Bonferroni within each family (models, ablation), per metric",
            "confidence_level": level,
        },
        "reference_model": ref,
        "models": [
            {
                "id": m.id,
                "label": m.label,
                "status": "skipped" if m.id in skipped else "ok",
                "note": skipped.get(m.id, "") + (" " + TABPFN_NOTE if m.id == "tabpfn" else ""),
            }
            for m in cfg.models
        ],
        "feature_sets": [
            {
                "id": s.id,
                "label": s.label,
                "drop_groups": s.drop_groups,
                "dropped_columns": dropped_columns(schema, s.drop_groups),
                "n_columns": len(kept_columns(schema, s.drop_groups)),
            }
            for s in cfg.feature_sets
        ],
        "comparison": comparison,
        "ablation": ablation,
    }
