import urllib.request
import urllib.parse
import json
import asyncio
from app.core import settings
import logging

logger = logging.getLogger(__name__)


async def verify_turnstile_token(token: str, remote_ip: str = None) -> bool:
    """
    Verifies a Cloudflare Turnstile token using stdlib urllib (no httpx needed).
    https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
    """
    if not settings.TURNSTILE_ENABLED:
        return True

    # AKILLI TESPİT: Yerel ortamda Turnstile çalışmaz, otomatik atla
    if remote_ip in ("127.0.0.1", "localhost", "0.0.0.0", "::1") or (remote_ip and remote_ip.startswith("192.168.")):
        return True

    if not token:
        return False

    def _verify_sync() -> dict:
        data: dict = {
            "secret": settings.TURNSTILE_SECRET_KEY,
            "response": token,
        }
        if remote_ip:
            data["remoteip"] = remote_ip

        encoded = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data=encoded,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())

    try:
        res_json = await asyncio.to_thread(_verify_sync)
        if res_json.get("success"):
            return True
        logger.warning(f"Turnstile verification failed: {res_json.get('error-codes')}")
        return False
    except Exception as e:
        # Network/timeout error reaching Cloudflare — fail open to avoid
        # locking out legitimate users when Cloudflare is unreachable.
        logger.error(f"Turnstile verification network error (fail-open): {e}")
        return True
