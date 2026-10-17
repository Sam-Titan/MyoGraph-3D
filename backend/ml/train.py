"""`make train`: 5x3 CV on train, final fit, one hold-out evaluation, write all artifacts.

Deterministic: fixed seeds, single-threaded XGBoost, no wall-clock values in metrics.json.
"""

import hashlib
import logging
import subprocess
import time
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.model_selection import RepeatedStratifiedKFold

from app.core.config import ARTIFACTS_DIR, REPO_ROOT
from ml.artifacts import write_json
from ml.evaluate import (
    METRICS,
    THRESHOLD,
    calibration_bins,
    confusion,
    roc_points,
    score,
    summarize,
)
from ml.explain import global_importance
from ml.models import Calibration, create_model
from ml.models.xgb import DEFAULT_PARAMS
from ml.preprocess import RAW_CSV, load_raw, raw_targets, raw_to_matrix
from ml.presets import build_presets
from ml.schema import FeatureSchema, load_schema
from ml.split import SEED, load_split
from ml.uncertainty import fit_replicates, holdout_report, load_uncertainty, replicate_path

log = logging.getLogger(__name__)

MODEL_NAME = "xgb"
N_SPLITS, N_REPEATS = 5, 3
MODELS_DIR = ARTIFACTS_DIR / "models"


def cross_validate(
    X: pd.DataFrame, y: np.ndarray
) -> tuple[dict[str, list[dict[str, float]]], list[float], np.ndarray]:
    """Repeated stratified CV on the train set.

    Each fold's tuned threshold comes from that fold's own training OOF (inside `fit`), so the
    validation fold never influences it. Returns per-fold scores at the default and tuned
    thresholds, the per-fold tuned thresholds, and OOF probabilities averaged over repeats.
    """
    cv = RepeatedStratifiedKFold(n_splits=N_SPLITS, n_repeats=N_REPEATS, random_state=SEED)
    folds: dict[str, list[dict[str, float]]] = {"default": [], "tuned": []}
    thresholds: list[float] = []
    oof = np.zeros(len(y))
    for tr, va in cv.split(X, y):
        model = create_model(MODEL_NAME)
        model.fit(X.iloc[tr], y[tr])
        assert model.calibration is not None
        t = model.calibration.threshold
        p = model.predict_proba(X.iloc[va])
        folds["default"].append(score(y[va], p))
        folds["tuned"].append(score(y[va], p, t))
        thresholds.append(t)
        oof[va] += p / N_REPEATS
    return folds, thresholds, oof


def _table(schema: FeatureSchema, metrics: dict[str, Any]) -> str:
    lines: list[str] = []
    for t, m in metrics["targets"].items():
        prev, thr = m["prevalence"], m["threshold"]
        lines.append(
            f"{t} ({schema.targets[t].label})  prevalence train {prev['train']:.2f} / "
            f"test {prev['test']:.2f}  tuned threshold {thr['tuned']:.3f} "
            f"(CV folds {thr['cv_mean']:.3f} ± {thr['cv_std']:.3f})"
        )
        lines.append(
            f"  {'metric':<10}{'CV @0.5':<16}{'CV @tuned':<16}{'hold-out @0.5':<15}hold-out @tuned"
        )
        for k in METRICS:
            row = [
                f"{m['cv'][v][k]['mean']:.3f} ± {m['cv'][v][k]['std']:.3f}"
                for v in ("default", "tuned")
            ]
            row += [f"{m['test'][v][k]:.3f}" for v in ("default", "tuned")]
            lines.append(f"  {k:<10}{row[0]:<16}{row[1]:<16}{row[2]:<15}{row[3]}")
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
    unc_cfg = load_uncertainty()
    unc_report: dict[str, Any] = {}

    for ti, t in enumerate(schema.targets):
        y_tr, y_te = Y_train[t].to_numpy(), Y_test[t].to_numpy()
        log.info("%s: cross-validating (%dx%d)", t, N_SPLITS, N_REPEATS)
        folds, cv_thresholds, oof = cross_validate(X_train, y_tr)

        model = create_model(MODEL_NAME)
        model.fit(X_train, y_tr)
        cal = model.calibration
        assert isinstance(cal, Calibration)
        p_te = model.predict_proba(X_test)
        model.save(MODELS_DIR / f"{t}.ubj")

        started = time.perf_counter()
        replicates = fit_replicates(model, X_train, y_tr, unc_cfg, ti)
        replicates.save(replicate_path(t))
        unc_report[t] = holdout_report(replicates, X_test, p_te, unc_cfg.level)
        log.info(
            "%s: %d bootstrap replicates in %.0f s, %.1f MB",
            t,
            len(replicates),
            time.perf_counter() - started,
            replicate_path(t).stat().st_size / 1e6,
        )

        test_probs[t] = p_te
        calibration[t] = {"a": cal.a, "b": cal.b, "threshold": cal.threshold}
        scale_pos_weight[t] = model.params_used["scale_pos_weight"]
        importance[t] = global_importance(model.explain(X_train), schema)
        target_metrics[t] = {
            "label": schema.targets[t].label,
            "role": schema.targets[t].role,
            "prevalence": {"train": float(y_tr.mean()), "test": float(y_te.mean())},
            "threshold": {
                "default": THRESHOLD,
                "tuned": cal.threshold,
                "cv_mean": float(np.mean(cv_thresholds)),
                "cv_std": float(np.std(cv_thresholds, ddof=1)),
            },
            "cv": {v: summarize(folds[v]) for v in folds},
            "test": {
                "default": score(y_te, p_te),
                "tuned": score(y_te, p_te, cal.threshold),
            },
            "roc_test": roc_points(y_te, p_te),
            "confusion_test": {
                "default": confusion(y_te, p_te),
                "tuned": confusion(y_te, p_te, cal.threshold),
            },
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
        "targets": target_metrics,
        "feature_importance": importance,
        "uncertainty": {
            "method": unc_cfg.method,
            "n_models": unc_cfg.n_models,
            "level": unc_cfg.level,
            "targets": unc_report,
        },
    }
    write_json("metrics.json", metrics)
    write_json("calibration.json", calibration)
    write_json(
        "params.json",
        {"model": MODEL_NAME, "params": DEFAULT_PARAMS, "scale_pos_weight": scale_pos_weight},
    )
    presets = build_presets(
        df.iloc[split.test_idx],
        test_probs,
        {t: c["threshold"] for t, c in calibration.items()},
        schema,
    )
    write_json("presets.json", presets)
    data_sha = hashlib.sha256(RAW_CSV.read_bytes()).hexdigest()
    write_json(
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
