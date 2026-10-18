"""Bootstrap uncertainty ranges (Phase 16.5, `config/uncertainty.yaml`).

Per target, `make train` refits the model on `n_models` stratified bootstrap resamples of the TRAIN
patients and Platt-calibrates each replicate on its own out-of-bag patients. An estimate's range is
the middle `level` share of the replicates' calibrated probabilities. The point estimate stays the
main model, so it can occasionally sit just outside its own range; the hold-out report counts that.
"""

import gzip
import json
import struct
import threading
from functools import cache
from pathlib import Path
from typing import Literal, Self

import numpy as np
import pandas as pd
import xgboost as xgb
import yaml
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import ARTIFACTS_DIR, CONFIG_DIR
from ml.models.base import RiskModel

UNCERTAINTY_PATH = CONFIG_DIR / "uncertainty.yaml"
REPLICATES_DIR = ARTIFACTS_DIR / "models" / "replicates"


class UncertaintyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["bootstrap"]
    n_models: int = Field(ge=2, le=500)
    level: float = Field(gt=0, lt=1)
    seed: int


@cache
def load_uncertainty(path: Path = UNCERTAINTY_PATH) -> UncertaintyConfig:
    return UncertaintyConfig.model_validate(yaml.safe_load(path.read_text()))


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def bootstrap_split(y: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Stratified resample with replacement: (fit indices, out-of-bag indices)."""
    picked = [
        rng.choice(idx, size=len(idx), replace=True)
        for idx in (np.flatnonzero(y == c) for c in (0, 1))
    ]
    fit_idx = np.sort(np.concatenate(picked))
    oob_idx = np.setdiff1d(np.arange(len(y)), fit_idx)
    return fit_idx, oob_idx


class ReplicateSet:
    """The bootstrap replicates of one target: boosters plus their own Platt coefficients."""

    def __init__(self, blobs: list[bytes], a: list[float], b: list[float]) -> None:
        self._blobs, self.a, self.b = blobs, np.array(a), np.array(b)
        self.boosters = []
        for blob in blobs:
            booster = xgb.Booster()
            booster.load_model(bytearray(blob))
            booster.set_param({"nthread": 1})  # one row: OpenMP fan-out costs more than it saves
            self.boosters.append(booster)
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self.boosters)

    def probabilities(self, X: pd.DataFrame) -> np.ndarray:
        """Calibrated probability of every replicate for every row: shape (n_models, n_rows)."""
        data = X.to_numpy(dtype=np.float32)
        with self._lock:
            margins = np.stack(
                [bst.inplace_predict(data, predict_type="margin") for bst in self.boosters]
            )
        return _sigmoid(self.a[:, None] * margins + self.b[:, None])

    def interval(self, X: pd.DataFrame, level: float) -> tuple[np.ndarray, np.ndarray]:
        """(lo, hi) per row: the middle `level` share of the replicates."""
        lo_q, hi_q = (1 - level) / 2 * 100, (1 + level) / 2 * 100
        lo, hi = np.percentile(self.probabilities(X), [lo_q, hi_q], axis=0)
        return lo, hi

    # File: gzip(mtime=0) of [u64 header length][JSON header {sizes, a, b}][concatenated UBJ blobs],
    # so repeated training writes identical bytes.
    def save(self, path: Path) -> None:
        header = json.dumps(
            {
                "sizes": [len(x) for x in self._blobs],
                "a": self.a.tolist(),
                "b": self.b.tolist(),
            }
        ).encode()
        path.parent.mkdir(parents=True, exist_ok=True)
        with (
            path.open("wb") as raw,
            gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as f,
        ):
            f.write(struct.pack("<Q", len(header)) + header + b"".join(self._blobs))

    @classmethod
    def load(cls, path: Path) -> Self:
        with gzip.open(path, "rb") as f:
            data = f.read()
        (n,) = struct.unpack_from("<Q", data)
        head = json.loads(data[8 : 8 + n])
        blobs, pos = [], 8 + n
        for size in head["sizes"]:
            blobs.append(data[pos : pos + size])
            pos += size
        return cls(blobs, head["a"], head["b"])


def replicate_path(target: str) -> Path:
    return REPLICATES_DIR / f"{target}.bin.gz"


def fit_replicates(
    model: RiskModel, X: pd.DataFrame, y: np.ndarray, cfg: UncertaintyConfig, target_index: int
) -> ReplicateSet:
    """Fit `cfg.n_models` bootstrap replicates of `model` on (X, y). Deterministic."""
    y = np.asarray(y).astype(int)
    blobs: list[bytes] = []
    a: list[float] = []
    b: list[float] = []
    for i in range(cfg.n_models):
        rng = np.random.default_rng([cfg.seed, target_index, i])
        fit_idx, oob_idx = bootstrap_split(y, rng)
        seed = int(rng.integers(2**31 - 1))
        blob, ai, bi = model.bootstrap_member(X, y, fit_idx, oob_idx, seed)
        blobs.append(blob)
        a.append(ai)
        b.append(bi)
    return ReplicateSet(blobs, a, b)


def holdout_report(
    rs: ReplicateSet, X_test: pd.DataFrame, p_test: np.ndarray, level: float, threshold: float
) -> dict[str, float | int]:
    """Hold-out range width, how often the point estimate lies outside its own range, and how often
    the range crosses the threshold (the "uncertain" share)."""
    lo, hi = rs.interval(X_test, level)
    outside = (p_test < lo) | (p_test > hi)
    uncertain = (lo < threshold) & (threshold <= hi)
    return {
        "mean_width": float(np.mean(hi - lo)),
        "n_outside": int(outside.sum()),
        "n": len(p_test),
        "outside_fraction": float(outside.mean()),
        "n_uncertain": int(uncertain.sum()),
        "uncertain_fraction": float(uncertain.mean()),
    }


def side(p: float, threshold: float) -> Literal["above", "below"]:
    """The point estimate against the target's own threshold (the main label)."""
    return "above" if p >= threshold else "below"


def crosses(lo: float, hi: float, threshold: float) -> bool:
    """The range straddles the threshold: some replicates are below it and some at or above it."""
    return lo < threshold <= hi
