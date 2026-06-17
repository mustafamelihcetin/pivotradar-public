# backend/app/shared/utils/validators.py
"""
Ortak input validation yardımcıları.
"""
import re
from fastapi import HTTPException, status

# BIST sembol formatı: 2-10 büyük harf veya rakam
_SYMBOL_RE = re.compile(r'^[A-Z0-9]{2,10}$')

# Periyot formatı
_PERIOD_RE = re.compile(r'^(1M|3M|6M|1Y|2Y|3Y|5Y|MAX)$')


def validate_symbol(symbol: str) -> str:
    """
    BIST sembolünü doğrular ve büyük harfe çevirir.
    Geçersizse 422 döner.
    """
    cleaned = symbol.upper().replace(".IS", "").strip()
    if not _SYMBOL_RE.match(cleaned):
        raise HTTPException(
            status_code=422,
            detail=f"Geçersiz sembol formatı: '{symbol}'. Beklenen: 2-10 büyük harf/rakam.",
        )
    return cleaned


def validate_period(period: str) -> str:
    """Grafik periyot parametresini doğrular."""
    if not _PERIOD_RE.match(period.upper()):
        raise HTTPException(
            status_code=422,
            detail=f"Geçersiz periyot: '{period}'. Beklenen: 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, MAX.",
        )
    return period.upper()
