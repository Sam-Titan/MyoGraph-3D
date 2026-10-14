"""Plain-language summary: structured facts -> deterministic template, optionally reworded by Groq.

Only the facts object (never raw inputs) is ever sent out. Any problem with the LLM path falls back
to the template, so the endpoint always returns something safe.
"""

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import GroqSettings
from app.schemas import PredictResponse, SummaryResponse, TargetInfo

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TIMEOUT_S = 8.0
TOP_N = 3
DISCLAIMER = (
    "These are model estimates for education and decision support, "
    "not a substitute for imaging or clinical judgement."
)
SYSTEM_PROMPT = (
    "You rewrite a structured set of model outputs as a short plain-language summary for a "
    "non-expert. Rules: at most 120 words. Use only the numbers and factor names in the facts; "
    "never add numbers, medical facts, causes or comparisons; keep each factor list with the "
    "target it belongs to, and do not expand abbreviations. Say 'the model estimates'. "
    "No diagnosis, no treatment, no medication or lifestyle advice, no instructions to the reader. "
    f"End with exactly this sentence: {DISCLAIMER}"
)
_BANNED = re.compile(
    r"you have|you should|diagnos|treat|medicat|should take|prescrib|your doctor", re.IGNORECASE
)
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


# --- facts ------------------------------------------------------------------------------------
def _pct(p: float) -> int:
    return round(p * 100)


def _fmt(v: float) -> str:
    return f"{round(v, 1):g}"


def build_facts(resp: PredictResponse, targets: list[TargetInfo]) -> dict[str, Any]:
    """Everything the summary may mention, pre-formatted. Built from a server-side predict."""
    out_targets: list[dict[str, Any]] = []
    for t in targets:
        pred = resp.targets[t.id]
        contribs = resp.explanations[t.id].contributions
        up = [c for c in contribs if c.logit > 0][:TOP_N]
        down = [c for c in contribs if c.logit < 0][:TOP_N]
        out_targets.append(
            {
                "id": t.id,
                "label": t.label,
                "role": t.role,
                "probability_percent": _pct(pred.probability),
                "threshold_percent": _pct(pred.threshold),
                "verdict": "Likely" if pred.positive else "Unlikely",
                "increasing": [f"{c.label}: {c.display_value}" for c in up],
                "decreasing": [f"{c.label}: {c.display_value}" for c in down],
            }
        )
    outside = [
        f"{r.label}: {_fmt(r.value)}{' ' + r.unit if r.unit else ''} ({r.status})"
        for r in resp.breakdown
        if r.status in ("low", "high")
    ]
    return {
        "targets": out_targets,
        "outside_reference_range": outside,
        "outside_training_range_warnings": list(resp.warnings),
    }


# --- template ---------------------------------------------------------------------------------
def _join(items: list[str]) -> str:
    if len(items) <= 2:
        return " and ".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def template_summary(facts: dict[str, Any]) -> str:
    """4-6 short deterministic sentences, then the disclaimer."""
    ts: list[dict[str, Any]] = facts["targets"]
    overall = next((t for t in ts if t["role"] == "overall"), ts[0])
    vessels = [t for t in ts if t is not overall]
    s = [
        f"The model estimates a {overall['probability_percent']}% probability for "
        f"{overall['label']}, which is {overall['verdict'].lower()} against its "
        f"{overall['threshold_percent']}% decision threshold."
    ]
    if vessels:
        parts = [
            f"{v['label']} {v['probability_percent']}% ({v['verdict'].lower()})" for v in vessels
        ]
        s.append(f"For the individual vessels it estimates {_join(parts)}.")
    if overall["increasing"]:
        s.append(
            f"The inputs pushing the overall estimate up most were {_join(overall['increasing'])}."
        )
    if overall["decreasing"]:
        s.append(f"The inputs pulling it down most were {_join(overall['decreasing'])}.")
    if facts["outside_reference_range"]:
        s.append(
            "Measurements outside the typical reference range: "
            f"{_join(facts['outside_reference_range'])}."
        )
    n = len(facts["outside_training_range_warnings"])
    if n:
        s.append(
            f"{n} value{'s' if n > 1 else ''} fall outside the range seen in training, "
            "so this estimate is less reliable."
        )
    return " ".join(s[:6]) + " " + DISCLAIMER


# --- Groq -------------------------------------------------------------------------------------
def _request_groq(facts: dict[str, Any], settings: GroqSettings) -> str:
    """One chat completion; raises on HTTP/shape errors. The key only goes in the header."""
    payload: dict[str, Any] = {
        "model": settings.model,
        "temperature": 0.2,
        "max_tokens": 800,  # headroom for reasoning models' hidden thinking tokens
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
        ],
    }
    if "gpt-oss" in settings.model:
        payload["reasoning_effort"] = "low"
    res = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {settings.api_key}"},
        json=payload,
        timeout=GROQ_TIMEOUT_S,
    )
    res.raise_for_status()
    return str(res.json()["choices"][0]["message"]["content"]).strip()


def validate_llm_text(text: str, facts: dict[str, Any]) -> bool:
    """Reject missing disclaimer, over-long text, banned phrasing or numbers not in the facts."""
    if not text or not text.endswith(DISCLAIMER):
        return False
    body = text[: -len(DISCLAIMER)]
    if len(body.split()) > 140 or _BANNED.search(body):
        return False
    allowed = set(_NUMBER.findall(json.dumps(facts, ensure_ascii=False)))
    return all(n in allowed for n in _NUMBER.findall(body))


def summarise(facts: dict[str, Any], settings: GroqSettings | None) -> SummaryResponse:
    template = template_summary(facts)
    if settings is None:
        return SummaryResponse(text=template, source="template")
    try:
        text = _request_groq(facts, settings)
    except Exception as exc:  # timeout, HTTP error, bad JSON: all fall back
        logger.warning("groq summary failed (%s); using template", type(exc).__name__)
        return SummaryResponse(text=template, source="template")
    if not validate_llm_text(text, facts):
        logger.warning("groq summary rejected by validator; using template")
        return SummaryResponse(text=template, source="template")
    return SummaryResponse(text=text, source="groq", model=settings.model)
