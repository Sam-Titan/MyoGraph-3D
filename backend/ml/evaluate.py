"""Pure metric helpers (SPEC §4.5). Threshold is fixed at 0.5; never tuned on the test set."""

from collections.abc import Sequence

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

THRESHOLD = 0.5
METRICS = ("roc_auc", "accuracy", "precision", "recall", "f1", "brier")


def score(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    pred = (p >= THRESHOLD).astype(int)
    return {
        "roc_auc": float(roc_auc_score(y, p)),
        "accuracy": float(accuracy_score(y, pred)),
        "precision": float(precision_score(y, pred, zero_division=0)),
        "recall": float(recall_score(y, pred, zero_division=0)),
        "f1": float(f1_score(y, pred, zero_division=0)),
        "brier": float(brier_score_loss(y, p)),
    }


def summarize(folds: Sequence[dict[str, float]]) -> dict[str, dict[str, float]]:
    return {
        m: {
            "mean": float(np.mean([f[m] for f in folds])),
            "std": float(np.std([f[m] for f in folds], ddof=1)),
        }
        for m in METRICS
    }


def roc_points(y: np.ndarray, p: np.ndarray) -> dict[str, list[float]]:
    fpr, tpr, _ = roc_curve(y, p)
    return {"fpr": fpr.tolist(), "tpr": tpr.tolist()}


def confusion(y: np.ndarray, p: np.ndarray) -> dict[str, int]:
    tn, fp, fn, tp = confusion_matrix(y, (p >= THRESHOLD).astype(int), labels=[0, 1]).ravel()
    return {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}


def calibration_bins(y: np.ndarray, p: np.ndarray, n_bins: int = 10) -> list[dict[str, float]]:
    """Equal-count (quantile) bins of predicted probability."""
    order = np.argsort(p, kind="stable")
    return [
        {
            "n": int(len(idx)),
            "mean_predicted": float(p[idx].mean()),
            "fraction_positive": float(y[idx].mean()),
        }
        for idx in np.array_split(order, n_bins)
        if len(idx)
    ]
