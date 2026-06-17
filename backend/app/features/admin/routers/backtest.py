# backend/app/features/admin/routers/backtest.py
"""
Walk-forward validation admin endpoints:
  GET /validation/walk-forward
  GET /validation/signal-quality
"""
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.features.users.models import User
from app.features.admin.routers._shared import get_admin_user

router = APIRouter()


@router.get("/validation/walk-forward", summary="Walk-Forward Sinyal Validasyonu", response_model=Dict[str, Any])
def admin_walk_forward(
    profile: Optional[str] = Query(None, description="Profil filtresi (boş=hepsi)"),
    lookback_months: int   = Query(12, ge=3, le=24, description="Kaç aylık veri kullanılsın"),
    db: Session = Depends(get_db),
    _: User     = Depends(get_admin_user),
):
    """
    Geçmiş sinyal tahminlerini gerçek sonuçlarla karşılaştıran istatistiksel validasyon.
    Her ay ayrı test penceresi olarak değerlendirilir.
    Precision, Recall, F1, Sharpe ve drift analizi içerir.
    """
    from app.features.backtest.walk_forward import run_walk_forward
    return run_walk_forward(db, profile_name=profile, lookback_months=lookback_months)


@router.get("/validation/signal-quality", summary="Tüm Profil Sinyal Kalitesi Özeti", response_model=Dict[str, Any])
def admin_signal_quality(
    db: Session = Depends(get_db),
    _: User     = Depends(get_admin_user),
):
    """
    Tüm profiller için 6 aylık sinyal kalitesi özet tablosu.
    Drift alarmı ve istatistiksel anlamlılık içerir.
    """
    from app.features.backtest.walk_forward import get_signal_quality_summary
    return get_signal_quality_summary(db)
