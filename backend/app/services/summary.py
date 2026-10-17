"""Plain-language summary: structured facts -> deterministic template, optionally reworded by Groq.

Only the facts object (never raw inputs) is ever sent out. Any problem with the LLM path falls back
to the template, so the endpoint always returns something safe.
"""

import json
import logging
import math
import re
import threading
import time
from collections import OrderedDict
from typing import Any

import httpx

from app.core.config import GroqSettings
from app.schemas import (
    IntervalsResponse,
    PredictResponse,
    SummaryResponse,
    TargetInfo,
    WaterfallStep,
)

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
    "whether it is above or below the model's cut-off (decision threshold), and, only when the "
    "facts say uncertain is true, that it is uncertain because the range crosses the cut-off; "
    "(2) one sentence with each remaining target's probability in percent, range and "
    "above/below word, in the order given; always state every percentage; say above or below the "
    "cut-off for each, and uncertain only for targets whose facts say uncertain is true; the "
    "range only describes how much the estimate depends on which patients the model learned "
    "from, never call it the patient's true risk or a guarantee; "
    "(3) one sentence naming the selected target (by its outcome, as given) and its main factors "
    "with their points as written, using ONLY the factors listed for that target in "
    "facts.factors, never another target's; "
    "(4) one sentence saying the estimates come from a model trained on n_patients patients who "
    "had already been referred for an angiogram; "
    "(5) only if outside_training_range_warnings is not empty, one sentence saying some values "
    "are outside the training range; write one paragraph with no line breaks; then end with "
    f"exactly this sentence: {DISCLAIMER}\n"
    "Style: say 'probability of <condition>', never 'probability that X is likely'; write "
    "percentages like 75% (no space); no meta phrases such as 'the selected target is'. "
    "Match the tone and structure of this example, but take the target names, above/below words, "
    "uncertain flags and order from the facts, never from the example:\n"
    "EXAMPLE: The model estimates a {overall_pct} probability of {overall_outcome} for this "
    "patient (range {overall_range}), above the model's {overall_thr} cut-off. For the individual "
    "arteries, it estimates {lad_pct} (range {lad_range}) for the LAD (above the cut-off), "
    "{lcx_pct} (range {lcx_range}) for the LCX (below the cut-off) and {rca_pct} (range "
    "{rca_range}) for the RCA (below the cut-off, uncertain). For the estimate of "
    "{selected_outcome}, the factors that raised it most were {up_factor_1} and {up_factor_2}, "
    "while {down_factor_1} lowered it. The estimates come from a model trained on {n_patients} "
    "patients who had already been referred for an angiogram. {disclaimer}"
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


def _move(step: WaterfallStep, points: int) -> str:
    """Waterfall wording: "Typical chest pain: Yes (+18 points)"."""
    sign = "+" if points > 0 else "−"
    return f"{step.label}: {step.value_display} ({sign}{abs(points)} points)"


def build_facts(
    resp: PredictResponse,
    ranges: IntervalsResponse,
    targets: list[TargetInfo],
    selected: str | None = None,
    *,
    n_patients: int,
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
                "label": t.plain_label,  # prose wording, e.g. "left anterior descending artery"
                "outcome": t.outcome_phrase,  # "probability of <outcome>"
                "role": t.role,
                "probability_percent": _pct(pred.probability),
                "threshold_percent": _pct(pred.threshold),
                "range_low_percent": _pct(rng.interval.lo),
                "range_high_percent": _pct(rng.interval.hi),
                "range_level_percent": _pct(rng.interval.level),
                "side": rng.side,  # point estimate vs the cut-off: "above" or "below"
                "uncertain": rng.uncertain,  # the range crosses the cut-off
            }
        )
    blocks: list[dict[str, Any]] = []
    for t in dict.fromkeys([overall.id, chosen.id]):
        moves = [
            (s, math.floor((s.to_p - s.from_p) * 100 + 0.5))
            for s in resp.explanations[t].waterfall
            if s.feature is not None  # never the aggregated "N other factors" step
        ]
        blocks.append(
            {
                "target_id": t,
                "increasing": [_move(s, d) for s, d in moves if d > 0][:TOP_N],
                "decreasing": [_move(s, d) for s, d in moves if d < 0][:TOP_N],
            }
        )
    return {
        "n_patients": n_patients,  # whole dataset: everyone had been referred for an angiogram
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


def _side(t: dict[str, Any]) -> str:
    return f"{t['side']} the cut-off" + (", uncertain" if t["uncertain"] else "")


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
    where = f"This is {overall['side']} the model's {thr}% cut-off."
    if overall["uncertain"]:
        where += " The range crosses the cut-off, so this is uncertain."
    s = [
        f"The model estimates {_a(overall_pct)} {overall_pct}% probability of "
        f"{overall['outcome']} (range {_range(overall)}). {where}"
    ]
    if others:
        parts = [
            f"{t['label']} {t['probability_percent']}% (range {_range(t)}, {_side(t)})"
            for t in others
        ]
        s.append(f"For the individual vessels it estimates {_join(parts)}.")
    up, down = block["increasing"], block["decreasing"]
    if up and down:
        s.append(
            f"For the estimate of {chosen['outcome']}: the factors that moved it up most were "
            f"{_join(up)}, and those that moved it down most were {_join(down)}."
        )
    elif up or down:
        direction = "up" if up else "down"
        s.append(
            f"For the estimate of {chosen['outcome']}: the factors that moved it {direction} most "
            f"were {_join(up or down)}."
        )
    s.append(
        f"These estimates come from a model trained on {facts['n_patients']} patients who had "
        "already been referred for an angiogram."
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


_SIDE_WORD = re.compile(r"\b(above|below)\b", re.IGNORECASE)
_UNCERTAIN_WORD = re.compile(r"\buncertain\b", re.IGNORECASE)


def _states_ranges_and_sides(body: str, facts: dict[str, Any]) -> bool:
    """When the facts carry ranges: every range bound is stated, the above/below words used are
    exactly those the facts give, and "uncertain" appears only if some target is uncertain."""
    present = set(_NUMBER.findall(body))
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
    sides = {t["side"] for t in facts["targets"] if "side" in t}
    if not sides:
        return True
    used = {w.lower() for w in _SIDE_WORD.findall(body)}
    says_uncertain = bool(_UNCERTAIN_WORD.search(body))
    return used == sides and says_uncertain == any(t.get("uncertain") for t in facts["targets"])


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
    if str(facts["n_patients"]) not in present:
        return False  # the "trained on N patients" statement is required
    if not _states_ranges_and_sides(body, facts) or "angiogra" not in body.lower():
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
