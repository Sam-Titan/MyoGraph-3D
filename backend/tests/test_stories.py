import copy
import json
import re

import pytest
import yaml
from fastapi.testclient import TestClient

from app.core.config import ARTIFACTS_DIR
from app.main import app
from ml.schema import load_schema
from ml.stories import STORIES_PATH, Stories, validate_stories

SCHEMA = load_schema()
PRESET_IDS = {p["id"] for p in json.loads((ARTIFACTS_DIR / "presets.json").read_text())}
RAW = yaml.safe_load(STORIES_PATH.read_text())


def _check(raw: dict) -> None:
    validate_stories(Stories.model_validate(raw), SCHEMA, PRESET_IDS)


def _first_text(raw: dict) -> dict:
    return raw["stories"][0]["steps"][0]["parts"][0]


def test_config_is_valid_and_story_count() -> None:
    _check(RAW)
    assert 3 <= len(RAW["stories"]) <= 4


def test_one_story_is_the_hard_case() -> None:
    assert "hard-case" in {s["preset"] for s in RAW["stories"]}


def test_no_digits_or_percent_in_any_text() -> None:
    for story in RAW["stories"]:
        for text in [story["title"], story["blurb"]] + [
            p["text"] for st in story["steps"] for p in st["parts"]
        ]:
            assert not re.search(r"[0-9%]", re.sub(r"\{[^}]*\}", "", text)), text


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.update(text="The model estimates 78 for it."),
        lambda p: p.update(text="The estimate and the result agree."),
        lambda p: p.update(text="Estimate {p:NOPE}."),
        lambda p: p.update(text="Estimate {bogus:CAD}."),
        lambda p: p.update(text="The angiogram showed {truth:CAD}."),
        lambda p: p.update(text="Estimate {p:CAD}.", when=["nonsense:CAD"]),
        lambda p: p.update(text="Reasons {factors_up:3}."),
        lambda p: p.update(text="Estimate {p:CAD"),
    ],
)
def test_text_rules_reject(mutate) -> None:  # noqa: ANN001
    raw = copy.deepcopy(RAW)
    mutate(_first_text(raw))
    with pytest.raises(ValueError):
        _check(raw)


def test_unknown_preset_and_target_rejected() -> None:
    raw = copy.deepcopy(RAW)
    raw["stories"][0]["preset"] = "not-a-preset"
    with pytest.raises(ValueError):
        _check(raw)
    raw = copy.deepcopy(RAW)
    raw["stories"][0]["steps"][0]["camera"]["target"] = "XYZ"
    with pytest.raises(ValueError):
        _check(raw)


def test_step_needs_an_anchor_part() -> None:
    raw = copy.deepcopy(RAW)
    step = raw["stories"][0]["steps"][0]
    step["parts"] = [{"text": "That is below it.", "when": ["below_threshold:CAD"]}]
    with pytest.raises(ValueError):
        _check(raw)


def test_stories_endpoint() -> None:
    with TestClient(app) as client:
        body = client.get("/api/stories").json()
    assert [s["id"] for s in body["stories"]] == [s["id"] for s in RAW["stories"]]
    assert all(s["preset"] in PRESET_IDS for s in body["stories"])
