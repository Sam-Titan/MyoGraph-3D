"""XGBoost risk model: Platt calibration on out-of-fold margins + native TreeSHAP (SPEC §4.3)."""

import threading
from pathlib import Path
from typing import Any, Self

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold

from ml.evaluate import youden_threshold
from ml.models.base import Calibration, Explanation, register

SEED = 42
DEFAULT_PARAMS: dict[str, Any] = {
    "n_estimators": 300,
    "max_depth": 3,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 2,
    "reg_lambda": 1.0,
    "eval_metric": "logloss",
}


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


@register("xgb")
class XGBRiskModel:
    def __init__(
        self,
        params: dict[str, Any] | None = None,
        seed: int = SEED,
        calibration_folds: int = 5,
    ) -> None:
        self.params = {**DEFAULT_PARAMS, **(params or {})}
        self.seed = seed
        self.calibration_folds = calibration_folds
        self.params_used: dict[str, Any] = {}
        self.calibration: Calibration | None = None
        self._booster: xgb.Booster | None = None
        # Serving: request threads share one booster; predict and pred_contribs are serialised.
        self._lock = threading.Lock()

    def _classifier(self, scale_pos_weight: float) -> xgb.XGBClassifier:
        return xgb.XGBClassifier(
            **self.params,
            scale_pos_weight=scale_pos_weight,
            random_state=self.seed,
            n_jobs=1,  # single thread: bit-for-bit reproducible
            tree_method="hist",
        )

    def fit(self, X: pd.DataFrame, y: np.ndarray) -> None:
        y = np.asarray(y).astype(int)
        spw = float((y == 0).sum() / max((y == 1).sum(), 1))
        oof = np.zeros(len(y))
        folds = StratifiedKFold(self.calibration_folds, shuffle=True, random_state=self.seed)
        for tr, va in folds.split(X, y):
            clf = self._classifier(spw).fit(X.iloc[tr], y[tr])
            oof[va] = clf.predict(X.iloc[va], output_margin=True)
        platt = LogisticRegression(C=1e6).fit(oof.reshape(-1, 1), y)
        a, b = float(platt.coef_[0, 0]), float(platt.intercept_[0])
        self.calibration = Calibration(
            a=a, b=b, threshold=youden_threshold(y, _sigmoid(a * oof + b))
        )
        self._booster = self._classifier(spw).fit(X, y).get_booster()
        self.params_used = {**self.params, "scale_pos_weight": spw}

    def _fitted(self) -> tuple[xgb.Booster, Calibration]:
        if self._booster is None or self.calibration is None:
            raise RuntimeError("model is not fitted")
        return self._booster, self.calibration

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        booster, cal = self._fitted()
        with self._lock:
            margin = booster.predict(xgb.DMatrix(X), output_margin=True)
        return _sigmoid(cal.a * margin + cal.b)

    def explain(self, X: pd.DataFrame) -> Explanation:
        booster, cal = self._fitted()
        with self._lock:
            raw = booster.predict(xgb.DMatrix(X), pred_contribs=True)  # (n, cols + bias)
        return Explanation(
            columns=list(X.columns),
            contribs=cal.a * raw[:, :-1],
            base=cal.a * raw[:, -1] + cal.b,
        )

    def save(self, path: Path) -> None:
        booster, _ = self._fitted()
        path.parent.mkdir(parents=True, exist_ok=True)
        booster.save_model(path)

    @classmethod
    def load(cls, path: Path, calibration: Calibration) -> Self:
        model = cls()
        model._booster = xgb.Booster()
        model._booster.load_model(path)
        model.calibration = calibration
        return model
