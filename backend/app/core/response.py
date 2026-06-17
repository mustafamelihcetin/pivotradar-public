# backend/app/core/response.py
"""
Standart API yanıt zarfı.

Kullanım:
    from app.core.response import ok, paginated

    return ok({"user": ...})
    return paginated(items, total=100, page=1, per_page=50)
"""
from typing import Any, Optional


def ok(data: Any, meta: Optional[dict] = None) -> dict:
    """Başarılı yanıt zarfı."""
    result = {"ok": True, "data": data}
    if meta:
        result["meta"] = meta
    return result


def paginated(items: Any, *, total: int, page: int, per_page: int) -> dict:
    """Sayfalı liste yanıtı."""
    import math
    return ok(
        items,
        meta={
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "pages":    math.ceil(total / per_page) if total else 1,
        },
    )
