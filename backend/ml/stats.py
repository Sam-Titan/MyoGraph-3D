"""Per-input statistics from the TRAIN rows only: defaults, ranges, out-of-range warnings."""

import json
from collections import Counter
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import ARTIFACTS_DIR
from ml.preprocess import InputValue
from ml.schema import DerivedFeature, FeatureSchema, NumberFeature, load_schema

STATS_PATH = ARTIFACTS_DIR / "feature_stats.json"


def _numeric(values: pd.Series) -> dict[str, Any]:
    return {
        "kind": "number",
        "median": float(values.median()),
        "mode": float(values.mode().iloc[0]),
        "min": float(values.min()),
        "max": float(values.max()),
    }


def _categorical(values: Sequence[InputValue]) -> dict[str, Any]:
    counts = Counter(values)
    # most_common is stable for ties (first seen), so the mode is deterministic
    return {
        "kind": "category",
        "mode": counts.most_common(1)[0][0],
        "counts": {str(k): v for k, v in sorted(counts.items(), key=lambda kv: str(kv[0]))},
    }


def compute_feature_stats(
    train_inputs: Sequence[Mapping[str, InputValue]],
    train_matrix: pd.DataFrame,
    schema: FeatureSchema | None = None,
) -> dict[str, dict[str, Any]]:
    """Stats per input id. Derived numeric features (e.g. BMI) get min/max/median as well."""
    schema = schema or load_schema()
    stats: dict[str, dict[str, Any]] = {}
    for f in schema.features:
        if isinstance(f, NumberFeature):
            stats[f.id] = _numeric(train_matrix[f.id])
        elif isinstance(f, DerivedFeature):
            col = train_matrix[f.id]
            if col.nunique() > 2:
                stats[f.id] = _numeric(col)
            else:
                stats[f.id] = _categorical([int(v) for v in col])
        else:
            stats[f.id] = _categorical([i[f.id] for i in train_inputs])
    return stats


def write_feature_stats(stats: dict[str, dict[str, Any]], path: Path = STATS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(stats, indent=2, sort_keys=True) + "\n")


def load_feature_stats(path: Path = STATS_PATH) -> dict[str, dict[str, Any]]:
    return json.loads(path.read_text())
