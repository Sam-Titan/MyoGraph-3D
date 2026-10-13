import numpy as np
import pytest

from ml.explain import aggregate_to_inputs
from ml.models import create_model
from ml.preprocess import load_raw, raw_targets, raw_to_matrix
from ml.schema import load_schema
from ml.split import make_split

SCHEMA = load_schema()
FAST = {"n_estimators": 40}


@pytest.fixture(scope="module")
def data():
    df = load_raw(schema=SCHEMA)
    split = make_split(df, SCHEMA)
    X = raw_to_matrix(df, SCHEMA)
    Y = raw_targets(df, SCHEMA)
    return (
        X.iloc[split.train_idx].reset_index(drop=True),
        Y.iloc[split.train_idx].reset_index(drop=True),
        X.iloc[split.test_idx].reset_index(drop=True),
    )


@pytest.mark.parametrize("target", list(SCHEMA.targets))
def test_base_plus_contribs_is_calibrated_logit(data, target: str) -> None:
    X_tr, Y_tr, X_te = data
    model = create_model("xgb", params=FAST)
    model.fit(X_tr, Y_tr[target].to_numpy())
    expl = model.explain(X_te)
    p = model.predict_proba(X_te)
    np.testing.assert_allclose(expl.logit, np.log(p / (1 - p)), atol=1e-4)
    ids, agg = aggregate_to_inputs(expl, SCHEMA)
    assert len(ids) == len(set(ids)) < len(expl.columns)
    np.testing.assert_allclose(expl.base + agg.sum(axis=1), expl.logit, atol=1e-6)


def test_fit_is_deterministic(data) -> None:
    X_tr, Y_tr, X_te = data
    y = Y_tr[SCHEMA.overall_target].to_numpy()
    runs = []
    for _ in range(2):
        m = create_model("xgb", params=FAST)
        m.fit(X_tr, y)
        runs.append(m.predict_proba(X_te))
    np.testing.assert_array_equal(runs[0], runs[1])
