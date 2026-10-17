import logging
from collections.abc import Iterator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import DEFAULT_GROQ_MODEL, GroqSettings
from app.main import app
from app.services import summary as S

KEY = "gsk_test_secret_key_123"


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        app.state.predictor.replicates_ready.wait(120)
        yield c


@pytest.fixture
def values(client: TestClient) -> dict[str, Any]:
    return client.get("/api/presets").json()[0]["values"]


@pytest.fixture(autouse=True)
def no_key(monkeypatch: pytest.MonkeyPatch) -> None:
    S.clear_cache()
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_MODEL", raising=False)


def _facts(client: TestClient, values: dict[str, Any]) -> dict[str, Any]:
    p = client.app.state.predictor  # type: ignore[attr-defined]
    return S.build_facts(p.predict(values), p.intervals(values), p.features.targets, n_patients=303)


def test_template_is_deterministic(client: TestClient, values: dict[str, Any]) -> None:
    a = client.post("/api/summary", json={"values": values}).json()
    b = client.post("/api/summary", json={"values": values}).json()
    assert a == b
    assert a["source"] == "template" and a["model"] is None
    assert a["text"].endswith(S.DISCLAIMER)
    assert "diagnos" not in a["text"].lower()
    assert 5 <= a["text"].count(". ") + 1 <= 8


def test_invalid_values_422(client: TestClient, values: dict[str, Any]) -> None:
    res = client.post("/api/summary", json={"values": {**values, "age": 500}})
    assert res.status_code == 422


def test_server_recomputes_numbers(client: TestClient, values: dict[str, Any]) -> None:
    # Extra client-sent "numbers" are ignored: only `values` is accepted and re-predicted.
    res = client.post("/api/summary", json={"values": values, "probability": 0.01})
    assert res.status_code == 200
    facts = _facts(client, values)
    assert f"{facts['targets'][0]['probability_percent']}%" in res.json()["text"]


def test_groq_valid_output_used(
    client: TestClient, values: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    facts = _facts(client, values)
    good = _good_text(client, values)
    sent: dict[str, Any] = {}

    def fake(f: dict[str, Any], s: GroqSettings) -> str:
        sent.update(facts=f, model=s.model)
        return good

    monkeypatch.setattr(S, "_request_groq", fake)
    res = client.post("/api/summary", json={"values": values}).json()
    assert res == {"text": good, "source": "groq", "model": DEFAULT_GROQ_MODEL}
    assert sent["facts"] == facts  # only the facts object is sent
    assert KEY not in str(res)


@pytest.mark.parametrize(
    "bad",
    [
        "The model estimates a 12345% probability. " + S.DISCLAIMER,  # invented number
        "You have a high chance of disease. " + S.DISCLAIMER,
        "The model estimates risk; consider medication. " + S.DISCLAIMER,
        "The model estimates a lot.",  # missing disclaimer
    ],
)
def test_groq_invalid_output_falls_back(
    client: TestClient, values: dict[str, Any], monkeypatch: pytest.MonkeyPatch, bad: str
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    monkeypatch.setattr(S, "_request_groq", lambda f, s: bad)
    res = client.post("/api/summary", json={"values": values}).json()
    assert res["source"] == "template"


def test_groq_timeout_falls_back_and_key_not_logged(
    client: TestClient,
    values: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)

    def boom(*a: Any, **k: Any) -> httpx.Response:
        raise httpx.ReadTimeout(f"timed out with {KEY}")

    monkeypatch.setattr(httpx, "post", boom)
    with caplog.at_level(logging.DEBUG):
        res = client.post("/api/summary", json={"values": values}).json()
    assert res["source"] == "template"
    assert KEY not in caplog.text
    assert KEY not in repr(GroqSettings(KEY, "m"))


def test_facts_scope_factors_to_overall_and_selected(
    client: TestClient, values: dict[str, Any]
) -> None:
    p = client.app.state.predictor  # type: ignore[attr-defined]
    targets = p.features.targets
    overall = next(t.id for t in targets if t.role == "overall")
    vessels = [t.id for t in targets if t.role == "vessel"]
    resp, rng = p.predict(values), p.intervals(values)
    only_overall = S.build_facts(resp, rng, targets, n_patients=303)
    assert only_overall["selected_target"] == overall
    assert [b["target_id"] for b in only_overall["factors"]] == [overall]
    scoped = S.build_facts(resp, rng, targets, vessels[0], n_patients=303)
    assert [b["target_id"] for b in scoped["factors"]] == [overall, vessels[0]]
    assert [t["id"] for t in scoped["targets"]] == [t.id for t in targets]  # API order, all targets
    assert all(len(b["increasing"]) <= 3 and len(b["decreasing"]) <= 3 for b in scoped["factors"])


def test_unknown_selected_target_is_422(client: TestClient, values: dict[str, Any]) -> None:
    res = client.post("/api/summary", json={"values": values, "selected_target": "XYZ"})
    assert res.status_code == 422


def test_template_names_selected_target(client: TestClient, values: dict[str, Any]) -> None:
    p = client.app.state.predictor  # type: ignore[attr-defined]
    vessel = next(t for t in p.features.targets if t.role == "vessel")
    res = client.post("/api/summary", json={"values": values, "selected_target": vessel.id}).json()
    assert f"For the estimate of {vessel.outcome_phrase}:" in res["text"]
    assert "already been referred for an angiogram" in res["text"]
    assert res["text"].endswith(S.DISCLAIMER)


def test_validator_rejects_factor_not_in_selected_list(
    client: TestClient, values: dict[str, Any]
) -> None:
    p = client.app.state.predictor  # type: ignore[attr-defined]
    labels = frozenset(f.label for f in p.features.features)
    facts = _facts(client, values)
    listed = {x.split(": ")[0] for b in facts["factors"] for x in b["increasing"] + b["decreasing"]}
    foreign = sorted(labels - listed - {"Sex"})[0]
    pcts = _stated(facts)
    ok = f"The model estimates {pcts}, from 303 patients referred for an angiogram. {S.DISCLAIMER}"
    bad = f"{ok.split(S.DISCLAIMER)[0]}Influenced by {foreign}. {S.DISCLAIMER}"
    assert S.validate_llm_text(ok, facts, labels)
    assert not S.validate_llm_text(bad, facts, labels)


def _stated(facts: dict[str, Any]) -> str:
    """Every target with its percentage, range, above/below word and uncertain flag."""
    return ", ".join(
        f"{t['probability_percent']}% (range {t['range_low_percent']}–{t['range_high_percent']}%, "
        f"{t['side']} the cut-off{', uncertain' if t['uncertain'] else ''})"
        for t in facts["targets"]
    )


def _good_text(client: TestClient, values: dict[str, Any]) -> str:
    return (
        f"The model estimates {_stated(_facts(client, values))}, "
        f"from 303 patients referred for an angiogram. {S.DISCLAIMER}"
    )


def test_validator_requires_ranges_and_sides(client: TestClient, values: dict[str, Any]) -> None:
    facts = _facts(client, values)
    labels: frozenset[str] = frozenset()
    pct_only = ", ".join(f"{t['probability_percent']}%" for t in facts["targets"])
    assert S.validate_llm_text(_good_text(client, values), facts, labels)
    # Percentages alone (no ranges, no verdict words) now fail.
    assert not S.validate_llm_text(f"The model estimates {pct_only}. {S.DISCLAIMER}", facts, labels)
    # A missing range bound fails.
    t0 = facts["targets"][0]
    dropped = _good_text(client, values).replace(f"{t0['range_low_percent']}–", "", 1)
    if f"{t0['range_low_percent']}" not in dropped.split(S.DISCLAIMER)[0].replace("%", " ").split():
        assert not S.validate_llm_text(dropped, facts, labels)
    # A side word the facts never give fails.
    sides = _sides(facts)
    flipped = {"above": "below", "below": "above"}
    if len(sides) == 1:
        swapped = _good_text(client, values).replace(t0["side"], flipped[t0["side"]], 1)
        assert not S.validate_llm_text(swapped, facts, labels)
    # "uncertain" is rejected when no target is uncertain, and required when one is.
    calm = [dict(t, uncertain=False) for t in facts["targets"]]
    calm_facts = {**facts, "targets": calm}
    with_word = _good_text(client, values) + ""
    if any(t["uncertain"] for t in facts["targets"]):
        assert not S.validate_llm_text(with_word, calm_facts, labels)
        stripped = with_word.replace(", uncertain", "")
        assert not S.validate_llm_text(stripped, facts, labels)
    else:
        extra = with_word.replace("the cut-off)", "the cut-off, uncertain)", 1)
        assert not S.validate_llm_text(extra, facts, labels)


def test_validator_without_ranges_in_facts_is_unchanged(
    client: TestClient, values: dict[str, Any]
) -> None:
    facts = _facts(client, values)
    for t in facts["targets"]:
        for k in ("range_low_percent", "range_high_percent", "range_level_percent", "side"):
            t.pop(k)
    pcts = ", ".join(f"{t['probability_percent']}%" for t in facts["targets"])
    text = f"The model estimates {pcts}, from 303 patients referred for an angiogram."
    assert S.validate_llm_text(f"{text} {S.DISCLAIMER}", facts, frozenset())


def _sides(facts: dict[str, Any]) -> set[str]:
    return {t["side"] for t in facts["targets"]}


def _resp(status: int, content: str = "") -> httpx.Response:
    return httpx.Response(
        status,
        json={"choices": [{"message": {"content": content}}]},
        request=httpx.Request("POST", S.GROQ_URL),
    )


def test_cache_hit_avoids_second_http_call(
    client: TestClient, values: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    calls: list[int] = []

    def post(*a: Any, **k: Any) -> httpx.Response:
        calls.append(1)
        return _resp(200, _good_text(client, values))

    monkeypatch.setattr(httpx, "post", post)
    a = client.post("/api/summary", json={"values": values}).json()
    b = client.post("/api/summary", json={"values": values}).json()
    assert a == b and a["source"] == "groq"
    assert len(calls) == 1


def test_429_then_success_retries_once(
    client: TestClient, values: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    responses = [_resp(429), _resp(200, _good_text(client, values))]
    sleeps: list[float] = []
    monkeypatch.setattr(httpx, "post", lambda *a, **k: responses.pop(0))
    monkeypatch.setattr(S.time, "sleep", sleeps.append)
    res = client.post("/api/summary", json={"values": values}).json()
    assert res["source"] == "groq"
    assert sleeps == [S.RETRY_DELAY_S] and not responses


def test_429_twice_falls_back_and_is_not_cached(
    client: TestClient, values: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    calls: list[int] = []

    def post(*a: Any, **k: Any) -> httpx.Response:
        calls.append(1)
        return _resp(429)

    monkeypatch.setattr(httpx, "post", post)
    monkeypatch.setattr(S.time, "sleep", lambda s: None)
    res = client.post("/api/summary", json={"values": values}).json()
    assert res["source"] == "template" and len(calls) == 2
    client.post("/api/summary", json={"values": values})
    assert len(calls) == 4  # a template fallback is never cached


def test_space_before_percent_is_collapsed(
    client: TestClient, values: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", KEY)
    spaced = _good_text(client, values).replace("%", " %")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(200, spaced))
    res = client.post("/api/summary", json={"values": values}).json()
    assert res["source"] == "groq" and " %" not in res["text"]


def test_article_before_eight_and_eleven() -> None:
    assert S._A_BEFORE_EIGHT.sub(r"\1n ", "a 85% and a 11% and a 26% and A 8%") == (
        "an 85% and an 11% and a 26% and An 8%"
    )
    assert [S._a(p) for p in (85, 8, 11, 18, 26, 98)] == ["an", "an", "an", "an", "a", "a"]


def test_validator_requires_referral_statement(client: TestClient, values: dict[str, Any]) -> None:
    facts = _facts(client, values)
    text = _good_text(client, values)
    assert S.validate_llm_text(text, facts, frozenset())
    assert not S.validate_llm_text(text.replace("angiogram", "scan"), facts, frozenset())


def test_validator_requires_patient_count(client: TestClient, values: dict[str, Any]) -> None:
    facts = _facts(client, values)
    text = _good_text(client, values).replace("303 ", "")
    assert not S.validate_llm_text(text, facts, frozenset())
