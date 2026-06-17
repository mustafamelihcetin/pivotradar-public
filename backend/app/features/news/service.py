# backend/app/features/news/service.py
"""
Google News RSS üzerinden BIST haber akışı.
In-memory cache: 15 dakika TTL, sembol başına ayrı cache entry.
"""
from __future__ import annotations

import time
import logging
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger("PivotRadar.News")

# ── In-memory cache ──────────────────────────────────────────────────────────
_CACHE: Dict[str, Dict] = {}  # key → {ts: float, data: list}
_TTL = 900  # 15 dakika


def _cache_get(key: str) -> Optional[List]:
    entry = _CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < _TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data: List) -> None:
    _CACHE[key] = {"ts": time.time(), "data": data}


# ── RSS fetch & parse ─────────────────────────────────────────────────────────
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PivotRadar/1.0; +https://pivotradar.com)",
    "Accept": "application/rss+xml, application/xml, text/xml",
}

_TIMEOUT = 8.0  # saniye


def _build_url(query: str) -> str:
    return (
        f"https://news.google.com/rss/search"
        f"?q={quote_plus(query)}"
        f"&hl=tr&gl=TR&ceid=TR:tr"
    )


def _parse_rss(xml_text: str, max_items: int = 20) -> List[Dict[str, Any]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning("RSS parse hatası: %s", e)
        return []

    items = []
    channel = root.find("channel")
    if channel is None:
        return []

    for item in channel.findall("item")[:max_items]:
        title = (item.findtext("title") or "").strip()
        link  = (item.findtext("link")  or "").strip()
        src_el = item.find("source")
        source = src_el.text.strip() if src_el is not None and src_el.text else "Haber"
        pub_raw = item.findtext("pubDate") or ""

        # Zaman: RFC 822 → ISO
        published_at = None
        if pub_raw:
            try:
                published_at = parsedate_to_datetime(pub_raw).isoformat()
            except Exception:
                pass

        if title and link:
            items.append({
                "title":        title,
                "url":          link,
                "source":       source,
                "published_at": published_at,
            })

    return items


def fetch_news(symbol: str = "", max_items: int = 25) -> List[Dict[str, Any]]:
    """
    symbol boşsa genel BIST piyasa haberleri döner.
    symbol doluysa o hisse + borsa kelimesiyle arama yapar.
    """
    symbol = symbol.strip().upper()
    cache_key = symbol or "_MARKET_"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    if symbol:
        query = f"{symbol} borsa hisse"
    else:
        query = "BIST borsa piyasa Türkiye hisse"

    url = _build_url(query)
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url, headers=_HEADERS)
            resp.raise_for_status()
            items = _parse_rss(resp.text, max_items=max_items)
    except Exception as exc:
        logger.warning("Google News RSS çekilemedi (%s): %s", cache_key, exc)
        items = []

    _cache_set(cache_key, items)
    return items


def kap_url(symbol: str = "") -> str:
    """KAP bildirim sorgu URL'ini döndürür."""
    base = "https://www.kap.org.tr/tr/bildirim-sorgu"
    if symbol:
        return f"{base}?isFilter=Y&company={quote_plus(symbol.upper())}"
    return base
