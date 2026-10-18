"""Plain-language wording (`config/display.yaml`): validated at startup, served by the API.

Every template may only use the placeholders listed for it in `ALLOWED`, so a typo fails at startup
instead of showing `{oops}` in the UI.
"""

import string
from functools import cache
from pathlib import Path
from typing import Self

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import CONFIG_DIR

DISPLAY_PATH = CONFIG_DIR / "display.yaml"

#: Placeholders each template may use (dotted path into the config).
ALLOWED: dict[str, frozenset[str]] = {
    "headline": frozenset({"p", "outcome", "range"}),
    "headline_range": frozenset({"range"}),
    "headline_compact": frozenset({"label"}),
    "headline_range_compact": frozenset({"range"}),
    "cutoff_line": frozenset({"thr"}),
    "cutoff_crosses": frozenset(),
    "base_rate_note.line1": frozenset({"n_total", "prev", "outcome"}),
    "base_rate_note.line2": frozenset(),
    "range_meaning": frozenset(),
    "waterfall.title": frozenset({"p"}),
    "waterfall.start_label": frozenset(),
    "waterfall.end_label": frozenset(),
    "waterfall.baseline_caption": frozenset({"target", "base", "prev", "outcome"}),
    "waterfall.order_caption": frozenset(),
    "waterfall.points": frozenset({"sign", "n"}),
    "waterfall.points_one": frozenset({"sign"}),
    "waterfall.cutoff_tick": frozenset({"thr"}),
    "waterfall.technical_title": frozenset(),
    "waterfall.technical_line": frozenset({"base_logit", "logit", "p"}),
    "dots.caption": frozenset({"p", "outcome"}),
    "dots.legend_solid": frozenset(),
    "dots.legend_light": frozenset(),
    "dots.legend_ring": frozenset(),
    "performance.roc_auc": frozenset({"outcome", "cv", "holdout"}),
    "performance.metric_example": frozenset({"target", "n_test"}),
    "performance.brier": frozenset({"value", "prev", "ref"}),
    "performance.accuracy": frozenset({"value", "v100", "majority"}),
    "performance.precision": frozenset({"value", "v100", "outcome"}),
    "performance.recall": frozenset({"value", "v100", "outcome"}),
    "performance.f1": frozenset({"value"}),
    "trust.title": frozenset(),
    "trust.rule": frozenset({"min_auc"}),
    "trust.reliable": frozenset({"id", "label", "auc", "n_unc", "n"}),
    "trust.weak": frozenset({"id", "label", "auc", "n_unc", "n"}),
    "trust.footer": frozenset({"n_total"}),
}


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ThresholdLabels(_Strict):
    above: str
    below: str
    uncertain_suffix: str


class BaseRateNote(_Strict):
    line1: str
    line2: str


class WaterfallText(_Strict):
    title: str
    start_label: str
    end_label: str
    baseline_caption: str
    order_caption: str
    points: str
    points_one: str
    cutoff_tick: str
    technical_title: str
    technical_line: str


class DotsText(_Strict):
    caption: str
    legend_solid: str
    legend_light: str
    legend_ring: str


class PerformanceText(_Strict):
    roc_auc: str
    metric_example: str
    brier: str
    accuracy: str
    precision: str
    recall: str
    f1: str


class TrustText(_Strict):
    title: str
    reliable_min_auc: float = Field(gt=0.5, lt=1)
    rule: str
    reliable: str
    weak: str
    footer: str


class GlossaryEntry(_Strict):
    id: str
    match: list[str] = Field(min_length=1)
    text: str


class DisplayConfig(_Strict):
    threshold_labels: ThresholdLabels
    waterfall_top_n: int = Field(ge=1, le=15)
    headline: str
    headline_range: str
    headline_compact: str
    headline_range_compact: str
    compact_labels: dict[str, str]
    cutoff_line: str
    cutoff_crosses: str
    base_rate_note: BaseRateNote
    range_meaning: str
    waterfall: WaterfallText
    dots: DotsText
    performance: PerformanceText
    trust: TrustText
    glossary: list[GlossaryEntry]

    @model_validator(mode="after")
    def _placeholders_and_glossary(self) -> Self:
        for path, allowed in ALLOWED.items():
            node: object = self
            for part in path.split("."):
                node = getattr(node, part)
            assert isinstance(node, str), path
            used = {name for _, name, _, _ in string.Formatter().parse(node) if name}
            if not used <= allowed:
                raise ValueError(f"{path}: unknown placeholder(s) {sorted(used - allowed)}")
        ids = [g.id for g in self.glossary]
        if len(ids) != len(set(ids)):
            raise ValueError("glossary ids must be unique")
        return self


@cache
def load_display(path: Path = DISPLAY_PATH) -> DisplayConfig:
    return DisplayConfig.model_validate(yaml.safe_load(path.read_text()))
