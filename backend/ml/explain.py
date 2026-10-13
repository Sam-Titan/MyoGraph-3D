"""Aggregate per-column contributions back to input ids (exact, by additivity)."""

import numpy as np

from ml.models.base import Explanation
from ml.schema import FeatureSchema, load_schema


def aggregate_to_inputs(
    expl: Explanation, schema: FeatureSchema | None = None
) -> tuple[list[str], np.ndarray]:
    """Sum multi-column inputs (bbb_*, smoking, chest-pain) back to one column per input id."""
    schema = schema or load_schema()
    mapping = schema.column_to_input
    ids = list(dict.fromkeys(mapping[c] for c in expl.columns))
    out = np.zeros((expl.contribs.shape[0], len(ids)))
    for j, col in enumerate(expl.columns):
        out[:, ids.index(mapping[col])] += expl.contribs[:, j]
    return ids, out


def global_importance(expl: Explanation, schema: FeatureSchema | None = None) -> list[dict]:
    """Mean |contribution| per input id, descending."""
    schema = schema or load_schema()
    ids, agg = aggregate_to_inputs(expl, schema)
    labels = {f.id: f.label for f in schema.features}
    imp = np.abs(agg).mean(axis=0)
    order = sorted(range(len(ids)), key=lambda i: (-imp[i], ids[i]))
    return [{"id": ids[i], "label": labels[ids[i]], "importance": float(imp[i])} for i in order]
