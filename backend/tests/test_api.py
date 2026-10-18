import json
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import model_version
from app.main import app
from ml.schema import load_schema

SCHEMA = load_schema()


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        app.state.predictor.replicates_ready.wait(120)
        yield c


@pytest.fixture(scope="module")
def presets(client: TestClient) -> list[dict[str, Any]]:
    return client.get("/api/presets").json()


def test_presets_predict(client: TestClient, presets: list[dict[str, Any]]) -> None:
    assert presets
    for p in presets:
        res = client.post("/api/predict", json={"values": p["values"]})
        assert res.status_code == 200, (p["id"], res.text)
        body = res.json()
        assert set(body["targets"]) == set(SCHEMA.targets)
        assert set(body["explanations"]) == set(SCHEMA.targets)
        for t, pred in body["targets"].items():
            assert pred["positive"] == (pred["probability"] >= pred["threshold"])
            expl = body["explanations"][t]
            total = expl["base_logit"] + sum(c["logit"] for c in expl["contributions"])
            assert abs(1 / (1 + 2.718281828459045**-total) - pred["probability"]) < 1e-6
            mags = [abs(c["logit"]) for c in expl["contributions"]]
            assert mags == sorted(mags, reverse=True)


def test_predict_logs_timing(
    client: TestClient, presets: list[dict[str, Any]], caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.predictor"):
        client.post("/api/predict", json={"values": presets[0]["values"]})
    assert any("predict took" in r.message for r in caplog.records)


def test_out_of_bounds_is_422(client: TestClient, presets: list[dict[str, Any]]) -> None:
    values = {**presets[0]["values"], "age": 500}
    res = client.post("/api/predict", json={"values": values})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["body", "values", "age"]


def test_missing_and_bad_option_is_422(client: TestClient, presets: list[dict[str, Any]]) -> None:
    values = {k: v for k, v in presets[0]["values"].items() if k != "age"}
    values["sex"] = "nope"
    res = client.post("/api/predict", json={"values": values})
    locs = {tuple(e["loc"]) for e in res.json()["detail"]}
    assert res.status_code == 422
    assert {("body", "values", "age"), ("body", "values", "sex")} <= locs


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_is_422(client: TestClient, presets: list[dict[str, Any]], token: str) -> None:
    values = {**presets[0]["values"], "age": "__X__"}
    raw = json.dumps({"values": values}).replace('"__X__"', token)
    res = client.post("/api/predict", content=raw, headers={"content-type": "application/json"})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["body", "values", "age"]


def test_out_of_training_range_warns(client: TestClient, presets: list[dict[str, Any]]) -> None:
    feats = {f["id"]: f for f in client.get("/api/features").json()["features"]}
    age = feats["age"]
    assert age["input"]["max"] > age["observed"]["max"]
    values = {**presets[0]["values"], "age": age["input"]["max"]}
    body = client.post("/api/predict", json={"values": values}).json()
    assert any(w.startswith("Age ") for w in body["warnings"])
    assert next(r for r in body["breakdown"] if r["id"] == "age")["outside_training_range"]


def test_bmi_out_of_range_warns(client: TestClient, presets: list[dict[str, Any]]) -> None:
    stats = {f["id"]: f for f in client.get("/api/features").json()["features"]}
    bmi_max = stats["bmi"]["observed"]["max"]
    h = stats["height"]["input"]["min"]
    w = stats["weight"]["input"]["max"]
    assert w / (h / 100) ** 2 > bmi_max
    values = {**presets[0]["values"], "height": h, "weight": w, "bmi": 1.0}  # derived is ignored
    body = client.post("/api/predict", json={"values": values}).json()
    row = next(r for r in body["breakdown"] if r["id"] == "bmi")
    assert row["kind"] == "derived"
    assert row["outside_training_range"]
    assert row["value"] == pytest.approx(w / (h / 100) ** 2)
    assert any(x.startswith("BMI ") for x in body["warnings"])


def test_breakdown_has_group_and_kind(client: TestClient, presets: list[dict[str, Any]]) -> None:
    body = client.post("/api/predict", json={"values": presets[0]["values"]}).json()
    groups = {g.id for g in SCHEMA.groups}
    assert body["breakdown"]
    for r in body["breakdown"]:
        assert r["group"] in groups
        assert r["kind"] in {"number", "derived", "binary"}
        assert set(r["contribution"]) == set(SCHEMA.targets)


def test_features_targets(client: TestClient) -> None:
    targets = client.get("/api/features").json()["targets"]
    assert {t["id"] for t in targets} == set(SCHEMA.targets)
    for t in targets:
        assert t["role"] == SCHEMA.targets[t["id"]].role
        assert t["node"]
        if t["role"] == "vessel":  # anatomy.yaml `where`, shown in the 3D vessel key
            assert t["where"]


def test_metrics_includes_stability(client: TestClient) -> None:
    body = client.get("/api/metrics").json()
    assert set(body["targets"]) == set(SCHEMA.targets)
    for t in SCHEMA.targets:
        assert {"default", "tuned"} <= set(body["targets"][t]["test"])
        for stat in body["stability"]["targets"][t].values():
            assert {"median", "iqr", "min", "max", "official_percentile"} <= set(stat)


def test_metrics_excluded_inputs(client: TestClient) -> None:
    body = client.get("/api/metrics").json()
    assert body["excluded_inputs"] == SCHEMA.excluded_from_inputs
    inputs = {f.id for f in SCHEMA.features}
    assert not set(body["excluded_inputs"]) & inputs


def test_health_reports_model_version(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body["model_version"] == model_version() != "untrained"
