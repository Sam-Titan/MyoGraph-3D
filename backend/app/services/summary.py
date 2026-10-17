"""Plain-language summary: structured facts -> deterministic template, optionally reworded by Groq.

Only the facts object (never raw inputs) is ever sent out. Any problem with the LLM path falls back
to the template, so the endpoint always returns something safe.
"""

import json
import logging
import re
import threading
import time
from collections import OrderedDict
from typing import Any

import httpx

from app.core.config import GroqSettings
from app.schemas import IntervalsResponse, PredictResponse, SummaryResponse, TargetInfo

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_TIMEOUT_S = 8.0
TOP_N = 3
RETRY_DELAY_S = 2.0
CACHE_SIZE = 256
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
    "(1) one or two sentences with the overall target's probability in percent, its range, and "
    "its verdict (likely, unlikely or uncertain: uncertain means the range crosses the decision "
    "threshold); "
    "(2) one sentence with each remaining target's probability in percent, range and verdict, in "
    "the order given; always state every percentage; the range only describes how much the "
    "estimate depends on which patients the model learned from, never call it the patient's "
    "true risk or a guarantee; "
    "(3) one sentence naming the selected target (by its label, as given) and its main factors, "
    "using ONLY the factors listed for that target in facts.factors, never another target's; "
    "(4) only if outside_training_range_warnings is not empty, one sentence saying some values "
    "are outside the training range; write one paragraph with no line breaks; then end with "
    f"exactly this sentence: {DISCLAIMER}\n"
    "Style: say 'probability of <condition>', never 'probability that X is likely'; write "
    "percentages like 75% (no space); no meta phrases such as 'the selected target is'. "
    "Match the tone and structure of this example, but take the target names, verdict words "
    "(above/below, likely/unlikely) and order from the facts, never from the example:\n"
    "EXAMPLE: The model estimates a {overall_pct} probability of coronary artery disease for this "
    "patient (range {overall_range}); the whole range is at or above its {overall_thr} decision "
    "threshold. For the individual arteries, it estimates {lad_pct} (range {lad_range}) for the "
    "LAD (likely), {lcx_pct} (range {lcx_range}) for the LCX (unlikely) and {rca_pct} (range "
    "{rca_range}) for the RCA (uncertain). For {selected_label}, the factors that raised the "
    "estimate most were "
    "{up_factor_1} and {up_factor_2}, while {down_factor_1} lowered it. {disclaimer}"
)
_BANNED = re.compile(
    r"you have|you should|diagnos|treat|medicat|should take|prescrib|your doctor", re.IGNORECASE
)
_A_BEFORE_EIGHT = re.compile(r"\b([Aa]) (?=(?:8\d?|11|18)%)")
_SPACE_PCT = re.compile(r"(\d) %")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


# --- facts ------------------------------------------------------------------------------------
def _pct(p: float) -> int:
    return round(p * 100)


def _fmt(v: float) -> str:
    return f"{round(v, 1):g}"


def build_facts(
    resp: PredictResponse,
    ranges: IntervalsResponse,
    targets: list[TargetInfo],
    selected: str | None = None,
) -> dict[str, Any]:
    """Everything the summary may mention, pre-formatted. Built from a server-side predict.

    Factors are included only for the overall target and the selected target.
    """
    overall = next((t for t in targets if t.role == "overall"), targets[0])
    chosen = next((t for t in targets if t.id == selected), overall)
    out_targets: list[dict[str, Any]] = []
    for t in targets:
        pred = resp.targets[t.id]
        rng = ranges.targets[t.id]
        out_targets.append(
            {
                "id": t.id,
                "label": t.plain_label,  # prose wording, e.g. "coronary artery disease"
                "role": t.role,
                "probability_percent": _pct(pred.probability),
                "threshold_percent": _pct(pred.threshold),
                "range_low_percent": _pct(rng.interval.lo),
                "range_high_percent": _pct(rng.interval.hi),
                "range_level_percent": _pct(rng.interval.level),
                "verdict": rng.verdict,
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
def _a(pct: int) -> str:
    return "an" if str(pct).startswith("8") or pct in (11, 18) else "a"


def _range(t: dict[str, Any]) -> str:
    return f"{t['range_low_percent']}–{t['range_high_percent']}%"


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
    overall_pct = overall["probability_percent"]
    thr = overall["threshold_percent"]
    where = {
        "likely": f"The whole range is at or above its {thr}% decision threshold.",
        "unlikely": f"The whole range is below its {thr}% decision threshold.",
        "uncertain": f"The range crosses its {thr}% decision threshold, so the verdict is "
        "uncertain.",
    }[overall["verdict"]]
    s = [
        f"The model estimates {_a(overall_pct)} {overall_pct}% probability "
        f"(range {_range(overall)}) for {overall['label']}. {where}"
    ]
    if others:
        parts = [
            f"{t['label']} {t['probability_percent']}% (range {_range(t)}, {t['verdict']})"
            for t in others
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
    # The route is a sync `def` (threadpool), so sleeping here never blocks the event loop.
    for attempt in range(2):
        res = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.api_key}"},
            json=payload,
            timeout=GROQ_TIMEOUT_S,
        )
        if res.status_code == 429 and attempt == 0:
            logger.warning("groq rate-limited (429); retrying once")
            time.sleep(RETRY_DELAY_S)
            continue
        break
    res.raise_for_status()
    text = " ".join(str(res.json()["choices"][0]["message"]["content"]).split())
    text = _SPACE_PCT.sub(r"\1%", text)
    return _A_BEFORE_EIGHT.sub(r"\1n ", text)


_VERDICT_WORD = re.compile(r"\b(likely|unlikely|uncertain)\b", re.IGNORECASE)


def _states_ranges_and_verdicts(body: str, facts: dict[str, Any]) -> bool:
    """When the facts carry ranges: every range bound is stated, every verdict word used is one the
    facts give (never another), and each verdict that occurs in the facts is stated."""
    present = set(_NUMBER.findall(body))
    verdicts = {t["verdict"] for t in facts["targets"] if "verdict" in t}
    for t in facts["targets"]:
        if (
            "range_low_percent" in t
            and not {
                str(t["range_low_percent"]),
                str(t["range_high_percent"]),
            }
            <= present
        ):
            return False
    if not verdicts:
        return True
    used = {w.lower() for w in _VERDICT_WORD.findall(body)}
    return used == verdicts


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
    if not _states_ranges_and_verdicts(body, facts):
        return False
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


# --- cache ------------------------------------------------------------------------------------
# Keyed by the canonical facts (already derived from the inputs and the resolved selected target)
# plus the model. Only validated Groq results are stored, never template fallbacks.
_cache: OrderedDict[str, SummaryResponse] = OrderedDict()
_cache_lock = threading.Lock()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cache_key(facts: dict[str, Any], model: str) -> str:
    return json.dumps([facts, model], sort_keys=True, ensure_ascii=False)


def summarise(
    facts: dict[str, Any],
    settings: GroqSettings | None,
    all_labels: frozenset[str] = frozenset(),
) -> SummaryResponse:
    template = template_summary(facts)
    if settings is None:
        return SummaryResponse(text=template, source="template")
    key = _cache_key(facts, settings.model)
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
            return hit
    try:
        text = _request_groq(facts, settings)
    except Exception as exc:  # timeout, HTTP error, bad JSON: all fall back
        logger.warning("groq summary failed (%s); using template", type(exc).__name__)
        return SummaryResponse(text=template, source="template")
    if not validate_llm_text(text, facts, all_labels):
        logger.warning("groq summary rejected by validator; using template")
        return SummaryResponse(text=template, source="template")
    result = SummaryResponse(text=text, source="groq", model=settings.model)
    with _cache_lock:
        _cache[key] = result
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return result
