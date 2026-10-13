import pytest

from ml.preprocess import load_raw
from ml.schema import FeatureSchema, load_schema
from ml.split import load_split, make_split, vessel_count
from ml.stats import compute_feature_stats, load_feature_stats

SCHEMA = load_schema()
RAW = load_raw(schema=SCHEMA)


def test_split_sizes_disjoint_and_complete() -> None:
    s = make_split(RAW, SCHEMA)
    assert (s.n_train, s.n_test) == (242, 61)
    assert not set(s.train_idx) & set(s.test_idx)
    assert sorted(s.train_idx + s.test_idx) == list(range(303))


def test_split_is_deterministic_and_matches_artifact() -> None:
    assert make_split(RAW, SCHEMA) == make_split(RAW, SCHEMA)
    assert load_split() == make_split(RAW, SCHEMA)


def test_split_is_stratified_on_vessel_count() -> None:
    s = make_split(RAW, SCHEMA)
    vc = vessel_count(RAW, SCHEMA)
    for k in range(4):
        expected = (vc == k).sum() * 0.2
        assert abs((vc.iloc[s.test_idx] == k).sum() - expected) <= 1


def test_vessel_count_uses_roles_not_ids() -> None:
    assert SCHEMA.vessel_targets == ["LAD", "LCX", "RCA"]
    assert SCHEMA.overall_target == "CAD"
    assert set(vessel_count(RAW, SCHEMA)) == {0, 1, 2, 3}


def test_role_validation() -> None:
    raw = SCHEMA.model_dump(mode="json")
    raw["targets"]["LAD"]["role"] = "overall"
    with pytest.raises(ValueError, match="exactly one"):
        FeatureSchema.model_validate(raw)
    raw = SCHEMA.model_dump(mode="json")
    for k in ("LAD", "LCX", "RCA"):
        raw["targets"][k]["role"] = "overall"
    raw["targets"]["CAD"]["role"] = "vessel"
    with pytest.raises(ValueError, match="exactly one"):
        FeatureSchema.model_validate(raw)
    raw["targets"]["LAD"]["role"] = "bogus"
    with pytest.raises(ValueError):
        FeatureSchema.model_validate(raw)


def test_feature_stats_use_train_rows_only_and_include_bmi() -> None:
    stats = load_feature_stats()
    assert set(stats["bmi"]) >= {"min", "max", "median"}
    s = load_split()
    from ml.preprocess import raw_to_inputs, raw_to_matrix

    train = RAW.iloc[s.train_idx]
    expect = compute_feature_stats(
        raw_to_inputs(train, SCHEMA), raw_to_matrix(train, SCHEMA), SCHEMA
    )
    assert stats == expect
    assert stats["age"]["min"] == train["Age"].min()
    assert stats["age"]["max"] == train["Age"].max()
