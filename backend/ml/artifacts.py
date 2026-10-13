"""Write JSON artifacts with stable formatting (sorted keys, 6 dp floats)."""

import json
from pathlib import Path
from typing import Any

from app.core.config import ARTIFACTS_DIR


def round_floats(obj: Any, nd: int = 6) -> Any:
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, dict):
        return {k: round_floats(v, nd) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(v, nd) for v in obj]
    return obj


def write_json(name: str, data: Any, directory: Path = ARTIFACTS_DIR) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / name).write_text(json.dumps(round_floats(data), indent=2, sort_keys=True) + "\n")
