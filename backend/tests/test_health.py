from fastapi.testclient import TestClient

from app.core.config import model_version
from app.main import app


def test_health() -> None:
    res = TestClient(app).get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["model_version"], str)
    assert body["model_version"] == model_version() != "untrained"
