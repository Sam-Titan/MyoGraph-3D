"""Startup: /api/health and /api/predict are ready before the bootstrap replicates are."""

import threading
from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from app.services.predictor import Predictor


def test_ranges_503_until_loaded_then_200(monkeypatch: Any) -> None:
    gate = threading.Event()
    real = Predictor.load_replicates

    def slow(self: Predictor) -> None:
        gate.wait(60)
        real(self)

    monkeypatch.setattr(Predictor, "load_replicates", slow)
    with TestClient(app) as c:
        presets = c.get("/api/presets").json()
        body = {"values": presets[0]["values"]}
        assert c.get("/api/health").status_code == 200
        assert c.post("/api/predict", json=body).status_code == 200
        for path in ("/api/intervals", "/api/summary"):
            res = c.post(path, json=body)
            assert res.status_code == 503
            assert int(res.headers["Retry-After"]) > 0
        gate.set()
        app.state.predictor.replicates_ready.wait(120)
        res = c.post("/api/intervals", json=body)
        assert res.status_code == 200
