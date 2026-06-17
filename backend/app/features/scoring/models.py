# backend/app/features/scoring/models.py
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

class ReasonCode(str, Enum):
    # Technical Signals
    OVERSOLD = "OVERSOLD"
    OVERBOUGHT = "OVERBOUGHT"
    EMA_BULLISH = "EMA_BULLISH"
    EMA_BEARISH = "EMA_BEARISH"
    VOL_PULSE = "VOL_PULSE"

    # Vetoes & Caps
    ML_VETO = "ML_VETO"
    SAFE_HARBOR_VETO = "SAFE_HARBOR_VETO"
    SAFE_HARBOR_CAP = "SAFE_HARBOR_CAP"
    VALUE_SCOUT_CAP = "VALUE_SCOUT_CAP"

    # Risk Protections
    RISK_HEAT_SHIELD = "RISK_HEAT_SHIELD"
    RISK_BULL_TRAP = "RISK_BULL_TRAP"
    RISK_EXTREME_VOLATILITY = "RISK_EXTREME_VOLATILITY"
    POOR_RISK_REWARD = "POOR_RISK_REWARD"

    # Data Quality
    STALE_DATA_SHRINKAGE = "STALE_DATA_SHRINKAGE"
    VETO_ZERO_LIQUIDITY = "VETO_ZERO_LIQUIDITY"
    VETO_INSTITUTIONAL_OUTLIER = "VETO_INSTITUTIONAL_OUTLIER"
    SYSTEM_SAFE_MODE = "SYSTEM_SAFE_MODE"

    # Corporate Events
    RECENT_SPLIT = "RECENT_SPLIT"
    DIVIDEND_WINDOW = "DIVIDEND_WINDOW"

    # Profile Relevance
    PROFILE_CONDITION_WEAK = "PROFILE_CONDITION_WEAK"

class ScoreBreakdown(BaseModel):
    technical: float = Field(..., description="Base rules-based score")
    ml_impact: float = Field(..., description="Delta added/removed by AI model")
    risk_penalty: float = Field(..., description="Total points removed by safety valves")
    final_score: float = Field(..., description="Normalized final QRS (0-100)")

class RiskContext(BaseModel):
    is_divergent: bool = Field(..., description="True if AI and Rules disagree significantly")
    safety_valves: List[ReasonCode] = Field(default_factory=list)
    data_quality: str = Field("NORMAL")
    provenance: str = Field("unknown")

class PrismVerdict(BaseModel):
    qrs: float
    direction: str  # bullish, bearish, neutral
    target_price: Optional[float] = None
    stop_price: Optional[float] = None      # stop-loss seviyesi (ATR-based)
    risk_reward: Optional[float] = None     # risk/reward oranı (örn. 2.4 = 2.4:1)
    position_size_pct: Optional[float] = None  # half-Kelly position size (% of portfolio)
    predicted_days: int
    quality_label: str
    confidence_score: float
    score_breakdown: ScoreBreakdown
    risk_context: RiskContext
    reason_codes: List[ReasonCode]
    signals: List[Dict[str, Any]]
    archetype: str
    data_source: str
    is_divergent: bool
