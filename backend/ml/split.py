"""Stratified 80/20 hold-out, stratified on the number of stenotic vessels (SPEC §4.1)."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from pydantic import BaseModel
from sklearn.model_selection import train_test_split

from app.core.config import ARTIFACTS_DIR
from ml.preprocess import raw_targets
from ml.schema import FeatureSchema, load_schema

SEED = 42
TEST_SIZE = 0.2
SPLIT_PATH = ARTIFACTS_DIR / "split.json"


class Split(BaseModel):
    seed: int
    test_size: float
    stratify_on: list[str]
    n_train: int
    n_test: int
    train_idx: list[int]
    test_idx: list[int]


def vessel_count(df: pd.DataFrame, schema: FeatureSchema | None = None) -> pd.Series:
    """Number of positive `role: vessel` targets per row (0..n_vessels)."""
    schema = schema or load_schema()
    labels = raw_targets(df, schema)
    return labels[schema.vessel_targets].sum(axis=1)


def make_split(
    df: pd.DataFrame,
    schema: FeatureSchema | None = None,
    seed: int = SEED,
    test_size: float = TEST_SIZE,
) -> Split:
    schema = schema or load_schema()
    idx = np.arange(len(df))
    train, test = train_test_split(
        idx, test_size=test_size, random_state=seed, stratify=vessel_count(df, schema)
    )
    train_idx, test_idx = sorted(train.tolist()), sorted(test.tolist())
    return Split(
        seed=seed,
        test_size=test_size,
        stratify_on=schema.vessel_targets,
        n_train=len(train_idx),
        n_test=len(test_idx),
        train_idx=train_idx,
        test_idx=test_idx,
    )


def write_split(split: Split, path: Path = SPLIT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(split.model_dump(), indent=2) + "\n")


def load_split(path: Path = SPLIT_PATH) -> Split:
    return Split.model_validate_json(path.read_text())
