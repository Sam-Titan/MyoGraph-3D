"""`make train`: 5x3 CV on train, final fit, one hold-out evaluation, write all artifacts.

Deterministic: fixed seeds, single-threaded XGBoost, no wall-clock values in metrics.json.
"""

import hashlib
import json
import logging
import subprocess
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import RepeatedStratifiedKFold

from app.core.config import ARTIFACTS_DIR, REPO_ROOT
from ml.evaluate import METRICS, calibration_bins, confusion, roc_points, score, summarize
from ml.explain import global_importance
from ml.models import Calibration, create_model
from ml.models.xgb import DEFAULT_PARAMS
from ml.preprocess import RAW_CSV, load_raw, raw_targets, raw_to_matrix
from ml.presets import build_presets
from ml.schema import FeatureSchema, load_schema
from ml.split import SEED, load_split

log = logging.getLogger(__name__)

MODEL_NAME = "xgb"
N_SPLITS, N_REPEATS = 5, 3
MODELS_DIR = ARTIFACTS_DIR / "models"


def _round(obj: Any, nd: int = 6) -> Any:
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, dict):
        return {k: _round(v, nd) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round(v, nd) for v in obj]
    return obj


def _write_json(name: str, data: Any) -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS_DIR / name).write_text(json.dumps(_round(data), indent=2, sort_keys=True) + "\n")


def cross_validate(X: pd.DataFrame, y: np.ndarray) -> tuple[list[dict[str, float]], np.ndarray]:
    """Repeated stratified CV on the train set. Returns per-fold scores and OOF probabilities
    (averaged over repeats)."""
    cv = RepeatedStratifiedKFold(n_splits=N_SPLITS, n_repeats=N_REPEATS, random_state=SEED)
    folds: list[dict[str, float]] = []
    oof = np.zeros(len(y))
    for tr, va in cv.split(X, y):
        model = create_model(MODEL_NAME)
        model.fit(X.iloc[tr], y[tr])
        p = model.predict_proba(X.iloc[va])
        folds.append(score(y[va], p))
        oof[va] += p / N_REPEATS
    return folds, oof


def _table(schema: FeatureSchema, metrics: dict[str, Any]) -> str:
    lines: list[str] = []
    for t, m in metrics["targets"].items():
        prev = m["prevalence"]
        lines.append(
            f"{t} ({schema.targets[t].label})  prevalence train {prev['train']:.2f} / "
            f"test {prev['test']:.2f}"
        )
        lines.append(f"  {'metric':<10}{'CV mean ± std (5x3, train)':<30}hold-out")
        for k in METRICS:
            cv = m["cv"][k]
            lines.append(f"  {k:<10}{cv['mean']:.3f} ± {cv['std']:.3f}{'':<17}{m['test'][k]:.3f}")
    return "\n".join(lines)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    schema = load_schema()
    df = load_raw(schema=schema)
    split = load_split()
    if split.n_train + split.n_test != len(df):
        raise SystemExit("split.json does not match the dataset; run `make prepare`")

    X_all = raw_to_matrix(df, schema)
    Y_all = raw_targets(df, schema)
    X_train = X_all.iloc[split.train_idx].reset_index(drop=True)
    X_test = X_all.iloc[split.test_idx].reset_index(drop=True)
    Y_train = Y_all.iloc[split.train_idx].reset_index(drop=True)
    Y_test = Y_all.iloc[split.test_idx].reset_index(drop=True)

    target_metrics: dict[str, Any] = {}
    importance: dict[str, Any] = {}
    calibration: dict[str, dict[str, float]] = {}
    scale_pos_weight: dict[str, float] = {}
    test_probs: dict[str, np.ndarray] = {}

    for t in schema.targets:
        y_tr, y_te = Y_train[t].to_numpy(), Y_test[t].to_numpy()
        log.info("%s: cross-validating (%dx%d)", t, N_SPLITS, N_REPEATS)
        folds, oof = cross_validate(X_train, y_tr)

        model = create_model(MODEL_NAME)
        model.fit(X_train, y_tr)
        cal = model.calibration
        assert isinstance(cal, Calibration)
        p_te = model.predict_proba(X_test)
        model.save(MODELS_DIR / f"{t}.ubj")

        test_probs[t] = p_te
        calibration[t] = {"a": cal.a, "b": cal.b}
        scale_pos_weight[t] = model.params_used["scale_pos_weight"]
        importance[t] = global_importance(model.explain(X_train), schema)
        target_metrics[t] = {
            "label": schema.targets[t].label,
            "role": schema.targets[t].role,
            "prevalence": {"train": float(y_tr.mean()), "test": float(y_te.mean())},
            "cv": summarize(folds),
            "test": score(y_te, p_te),
            "roc_test": roc_points(y_te, p_te),
            "confusion_test": confusion(y_te, p_te),
            "calibration_bins": calibration_bins(y_tr, oof),
        }

    metrics = {
        "split": {
            "seed": split.seed,
            "test_size": split.test_size,
            "n_train": split.n_train,
            "n_test": split.n_test,
            "stratify_on": split.stratify_on,
        },
        "cv": {"n_splits": N_SPLITS, "n_repeats": N_REPEATS, "seed": SEED},
        "threshold": 0.5,
        "targets": target_metrics,
        "feature_importance": importance,
    }
    _write_json("metrics.json", metrics)
    _write_json("calibration.json", calibration)
    _write_json(
        "params.json",
        {"model": MODEL_NAME, "params": DEFAULT_PARAMS, "scale_pos_weight": scale_pos_weight},
    )
    presets = build_presets(df.iloc[split.test_idx], test_probs, schema)
    _write_json("presets.json", presets)
    data_sha = hashlib.sha256(RAW_CSV.read_bytes()).hexdigest()
    _write_json(
        "model_card.json",
        {
            "model_version": f"{MODEL_NAME}-v1-{data_sha[:8]}",
            "git_sha": _git_sha(),
            "data_sha256": data_sha,
            "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "seed": SEED,
        },
    )
    log.info("\n%s", _table(schema, metrics))
    log.info("presets: %s", ", ".join(p["id"] for p in presets))
    log.info("artifacts -> %s", ARTIFACTS_DIR)


def _git_sha() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True
        )
        return out.stdout.strip()
    except OSError, subprocess.CalledProcessError:
        return "unknown"


if __name__ == "__main__":
    main()
