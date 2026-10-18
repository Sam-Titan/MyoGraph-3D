"""frontend/public/snapshot.json must equal what the live API returns now (run `make snapshot`)."""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import model_version
from app.main import app
from app.snapshot import STATIC_ENDPOINTS, first_visit_preset_id, values_hash

SNAPSHOT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "snapshot.json"
STALE = "frontend/public/snapshot.json is stale: run `make snapshot` and commit it"


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        app.state.predictor.replicates_ready.wait(120)
        yield c


@pytest.fixture(scope="module")
def snap() -> dict[str, Any]:
    return json.loads(SNAPSHOT.read_text())  # type: ignore[no-any-return]


def test_model_version(snap: dict[str, Any]) -> None:
    assert snap["model_version"] == model_version(), STALE


def test_static_payloads_match(client: TestClient, snap: dict[str, Any]) -> None:
    for name, path in STATIC_ENDPOINTS.items():
        assert snap[name] == client.get(path).json(), (name, STALE)


def test_every_preset_equals_live(client: TestClient, snap: dict[str, Any]) -> None:
    presets = client.get("/api/presets").json()
    assert set(snap["entries"]) == {p["id"] for p in presets}, STALE
    for p in presets:
        entry = snap["entries"][p["id"]]
        assert entry["values"] == p["values"], (p["id"], STALE)
        assert entry["values_hash"] == values_hash(p["values"]), (p["id"], STALE)
        live = client.post("/api/predict", json={"values": p["values"]}).json()
        assert entry["predict"] == live, (p["id"], STALE)
        live = client.post("/api/intervals", json={"values": p["values"]}).json()
        assert entry["intervals"] == live, (p["id"], STALE)
        assert entry["predict"]["model_version"] == snap["model_version"]


def test_first_visit_preset(snap: dict[str, Any]) -> None:
    vessels = [t["id"] for t in snap["features"]["targets"] if t["role"] == "vessel"]
    assert snap["first_visit_preset_id"] == first_visit_preset_id(snap["presets"], vessels)
