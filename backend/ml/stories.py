"""Typed, validated view of `config/stories.yaml` (guided walk-throughs of hold-out presets).

Story text never hard-codes a number or an outcome: every figure comes from the live API through
`{tokens}`, and every sentence that states an outcome (agree, miss, above/below a threshold, ...)
sits in a part with a `when` condition that the frontend evaluates at runtime.
"""

import re
from functools import cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import CONFIG_DIR
from ml.schema import FeatureSchema

STORIES_PATH = CONFIG_DIR / "stories.yaml"

#: Tokens that take a target id.
TARGET_TOKENS = {"p", "range", "thr", "truth", "name", "plain", "where"}
#: Tokens that take a count (1-5): up to N factors, joined as a list.
FACTOR_TOKENS = {"factors_up": "up", "factors_down": "down"}
#: Tokens that take no argument.
GLOBAL_TOKENS = {"n_patients"}
#: Conditions that take a target id / need no argument.
TARGET_CONDITIONS = {
    "above_threshold",
    "below_threshold",
    "well_above_threshold",
    "well_below_threshold",
    "agrees",
    "disagrees",
    "range_crosses_threshold",
    "range_clear_of_threshold",
}
GLOBAL_CONDITIONS = {"all_agree", "any_disagrees"}

_TOKEN = re.compile(r"\{(\w+)(?::(\w+))?\}")
_UNSAFE = re.compile(r"[0-9%]")
#: Words that state an outcome or a comparison: only allowed in parts that have a `when`.
_OUTCOME_WORDS = re.compile(
    r"\b(agrees?|disagrees?|miss(?:es|ed)?|higher|lower|much|far|well|above|below|wrong|correct|"
    r"confident|than)\b",
    re.IGNORECASE,
)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Part(_Strict):
    text: str = Field(min_length=1)
    #: All must hold (evaluated in the browser on the live prediction): `kind:TARGET` or `kind`.
    when: list[str] = []


class Camera(_Strict):
    target: str  # a target id from features.yaml; its node is read from /api/features


class Highlight(_Strict):
    target: str
    direction: Literal["up", "down"] = "up"
    top: int = Field(default=3, ge=1, le=5)


class Step(_Strict):
    id: str
    parts: list[Part] = Field(min_length=1)
    camera: Camera | None = None
    highlight: Highlight | None = None
    reveal_truth: bool = False


class Story(_Strict):
    id: str
    title: str
    blurb: str
    preset: str
    steps: list[Step] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_steps(self) -> Story:
        ids = [s.id for s in self.steps]
        if len(set(ids)) != len(ids):
            raise ValueError(f"{self.id}: duplicate step ids")
        return self


class Stories(_Strict):
    #: Closing sentence of every step that lists factors; tokens only, no digits.
    factor_note: str = Field(min_length=1)
    stories: list[Story] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self) -> Stories:
        ids = [s.id for s in self.stories]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate story ids")
        return self


def _split_condition(cond: str) -> tuple[str, str | None]:
    kind, _, arg = cond.partition(":")
    return kind, (arg or None)


def validate_stories(stories: Stories, schema: FeatureSchema, preset_ids: set[str]) -> None:
    """Cross-checks against targets and presets, plus the text rules. Raises ValueError."""
    targets = set(schema.targets)
    note = _TOKEN.sub("", stories.factor_note)
    if _UNSAFE.search(note) or _OUTCOME_WORDS.search(note):
        raise ValueError(f"factor_note: digits, % or outcome wording: {stories.factor_note!r}")
    for name, arg in _TOKEN.findall(stories.factor_note):
        if name not in GLOBAL_TOKENS or arg:
            raise ValueError(f"factor_note: token {{{name}}} not allowed here")

    def need_target(where: str, tid: str | None) -> None:
        if tid not in targets:
            raise ValueError(f"{where}: unknown target {tid!r}")

    for story in stories.stories:
        if story.preset not in preset_ids:
            raise ValueError(f"{story.id}: preset {story.preset!r} is not a hold-out preset")
        for text in (story.title, story.blurb):
            if _UNSAFE.search(text):
                raise ValueError(f"{story.id}: digits or % in title/blurb")
        for step in story.steps:
            where = f"{story.id}/{step.id}"
            cam, hl = step.camera, step.highlight
            for t in (cam.target if cam else None, hl.target if hl else None):
                if t is not None:
                    need_target(where, t)
            if cam and hl and cam.target != hl.target:
                raise ValueError(f"{where}: camera and highlight must point at the same target")
            anchored = False
            for part in step.parts:
                if _UNSAFE.search(_TOKEN.sub("", part.text)):
                    raise ValueError(f"{where}: digits or % in text (use a token): {part.text!r}")
                has_factors = False
                for name, arg in _TOKEN.findall(part.text):
                    if name in TARGET_TOKENS:
                        need_target(where, arg)
                        if name == "truth" and not step.reveal_truth:
                            raise ValueError(f"{where}: {{truth}} before reveal_truth")
                    elif name in FACTOR_TOKENS:
                        has_factors = True
                        if not (arg and arg.isdigit() and 1 <= int(arg) <= 5):
                            raise ValueError(f"{where}: {{{name}}} needs a count 1-5")
                        if hl is None or hl.direction != FACTOR_TOKENS[name]:
                            raise ValueError(f"{where}: {{{name}}} needs a matching highlight")
                    elif name in GLOBAL_TOKENS and not arg:
                        continue
                    else:
                        raise ValueError(f"{where}: unknown token {{{name}}}")
                if re.sub(_TOKEN, "", part.text).count("{") or "}" in re.sub(_TOKEN, "", part.text):
                    raise ValueError(f"{where}: malformed token in {part.text!r}")
                for cond in part.when:
                    kind, arg = _split_condition(cond)
                    if kind in TARGET_CONDITIONS:
                        need_target(where, arg)
                    elif kind not in GLOBAL_CONDITIONS or arg is not None:
                        raise ValueError(f"{where}: unknown condition {cond!r}")
                if not part.when and _OUTCOME_WORDS.search(part.text):
                    raise ValueError(f"{where}: outcome wording needs a `when`: {part.text!r}")
                anchored = anchored or (not part.when and not has_factors)
            if not anchored:
                raise ValueError(f"{where}: needs one part with no `when` and no factor token")


@cache
def load_stories(path: Path = STORIES_PATH) -> Stories:
    return Stories.model_validate(yaml.safe_load(path.read_text()))
