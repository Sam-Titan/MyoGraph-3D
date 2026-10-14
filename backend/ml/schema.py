"""Typed, validated view of `config/features.yaml` (the single source of truth for features)."""

from functools import cache
from pathlib import Path
from typing import Annotated, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import CONFIG_DIR

FEATURES_PATH = CONFIG_DIR / "features.yaml"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Target(_Strict):
    column: str
    positive: str
    label: str
    role: Literal["overall", "vessel"]
    plain_label: str | None = None  # wording used inside prose summaries; falls back to label


class Group(_Strict):
    id: str
    label: str


class Dropped(_Strict):
    column: str
    reason: str


class Reference(_Strict):
    low: float
    high: float


class InputBounds(_Strict):
    min: float
    max: float
    step: float


class Option(_Strict):
    value: str
    label: str
    source: str | None = None
    sets: dict[str, int | str] | None = None


class BinaryEncoding(_Strict):
    type: Literal["binary"]
    positive: str
    model_column: str


class OneHotEncoding(_Strict):
    type: Literal["one_hot"]
    drop: str
    model_columns: list[str]


class OrdinalEncoding(_Strict):
    type: Literal["ordinal"]
    order: list[str]
    model_column: str


Encoding = Annotated[BinaryEncoding | OneHotEncoding | OrdinalEncoding, Field(discriminator="type")]


class _Feature(_Strict):
    id: str
    label: str
    group: str
    column: str | None = None
    unit: str | None = None
    reference: Reference | None = None


class NumberFeature(_Feature):
    kind: Literal["number"]
    column: str
    input: InputBounds


class BinaryFeature(_Feature):
    kind: Literal["binary"]
    column: str
    source: list[str | int]


class CategoryFeature(_Feature):
    kind: Literal["category"]
    column: str
    options: list[Option]
    encoding: Encoding


class DerivedFeature(_Feature):
    kind: Literal["derived"]
    column: str
    formula: str
    source: list[str | int] | None = None


class CompositeFeature(_Feature):
    kind: Literal["composite"]
    options: list[Option]


Feature = Annotated[
    NumberFeature | BinaryFeature | CategoryFeature | DerivedFeature | CompositeFeature,
    Field(discriminator="kind"),
]


class FeatureSchema(_Strict):
    targets: dict[str, Target]
    excluded_from_inputs: list[str]
    dropped: list[Dropped]
    groups: list[Group]
    features: list[Feature]

    @model_validator(mode="after")
    def _validate(self) -> FeatureSchema:
        ids = [f.id for f in self.features]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate feature ids")
        groups = {g.id for g in self.groups}
        for f in self.features:
            if f.group not in groups:
                raise ValueError(f"feature {f.id!r}: unknown group {f.group!r}")
        roles = [t.role for t in self.targets.values()]
        if roles.count("overall") != 1:
            raise ValueError("exactly one target must have role 'overall'")
        if roles.count("vessel") < 1:
            raise ValueError("at least one target must have role 'vessel'")
        if {t.column for t in self.targets.values()} != set(self.excluded_from_inputs):
            raise ValueError("excluded_from_inputs must be exactly the target columns")
        for col in self.source_columns():
            if col in self.excluded_from_inputs:
                raise ValueError(f"target column {col!r} used as a model input (leakage)")
        return self

    def source_columns(self) -> set[str]:
        cols: set[str] = set()
        for f in self.features:
            if f.column:
                cols.add(f.column)
            if isinstance(f, CompositeFeature):
                for o in f.options:
                    cols.update((o.sets or {}).keys())
        return cols

    @property
    def vessel_targets(self) -> list[str]:
        return [k for k, t in self.targets.items() if t.role == "vessel"]

    @property
    def overall_target(self) -> str:
        return next(k for k, t in self.targets.items() if t.role == "overall")

    @property
    def api_inputs(self) -> list[Feature]:
        """Features a client sends (everything except derived ones)."""
        return [f for f in self.features if f.kind != "derived"]

    @property
    def model_columns(self) -> list[str]:
        """Fixed-order model matrix columns: yaml order, with multi-column inputs expanded."""
        return [c for f in self.features for c in feature_model_columns(f)]

    @property
    def column_to_input(self) -> dict[str, str]:
        """Model column -> the input id it came from (for aggregating contributions)."""
        return {c: f.id for f in self.features for c in feature_model_columns(f)}


def feature_model_columns(f: Feature) -> list[str]:
    """Model matrix columns one input expands to."""
    if isinstance(f, CategoryFeature):
        enc = f.encoding
        return enc.model_columns if isinstance(enc, OneHotEncoding) else [enc.model_column]
    if isinstance(f, CompositeFeature):
        return _composite_columns(f)
    return [f.id]


def _composite_columns(f: CompositeFeature) -> list[str]:
    """Dataset columns a composite expands to, in first-seen order across its options."""
    seen: dict[str, None] = {}
    for o in f.options:
        for col in o.sets or {}:
            seen.setdefault(col)
    return list(seen)


composite_columns = _composite_columns


@cache
def load_schema(path: Path = FEATURES_PATH) -> FeatureSchema:
    return FeatureSchema.model_validate(yaml.safe_load(path.read_text()))
