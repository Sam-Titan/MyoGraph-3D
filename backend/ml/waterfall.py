"""Probability waterfall from calibrated SHAP contributions (Phase 17).

Start at the model baseline `sigmoid(base_logit)`, add the factors in a fixed order (largest
|log-odds| first, ids break ties) and convert the running log-odds to a probability after each step.
The last `to_p` is pinned to the served probability, so the steps always add up to what is shown.
Step sizes depend on the order (log-odds -> probability is not linear); that is stated in the UI.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Factor:
    id: str
    label: str
    display_value: str
    logit: float


@dataclass(frozen=True)
class Step:
    feature: str | None  # None for the aggregated "other factors" step
    label: str
    value_display: str
    from_p: float
    to_p: float


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def order_factors(factors: Sequence[Factor]) -> list[Factor]:
    """Largest |log-odds| first; ids break ties so the order is deterministic."""
    return sorted(factors, key=lambda f: (-abs(f.logit), f.id))


def build_waterfall(
    base_logit: float, factors: Sequence[Factor], probability: float, top_n: int
) -> list[Step]:
    """Top `top_n` factors as steps, the rest as one "N other factors" step, chained."""
    ordered = order_factors(factors)
    parts: list[tuple[str | None, str, str, float]] = [
        (f.id, f.label, f.display_value, f.logit) for f in ordered[:top_n]
    ]
    rest = ordered[top_n:]
    if rest:
        label = f"{len(rest)} other factor{'s' if len(rest) > 1 else ''}"
        parts.append((None, label, "", sum(f.logit for f in rest)))
    steps: list[Step] = []
    running, p_prev = base_logit, _sigmoid(base_logit)
    for i, (feature, label, shown, logit) in enumerate(parts):
        running += logit
        p_next = probability if i == len(parts) - 1 else _sigmoid(running)
        steps.append(Step(feature, label, shown, p_prev, p_next))
        p_prev = p_next
    return steps
