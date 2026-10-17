import copy
import statistics
import time
from collections.abc import Iterator
from typing import Any

import numpy as np
import pandas as pd
import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from ml.models import create_model
from ml.preprocess import load_raw, raw_targets, raw_to_matrix
from ml.schema import load_schema
from ml.split import load_split
from ml.uncertainty import (
    UNCERTAINTY_PATH,
    ReplicateSet,
    UncertaintyConfig,
    bootstrap_split,
    fit_replicates,
    load_uncertainty,
    verdict,
)

SCHEMA = load_schema()
CFG = load_uncertainty()
RAW = yaml.safe_load(UNCERTAINTY_PATH.read_text())
#: /api/intervals runs off the critical path, but must stay well under a second in-process.
INTERVALS_BUDGET_MS = 250.0


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def presets(client: TestClient) -> list[dict[str, Any]]:
    return client.get("/api/presets").json()


def test_config_validates_and_rejects_bad_values() -> None:
    assert CFG.method == "bootstrap" and CFG.n_models >= 2 and 0 < CFG.level < 1
    for key, bad in (("level", 1.0), ("n_models", 1), ("method", "jackknife")):
        raw = copy.deepcopy(RAW)
        raw[key] = bad
        with pytest.raises(ValidationError):
            UncertaintyConfig.model_validate(raw)
    with pytest.raises(ValidationError):
        UncertaintyConfig.model_validate({**RAW, "extra": 1})


def test_verdict_from_range_and_threshold() -> None:
    assert verdict(0.5, 0.9, 0.5) == "likely"  # lo == threshold counts as at or above
    assert verdict(0.2, 0.49, 0.5) == "unlikely"
    assert verdict(0.2, 0.5, 0.5) == "uncertain"  # hi == threshold is not below it
    assert verdict(0.4, 0.6, 0.5) == "uncertain"


def test_bootstrap_split_is_stratified_and_disjoint() -> None:
    y = np.array([0] * 30 + [1] * 70)
    fit, oob = bootstrap_split(y, np.random.default_rng(1))
    assert len(fit) == len(y) and (y[fit] == 1).sum() == 70
    assert not set(fit) & set(oob) and len(oob) > 0


def test_intervals_endpoint_one_per_target(
    client: TestClient, presets: list[dict[str, Any]]
) -> None:
    for p in presets:
        body = client.post("/api/intervals", json={"values": p["values"]}).json()
        pred = client.post("/api/predict", json={"values": p["values"]}).json()["targets"]
        assert set(body["targets"]) == set(SCHEMA.targets)
        for t, r in body["targets"].items():
            iv = r["interval"]
            assert 0 <= iv["lo"] <= iv["hi"] <= 1
            assert (iv["level"], iv["method"], iv["n_models"]) == (
                CFG.level,
                CFG.method,
                CFG.n_models,
            )
            assert r["verdict"] == verdict(iv["lo"], iv["hi"], pred[t]["threshold"])


def test_intervals_rejects_invalid_input(client: TestClient) -> None:
    assert client.post("/api/intervals", json={"values": {"age": 1}}).status_code == 422


def test_intervals_deterministic_and_within_budget(
    client: TestClient, presets: list[dict[str, Any]]
) -> None:
    values = presets[0]["values"]
    first = client.post("/api/intervals", json={"values": values}).json()
    assert client.post("/api/intervals", json={"values": values}).json() == first
    predictor = client.app.state.predictor  # type: ignore[attr-defined]
    times = []
    for i in range(30):
        t = time.perf_counter()
        predictor.intervals(presets[i % len(presets)]["values"])
        times.append((time.perf_counter() - t) * 1000)
    assert statistics.median(times) < INTERVALS_BUDGET_MS


def test_replicates_are_reproducible_and_round_trip(tmp_path: Any) -> None:
    df = load_raw(schema=SCHEMA)
    split = load_split()
    X = raw_to_matrix(df, SCHEMA).iloc[split.train_idx].reset_index(drop=True)
    target = next(iter(SCHEMA.targets))
    y = raw_targets(df, SCHEMA).iloc[split.train_idx].reset_index(drop=True)[target].to_numpy()
    model = create_model("xgb")
    model.fit(X, y)
    cfg = UncertaintyConfig(method="bootstrap", n_models=3, level=0.9, seed=7)
    one, two = (fit_replicates(model, X, y, cfg, 0) for _ in range(2))
    one.save(tmp_path / "a.bin.gz")
    two.save(tmp_path / "b.bin.gz")
    assert (tmp_path / "a.bin.gz").read_bytes() == (tmp_path / "b.bin.gz").read_bytes()
    loaded = ReplicateSet.load(tmp_path / "a.bin.gz")
    rows: pd.DataFrame = X.iloc[:5]
    np.testing.assert_allclose(loaded.probabilities(rows), one.probabilities(rows))
    assert loaded.probabilities(rows).shape == (3, 5)


def test_intervals_are_cached_per_input(client: TestClient, presets: list[dict[str, Any]]) -> None:
    predictor = client.app.state.predictor  # type: ignore[attr-defined]
    calls: list[int] = []
    original = predictor._compute_intervals
    predictor._intervals_cache.clear()
    predictor._compute_intervals = lambda v: (calls.append(1), original(v))[1]
    try:
        values = presets[0]["values"]
        first = predictor.intervals(values)
        assert predictor.intervals(dict(reversed(list(values.items())))) is first  # key order-free
        assert len(calls) == 1
        predictor.intervals(presets[1]["values"])
        assert len(calls) == 2
        # /api/summary reuses the same entry (no recompute for an already-seen patient).
        client.post("/api/summary", json={"values": values})
        assert len(calls) == 2
    finally:
        predictor._compute_intervals = original


def test_intervals_cache_is_bounded(client: TestClient, presets: list[dict[str, Any]]) -> None:
    from app.services import predictor as mod

    predictor = client.app.state.predictor  # type: ignore[attr-defined]
    predictor._intervals_cache.clear()
    base = presets[0]["values"]
    for i in range(mod.INTERVALS_CACHE_SIZE + 5):
        predictor.intervals({**base, "age": 30 + i % 50, "weight": 50 + i // 50})
    assert len(predictor._intervals_cache) <= mod.INTERVALS_CACHE_SIZE
