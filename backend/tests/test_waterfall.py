import copy
import math
from typing import Any

import pytest
import yaml
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from ml.display import DISPLAY_PATH, DisplayConfig, load_display
from ml.schema import load_schema
from ml.waterfall import Factor, build_waterfall

SCHEMA = load_schema()
DISPLAY = load_display()
TOP_N = DISPLAY.waterfall_top_n


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def _factors(logits: list[float]) -> list[Factor]:
    return [Factor(f"f{i}", f"Factor {i}", str(i), z) for i, z in enumerate(logits)]


@pytest.fixture(scope="module")
def client() -> Any:
    with TestClient(app) as c:
        app.state.predictor.replicates_ready.wait(120)
        yield c


@pytest.fixture(scope="module")
def presets(client: TestClient) -> list[dict[str, Any]]:
    return client.get("/api/presets").json()


def test_steps_start_at_baseline_chain_and_end_at_probability() -> None:
    base, logits = -0.4, [0.9, -0.5, 0.3, 0.2, -0.1, 0.05, 0.04, -0.02]
    p = _sigmoid(base + sum(logits))
    steps = build_waterfall(base, _factors(logits), p, TOP_N)
    assert steps[0].from_p == pytest.approx(_sigmoid(base))
    assert steps[-1].to_p == pytest.approx(p, abs=1e-6)
    assert all(a.to_p == b.from_p for a, b in zip(steps, steps[1:], strict=False))


def test_other_factors_step_only_when_more_than_top_n() -> None:
    few = build_waterfall(0.0, _factors([0.1] * TOP_N), _sigmoid(0.1 * TOP_N), TOP_N)
    assert len(few) == TOP_N and all(s.feature is not None for s in few)
    many_logits = [0.1] * (TOP_N + 3)
    many = build_waterfall(0.0, _factors(many_logits), _sigmoid(sum(many_logits)), TOP_N)
    assert len(many) == TOP_N + 1
    assert many[-1].feature is None and many[-1].label == "3 other factors"
    one_more = build_waterfall(0.0, _factors([0.1] * (TOP_N + 1)), 0.7, TOP_N)
    assert one_more[-1].label == "1 other factor"


def test_order_is_largest_first_with_id_tie_break_and_deterministic() -> None:
    fs = [Factor("b", "B", "", 0.5), Factor("a", "A", "", -0.5), Factor("c", "C", "", 1.0)]
    first = build_waterfall(0.0, fs, 0.6, TOP_N)
    assert [s.feature for s in first] == ["c", "a", "b"]
    assert build_waterfall(0.0, list(reversed(fs)), 0.6, TOP_N) == first


def test_predict_response_has_a_waterfall_per_target(
    client: TestClient, presets: list[dict[str, Any]]
) -> None:
    for preset in presets[:4]:
        body = client.post("/api/predict", json={"values": preset["values"]}).json()
        for t in SCHEMA.targets:
            expl, p = body["explanations"][t], body["targets"][t]["probability"]
            steps = expl["waterfall"]
            assert len(steps) == TOP_N + 1  # the 54-odd inputs always exceed top_n
            assert steps[-1]["feature"] is None and "other factors" in steps[-1]["label"]
            assert steps[0]["from_p"] == pytest.approx(expl["base_probability"], abs=1e-9)
            assert steps[-1]["to_p"] == pytest.approx(p, abs=1e-6)
            closes = expl["base_logit"] + sum(c["logit"] for c in expl["contributions"])
            assert _sigmoid(closes) == pytest.approx(p, abs=1e-6)  # the pinned last step is honest
            assert all(a["to_p"] == b["from_p"] for a, b in zip(steps, steps[1:], strict=False))
            ids = [c["id"] for c in expl["contributions"][:TOP_N]]
            assert [s["feature"] for s in steps[:TOP_N]] == ids


def test_targets_carry_outcome_phrases(client: TestClient) -> None:
    for t in client.get("/api/features").json()["targets"]:
        assert t["outcome_phrase"]


def test_display_config_rejects_unknown_placeholders_and_keys() -> None:
    raw = yaml.safe_load(DISPLAY_PATH.read_text())
    bad = copy.deepcopy(raw)
    bad["headline"] = "The model estimates {oops}"
    with pytest.raises(ValidationError):
        DisplayConfig.model_validate(bad)
    extra = copy.deepcopy(raw)
    extra["surprise"] = 1
    with pytest.raises(ValidationError):
        DisplayConfig.model_validate(extra)
    dup = copy.deepcopy(raw)
    dup["glossary"].append(dup["glossary"][0])
    with pytest.raises(ValidationError):
        DisplayConfig.model_validate(dup)


def test_display_endpoint_serves_full_config(client: TestClient) -> None:
    body = client.get("/api/display").json()
    assert DisplayConfig.model_validate(body) == DISPLAY
    text = yaml.safe_load(DISPLAY_PATH.read_text())
    flat = str(text).lower()
    assert "diagnos" not in flat.replace('never "diagnosis"', "")
