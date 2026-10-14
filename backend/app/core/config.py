import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

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


DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"

# Root .env is optional; real environment variables win.
load_dotenv(REPO_ROOT / ".env", override=False)


@dataclass(frozen=True)
class GroqSettings:
    api_key: str
    model: str

    def __repr__(self) -> str:  # never let the key reach a log line
        return f"GroqSettings(model={self.model!r}, api_key=<redacted>)"


def groq_settings() -> GroqSettings | None:
    """Groq config from the environment (read per call), or None when no key is set."""
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        return None
    return GroqSettings(
        api_key=key, model=os.environ.get("GROQ_MODEL", "").strip() or DEFAULT_GROQ_MODEL
    )
