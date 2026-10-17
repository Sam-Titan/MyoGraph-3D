"""Plain-language wording (`config/display.yaml`): validated at startup, served by the API."""

from functools import cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict

from app.core.config import CONFIG_DIR

DISPLAY_PATH = CONFIG_DIR / "display.yaml"


class ThresholdLabels(BaseModel):
    model_config = ConfigDict(extra="forbid")

    above: str
    below: str
    uncertain_suffix: str


class DisplayConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    threshold_labels: ThresholdLabels


@cache
def load_display(path: Path = DISPLAY_PATH) -> DisplayConfig:
    return DisplayConfig.model_validate(yaml.safe_load(path.read_text()))
