import json

import numpy as np
import pandas as pd
import pytest

from ml.preprocess import inputs_to_matrix, load_raw, raw_targets, raw_to_inputs, raw_to_matrix
from ml.schema import load_schema

SCHEMA = load_schema()
RAW = load_raw(schema=SCHEMA)


def _inputs(i: int = 0) -> dict:
    return raw_to_inputs(RAW.iloc[[i]], SCHEMA)[0]


def test_matrix_shape_and_order() -> None:
    m = raw_to_matrix(RAW, SCHEMA)
    assert m.shape == (303, 55)
    assert list(m.columns) == SCHEMA.model_columns
    assert not m.isna().any().any()
    assert len(SCHEMA.api_inputs) == 49


def test_raw_row_and_api_dict_give_identical_vector() -> None:
    batch = raw_to_matrix(RAW, SCHEMA)
    for i in range(len(RAW)):
        api = json.loads(json.dumps(_inputs(i)))  # what a client would POST
        row = inputs_to_matrix([api], SCHEMA).iloc[0]
        assert np.array_equal(row.to_numpy(), batch.iloc[i].to_numpy()), i


def test_bmi_and_obesity_derivation() -> None:
    m = raw_to_matrix(RAW, SCHEMA)
    assert np.allclose(m["bmi"], RAW["BMI"], atol=1e-9)
    assert (m["obesity"] == (m["bmi"] > 25).astype(float)).all()
    # the one raw row whose Obesity flag disagrees with BMI > 25 is overridden
    raw_flag = (RAW["Obesity"] == "Y").astype(float)
    assert (m["obesity"] != raw_flag).sum() == 1


def test_client_sent_derived_fields_are_ignored() -> None:
    inp = {**_inputs(), "bmi": 5.0, "obesity": 0, "weight": 120.0, "height": 170.0}
    row = inputs_to_matrix([inp], SCHEMA).iloc[0]
    assert row["bmi"] == pytest.approx(120 / 1.7**2)
    assert row["obesity"] == 1.0


def test_fmale_typo_is_female() -> None:
    df = pd.concat([RAW.iloc[[0]], RAW.iloc[[1]]]).copy()
    df["Sex"] = ["Male", "Fmale"]
    m = raw_to_matrix(df, SCHEMA)
    assert m["sex_male"].tolist() == [1.0, 0.0]
    assert raw_to_inputs(df, SCHEMA)[1]["sex"] == "female"


def test_category_composite_and_ordinal_encodings() -> None:
    inp = {**_inputs(), "vhd": "mild", "bbb": "rbbb", "smoking": "ex", "chest_pain": "atypical"}
    r = inputs_to_matrix([inp], SCHEMA).iloc[0]
    assert r["vhd"] == 1.0
    assert (r["bbb_lbbb"], r["bbb_rbbb"]) == (0.0, 1.0)
    assert (r["Current Smoker"], r["EX-Smoker"]) == (0.0, 1.0)
    assert (r["Typical Chest Pain"], r["Atypical"], r["Nonanginal"]) == (0.0, 1.0, 0.0)


def test_lowercase_mild_in_raw_data_is_decoded() -> None:
    df = RAW.iloc[[0]].copy()
    df["VHD"] = "mild"
    assert raw_to_inputs(df, SCHEMA)[0]["vhd"] == "mild"


def test_unknown_values_raise() -> None:
    with pytest.raises(ValueError, match="unknown option"):
        inputs_to_matrix([{**_inputs(), "vhd": "huge"}], SCHEMA)
    with pytest.raises(ValueError, match="missing inputs"):
        inputs_to_matrix([{k: v for k, v in _inputs().items() if k != "age"}], SCHEMA)
    bad = RAW.iloc[[0]].copy()
    bad["Sex"] = "Other"
    with pytest.raises(ValueError, match="unexpected value"):
        raw_to_inputs(bad, SCHEMA)


def test_targets_are_not_in_inputs() -> None:
    t = raw_targets(RAW, SCHEMA)
    assert t.sum().to_dict() == {"CAD": 216, "LAD": 177, "LCX": 119, "RCA": 114}
    assert not set(t.columns) & set(_inputs())
