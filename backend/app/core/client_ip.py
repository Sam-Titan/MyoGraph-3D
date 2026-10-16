"""Real client IP behind Netlify's proxy, for logs and rough abuse spotting.

Security note: `x-nf-client-connection-ip` and `X-Forwarded-For` can be forged by anyone who calls
the Render URL directly, so the result is fine for analytics, not for security decisions.
"""

import ipaddress
import os
from collections.abc import Mapping

NETLIFY_IP_HEADER = "x-nf-client-connection-ip"
FORWARDED_FOR_HEADER = "x-forwarded-for"
UNKNOWN_IP = "-"


def trust_proxy_headers() -> bool:
    """`TRUST_PROXY_HEADERS` (read per call); on unless explicitly set to a false value."""
    return os.environ.get("TRUST_PROXY_HEADERS", "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def log_ip_mode() -> str:
    """`LOG_IP_MODE`: "full" (default) or "truncated"."""
    mode = os.environ.get("LOG_IP_MODE", "full").strip().lower()
    return "truncated" if mode == "truncated" else "full"


def _parse(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def resolve_client_ip(
    headers: Mapping[str, str], client_host: str | None, trust_proxy: bool | None = None
) -> str:
    """Netlify header, then the left-most global X-Forwarded-For entry, then the socket peer.

    `headers` keys must be lowercase. Malformed values are ignored.
    """
    if trust_proxy is None:
        trust_proxy = trust_proxy_headers()
    if trust_proxy:
        netlify = _parse(headers.get(NETLIFY_IP_HEADER, ""))
        if netlify is not None:
            return str(netlify)
        for part in headers.get(FORWARDED_FOR_HEADER, "").split(","):
            addr = _parse(part)
            if addr is not None and addr.is_global:
                return str(addr)
    peer = _parse(client_host or "")
    return str(peer) if peer is not None else UNKNOWN_IP


def anonymize_ip(ip: str, mode: str | None = None) -> str:
    """ "truncated" zeroes the last IPv4 octet / the last 80 bits of an IPv6 address."""
    if (mode or log_ip_mode()) != "truncated":
        return ip
    addr = _parse(ip)
    if isinstance(addr, ipaddress.IPv4Address):
        return str(ipaddress.IPv4Address(int(addr) & ~0xFF))
    if isinstance(addr, ipaddress.IPv6Address):
        return str(ipaddress.IPv6Address(int(addr) & ~((1 << 80) - 1)))
    return ip
