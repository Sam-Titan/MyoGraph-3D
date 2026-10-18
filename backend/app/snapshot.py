"""Write `frontend/public/snapshot.json` (offline, no server) for `make snapshot`.

The file lets the app paint its first screen before the (possibly sleeping) API answers: the static
payloads plus predict + intervals for every preset, each exactly as the live endpoints return them.
Each entry carries a hash of its input values; the frontend ignores an entry whose model_version or
values no longer match the live API, and `tests/test_snapshot.py` fails when the file is stale.
"""

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

#: Responses copied verbatim from the API, keyed by the name the frontend seeds them under.
STATIC_ENDPOINTS = {
    "features": "/api/features",
    "display": "/api/display",
    "presets": "/api/presets",
    "stories": "/api/stories",
}


def values_hash(values: dict[str, Any]) -> str:
    canonical = json.dumps(values, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def first_visit_preset_id(presets: list[dict[str, Any]], vessels: list[str]) -> str:
    """Same rule as the frontend's PresetSelect: every vessel stenotic, else the first preset."""
    for p in presets:
        if vessels and all(p["truth"].get(v) is True for v in vessels):
            return str(p["id"])
    return str(presets[0]["id"])


def build_snapshot(client: TestClient) -> dict[str, Any]:
    app.state.predictor.replicates_ready.wait(300)

    def get(path: str) -> Any:
        res = client.get(path)
        res.raise_for_status()
        return res.json()

    def post(path: str, values: dict[str, Any]) -> Any:
        res = client.post(path, json={"values": values})
        res.raise_for_status()
        return res.json()

    snapshot: dict[str, Any] = {"model_version": get("/api/health")["model_version"]}
    for name, path in STATIC_ENDPOINTS.items():
        snapshot[name] = get(path)
    presets = snapshot["presets"]
    # Vessels are the targets with a mesh of their own (the overall target has none).
    vessels = [t["id"] for t in snapshot["features"]["targets"] if t["role"] == "vessel"]
    snapshot["first_visit_preset_id"] = first_visit_preset_id(presets, vessels)
    snapshot["entries"] = {
        p["id"]: {
            "values_hash": values_hash(p["values"]),
            "values": p["values"],
            "predict": post("/api/predict", p["values"]),
            "intervals": post("/api/intervals", p["values"]),
        }
        for p in presets
    }
    return snapshot


if __name__ == "__main__":
    # Written to a path, not stdout: the access log shares stdout.
    out = Path(sys.argv[1])
    with TestClient(app) as c:
        out.write_text(json.dumps(build_snapshot(c), sort_keys=True, separators=(",", ":")) + "\n")
