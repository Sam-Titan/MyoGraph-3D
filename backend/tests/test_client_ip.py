import logging
from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.access_log import LOGGER_NAME, AccessLogMiddleware
from app.core.client_ip import anonymize_ip, resolve_client_ip
from app.main import app as real_app

NF = "x-nf-client-connection-ip"
XFF = "x-forwarded-for"


def test_netlify_header_wins() -> None:
    headers = {NF: "203.0.113.7", XFF: "8.8.8.8"}
    assert resolve_client_ip(headers, "10.0.0.1", True) == "203.0.113.7"


def test_xff_skips_private_and_takes_leftmost_global() -> None:
    headers = {XFF: "10.1.2.3, 8.8.8.8, 1.1.1.1"}
    assert resolve_client_ip(headers, "10.0.0.1", True) == "8.8.8.8"


def test_xff_garbage_falls_back_to_peer() -> None:
    assert resolve_client_ip({XFF: "not-an-ip, unknown"}, "192.0.2.1", True) == "192.0.2.1"
    assert resolve_client_ip({NF: "garbage"}, "192.0.2.1", True) == "192.0.2.1"


def test_no_headers_and_no_peer() -> None:
    assert resolve_client_ip({}, "192.0.2.1", True) == "192.0.2.1"
    assert resolve_client_ip({}, None, True) == "-"


def test_trust_proxy_headers_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "false")
    assert resolve_client_ip({NF: "203.0.113.7"}, "192.0.2.1") == "192.0.2.1"
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    assert resolve_client_ip({NF: "203.0.113.7"}, "192.0.2.1") == "203.0.113.7"


def test_truncation() -> None:
    assert anonymize_ip("203.0.113.7", "truncated") == "203.0.113.0"
    assert anonymize_ip("2001:db8:abcd:12:1:2:3:4", "truncated") == "2001:db8:abcd::"
    assert anonymize_ip("203.0.113.7", "full") == "203.0.113.7"
    assert anonymize_ip("-", "truncated") == "-"


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(record.getMessage())


@pytest.fixture
def captured() -> Iterator[_Capture]:
    # The access logger has propagate=False, so caplog cannot see it; attach a handler directly.
    handler = _Capture()
    handler.setLevel(logging.DEBUG)
    log = logging.getLogger(LOGGER_NAME)
    log.addHandler(handler)
    yield handler
    log.removeHandler(handler)


@pytest.fixture
def boom_client() -> Iterator[TestClient]:
    app = FastAPI()

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    @app.get("/ok")
    def ok() -> dict[str, bool]:
        return {"ok": True}

    app.add_middleware(AccessLogMiddleware)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_line_fields_and_no_query_string(captured: _Capture, boom_client: TestClient) -> None:
    res = boom_client.get(
        "/ok?age=61&secret=1",
        headers={
            NF: "203.0.113.7",
            "x-nf-request-id": "01ABC-xyz",
            "user-agent": "Mozilla/5.0 " + "x" * 300,
            "referer": "https://www.linkedin.com/feed/?token=abc#frag",
        },
    )
    assert res.headers["x-request-id"]
    (line,) = captured.lines
    assert "ip=203.0.113.7" in line
    assert "method=GET" in line and 'path="/ok"' in line and "status=200" in line
    assert "rid_nf=01ABC-xyz" in line
    assert 'ref="https://www.linkedin.com/feed/"' in line
    assert "age=61" not in line and "token" not in line and "frag" not in line
    ua = line.split(" ua=")[1].split(" ref=")[0]
    assert len(ua) <= 120 + 2


def test_no_rid_nf_when_absent(captured: _Capture, boom_client: TestClient) -> None:
    boom_client.get("/ok")
    assert "rid_nf" not in captured.lines[0]


def test_unhandled_exception_logged_as_500(captured: _Capture, boom_client: TestClient) -> None:
    assert boom_client.get("/boom").status_code == 500
    assert "status=500" in captured.lines[0] and 'path="/boom"' in captured.lines[0]


def test_health_not_logged_at_info(captured: _Capture) -> None:
    with TestClient(real_app) as c:
        c.get("/api/health")
    assert captured.lines == []


def test_cors_preflight_is_logged(captured: _Capture) -> None:
    with TestClient(real_app) as c:
        res = c.options(
            "/api/predict",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )
    assert res.status_code == 200
    assert any(
        "method=OPTIONS" in line and 'path="/api/predict"' in line for line in captured.lines
    )


def test_predict_values_never_logged(captured: _Capture) -> None:
    with TestClient(real_app) as c:
        preset = c.get("/api/presets").json()[0]
        values = dict(preset["values"])
        res = c.post("/api/predict?age=61987", json={"values": values})
        assert res.status_code == 200
    text = "\n".join(captured.lines)
    assert 'path="/api/predict"' in text
    assert "61987" not in text
    for v in values.values():
        if isinstance(v, str) and len(v) > 3:
            assert v not in text
