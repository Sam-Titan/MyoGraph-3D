"""config/benchmark.yaml: models and feature sets (by feature group) for `make benchmark`."""

from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import REPO_ROOT
from ml.schema import FeatureSchema, feature_model_columns

BENCHMARK_PATH = REPO_ROOT / "config" / "benchmark.yaml"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BenchModelSpec(_Strict):
    id: str
    label: str
    optional: bool = False


class FeatureSet(_Strict):
    id: str
    label: str
    drop_groups: list[str]


class BenchmarkConfig(_Strict):
    models: list[BenchModelSpec] = Field(min_length=1)
    reference_model: str
    feature_sets: list[FeatureSet] = Field(min_length=1)
    confidence_level: float = Field(gt=0, lt=1)

    @model_validator(mode="after")
    def _validate(self) -> Self:
        for name, ids in (
            ("model", [m.id for m in self.models]),
            ("feature set", [s.id for s in self.feature_sets]),
        ):
            if len(set(ids)) != len(ids):
                raise ValueError(f"duplicate {name} id")
        if self.reference_model not in {m.id for m in self.models}:
            raise ValueError(f"reference_model {self.reference_model!r} is not in models")
        if self.feature_sets[0].drop_groups:
            raise ValueError("the first feature set is the baseline and must drop nothing")
        return self

    def check_groups(self, schema: FeatureSchema) -> None:
        known = {g.id for g in schema.groups}
        for s in self.feature_sets:
            if unknown := set(s.drop_groups) - known:
                raise ValueError(f"feature set {s.id!r} drops unknown groups {sorted(unknown)}")


def load_benchmark(path: Path = BENCHMARK_PATH) -> BenchmarkConfig:
    return BenchmarkConfig(**yaml.safe_load(path.read_text()))


def dropped_columns(schema: FeatureSchema, drop_groups: list[str]) -> list[str]:
    """Every model column derived from a dropped group's features (a one-hot drops all dummies)."""
    return [c for f in schema.features if f.group in drop_groups for c in feature_model_columns(f)]


def kept_columns(schema: FeatureSchema, drop_groups: list[str]) -> list[str]:
    drop = set(dropped_columns(schema, drop_groups))
    return [c for c in schema.model_columns if c not in drop]
