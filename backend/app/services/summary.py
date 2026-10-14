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
    "non-expert. Rules: at most 120 words; use only the numbers and factor names in the facts; "
    "never add numbers, medical facts, causes or comparisons; do not expand abbreviations. "
    "Say 'the model estimates'. No diagnosis, no treatment, no medication or lifestyle advice, "
    "no instructions to the reader. Structure, in this order: "
    "(1) one sentence with the overall target's probability in percent and its verdict; "
    "(2) one sentence with each remaining target's probability in percent and verdict, in the "
    "order given; always state every percentage; "
    "(3) one sentence naming the selected target (by its label) and its main factors, "
    "using ONLY the factors listed for that target in facts.factors, never another target's; "
    "(4) only if outside_training_range_warnings is not empty, one sentence saying some values "
    "are outside the training range; write one paragraph with no line breaks; then end with "
    f"exactly this sentence: {DISCLAIMER}"
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


def build_facts(
    resp: PredictResponse, targets: list[TargetInfo], selected: str | None = None
) -> dict[str, Any]:
    """Everything the summary may mention, pre-formatted. Built from a server-side predict.

    Factors are included only for the overall target and the selected target.
    """
    overall = next((t for t in targets if t.role == "overall"), targets[0])
    chosen = next((t for t in targets if t.id == selected), overall)
    out_targets: list[dict[str, Any]] = []
    for t in targets:
        pred = resp.targets[t.id]
        out_targets.append(
            {
                "id": t.id,
                "label": t.label,
                "role": t.role,
                "probability_percent": _pct(pred.probability),
                "threshold_percent": _pct(pred.threshold),
                "verdict": "Likely" if pred.positive else "Unlikely",
            }
        )
    blocks: list[dict[str, Any]] = []
    for t in dict.fromkeys([overall.id, chosen.id]):
        contribs = resp.explanations[t].contributions
        blocks.append(
            {
                "target_id": t,
                "increasing": [f"{c.label}: {c.display_value}" for c in contribs if c.logit > 0][
                    :TOP_N
                ],
                "decreasing": [f"{c.label}: {c.display_value}" for c in contribs if c.logit < 0][
                    :TOP_N
                ],
            }
        )
    return {
        "selected_target": chosen.id,
        "targets": out_targets,
        "factors": blocks,
        "outside_training_range_warnings": list(resp.warnings),
    }


# --- template ---------------------------------------------------------------------------------
def _join(items: list[str]) -> str:
    if len(items) <= 2:
        return " and ".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def template_summary(facts: dict[str, Any]) -> str:
    """S1 overall, S2 vessels (API order), S3 selected target's factors, caveat, disclaimer."""
    ts: list[dict[str, Any]] = facts["targets"]
    overall = next((t for t in ts if t["role"] == "overall"), ts[0])
    others = [t for t in ts if t is not overall]
    chosen = next(t for t in ts if t["id"] == facts["selected_target"])
    block = next(b for b in facts["factors"] if b["target_id"] == chosen["id"])
    s = [
        f"The model estimates a {overall['probability_percent']}% probability for "
        f"{overall['label']}, which is {overall['verdict'].lower()} against its "
        f"{overall['threshold_percent']}% decision threshold."
    ]
    if others:
        parts = [
            f"{t['label']} {t['probability_percent']}% ({t['verdict'].lower()})" for t in others
        ]
        s.append(f"For the individual vessels it estimates {_join(parts)}.")
    up, down = block["increasing"], block["decreasing"]
    if up and down:
        s.append(
            f"For {chosen['label']}, the inputs pushing the estimate up most were {_join(up)}, "
            f"and those pulling it down most were {_join(down)}."
        )
    elif up or down:
        direction = "up" if up else "down"
        s.append(
            f"For {chosen['label']}, the inputs pushing the estimate {direction} most were "
            f"{_join(up or down)}."
        )
    n = len(facts["outside_training_range_warnings"])
    if n:
        s.append(
            f"{n} value{'s' if n > 1 else ''} fall outside the range seen in training, "
            "so this estimate is less reliable."
        )
    return " ".join(s) + " " + DISCLAIMER


# --- Groq -------------------------------------------------------------------------------------
def _request_groq(facts: dict[str, Any], settings: GroqSettings) -> str:
    """One chat completion; raises on HTTP/shape errors. The key only goes in the header."""
    payload: dict[str, Any] = {
        "model": settings.model,
        "temperature": 0,
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
    return " ".join(str(res.json()["choices"][0]["message"]["content"]).split())


def validate_llm_text(
    text: str, facts: dict[str, Any], all_labels: frozenset[str] = frozenset()
) -> bool:
    """Reject missing disclaimer, over-long text, banned phrasing, numbers not in the facts, or any
    input label that is not one of the selected target's listed factors."""
    if not text or not text.endswith(DISCLAIMER):
        return False
    body = text[: -len(DISCLAIMER)]
    if len(body.split()) > 140 or _BANNED.search(body):
        return False
    present = set(_NUMBER.findall(body))
    if not all(str(t["probability_percent"]) in present for t in facts["targets"]):
        return False  # every target's percentage must be stated
    allowed = set(_NUMBER.findall(json.dumps(facts, ensure_ascii=False)))
    if not all(n in allowed for n in _NUMBER.findall(body)):
        return False
    block = next(b for b in facts["factors"] if b["target_id"] == facts["selected_target"])
    listed = {f.split(": ", 1)[0].lower() for f in block["increasing"] + block["decreasing"]}
    for label in all_labels:
        if label.lower() not in listed and re.search(
            rf"(?<![\w]){re.escape(label)}(?![\w])", body, re.IGNORECASE
        ):
            return False
    return True


def summarise(
    facts: dict[str, Any],
    settings: GroqSettings | None,
    all_labels: frozenset[str] = frozenset(),
) -> SummaryResponse:
    template = template_summary(facts)
    if settings is None:
        return SummaryResponse(text=template, source="template")
    try:
        text = _request_groq(facts, settings)
    except Exception as exc:  # timeout, HTTP error, bad JSON: all fall back
        logger.warning("groq summary failed (%s); using template", type(exc).__name__)
        return SummaryResponse(text=template, source="template")
    if not validate_llm_text(text, facts, all_labels):
        logger.warning("groq summary rejected by validator; using template")
        return SummaryResponse(text=template, source="template")
    return SummaryResponse(text=text, source="groq", model=settings.model)
