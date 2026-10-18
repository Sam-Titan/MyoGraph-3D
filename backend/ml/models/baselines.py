"""Benchmark-only comparison models (not served): logistic regression, random forest, TabPFN.

They follow the same calibration protocol as `XGBRiskModel.fit`: an inner stratified 5-fold gives
out-of-fold scores, Platt scaling is fitted on them, and the decision threshold maximises Youden's J
on the calibrated out-of-fold probabilities. Only then is the final estimator fitted on all rows.
"""

import importlib.util
from collections.abc import Callable
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.evaluate import youden_threshold
from ml.models.base import Calibration

SEED = 42
_EPS = 1e-4


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def _logit_of_proba(est: Any, X: pd.DataFrame) -> np.ndarray:
    p = np.clip(est.predict_proba(X)[:, 1], _EPS, 1 - _EPS)
    return np.log(p / (1 - p))


def _decision(est: Any, X: pd.DataFrame) -> np.ndarray:
    return np.asarray(est.decision_function(X))


class CalibratedBaseline:
    def __init__(
        self,
        estimator: Any,
        margin: Callable[[Any, pd.DataFrame], np.ndarray],
        seed: int = SEED,
        calibration_folds: int = 5,
    ) -> None:
        self._estimator, self._margin = estimator, margin
        self.seed, self.calibration_folds = seed, calibration_folds
        self.calibration: Calibration | None = None
        self._fitted: Any = None

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> None:
        y = np.asarray(y).astype(int)
        oof = np.zeros(len(y))
        folds = StratifiedKFold(self.calibration_folds, shuffle=True, random_state=self.seed)
        for tr, va in folds.split(X, y):
            est = clone(self._estimator).fit(X.iloc[tr], y[tr])
            oof[va] = self._margin(est, X.iloc[va])
        platt = LogisticRegression(C=1e6).fit(oof.reshape(-1, 1), y)
        a, b = float(platt.coef_[0, 0]), float(platt.intercept_[0])
        self.calibration = Calibration(
            a=a, b=b, threshold=youden_threshold(y, _sigmoid(a * oof + b))
        )
        self._fitted = clone(self._estimator).fit(X, y)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        if self._fitted is None or self.calibration is None:
            raise RuntimeError("model is not fitted")
        return _sigmoid(self.calibration.a * self._margin(self._fitted, X) + self.calibration.b)


def logreg(seed: int = SEED) -> CalibratedBaseline:
    """Standardised (scaler fitted inside every fit), L2, class weights."""
    pipe = Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "lr",
                # L2 is sklearn's default penalty.
                LogisticRegression(
                    C=1.0, class_weight="balanced", max_iter=5000, random_state=seed
                ),
            ),
        ]
    )
    return CalibratedBaseline(pipe, _decision, seed)


def random_forest(seed: int = SEED) -> CalibratedBaseline:
    rf = RandomForestClassifier(
        n_estimators=500, min_samples_leaf=2, class_weight="balanced", random_state=seed, n_jobs=1
    )
    return CalibratedBaseline(rf, _logit_of_proba, seed)


def tabpfn_available() -> bool:
    return importlib.util.find_spec("tabpfn") is not None


def tabpfn(seed: int = SEED) -> CalibratedBaseline:
    """Offline only: needs the `tabpfn` package (PyTorch), never installed in the API image."""
    from tabpfn import TabPFNClassifier  # type: ignore[import-not-found]

    return CalibratedBaseline(
        TabPFNClassifier(random_state=seed, device="cpu", n_estimators=4), _logit_of_proba, seed
    )
