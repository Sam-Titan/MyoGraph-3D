"""One access-log line per HTTP request, with the real client IP.

Pure ASGI (not BaseHTTPMiddleware) so it adds no body buffering and can sit outermost, which also
logs CORS preflights. Never reads request bodies and never logs query strings: patient values must
not reach logs.
"""

import logging
import sys
import time
import uuid
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.client_ip import anonymize_ip, resolve_client_ip

LOGGER_NAME = "myograph.access"
HEALTH_PATH = "/api/health"
UA_MAX = 120

logger = logging.getLogger(LOGGER_NAME)


def configure_access_logger() -> None:
    """INFO to stdout, no propagation. Idempotent.

    Needed because uvicorn runs with --no-access-log and the root logger defaults to WARNING,
    so without this nothing would show up in Render's logs.
    """
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not any(getattr(h, "_myograph_access", False) for h in logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
        handler._myograph_access = True  # type: ignore[attr-defined]
        logger.addHandler(handler)


def _quote(value: str) -> str:
    """Double-quoted with backslash escapes, no raw control characters (no log injection)."""
    out = []
    for ch in value:
        if ch in '"\\':
            out.append("\\" + ch)
        elif ord(ch) < 32 or ord(ch) == 127:
            out.append(f"\\x{ord(ch):02x}")
        else:
            out.append(ch)
    return '"' + "".join(out) + '"'


def _referer(value: str) -> str:
    """Scheme + host + path only; query and fragment are dropped."""
    parts = urlsplit(value)
    if not parts.scheme or not parts.netloc:
        return ""
    return f"{parts.scheme}://{parts.hostname or ''}{parts.path}"


def format_access_line(
    *,
    ip: str,
    method: str,
    path: str,
    status: int,
    ms: int,
    rid: str,
    rid_nf: str,
    ua: str,
    ref: str,
) -> str:
    safe_nf = "".join(c for c in rid_nf[:64] if c.isalnum() or c in "-_:.")
    nf = f" rid_nf={safe_nf}" if safe_nf else ""
    return (
        f"access ip={ip} method={method} path={_quote(path)} status={status} ms={ms} "
        f"rid={rid}{nf} ua={_quote(ua[:UA_MAX])} ref={_quote(_referer(ref))}"
    )


class AccessLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        configure_access_logger()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        rid = uuid.uuid4().hex[:12]
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        client = scope.get("client")
        status = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message.get("headers", []), (b"x-request-id", rid.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope.get("path", "")
            line = format_access_line(
                ip=anonymize_ip(resolve_client_ip(headers, client[0] if client else None)),
                method=scope.get("method", ""),
                path=path,
                status=status,
                ms=round((time.perf_counter() - start) * 1000),
                rid=rid,
                rid_nf=headers.get("x-nf-request-id", ""),
                ua=headers.get("user-agent", ""),
                ref=headers.get("referer", ""),
            )
            logger.log(logging.DEBUG if path == HEALTH_PATH else logging.INFO, line)
