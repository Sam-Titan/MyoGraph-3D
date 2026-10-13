import pytest
from pydantic import ValidationError

from ml.preprocess import load_raw, raw_to_matrix
from ml.schema import FeatureSchema, load_schema

SCHEMA = load_schema()


def _forbidden() -> set[str]:
    return set(SCHEMA.excluded_from_inputs) | set(SCHEMA.targets)


def test_no_target_columns_in_model_columns() -> None:
    assert not _forbidden() & set(SCHEMA.model_columns)


def test_no_target_columns_in_real_matrix() -> None:
    matrix = raw_to_matrix(load_raw(schema=SCHEMA), SCHEMA)
    assert not _forbidden() & set(matrix.columns)
    assert list(matrix.columns) == SCHEMA.model_columns


def test_no_feature_reads_a_target_column() -> None:
    assert not set(SCHEMA.excluded_from_inputs) & SCHEMA.source_columns()


def test_schema_rejects_target_used_as_input() -> None:
    raw = SCHEMA.model_dump(mode="json")
    raw["features"].append(
        {
            "id": "lad_leak",
            "column": "LAD",
            "label": "x",
            "group": "demographics",
            "kind": "binary",
            "source": ["Stenotic"],
            "unit": None,
            "reference": None,
        }
    )
    with pytest.raises(ValidationError, match="leakage"):
        FeatureSchema.model_validate(raw)
