"""The model interface every risk model implements, plus a tiny registry (SPEC §4.2)."""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, Self

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Calibration:
    """Platt scaling (calibrated logit = a * margin + b) and the tuned decision threshold.

    `threshold` maximises Youden's J on the train out-of-fold calibrated probabilities.
    """

    a: float
    b: float
    threshold: float = 0.5


@dataclass(frozen=True)
class Explanation:
    """Per-model-column contributions in calibrated log-odds.

    `base + contribs.sum(axis=1)` equals the calibrated logit of each row.
    """

    columns: list[str]
    contribs: np.ndarray  # (n_rows, n_columns)
    base: np.ndarray  # (n_rows,)

    @property
    def logit(self) -> np.ndarray:
        return self.base + self.contribs.sum(axis=1)


class RiskModel(Protocol):
    calibration: Calibration | None
    params_used: dict[str, Any]

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> None: ...

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Calibrated P(positive), shape (n_rows,)."""
        ...

    def explain(self, X: pd.DataFrame) -> Explanation: ...

    def save(self, path: Path) -> None: ...

    @classmethod
    def load(cls, path: Path, calibration: Calibration) -> Self: ...


_REGISTRY: dict[str, Callable[..., RiskModel]] = {}


def register(name: str) -> Callable[[type], type]:
    def deco(cls: type) -> type:
        _REGISTRY[name] = cls
        return cls

    return deco


def create_model(name: str, **kwargs: Any) -> RiskModel:
    if name not in _REGISTRY:
        raise KeyError(f"unknown model {name!r}; registered: {sorted(_REGISTRY)}")
    return _REGISTRY[name](**kwargs)


def model_class(name: str) -> Any:
    return _REGISTRY[name]
