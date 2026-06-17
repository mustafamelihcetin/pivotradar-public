# backend/app/features/news/router.py
from fastapi import APIRouter, Query
from .service import fetch_news, kap_url

router = APIRouter()


@router.get("/news", summary="Google News RSS haber akışı")
def get_news(
    symbol: str = Query(default="", description="BIST hisse kodu (boş = piyasa genel)"),
    max_items: int = Query(default=25, ge=1, le=50),
):
    items = fetch_news(symbol=symbol, max_items=max_items)
    return {
        "symbol":  symbol.upper() or None,
        "kap_url": kap_url(symbol),
        "count":   len(items),
        "items":   items,
    }
