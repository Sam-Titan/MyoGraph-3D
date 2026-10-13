"""Per-input request validation driven by features.yaml (no hard-coded lists)."""

import math
from collections.abc import Mapping
from typing import Any

from ml.schema import (
    BinaryFeature,
    CategoryFeature,
    CompositeFeature,
    FeatureSchema,
    NumberFeature,
)

ValidationError = dict[str, Any]


def _err(input_id: str, msg: str, kind: str) -> ValidationError:
    return {"loc": ["body", "values", input_id], "msg": msg, "type": kind}


def _is_number(v: object) -> bool:
    return isinstance(v, int | float) and not isinstance(v, bool)


def validate_values(values: Mapping[str, Any], schema: FeatureSchema) -> list[ValidationError]:
    """Field-level errors; empty when the request is valid. Derived ids are accepted and ignored."""
    errors: list[ValidationError] = []
    known = {f.id for f in schema.features}
    for key in values:
        if key not in known:
            errors.append(_err(key, "unknown input", "value_error.extra"))
    for f in schema.api_inputs:
        if f.id not in values:
            errors.append(_err(f.id, "field required", "value_error.missing"))
            continue
        v = values[f.id]
        if isinstance(f, NumberFeature):
            if not _is_number(v) or not math.isfinite(v):
                errors.append(_err(f.id, "must be a finite number", "value_error.number"))
            elif not f.input.min <= v <= f.input.max:
                msg = f"must be between {f.input.min:g} and {f.input.max:g}"
                errors.append(_err(f.id, msg, "value_error.range"))
        elif isinstance(f, BinaryFeature):
            if isinstance(v, bool) or (_is_number(v) and v in (0, 1)):
                continue
            errors.append(_err(f.id, "must be 0 or 1", "value_error.binary"))
        elif isinstance(f, CategoryFeature | CompositeFeature):
            options = [o.value for o in f.options]
            if v not in options:
                errors.append(_err(f.id, f"must be one of {options}", "value_error.option"))
    return errors
