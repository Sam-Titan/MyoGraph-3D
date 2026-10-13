import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
CONFIG_DIR = REPO_ROOT / "config"
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"

UNTRAINED_VERSION = "untrained"


def model_version() -> str:
    """Version string from the model card, or "untrained" before `make train`."""
    card = ARTIFACTS_DIR / "model_card.json"
    if not card.exists():
        return UNTRAINED_VERSION
    return str(json.loads(card.read_text()).get("model_version", UNTRAINED_VERSION))
