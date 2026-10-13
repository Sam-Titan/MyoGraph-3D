"""Demo presets: real hold-out patients picked by one deterministic rule (PLAN phase 2).

Every category takes the smallest-index matching hold-out row. The "hard case" is the only
exception: the not-yet-chosen row with the largest |p - truth| on any target.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd

from ml.evaluate import THRESHOLD
from ml.preprocess import raw_targets, raw_to_inputs
from ml.schema import FeatureSchema, load_schema

log = logging.getLogger(__name__)


def _first(mask: np.ndarray, taken: set[int]) -> int | None:
    for i in np.flatnonzero(mask):
        if int(i) not in taken:
            return int(i)
    return None


def build_presets(
    test_df: pd.DataFrame,
    probs: dict[str, np.ndarray],
    schema: FeatureSchema | None = None,
) -> list[dict[str, Any]]:
    """`test_df` rows must be the hold-out rows in ascending dataset-index order."""
    schema = schema or load_schema()
    truth = raw_targets(test_df, schema).reset_index(drop=True)
    inputs = raw_to_inputs(test_df, schema)
    overall, vessels = schema.overall_target, schema.vessel_targets
    count = truth[vessels].sum(axis=1).to_numpy()
    first, others = vessels[0], vessels[1:]

    # (id, label, description, mask)
    cats: list[tuple[str, str, str, np.ndarray]] = [
        (
            f"no-{overall.lower()}",
            f"No {overall}",
            f"Actual finding: no {overall}.",
            (truth[overall].to_numpy() == 0) & (count == 0),
        ),
        (
            f"{first.lower()}-only",
            f"{first}-only disease",
            f"Actual finding: stenosis in {first} only.",
            (count == 1) & (truth[first].to_numpy() == 1),
        ),
    ]
    if others:
        names = " or ".join(others)
        cats.append(
            (
                "-".join(o.lower() for o in others) + "-only",
                f"{names}-only disease",
                f"Actual finding: stenosis in a single vessel ({names}).",
                (count == 1) & (truth[others].to_numpy().sum(axis=1) == 1),
            )
        )
    cats += [
        (
            f"{k}-vessel",
            f"{k}-vessel disease",
            f"Actual finding: {k} vessels with stenosis.",
            count == k,
        )
        for k in range(2, len(vessels) + 1)
    ]

    taken: set[int] = set()
    out: list[dict[str, Any]] = []

    def add(pid: str, label: str, desc: str, i: int) -> None:
        taken.add(i)
        out.append(
            {
                "id": pid,
                "label": label,
                "description": desc,
                "values": inputs[i],
                "truth": {t: bool(truth.loc[i, t]) for t in schema.targets},
            }
        )

    for pid, label, desc, mask in cats:
        i = _first(mask, taken)
        if i is None:
            log.warning("preset %s: no matching hold-out patient, skipped", pid)
        else:
            add(pid, label, desc, i)

    err = np.column_stack([np.abs(probs[t] - truth[t].to_numpy()) for t in schema.targets])
    err[sorted(taken)] = -1.0
    i, j = np.unravel_index(int(np.argmax(err)), err.shape)  # first max -> smallest index
    target = list(schema.targets)[j]
    p, actual = float(probs[target][i]), bool(truth.loc[i, target])
    if (p >= THRESHOLD) != actual:
        desc = (
            f"The model misclassifies this patient on {schema.targets[target].label}: "
            f"estimated probability {p:.0%}, but the actual finding is "
            f"{'stenosis present' if actual else 'no stenosis'}."
        )
        add("hard-case", "Hard case (model is wrong)", desc, int(i))
    else:
        log.warning("hard case: no misclassified hold-out patient left")
    return out
