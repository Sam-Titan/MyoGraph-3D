"""Split-stability analysis: how much does the hold-out score depend on the split seed?

For seeds 0..19: same stratified 80/20 split rule, fit (with calibration) on train, score the
hold-out. Model seed stays 42, so only the split varies. Writes `stability.json` only; run
`make train` first (the official seed-42 numbers are read from metrics.json).
"""

import json
import logging
from typing import Any

import numpy as np

from app.core.config import ARTIFACTS_DIR
from ml.artifacts import write_json
from ml.evaluate import roc_auc_brier
from ml.models import create_model
from ml.preprocess import load_raw, raw_targets, raw_to_matrix
from ml.schema import load_schema
from ml.split import SEED, make_split

log = logging.getLogger(__name__)

SEEDS = list(range(20))
STAT_METRICS = ("roc_auc", "brier")


def _summary(values: list[float], official: float) -> dict[str, float]:
    v = np.asarray(values)
    return {
        "median": float(np.median(v)),
        "q25": float(np.percentile(v, 25)),
        "q75": float(np.percentile(v, 75)),
        "iqr": float(np.percentile(v, 75) - np.percentile(v, 25)),
        "min": float(v.min()),
        "max": float(v.max()),
        "official": official,
        "official_percentile": float(100.0 * np.mean(v <= official)),
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    schema = load_schema()
    df = load_raw(schema=schema)
    X = raw_to_matrix(df, schema)
    Y = raw_targets(df, schema)
    official = json.loads((ARTIFACTS_DIR / "metrics.json").read_text())["targets"]

    runs: dict[str, dict[str, list[float]]] = {
        t: {m: [] for m in STAT_METRICS} for t in schema.targets
    }
    for seed in SEEDS:
        split = make_split(df, schema, seed=seed)
        X_tr, X_te = X.iloc[split.train_idx], X.iloc[split.test_idx]
        for t in schema.targets:
            model = create_model("xgb")
            model.fit(X_tr.reset_index(drop=True), Y[t].iloc[split.train_idx].to_numpy())
            auc, brier = roc_auc_brier(
                Y[t].iloc[split.test_idx].to_numpy(), model.predict_proba(X_te)
            )
            runs[t]["roc_auc"].append(auc)
            runs[t]["brier"].append(brier)
        log.info("seed %d done", seed)

    out: dict[str, Any] = {
        "seeds": SEEDS,
        "official_seed": SEED,
        "targets": {
            t: {
                m: {
                    **_summary(runs[t][m], official[t]["test"]["default"][m]),
                    "values": runs[t][m],
                }
                for m in STAT_METRICS
            }
            for t in schema.targets
        },
    }
    write_json("stability.json", out)

    lines = [
        f"{'target':<7}{'metric':<9}{'median':>8}{'IQR':>8}{'min':>8}{'max':>8}"
        f"{'seed 42':>9}{'pctile':>8}"
    ]
    for t, ms in out["targets"].items():
        for m, s in ms.items():
            lines.append(
                f"{t:<7}{m:<9}{s['median']:>8.3f}{s['iqr']:>8.3f}{s['min']:>8.3f}"
                f"{s['max']:>8.3f}{s['official']:>9.3f}{s['official_percentile']:>7.0f}%"
            )
    log.info("\nHold-out stability over seeds 0..19\n%s", "\n".join(lines))


if __name__ == "__main__":
    main()
