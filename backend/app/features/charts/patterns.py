# core/pattern_geometry.py
"""
Unified Pattern Detection Module - Single Source of Truth
==========================================================

This module provides deterministic, repaint-free pattern detection
used by both ML scoring and UI overlays. All pattern classification
uses geometric validation with ATR-normalized thresholds.

Pattern Types (Enum):
- TRIANGLE: Converging lines (upper desc/flat, lower asc/flat)
- WEDGE_FALLING: Both descending + converging
- WEDGE_RISING: Both ascending + converging
- CHANNEL_DESC: Parallel descending lines
- CHANNEL_ASC: Parallel ascending lines
- RANGE: Horizontal parallel lines
- BREAKOUT_LINE: Single validated line (support/resistance)
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional
from enum import Enum


class PatternType(Enum):
    """Pattern classification enum - single source of truth for labels"""
    TRIANGLE          = "Daralan Üçgen"
    ASCENDING_TRIANGLE  = "Yükselen Üçgen"
    DESCENDING_TRIANGLE = "Alçalan Üçgen"
    EXPANDING_TRIANGLE  = "Genişleyen Üçgen"
    WEDGE_FALLING     = "Alçalan Takoz"
    WEDGE_RISING      = "Yükselen Takoz"
    CHANNEL_DESC      = "Alçalan Kanal"
    CHANNEL_ASC       = "Yükselen Kanal"
    RANGE             = "Range/Kutu"
    RESISTANCE        = "Direnç Hattı"
    SUPPORT           = "Destek Hattı"
    HEAD_SHOULDERS    = "Baş Omuz"
    INV_HEAD_SHOULDERS = "Ters Baş Omuz"
    DOUBLE_TOP        = "Çift Tepe"
    DOUBLE_BOTTOM     = "Çift Dip"
    TRIPLE_TOP        = "Üçlü Tepe"
    TRIPLE_BOTTOM     = "Üçlü Dip"
    FLAG              = "Bayrak"
    PENNANT           = "Flama"
    CUP_HANDLE        = "Kupa Sap"
    NONE              = "Formasyon Yok"


# Pattern Descriptions (Tooltip)
PATTERN_DESCRIPTIONS = {
    PatternType.TRIANGLE:           "Fiyat giderek daralan bir bant içinde sıkışıyor; her tepe bir öncekinden alçak, her dip bir öncekinden yüksek oluşuyor. Bu, alıcı ve satıcının eşit güçte olduğu ve bir karar anının yaklaştığı anlamına gelir. Bandın dışına çıkıldığı yön (yukarı veya aşağı) büyük ihtimalle güçlü bir hareketin başlangıcı olur. Fiyatın hangi yöne kırdığını ve o kırılımın hacimle desteklenip desteklenmediğini izleyin.",
    PatternType.ASCENDING_TRIANGLE: "Fiyat üstte aynı seviyeye defalarca çarparken alttan giderek yükseliyor. Alıcılar her düşüşte daha erken devreye giriyor — bu piyasada alım baskısının arttığını gösterir. Üst çizginin yukarı kırılması, biriken alım gücünün boşaldığı ve fiyatın hızla yükselebileceği anlamına gelir. Kırılımı hacim artışıyla teyit edin.",
    PatternType.DESCENDING_TRIANGLE:"Fiyat altta aynı seviyeye defalarca yaslanırken üstten giderek alçalıyor. Satıcılar her yükselişte daha erken baskı yapıyor — bu piyasada satış baskısının arttığını gösterir. Alt çizginin kırılması, biriken satış baskısının boşaldığı ve fiyatın hızla düşebileceği anlamına gelir. Kırılımı hacim artışıyla teyit edin.",
    PatternType.EXPANDING_TRIANGLE: "Fiyat her geçen gün daha geniş salınımlar yapıyor; tepeler giderek yükseliyor, dipler giderek alçalıyor. Bu, piyasada yön kararsızlığının ve oynaklığın arttığını gösterir. Ne alıcılar ne de satıcılar kontrolü tam ele geçiremiyor. Bu tür formasyonlarda ani ve sert hareketler olabilir; pozisyon açmadan önce net bir yön kırılımı bekleyin.",
    PatternType.WEDGE_FALLING:      "Fiyat düşüyor ama bu düşüş giderek ivme kaybediyor; hem tepeler hem de dipler alçalıyor ancak birbirine yaklaşıyor. Satıcıların gücü azalıyor. Çoğunlukla fiyatın bu kanaldan yukarı kırıp yön değiştirdiği görülür. Üst çizginin yukarı kırılması ve arkasından gelen hacim artışı, toparlanmanın başladığının işareti olabilir.",
    PatternType.WEDGE_RISING:       "Fiyat yükseliyor ama bu yükseliş giderek ivme kaybediyor; hem tepeler hem de dipler yükseliyor ancak birbirine yaklaşıyor. Alıcıların gücü azalıyor. Çoğunlukla fiyatın bu kanaldan aşağı kırıp düştüğü görülür. Alt çizginin aşağı kırılması, yükselişin tükendiğinin ve düzeltmenin başlayabileceğinin işareti olabilir.",
    PatternType.CHANNEL_DESC:       "Fiyat paralel iki çizgi arasında düzenli bir şekilde aşağı iniyor. Her yükseliş üst çizgiye, her düşüş alt çizgiye dokunuyor. Bu, düşüş trendinin sürüyor olduğunu gösterir. Üst çizgiden kısa pozisyon veya alt çizgiden çıkış düşünülebilir. Üst çizginin yukarı kırılması ise trendin sona erebileceğinin ilk işaretidir.",
    PatternType.CHANNEL_ASC:        "Fiyat paralel iki çizgi arasında düzenli bir şekilde yukarı çıkıyor. Her yükseliş üst çizgiye, her geri çekilme alt çizgiye dokunuyor. Bu, yükseliş trendinin sağlıklı devam ettiğini gösterir. Alt çizgiye yaklaşıldığında alım fırsatı değerlendirilebilir. Alt çizginin aşağı kırılması ise trendin bozulabileceğinin uyarısıdır.",
    PatternType.RANGE:              "Fiyat belirli bir üst ve alt sınır arasında yatay seyrediyor; ne yukarı ne de aşağı net bir yön tutturamıyor. Bu, alıcı ve satıcının dengede olduğu, bekleme modunda bir piyasayı gösterir. Üst sınırdan satış, alt sınırdan alış düşünülebilir. Sınırlardan birinin güçlü bir şekilde kırılması, yeni bir trendin başlangıcına işaret edebilir.",
    PatternType.RESISTANCE:         "Fiyatın defalarca çıkmaya çalışıp geçemediği bir tavan seviyesi var. Bu seviyede satıcılar her seferinde baskın geliyor. Fiyat bu seviyeye yaklaştığında dikkatli olunması, seviyenin yukarı kırılması durumunda ise bu kırılımın hacimle teyit edilmesini beklenmesi önerilir.",
    PatternType.SUPPORT:            "Fiyatın defalarca inip geri döndüğü bir taban seviyesi var. Bu seviyede alıcılar her seferinde devreye giriyor. Fiyat bu seviyeye yaklaştığında alım fırsatı değerlendirilebilir; ancak seviyenin aşağı kırılması durumunda düşüşün hızlanabileceğine dikkat edin.",
    PatternType.HEAD_SHOULDERS:     "Fiyat önce bir tepe, ardından daha yüksek bir tepe (baş), ardından tekrar daha alçak bir tepe (sağ omuz) yapıyor. Bu, yükselişin gücünü yitirdiğini ve dönüş sinyali verdiğini gösterir. İki omuz arasındaki dip seviyesinin (boyun çizgisi) aşağı kırılması, düşüşün başladığının teyididir. Bu noktadan sonra dikkatli olunması önerilir.",
    PatternType.INV_HEAD_SHOULDERS: "Fiyat önce bir dip, ardından daha derin bir dip (baş), ardından tekrar daha yüksek bir dip (sağ omuz) yapıyor. Bu, düşüşün gücünü yitirdiğini ve toparlanma sinyali verdiğini gösterir. İki omuz arasındaki tepe seviyesinin (boyun çizgisi) yukarı kırılması, yükselişin başladığının teyididir.",
    PatternType.DOUBLE_TOP:         "Fiyat aynı seviyeye iki kez çıkmış ama her seferinde geri dönmüş. Satıcılar bu seviyede iki kez baskın çıkmış demektir. İki tepe arasındaki dip seviyesinin aşağı kırılması, düşüşün güçlenebileceğine dair önemli bir uyarıdır.",
    PatternType.DOUBLE_BOTTOM:      "Fiyat aynı seviyeye iki kez inmiş ama her seferinde geri dönmüş. Alıcılar bu seviyede iki kez devreye girmiş demektir. İki dip arasındaki tepe seviyesinin yukarı kırılması, yükselişin güçlenebileceğine dair önemli bir işarettir.",
    PatternType.TRIPLE_TOP:         "Fiyat aynı tavan seviyesine üç kez çarpıp geri dönmüş. Satıcıların bu bölgede çok güçlü olduğunu gösterir. Üç başarısız deneme, o seviyenin geçilmesinin oldukça zor olduğuna işaret eder. İki tepe arasındaki dip seviyelerinin kırılması, sert bir düşüşün habercisi olabilir.",
    PatternType.TRIPLE_BOTTOM:      "Fiyat aynı taban seviyesine üç kez inip geri dönmüş. Alıcıların bu bölgede çok güçlü olduğunu gösterir. Üç başarısız düşüş denemesi, o seviyenin sağlam bir zemin oluşturduğuna işaret eder. İki dip arasındaki tepe seviyelerinin kırılması, güçlü bir yükselişin habercisi olabilir.",
    PatternType.FLAG:               "Fiyat önce kısa sürede sert bir şekilde yükselmiş (direk), ardından dar bir bant içinde yatay veya hafif aşağı bir seyirle nefes almış (bayrak). Bu, trendin devam ettiğinin ve alıcıların hâlâ kontrolde olduğunun işaretidir. Bayrak bölgesinin yukarı kırılması, yükselişin devam edebileceğine işaret eder.",
    PatternType.PENNANT:            "Fiyat önce kısa sürede sert bir şekilde yükselmiş (direk), ardından giderek daralan küçük bir üçgen içinde sıkışmış (flama). Bu, trendin devam etmeden önce kısa bir mola verdiğini gösterir. Flama bölgesinin yukarı kırılması, güçlü yükselişin devam edebileceğine işaret eder.",
    PatternType.CUP_HANDLE:         "Fiyat önce uzunca bir süre U şeklinde bir dip yapmış (kupa), ardından kısa bir geri çekilme yaşamış (sap). Bu, piyasanın büyük bir düşüşü sindirdiğini ve alıcıların yavaş yavaş toparlandığını gösterir. Sapın üst kısmının yukarı kırılması, güçlü ve kalıcı bir yükselişin başlangıcına işaret edebilir.",
    PatternType.NONE:               ""
}


# Default parameters (ATR-normalized, deterministic)
DEFAULT_PARAMS = {
    "pivot_order": 7,               # Rolling window for pivot detection (7 > 5: BIST günlük gürültüsünü filtreler)
    "lookback_bars": 120,           # Deterministic lookback window
    "atr_period": 14,               # ATR calculation period
    "touch_tolerance_k": 0.35,      # Touch tolerance = k * ATR
    "min_touches": 2,               # Minimum touches per line
    "rmse_threshold_k": 0.8,        # RMSE threshold = k * ATR
    "convergence_ratio_min": 1.15,  # Min ratio for triangle/wedge (1.3 çok katıydı)
    "parallelism_threshold_k": 0.08, # Slope diff threshold — 0.01 kanalları tamamen engelliyordu
    "min_pivots_for_fit": 2,        # Minimum pivots to attempt fit
}


def calculate_atr(df: pd.DataFrame, period: int = 14) -> float:
    """
    Calculate Average True Range for the dataframe.
    Returns scalar ATR value (latest).
    """
    if df is None or len(df) < period:
        return 0.0
    
    try:
        high = df["High"].values
        low = df["Low"].values
        close = df["Close"].values
        
        # True Range components
        tr1 = high[1:] - low[1:]
        tr2 = np.abs(high[1:] - close[:-1])
        tr3 = np.abs(low[1:] - close[:-1])
        
        tr = np.maximum(tr1, np.maximum(tr2, tr3))
        
        # Simple moving average of TR
        if len(tr) >= period:
            atr = np.mean(tr[-period:])
            return float(atr) if np.isfinite(atr) and atr > 0 else 0.0
        
        return 0.0
    except Exception:
        return 0.0


def find_pivots(
    highs: np.ndarray,
    lows: np.ndarray,
    order: int = 5
) -> Tuple[List[Tuple[int, float]], List[Tuple[int, float]]]:
    """
    Find pivot points using rolling window method (deterministic).
    
    Returns:
        pivot_highs: List of (index, price) for local highs
        pivot_lows: List of (index, price) for local lows
    """
    pivot_highs = []
    pivot_lows = []
    
    n = len(highs)
    
    for i in range(order, n - order):
        # High Pivot: local maximum in window
        window_h = highs[i - order : i + order + 1]
        if highs[i] == np.max(window_h):
            pivot_highs.append((i, float(highs[i])))
        
        # Low Pivot: local minimum in window
        window_l = lows[i - order : i + order + 1]
        if lows[i] == np.min(window_l):
            pivot_lows.append((i, float(lows[i])))
    
    return pivot_highs, pivot_lows


def count_touches(
    pivots: List[Tuple[int, float]],
    slope: float,
    intercept: float,
    tolerance: float
) -> Tuple[int, List[int]]:
    """
    Count how many pivots touch the line within tolerance.
    
    Returns:
        touch_count: Number of pivots within tolerance
        touch_indices: List of pivot indices that touch
    """
    touches = []
    
    for idx, price in pivots:
        line_val = slope * idx + intercept
        distance = abs(price - line_val)
        
        if distance <= tolerance:
            touches.append(idx)
    
    return len(touches), touches


def fit_line_robust(
    pivots: List[Tuple[int, float]],
    atr: float,
    kind: str,
    params: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Fit a line to pivots with quality validation.
    
    Returns dict with line parameters or None if validation fails.
    """
    if len(pivots) < params["min_pivots_for_fit"]:
        return None
    
    # Extract x, y
    x = np.array([p[0] for p in pivots])
    y = np.array([p[1] for p in pivots])
    
    # Linear regression
    slope, intercept = np.polyfit(x, y, 1)
    
    # Calculate tolerance for touch test
    tolerance = params["touch_tolerance_k"] * atr if atr > 0 else 0.001
    
    # Touch validation
    touch_count, touch_indices = count_touches(pivots, slope, intercept, tolerance)
    
    if touch_count < params["min_touches"]:
        return None
    
    # Calculate RMSE (fit error)
    y_pred = slope * x + intercept
    residuals = y - y_pred
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    
    # RMSE threshold
    rmse_threshold = params["rmse_threshold_k"] * atr if atr > 0 else float('inf')
    
    if rmse > rmse_threshold:
        return None
    
    # Line is valid
    return {
        "kind": kind,
        "slope": float(slope),
        "intercept": float(intercept),
        "touch_count": touch_count,
        "touch_indices": touch_indices,
        "rmse": rmse,
        "pivots_used": len(pivots)
    }



def calculate_dynamic_confidence(
    base_score: float,
    upper_line: Optional[Dict],
    lower_line: Optional[Dict],
    atr: float
) -> float:
    """
    Calculate dynamic confidence score based on line quality.
    Formula: Base + TouchBonus - ErrorPenalty + PivotBonus
    """
    score = base_score
    
    # Analyze lines
    lines = [l for l in (upper_line, lower_line) if l is not None]
    
    if not lines:
        return 0.0
        
    try:
        avg_touches = sum(l['touch_count'] for l in lines) / len(lines)
        avg_rmse = sum(l['rmse'] for l in lines) / len(lines)
        avg_pivots = sum(l.get('pivots_used', 2) for l in lines) / len(lines)
        
        # 1. Touch Bonus: +0.05 per touch above 2 (Max +0.25)
        touch_bonus = min(0.25, (avg_touches - 2) * 0.05)
        score += touch_bonus
        
        # 2. Error Penalty: RMSE relative to ATR (Max -0.30)
        if atr > 0:
            error_ratio = avg_rmse / atr
            error_penalty = min(0.30, error_ratio * 0.15)
            score -= error_penalty
            
        # 3. Pivot Bonus: +0.03 per pivot used above 2 (Max +0.15)
        pivot_bonus = min(0.15, (avg_pivots - 2) * 0.03)
        score += pivot_bonus
        
    except Exception:
        pass # Safety fallback
    
    # Clamp 0.10 - 0.99
    return round(max(0.10, min(0.99, score)), 2)


def classify_pattern(
    upper_line: Optional[Dict],
    lower_line: Optional[Dict],
    n_bars: int,
    atr: float,
    price_scale: float,
    params: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Classify pattern based on geometric validation.
    Implements downgrade logic when criteria not met.
    
    Returns:
        type: PatternType enum
        confidence: 0-1 score
        convergence_ratio: width_start / width_end
        validation_passed: bool
        rejection_reason: str or None
    """
    # No valid lines
    if upper_line is None and lower_line is None:
        return {
            "type": PatternType.NONE,
            "confidence": 0.0,
            "convergence_ratio": None,
            "validation_passed": False,
            "rejection_reason": "no_valid_lines"
        }
    
    # Single line only -> Specific Support/Resistance
    if upper_line is not None and lower_line is None:
        score = calculate_dynamic_confidence(0.65, upper_line, None, atr)
        return {
            "type": PatternType.RESISTANCE,
            "confidence": score,
            "convergence_ratio": None,
            "validation_passed": True,
            "rejection_reason": None
        }

    if lower_line is not None and upper_line is None:
        score = calculate_dynamic_confidence(0.65, None, lower_line, atr)
        return {
            "type": PatternType.SUPPORT,
            "confidence": score,
            "convergence_ratio": None,
            "validation_passed": True,
            "rejection_reason": None
        }
    
    # Both lines exist - classify geometry
    m_upper = upper_line["slope"]
    m_lower = lower_line["slope"]
    
    # Calculate width at start and end for convergence
    x_start = 0
    x_end = n_bars - 1
    
    y_upper_start = m_upper * x_start + upper_line["intercept"]
    y_upper_end = m_upper * x_end + upper_line["intercept"]
    y_lower_start = m_lower * x_start + lower_line["intercept"]
    y_lower_end = m_lower * x_end + lower_line["intercept"]
    
    width_start = abs(y_upper_start - y_lower_start)
    width_end = abs(y_upper_end - y_lower_end)
    
    # Division-safe convergence ratio — threshold fiyat ölçeğine göre normalize edilir
    min_width = max(price_scale * 0.0001, 0.0001)
    if width_end < min_width:
        convergence_ratio = 999.0
    else:
        convergence_ratio = width_start / width_end
    
    # Parallelism test: eps = threshold * (atr/price_scale) — yüksek fiyatlı hisselerde
    # tolerans orantılı büyür, düşük fiyatlı hisselerde küçülür
    scale_factor = (atr / price_scale) if price_scale > 0 else 0.001
    parallelism_eps = params["parallelism_threshold_k"] * scale_factor
    
    is_parallel = abs(m_upper - m_lower) < parallelism_eps
    is_converging = convergence_ratio >= params["convergence_ratio_min"]
    is_diverging = convergence_ratio < (1.0 / params["convergence_ratio_min"])
    
    # Classification logic with downgrade
    
    # Classification logic with downgrade
    
    # Converging triangles — differentiate ascending/descending/symmetric
    if m_upper <= 0.003 and m_lower >= -0.003 and is_converging:
        # Ascending triangle: flat-ish upper resistance + rising support
        if abs(m_upper) <= 0.002 and m_lower > 0.001:
            score = calculate_dynamic_confidence(0.72, upper_line, lower_line, atr)
            return {"type": PatternType.ASCENDING_TRIANGLE, "confidence": score,
                    "convergence_ratio": convergence_ratio, "validation_passed": True, "rejection_reason": None}
        # Descending triangle: falling upper resistance + flat-ish support
        if m_upper < -0.001 and abs(m_lower) <= 0.002:
            score = calculate_dynamic_confidence(0.72, upper_line, lower_line, atr)
            return {"type": PatternType.DESCENDING_TRIANGLE, "confidence": score,
                    "convergence_ratio": convergence_ratio, "validation_passed": True, "rejection_reason": None}
        # Symmetric (both slopes) — classic daralan üçgen
        score = calculate_dynamic_confidence(0.70, upper_line, lower_line, atr)
        return {"type": PatternType.TRIANGLE, "confidence": score,
                "convergence_ratio": convergence_ratio, "validation_passed": True, "rejection_reason": None}

    # Expanding triangle: diverging lines
    if is_diverging and upper_line is not None and lower_line is not None:
        if m_upper > 0.001 and m_lower < -0.001:
            score = calculate_dynamic_confidence(0.55, upper_line, lower_line, atr)
            return {"type": PatternType.EXPANDING_TRIANGLE, "confidence": score,
                    "convergence_ratio": convergence_ratio, "validation_passed": True, "rejection_reason": None}
    
    # Falling Wedge (both descending, converging)
    if m_upper < -0.001 and m_lower < -0.001 and is_converging:
        score = calculate_dynamic_confidence(0.75, upper_line, lower_line, atr) # Base 75 for Falling Wedge (Bullish)
        return {
            "type": PatternType.WEDGE_FALLING,
            "confidence": score,
            "convergence_ratio": convergence_ratio,
            "validation_passed": True,
            "rejection_reason": None
        }
    
    # Rising Wedge (both ascending, converging)
    if m_upper > 0.001 and m_lower > 0.001 and is_converging:
        score = calculate_dynamic_confidence(0.70, upper_line, lower_line, atr) # Base 70 for Rising Wedge (Bearish)
        return {
            "type": PatternType.WEDGE_RISING,
            "confidence": score,
            "convergence_ratio": convergence_ratio,
            "validation_passed": True,
            "rejection_reason": None
        }
    
    # Channels (parallel lines)
    if is_parallel:
        # Descending Channel
        if m_upper < -0.001 and m_lower < -0.001:
            score = calculate_dynamic_confidence(0.65, upper_line, lower_line, atr) # Base 65
            return {
                "type": PatternType.CHANNEL_DESC,
                "confidence": score,
                "convergence_ratio": convergence_ratio,
                "validation_passed": True,
                "rejection_reason": None
            }
        
        # Ascending Channel
        if m_upper > 0.001 and m_lower > 0.001:
            score = calculate_dynamic_confidence(0.65, upper_line, lower_line, atr) # Base 65
            return {
                "type": PatternType.CHANNEL_ASC,
                "confidence": score,
                "convergence_ratio": convergence_ratio,
                "validation_passed": True,
                "rejection_reason": None
            }
        
        # Horizontal Range
        if abs(m_upper) <= 0.001 and abs(m_lower) <= 0.001:
            score = calculate_dynamic_confidence(0.60, upper_line, lower_line, atr) # Base 60
            return {
                "type": PatternType.RANGE,
                "confidence": score,
                "convergence_ratio": convergence_ratio,
                "validation_passed": True,
                "rejection_reason": None
            }
    
    # Downgrade: Diverging lines or no clear pattern -> Range
    if is_diverging:
        score = calculate_dynamic_confidence(0.40, upper_line, lower_line, atr) # Penalty Base 40
        return {
            "type": PatternType.RANGE,
            "confidence": score,
            "convergence_ratio": convergence_ratio,
            "validation_passed": False,
            "rejection_reason": "diverging_lines"
        }
    
    # Default: Range (safe fallback)
    score = calculate_dynamic_confidence(0.40, upper_line, lower_line, atr)
    return {
        "type": PatternType.RANGE,
        "confidence": score,
        "convergence_ratio": convergence_ratio,
        "validation_passed": False,
        "rejection_reason": "no_clear_pattern"
    }


def _detect_advanced_patterns(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    pivot_highs: List[Tuple[int, float]],
    pivot_lows: List[Tuple[int, float]],
    atr: float,
    n: int,
    volumes: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    """
    Detect advanced chart patterns: H&S, Double/Triple Top/Bottom, Flag, Pennant, Cup&Handle.
    Returns ALL found patterns sorted by confidence (best first). Empty list if none found.
    Runs BEFORE the geometric line classifier so specific patterns take precedence.
    volumes: opsiyonel hacim dizisi — hacim teyidi için kullanılır.
    """
    if atr <= 0:
        return []

    _candidates: List[Dict[str, Any]] = []
    tol = atr * 0.35        # peak clustering tolerance
    MIN_PEAK_SPACING = 5    # minimum bars between peaks/dips

    ph = pivot_highs  # [(idx, price), ...]
    pl = pivot_lows
    price_scale = float(np.mean(closes)) if len(closes) > 0 else 1.0
    _last_close = closes[-1] if len(closes) > 0 else 0.0

    # Hacim teyid yardımcısı: belirli bar aralığında ortalama hacim artışı var mı?
    def _vol_spike(idx: int, window: int = 5, threshold: float = 1.3) -> bool:
        """idx çevresindeki window barda ortalama hacim, genel ortalamanın threshold katı mı?"""
        if volumes is None or len(volumes) < 20:
            return True  # Hacim verisi yoksa teyit edilmiş say (false negative önlenir)
        try:
            i0 = max(0, idx - window // 2)
            i1 = min(len(volumes) - 1, idx + window // 2)
            local_avg = float(np.mean(volumes[i0:i1 + 1]))
            global_avg = float(np.mean(volumes[-30:])) if len(volumes) >= 30 else float(np.mean(volumes))
            return global_avg > 0 and (local_avg / global_avg) >= threshold
        except Exception:
            return True

    # ── Baş Omuz (Head & Shoulders) ──────────────────────────────────────────
    # Evaluate ALL valid triplets; return highest-confidence + most-recent one
    if len(ph) >= 3:
        best_hs = None
        best_hs_score = (-1.0, -1)  # (confidence, rs_idx)
        for i in range(len(ph) - 2):
            ls_idx, ls_p = ph[i]
            hd_idx, hd_p = ph[i + 1]
            rs_idx, rs_p = ph[i + 2]
            if hd_p <= ls_p or hd_p <= rs_p:
                continue
            if hd_p - ls_p < 0.5 * atr or hd_p - rs_p < 0.5 * atr:
                continue
            # Omuz simetrisi: baş fiyatının %8'i — ATR mutlak eşiği yüksek fiyatlı
            # hisselerde (500+ TL) fazla gevşek kalırdı; yüzde bazlı eşik tutarlı.
            if abs(ls_p - rs_p) / max(hd_p, 1e-9) > 0.08:
                continue
            between_ls_hd = [p for p in pl if ls_idx < p[0] < hd_idx]
            between_hd_rs = [p for p in pl if hd_idx < p[0] < rs_idx]
            if not between_ls_hd or not between_hd_rs:
                continue
            nl_left  = min(between_ls_hd, key=lambda p: p[1])
            nl_right = min(between_hd_rs, key=lambda p: p[1])
            # Neckline vadileri yeterince ayrışmış olmalı
            if abs(nl_left[0] - nl_right[0]) < MIN_PEAK_SPACING:
                continue
            neckline_price = (nl_left[1] + nl_right[1]) / 2
            confidence = 0.75 + min(0.15, (hd_p - max(ls_p, rs_p)) / (atr * 5))
            confidence = round(min(0.92, max(0.55, confidence)), 2)
            # Hacim teyidi: neckline kırılım bölgesinde hacim artışı var mı?
            # Artan hacim = daha güvenilir formasyon
            _nl_zone_idx = max(nl_left[0], nl_right[0])
            if _vol_spike(_nl_zone_idx, window=5, threshold=1.8):
                confidence = round(min(0.95, confidence * 1.08), 2)  # +%8 bonus
            else:
                confidence = round(confidence * 0.90, 2)  # -%10 ceza
            # Neckline kırılım teyidi: ayı dönüşü için fiyat neckline seviyesinde/altında olmalı.
            # Fiyat hâlâ neckline'ın belirgin üzerindeyse formasyon henüz teyit edilmemiş;
            # güven %28 düşürülür — Bu genellikle 0.58 eşiğinin altına düşürür → görünmez.
            if _last_close > neckline_price * 1.015:
                confidence = round(confidence * 0.72, 2)
            score = (confidence, rs_idx)
            if score > best_hs_score:
                best_hs_score = score
                best_hs = {
                    "type": PatternType.HEAD_SHOULDERS,
                    "confidence": confidence,
                    "neckline": neckline_price,
                    "head_idx": hd_idx, "head_price": hd_p,
                    "ls_idx": ls_idx, "ls_price": ls_p,
                    "rs_idx": rs_idx, "rs_price": rs_p,
                    "nl_left_idx": nl_left[0], "nl_right_idx": nl_right[0],
                }
        if best_hs:
            _candidates.append(best_hs)

    # ── Ters Baş Omuz (Inverse H&S) ──────────────────────────────────────────
    if len(pl) >= 3:
        best_ihs = None
        best_ihs_score = (-1.0, -1)
        for i in range(len(pl) - 2):
            ls_idx, ls_p = pl[i]
            hd_idx, hd_p = pl[i + 1]
            rs_idx, rs_p = pl[i + 2]
            if hd_p >= ls_p or hd_p >= rs_p:
                continue
            if ls_p - hd_p < 0.5 * atr or rs_p - hd_p < 0.5 * atr:
                continue
            # Omuz simetrisi: min(ls_p, rs_p) referansının %8'i — yüzde bazlı, fiyat ölçeğinden bağımsız
            if abs(ls_p - rs_p) / max(min(ls_p, rs_p), 1e-9) > 0.08:
                continue
            between_ls_hd = [p for p in ph if ls_idx < p[0] < hd_idx]
            between_hd_rs = [p for p in ph if hd_idx < p[0] < rs_idx]
            if not between_ls_hd or not between_hd_rs:
                continue
            nl_left  = max(between_ls_hd, key=lambda p: p[1])
            nl_right = max(between_hd_rs, key=lambda p: p[1])
            if abs(nl_left[0] - nl_right[0]) < MIN_PEAK_SPACING:
                continue
            neckline_price = (nl_left[1] + nl_right[1]) / 2
            confidence = 0.75 + min(0.15, (min(ls_p, rs_p) - hd_p) / (atr * 5))
            confidence = round(min(0.92, max(0.55, confidence)), 2)
            # Hacim teyidi: H&S ile simetrik — Ters H&S'de daha önce eksikti.
            _nl_zone_ihs = max(nl_left[0], nl_right[0])
            if _vol_spike(_nl_zone_ihs, window=5, threshold=1.8):
                confidence = round(min(0.95, confidence * 1.08), 2)
            else:
                confidence = round(confidence * 0.90, 2)
            # Neckline kırılım teyidi: boğa dönüşü için fiyat neckline seviyesinde/üzerinde olmalı.
            # Fiyat hâlâ neckline'ın belirgin altındaysa formasyon henüz teyit edilmemiş;
            # güven %28 düşürülür — Bu genellikle 0.58 eşiğinin altına düşürür → görünmez.
            if _last_close < neckline_price * 0.985:
                confidence = round(confidence * 0.72, 2)
            score = (confidence, rs_idx)
            if score > best_ihs_score:
                best_ihs_score = score
                best_ihs = {
                    "type": PatternType.INV_HEAD_SHOULDERS,
                    "confidence": confidence,
                    "neckline": neckline_price,
                    "head_idx": hd_idx, "head_price": hd_p,
                    "ls_idx": ls_idx, "ls_price": ls_p,
                    "rs_idx": rs_idx, "rs_price": rs_p,
                    "nl_left_idx": nl_left[0], "nl_right_idx": nl_right[0],
                }
        if best_ihs:
            _candidates.append(best_ihs)

    # ── Bayrak (Flag) ─────────────────────────────────────────────────────────
    # Öncelik: Bayrak konsolidasyonu Çift/Üçlü Tepe'den önce kontrol edilmeli;
    # aksi halde flag'in tavan bölgesi yanlışlıkla dönüş formasyonu olarak algılanır.
    if n >= 25:
        _flag_result = None
        for _pole_bars in [10, 15, 20, 30, 40]:
            if n < _pole_bars + 8:
                continue
            _search_start = max(0, n - 80)
            for _ps in range(_search_start, n - _pole_bars - 5, 5):
                _pe = _ps + _pole_bars
                if _pe >= n - 3:
                    break
                _pole_slice = closes[_ps:_pe]
                _pole_gain = (_pole_slice[-1] - _pole_slice[0]) / max(abs(_pole_slice[0]), 1e-9)
                if _pole_gain < 0.06:
                    continue
                _consol = closes[_pe:]
                if len(_consol) < 5:
                    continue
                _p_range = float(np.max(_pole_slice) - np.min(_pole_slice))
                _c_range = float(np.max(_consol)     - np.min(_consol))
                if _p_range <= 0 or _c_range / _p_range >= 0.40:
                    continue
                _conf = round(min(0.82, 0.58 + _pole_gain * 1.1), 2)
                # Bayrak: pole ortasında hacim konsolidasyon ortalamasının 1.8x'i olmalı.
                # Klasik teknik analizde kırılım hacmi konsolidasyon hacminin 2x+ beklenirdi;
                # burada pole-orta kontrolü yaptığımızdan 1.8x istatistiksel eşdeğer.
                if not _vol_spike(_ps + _pole_bars // 2, window=5, threshold=1.8):
                    _conf = round(_conf * 0.85, 2)
                # Breakout teyidi: fiyat konsolidasyonun üst bandını 0.1 ATR üzerinde kapadı mı?
                # Sadece son bar hariç tutularak hesaplanan max kullanılır (son bar = teyit edilecek bar).
                _consol_prev = closes[_pe:-1] if len(closes) > _pe + 1 else closes[_pe:]
                _consol_ceil = float(np.max(_consol_prev)) if len(_consol_prev) > 0 else _last_close
                if _last_close <= _consol_ceil + atr * 0.1:
                    _conf = round(_conf * 0.82, 2)
                if _flag_result is None or _conf > _flag_result["confidence"]:
                    _flag_result = {
                        "type": PatternType.FLAG,
                        "confidence": _conf,
                        "pole_gain_pct": round(_pole_gain * 100, 1),
                        "consol_ratio": round(_c_range / _p_range, 2),
                        "_pole_end": _pe,
                    }
        if _flag_result:
            _candidates.append(_flag_result)

    # ── Flama (Pennant) ───────────────────────────────────────────────────────
    if n >= 25:
        _pennant_result = None
        for _pole_bars in [10, 15, 20, 30]:
            if n < _pole_bars + 8:
                continue
            _search_start = max(0, n - 80)
            for _ps in range(_search_start, n - _pole_bars - 5, 5):
                _pe = _ps + _pole_bars
                if _pe >= n - 4:
                    break
                _pole_slice = closes[_ps:_pe]
                _pole_gain = (_pole_slice[-1] - _pole_slice[0]) / max(abs(_pole_slice[0]), 1e-9)
                if _pole_gain < 0.06:
                    continue
                _sh = highs[_pe:]
                _sl = lows[_pe:]
                if len(_sh) < 4:
                    continue
                _h_slope, _ = np.polyfit(np.arange(len(_sh)), _sh, 1)
                _l_slope, _ = np.polyfit(np.arange(len(_sl)), _sl, 1)
                _slope_thr = atr * 0.02
                if _h_slope < -_slope_thr and _l_slope > _slope_thr:
                    _conf = round(min(0.80, 0.60 + _pole_gain * 1.0), 2)
                    # Hacim teyidi — yoksa küçük ceza (çift ceza yerine tekil)
                    if not _vol_spike(_ps + _pole_bars // 2, window=5, threshold=1.5):
                        _conf = round(_conf * 0.90, 2)
                    if _pennant_result is None or _conf > _pennant_result["confidence"]:
                        _pennant_result = {
                            "type": PatternType.PENNANT,
                            "confidence": _conf,
                            "pole_gain_pct": round(_pole_gain * 100, 1),
                            "_pole_end": _pe,
                        }
        if _pennant_result:
            _candidates.append(_pennant_result)

    # ── Üçlü Tepe / Çift Tepe ────────────────────────────────────────────────
    if len(ph) >= 2:
        top_peaks = []
        used = set()
        for i in range(len(ph)):
            if i in used:
                continue
            cluster = [ph[i]]
            for j in range(i + 1, len(ph)):
                if j in used:
                    continue
                # Require minimum bar spacing to avoid clustering adjacent pivots
                if abs(ph[j][1] - ph[i][1]) <= tol and ph[j][0] - cluster[-1][0] >= MIN_PEAK_SPACING:
                    cluster.append(ph[j])
                    used.add(j)
            if len(cluster) >= 2:
                top_peaks.append(cluster)
                used.add(i)

        if top_peaks:
            best_cluster = max(top_peaks, key=lambda c: (len(c), c[-1][0]))
            if len(best_cluster) >= 3:
                avg_top = float(np.mean([p[1] for p in best_cluster]))
                neckline = float(np.min(lows[best_cluster[0][0]:best_cluster[-1][0] + 1]))
                confidence = round(min(0.88, 0.70 + (len(best_cluster) - 3) * 0.04), 2)
                # Neckline kırılım teyidi: ayı dönüşü için fiyat neckline'da/altında olmalı.
                if _last_close > neckline + atr * 0.3:
                    confidence = round(confidence * 0.72, 2)
                _candidates.append({
                    "type": PatternType.TRIPLE_TOP,
                    "confidence": confidence,
                    "top_price": avg_top,
                    "neckline": neckline,
                    "peaks": best_cluster,
                })
            elif len(best_cluster) == 2:
                p1, p2 = best_cluster[0], best_cluster[1]
                mid_lows = [q for q in pl if p1[0] < q[0] < p2[0]]
                if mid_lows:
                    neckline = min(mid_lows, key=lambda q: q[1])[1]
                    if neckline < min(p1[1], p2[1]) - atr * 0.2:
                        recency_bonus = 0.05 if p2[0] > n * 0.7 else 0.0
                        confidence = round(min(0.85, 0.65 + recency_bonus), 2)
                        # Neckline kırılım teyidi: ayı dönüşü için fiyat neckline'da/altında olmalı.
                        if _last_close > neckline + atr * 0.3:
                            confidence = round(confidence * 0.72, 2)
                        _candidates.append({
                            "type": PatternType.DOUBLE_TOP,
                            "confidence": confidence,
                            "top_price": (p1[1] + p2[1]) / 2,
                            "neckline": neckline,
                            "peak1": p1, "peak2": p2,
                        })

    # ── Üçlü Dip / Çift Dip ──────────────────────────────────────────────────
    if len(pl) >= 2:
        bottom_dips = []
        used = set()
        for i in range(len(pl)):
            if i in used:
                continue
            cluster = [pl[i]]
            for j in range(i + 1, len(pl)):
                if j in used:
                    continue
                if abs(pl[j][1] - pl[i][1]) <= tol and pl[j][0] - cluster[-1][0] >= MIN_PEAK_SPACING:
                    cluster.append(pl[j])
                    used.add(j)
            if len(cluster) >= 2:
                bottom_dips.append(cluster)
                used.add(i)

        if bottom_dips:
            best_cluster = max(bottom_dips, key=lambda c: (len(c), c[-1][0]))
            if len(best_cluster) >= 3:
                avg_bot = float(np.mean([p[1] for p in best_cluster]))
                neckline = float(np.max(highs[best_cluster[0][0]:best_cluster[-1][0] + 1]))
                confidence = round(min(0.88, 0.70 + (len(best_cluster) - 3) * 0.04), 2)
                # Neckline kırılım teyidi: boğa dönüşü için fiyat neckline'da/üzerinde olmalı.
                if _last_close < neckline - atr * 0.3:
                    confidence = round(confidence * 0.72, 2)
                _candidates.append({
                    "type": PatternType.TRIPLE_BOTTOM,
                    "confidence": confidence,
                    "bottom_price": avg_bot,
                    "neckline": neckline,
                    "dips": best_cluster,
                })
            elif len(best_cluster) == 2:
                d1, d2 = best_cluster[0], best_cluster[1]
                mid_highs = [q for q in ph if d1[0] < q[0] < d2[0]]
                if mid_highs:
                    neckline = max(mid_highs, key=lambda q: q[1])[1]
                    if neckline > max(d1[1], d2[1]) + atr * 0.2:
                        recency_bonus = 0.05 if d2[0] > n * 0.7 else 0.0
                        confidence = round(min(0.85, 0.65 + recency_bonus), 2)
                        # Neckline kırılım teyidi: boğa dönüşü için fiyat neckline'da/üzerinde olmalı.
                        if _last_close < neckline - atr * 0.3:
                            confidence = round(confidence * 0.72, 2)
                        _candidates.append({
                            "type": PatternType.DOUBLE_BOTTOM,
                            "confidence": confidence,
                            "bottom_price": (d1[1] + d2[1]) / 2,
                            "neckline": neckline,
                            "dip1": d1, "dip2": d2,
                        })

    # ── Kupa Sap (Cup & Handle) ───────────────────────────────────────────────
    # U-şekilli yuvarlak dip (cup) + küçük geri çekilme (handle).
    # Birden fazla pencere dene: 60/40, 70/30, 75/25
    if n >= 50:
        _cup_best = None
        for _cup_ratio in [0.60, 0.70, 0.75]:
            cup_end   = int(n * _cup_ratio)
            cup_slice = closes[:cup_end]
            handle_sl = closes[cup_end:]
            if len(handle_sl) < 5 or len(cup_slice) < 20:
                continue
            cup_left  = float(np.mean(cup_slice[:5]))
            cup_min   = float(np.min(cup_slice))
            cup_right = float(np.mean(cup_slice[-5:]))
            cup_depth = cup_left - cup_min
            # Simetri eşiği genişletildi %8 → %15; derinlik eşiği 1.5→1.0 ATR
            if cup_depth > atr * 1.0 and abs(cup_left - cup_right) / max(cup_left, 1e-9) < 0.15:
                handle_range = float(np.max(handle_sl) - np.min(handle_sl))
                if handle_range < cup_depth * 0.60:
                    symmetry = 1.0 - abs(cup_left - cup_right) / max(cup_depth, 1e-9)
                    depth_bonus = min(0.10, (cup_depth - atr * 1.0) / max(atr * 20, 1e-9))
                    confidence = round(min(0.85, 0.58 + symmetry * 0.20 + depth_bonus), 2)
                    if _last_close < cup_right * 0.97:
                        confidence = round(confidence * 0.88, 2)
                    if _cup_best is None or confidence > _cup_best["confidence"]:
                        _cup_best = {
                            "type": PatternType.CUP_HANDLE,
                            "confidence": confidence,
                            "cup_depth_pct": round(cup_depth / max(cup_left, 1e-9) * 100, 1),
                            "handle_range": round(handle_range, 2),
                        }
        if _cup_best:
            _candidates.append(_cup_best)

    _candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return _candidates


def _build_advanced_shapes(
    result: Dict[str, Any],
    idx_to_date,
    n: int,
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
) -> Tuple[List[Dict], str]:
    """Build Plotly shapes for advanced patterns. Returns (shapes_list, desc)."""
    ptype = result["type"]
    desc  = PATTERN_DESCRIPTIONS.get(ptype, "")
    shapes = []

    def line(x0i, y0v, x1i, y1v, color, width=2, dash="solid", name=""):
        d0, d1 = idx_to_date(x0i), idx_to_date(x1i)
        if d0 and d1:
            shapes.append({"type": "line", "x0": d0, "y0": float(y0v),
                           "x1": d1, "y1": float(y1v),
                           "line": {"color": color, "width": width, "dash": dash},
                           "name": name, "desc": desc})

    red   = "#F87171"
    green = "#34D399"
    amber = "#FBBF24"
    cyan  = "#22D3EE"
    purple = "#A855F7"

    if ptype in (PatternType.HEAD_SHOULDERS, PatternType.INV_HEAD_SHOULDERS):
        ls_i, ls_p = result["ls_idx"], result["ls_price"]
        hd_i, hd_p = result["head_idx"], result["head_price"]
        rs_i, rs_p = result["rs_idx"], result["rs_price"]
        nl_l, nl_r = result["nl_left_idx"], result["nl_right_idx"]
        nk          = result["neckline"]
        c = red if ptype == PatternType.HEAD_SHOULDERS else green
        line(ls_i, ls_p, hd_i, hd_p, c, width=1.5, dash="dot")
        line(hd_i, hd_p, rs_i, rs_p, c, width=1.5, dash="dot")
        # Neckline — extend to full window
        line(0, nk, n - 1, nk, c, width=2.0, dash="solid", name="neckline")

    elif ptype == PatternType.DOUBLE_TOP:
        p1, p2 = result["peak1"], result["peak2"]
        nk = result["neckline"]
        line(p1[0], p1[1], p2[0], p2[1], red, width=1.5, dash="dot")
        line(0, nk, n - 1, nk, red, width=1.8, dash="solid", name="neckline")

    elif ptype == PatternType.DOUBLE_BOTTOM:
        d1, d2 = result["dip1"], result["dip2"]
        nk = result["neckline"]
        line(d1[0], d1[1], d2[0], d2[1], green, width=1.5, dash="dot")
        line(0, nk, n - 1, nk, green, width=1.8, dash="solid", name="neckline")

    elif ptype == PatternType.TRIPLE_TOP:
        peaks = result["peaks"]
        avg_top = result["top_price"]
        nk = result["neckline"]
        line(peaks[0][0], avg_top, peaks[-1][0], avg_top, red, width=2.0, name="resistance")
        line(0, nk, n - 1, nk, red, width=1.5, dash="dash", name="neckline")

    elif ptype == PatternType.TRIPLE_BOTTOM:
        dips = result["dips"]
        avg_bot = result["bottom_price"]
        nk = result["neckline"]
        line(dips[0][0], avg_bot, dips[-1][0], avg_bot, green, width=2.0, name="support")
        line(0, nk, n - 1, nk, green, width=1.5, dash="dash", name="neckline")

    elif ptype == PatternType.FLAG:
        pole_end = result.get("_pole_end", n // 2)
        pole_start = max(0, pole_end - 20)
        # Flagpole
        line(pole_start, float(closes[pole_start]), pole_end, float(closes[pole_end]), amber, width=2, name="pole")
        # Flag channel (consolidation bounds)
        _flag_sl = closes[pole_end:] if pole_end < n else closes[-10:]
        flag_h = float(np.max(_flag_sl))
        flag_l = float(np.min(_flag_sl))
        line(pole_end, flag_h, n - 1, flag_h, amber, width=1.5, dash="dash", name="flag_upper")
        line(pole_end, flag_l, n - 1, flag_l, amber, width=1.5, dash="dash", name="flag_lower")

    elif ptype == PatternType.PENNANT:
        pole_end = result.get("_pole_end", n // 2)
        pole_start = max(0, pole_end - 20)
        line(pole_start, float(closes[pole_start]), pole_end, float(closes[pole_end]), cyan, width=2, name="pole")
        pn_h_start = float(np.max(highs[pole_end:pole_end + 5])) if pole_end + 5 <= n else float(highs[min(pole_end, n-1)])
        pn_l_start = float(np.min(lows[pole_end:pole_end + 5]))  if pole_end + 5 <= n else float(lows[min(pole_end, n-1)])
        pn_h_end   = float(np.max(highs[-5:])) if n >= 5 else float(highs[-1])
        pn_l_end   = float(np.min(lows[-5:]))  if n >= 5 else float(lows[-1])
        mid_price  = (pn_h_end + pn_l_end) / 2
        line(pole_end, pn_h_start, n - 1, mid_price, cyan, width=1.5, dash="dash", name="pennant_upper")
        line(pole_end, pn_l_start, n - 1, mid_price, cyan, width=1.5, dash="dash", name="pennant_lower")

    elif ptype == PatternType.CUP_HANDLE:
        cup_end = int(n * 0.70)
        cup_min_idx = int(np.argmin(closes[:cup_end]))
        cup_min_p   = float(closes[cup_min_idx])
        cup_left_p  = float(np.mean(closes[:5]))
        cup_right_p = float(np.mean(closes[cup_end - 5:cup_end]))
        avg_rim = (cup_left_p + cup_right_p) / 2
        # Cup: rim line
        line(0, avg_rim, cup_end, avg_rim, purple, width=2, dash="dash", name="cup_rim")
        # Cup bottom
        line(0, cup_min_p, cup_min_idx, cup_min_p, purple, width=1.2, dash="dot", name="cup_bottom")
        # Handle
        handle_h = float(np.max(closes[cup_end:]))
        handle_l = float(np.min(closes[cup_end:]))
        line(cup_end, handle_h, n - 1, handle_h, purple, width=1.5, dash="dash", name="handle_upper")
        line(cup_end, handle_l, n - 1, handle_l, purple, width=1.5, dash="dot", name="handle_lower")

    return shapes, desc


# Profil bazlı formasyon öncelikleri — hangi formasyonlar hangi profil için kritik
_PROFILE_PRIORITY: Dict[str, List[str]] = {
    "SAFE_HARBOR":   ["Çift Dip", "Ters Baş Omuz", "Üçlü Dip", "Kupa Sap", "Destek Hattı", "Alçalan Takoz"],
    "AGGRESSIVE":    ["Bayrak", "Flama", "Yükselen Üçgen", "Daralan Üçgen", "Alçalan Kanal"],
    "REVERSAL":      ["Baş Omuz", "Ters Baş Omuz", "Çift Tepe", "Çift Dip", "Üçlü Tepe", "Üçlü Dip"],
    "TREND":         ["Yükselen Kanal", "Alçalan Kanal", "Yükselen Üçgen", "Alçalan Üçgen"],
    "VALUE":         ["Kupa Sap", "Çift Dip", "Üçlü Dip", "Destek Hattı", "Range/Kutu"],
    "MOMENTUM":      ["Bayrak", "Flama", "Yükselen Üçgen", "Kupa Sap"],
    "BREAKOUT":      ["Daralan Üçgen", "Yükselen Üçgen", "Alçalan Üçgen", "Flama", "Bayrak"],
}

# Profil adı normalize — useScanStore'daki değerleri karşıla
_PROFILE_NAME_MAP = {
    "Güvenli Liman": "SAFE_HARBOR", "güvenli liman": "SAFE_HARBOR", "safe_harbor": "SAFE_HARBOR",
    "Agresif Atak": "AGGRESSIVE",   "agresif atak": "AGGRESSIVE",   "aggressive": "AGGRESSIVE",
    "Dönüş Uzmanı": "REVERSAL",     "dönüş uzmanı": "REVERSAL",     "reversal": "REVERSAL",
    "Trend Avcısı": "TREND",        "trend avcısı": "TREND",        "trend": "TREND",
    "Değer Kaşifi": "VALUE",        "değer kaşifi": "VALUE",        "value": "VALUE",
    "Anlık Fırsatçı": "MOMENTUM",   "anlık fırsatçı": "MOMENTUM",   "momentum": "MOMENTUM",
    "Kırılım Dedektörü": "BREAKOUT","kırılım dedektörü": "BREAKOUT","breakout": "BREAKOUT",
}

_STALE_BARS = 20  # default fallback

# Her formasyon tipi için uygun bayatlık eşiği (işlem günü)
_STALE_BARS_BY_TYPE: Dict[PatternType, int] = {
    # Kısa ömürlü devam formasyonları (konsolidasyon biter, kırılım ya olur ya olmaz)
    PatternType.FLAG:                 20,   # ~4 hafta konsolidasyon makul
    PatternType.PENNANT:              20,
    # Orta vadeli dönüş formasyonları
    PatternType.HEAD_SHOULDERS:       50,   # ~10 hafta
    PatternType.INV_HEAD_SHOULDERS:   50,
    PatternType.DOUBLE_TOP:           45,
    PatternType.DOUBLE_BOTTOM:        45,
    PatternType.TRIPLE_TOP:           55,
    PatternType.TRIPLE_BOTTOM:        55,
    # Uzun vadeli birikim
    PatternType.CUP_HANDLE:           70,   # Kupa Sap aylarca sürebilir
    # Teknik hatlar: fiyat tekrar test ettiği sürece geçerli
    PatternType.RESISTANCE:           80,
    PatternType.SUPPORT:              80,
    # Üçgenler ve takozlar (apekse yaklaştıkça kritikleşir)
    PatternType.TRIANGLE:             40,
    PatternType.ASCENDING_TRIANGLE:   40,
    PatternType.DESCENDING_TRIANGLE:  40,
    PatternType.EXPANDING_TRIANGLE:   25,
    PatternType.WEDGE_FALLING:        45,
    PatternType.WEDGE_RISING:         45,
    # Kanallar (trend sürdükçe geçerli)
    PatternType.CHANNEL_ASC:          60,
    PatternType.CHANNEL_DESC:         60,
    # Yatay bant
    PatternType.RANGE:                45,
}


def _profile_relevance(pattern_type_value: str, profile_key: Optional[str]) -> str:
    """Formasyon ile aktif profil arasındaki uyum: 'high' | 'medium' | 'low'"""
    if not profile_key or profile_key not in _PROFILE_PRIORITY:
        return "medium"
    priority_list = _PROFILE_PRIORITY[profile_key]
    if pattern_type_value in priority_list[:3]:
        return "high"
    if pattern_type_value in priority_list:
        return "medium"
    return "low"


def detect_patterns_validated(
    df: pd.DataFrame,
    params: Optional[Dict[str, Any]] = None,
    profile_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main entry point - Single source of truth for pattern detection.
    profile_name: aktif strateji profili adı (opsiyonel) — profile_relevance hesabı için.
    Returns enriched pattern data with debug metrics + age/staleness info.
    """
    profile_key = _PROFILE_NAME_MAP.get((profile_name or "").strip(), None)

    # Merge with defaults
    if params is None:
        params = DEFAULT_PARAMS.copy()
    else:
        p = DEFAULT_PARAMS.copy()
        p.update(params)
        params = p
    
    # Validation
    if df is None or len(df) < params["lookback_bars"]:
        return {
            "patterns": [],
            "detected_type": PatternType.NONE.value,
            "confidence": 0.0,
            "zoom_range": None,
            "debug": {
                "error": "insufficient_data",
                "required_bars": params["lookback_bars"],
                "actual_bars": len(df) if df is not None else 0
            }
        }
    
    # Use only lookback window (deterministic)
    df_window = df.tail(params["lookback_bars"]).copy()
    
    highs = df_window["High"].values
    lows = df_window["Low"].values
    closes = df_window["Close"].values
    times = df_window.index
    n = len(df_window)
    
    # Calculate ATR
    atr = calculate_atr(df_window, params["atr_period"])
    
    # Price scale (for adaptive thresholds)
    price_scale = float(np.mean(closes)) if len(closes) > 0 else 1.0
    
    # Find pivots
    pivot_highs, pivot_lows = find_pivots(
        highs, lows, params["pivot_order"]
    )
    
    if len(pivot_highs) < 2 and len(pivot_lows) < 2:
        return {
            "patterns": [],
            "detected_type": PatternType.NONE.value,
            "confidence": 0.0,
            "zoom_range": None,
            "debug": {
                "error": "insufficient_pivots",
                "pivot_high_count": len(pivot_highs),
                "pivot_low_count": len(pivot_lows)
            }
        }
    
    # Date formatting (needed by both advanced and geometric paths)
    has_time = False
    if isinstance(times, pd.DatetimeIndex):
        try:
            if getattr(times, "tz", None) is not None:
                times = times.tz_convert(None)
            has_time = bool(((times.hour != 0) | (times.minute != 0) | (times.second != 0)).any())
        except Exception:
            pass
    fmt = "%Y-%m-%d %H:%M" if has_time else "%Y-%m-%d"

    def idx_to_date(i):
        if 0 <= i < n:
            ts = times[i]
            if isinstance(ts, pd.Timestamp):
                return ts.strftime(fmt)
            return str(ts)
        return None

    # ── Advanced pattern detection (H&S, Double/Triple Top/Bot, Flag, Pennant, Cup) ──
    # Volumes: hacim teyidi için kullanılır — df'ten alınır
    _volumes = None
    try:
        _vol_col = next((c for c in ("Volume", "volume", "Hacim") if c in df_window.columns), None)
        if _vol_col:
            _volumes = df_window[_vol_col].values.astype(float)
    except Exception:
        _volumes = None

    adv = None
    try:
        _adv_list = _detect_advanced_patterns(highs, lows, closes, pivot_highs, pivot_lows, atr, n, volumes=_volumes)
        adv = _adv_list[0] if _adv_list else None
        _adv_secondary_candidate = _adv_list[1] if len(_adv_list) > 1 else None
    except Exception:
        adv = None

    # ── Trend bağlamı doğrulaması ─────────────────────────────────────────────
    # Dönüş formasyonları tersine döndürmek istedikleri trende ihtiyaç duyar:
    #   Bearish reversal (H&S, Double/Triple Top): sadece uptrend'de tam güçlü
    #   Bullish reversal (IHS, Double/Triple Bottom): sadece downtrend'de tam güçlü
    # Eğer yanlış trendde bulunuyorlarsa güven %30 düşürülür — tamamen iptal edilmez.
    _BEARISH_REVERSAL = {"HEAD_SHOULDERS", "DOUBLE_TOP", "TRIPLE_TOP"}
    _BULLISH_REVERSAL = {"INV_HEAD_SHOULDERS", "DOUBLE_BOTTOM", "TRIPLE_BOTTOM"}
    if adv is not None and adv.get("confidence", 0) >= 0.40:
        try:
            adv_t_name = adv.get("type", PatternType.NONE)
            adv_t_str = adv_t_name.name if hasattr(adv_t_name, "name") else str(adv_t_name)
            # Kısa vadeli trend: son 20 bar EMA5 > EMA20?
            _ema5  = float(np.mean(closes[-5:]))  if len(closes) >= 5  else float(closes[-1])
            _ema20 = float(np.mean(closes[-20:])) if len(closes) >= 20 else _ema5
            _uptrend = _ema5 >= _ema20
            if adv_t_str in _BEARISH_REVERSAL and not _uptrend:
                # Bearish reversal ama downtrend'de — trend zaten düşüyor, formasyon güvenilirliği azalır
                adv["confidence"] = adv.get("confidence", 0.6) * 0.70
            elif adv_t_str in _BULLISH_REVERSAL and _uptrend:
                # Bullish reversal ama uptrend'de — trend zaten yukarı, dönüş beklentisi zayıf
                adv["confidence"] = adv.get("confidence", 0.6) * 0.70
        except Exception:
            pass

    if adv is not None and adv.get("confidence", 0) >= 0.58:
        adv_shapes, adv_desc = _build_advanced_shapes(adv, idx_to_date, n, highs, lows, closes)
        adv_type = adv["type"]
        adv_conf = float(adv.get("confidence", 0.65))
        # Zoom range from shape extents
        zoom_range = None
        if adv_shapes:
            try:
                xs = [s["x0"] for s in adv_shapes] + [s["x1"] for s in adv_shapes]
                ys = [s["y0"] for s in adv_shapes] + [s["y1"] for s in adv_shapes]
                xs_valid = [x for x in xs if x]
                ys_valid = [y for y in ys if y is not None and np.isfinite(y)]
                if xs_valid and ys_valid:
                    zoom_range = {"x": [min(xs_valid), max(xs_valid)],
                                  "y": [min(ys_valid) * 0.95, max(ys_valid) * 1.05]}
            except Exception:
                pass
        is_stb = False
        try:
            last_p = closes[-1]
            nk = adv.get("neckline") or adv.get("top_price") or adv.get("bottom_price")
            if nk is not None:
                # "Kırılım yaklaşıyor": fiyat neckline'ın 1.5 ATR içinde
                # Bearish: fiyat neckline'ın hemen üzerinde (aşağı kırılmak üzere)
                # Bullish: fiyat neckline'ın hemen altında (yukarı kırılmak üzere)
                if adv_type in (PatternType.HEAD_SHOULDERS, PatternType.DOUBLE_TOP, PatternType.TRIPLE_TOP):
                    is_stb = nk - 1.5 * atr <= last_p <= nk + 0.3 * atr
                elif adv_type in (PatternType.INV_HEAD_SHOULDERS, PatternType.DOUBLE_BOTTOM, PatternType.TRIPLE_BOTTOM):
                    is_stb = nk - 0.3 * atr <= last_p <= nk + 1.5 * atr
                elif adv_type in (PatternType.FLAG, PatternType.PENNANT, PatternType.CUP_HANDLE):
                    # Devam formasyonları: fiyat üst banda yakın = kırılım yakın
                    recent_high = float(np.max(closes[-10:]))
                    overall_high = float(np.max(closes))
                    is_stb = recent_high >= overall_high * 0.97
        except Exception:
            pass
        # Formasyon yaşı — pattern tipine göre "sinyal çıkış noktası"
        # Bayrak/Flama: direk bitti = konsolidasyon başladı = sinyal başlangıcı
        # Kupa Sap: handle başladığı bar
        # H&S / Double Top / Bottom: son tepe/dip
        if adv_type in (PatternType.FLAG, PatternType.PENNANT):
            _pole_end_idx = adv.get("_pole_end", n - 1)
            _adv_last_idx = int(_pole_end_idx)
        elif adv_type == PatternType.CUP_HANDLE:
            _adv_last_idx = int(n * 0.70)  # handle başlangıcı
        else:
            _adv_last_idx = adv.get("rs_idx") or adv.get("peak2", [None, None])[0] \
                         or adv.get("dip2", [None, None])[0] or (n - 1)
        _formed_bars_ago = max(0, (n - 1) - int(_adv_last_idx))
        _stale_thr = _STALE_BARS_BY_TYPE.get(adv_type, _STALE_BARS)
        _is_stale = _formed_bars_ago > _stale_thr

        # İkincil formasyon: geometrik çizgileri de hesapla (çoklu formasyon desteği)
        _secondary = None
        try:
            _ul = fit_line_robust(pivot_highs, atr, "resistance", params) if len(pivot_highs) >= 2 else None
            _ll = fit_line_robust(pivot_lows,  atr, "support",    params) if len(pivot_lows)  >= 2 else None
            _cls = classify_pattern(_ul, _ll, n, atr, price_scale, params)
            if _cls["type"] != PatternType.NONE and _cls["confidence"] >= 0.50:
                _sec_shapes = []
                _last_idx_g = n - 1
                if _ul:
                    _y0 = _ul["slope"] * 0 + _ul["intercept"]
                    _y1 = _ul["slope"] * _last_idx_g + _ul["intercept"]
                    _d0, _d1 = idx_to_date(0), idx_to_date(_last_idx_g)
                    if _d0 and _d1:
                        _sec_shapes.append({"type": "line", "x0": _d0, "y0": float(_y0), "x1": _d1, "y1": float(_y1),
                                            "line": {"color": "#FF2A6D", "width": 1.5, "dash": "dot"}, "name": "resistance"})
                if _ll:
                    _y0 = _ll["slope"] * 0 + _ll["intercept"]
                    _y1 = _ll["slope"] * _last_idx_g + _ll["intercept"]
                    _d0, _d1 = idx_to_date(0), idx_to_date(_last_idx_g)
                    if _d0 and _d1:
                        _sec_shapes.append({"type": "line", "x0": _d0, "y0": float(_y0), "x1": _d1, "y1": float(_y1),
                                            "line": {"color": "#05D9E8", "width": 1.5, "dash": "dot"}, "name": "support"})
                _secondary = {
                    "detected_type": _cls["type"].value,
                    "confidence": _cls["confidence"],
                    "patterns": _sec_shapes,
                    "profile_relevance": _profile_relevance(_cls["type"].value, profile_key),
                }
        except Exception:
            pass

        # Geometrik ikincil yoksa second-best advanced adayını ikincil formasyon olarak sun.
        # Zıt yönlü formasyonlar (H&S↔IHS, Çift Tepe↔Çift Dip vb.) ikincil olarak gösterilmez.
        _OPPOSITE_PAIRS = {
            PatternType.HEAD_SHOULDERS:  PatternType.INV_HEAD_SHOULDERS,
            PatternType.INV_HEAD_SHOULDERS: PatternType.HEAD_SHOULDERS,
            PatternType.DOUBLE_TOP:  PatternType.DOUBLE_BOTTOM,
            PatternType.DOUBLE_BOTTOM: PatternType.DOUBLE_TOP,
            PatternType.TRIPLE_TOP:  PatternType.TRIPLE_BOTTOM,
            PatternType.TRIPLE_BOTTOM: PatternType.TRIPLE_TOP,
        }
        if _secondary is None and _adv_secondary_candidate is not None:
            try:
                _sec_adv_type = _adv_secondary_candidate.get("type", PatternType.NONE)
                _sec_adv_conf = float(_adv_secondary_candidate.get("confidence", 0))
                _sec_adv_name = _sec_adv_type.value if hasattr(_sec_adv_type, "value") else str(_sec_adv_type)
                _is_opposite = _OPPOSITE_PAIRS.get(adv_type) == _sec_adv_type
                if _sec_adv_conf >= 0.45 and not _is_opposite and _sec_adv_name not in ("Formasyon Yok", "", "NONE"):
                    _secondary = {
                        "detected_type": _sec_adv_name,
                        "confidence": _sec_adv_conf,
                        "patterns": [],
                        "profile_relevance": _profile_relevance(_sec_adv_name, profile_key),
                    }
            except Exception:
                pass

        return {
            "patterns": adv_shapes,
            "detected_type": adv_type.value,
            "detected_desc": adv_desc,
            "confidence": adv_conf,
            "is_short_term_breakout": is_stb,
            "formed_bars_ago": _formed_bars_ago,
            "is_stale": _is_stale,
            "profile_relevance": _profile_relevance(adv_type.value, profile_key),
            "secondary_pattern": _secondary,
            "zoom_range": zoom_range,
            "debug": {"method": "advanced", "pattern": adv_type.name,
                      "atr_14": round(atr, 4), "pivot_highs": len(pivot_highs), "pivot_lows": len(pivot_lows)},
        }

    # ── Geometric line classifier (channels, wedges, triangles, support/resistance) ──
    upper_line = fit_line_robust(pivot_highs, atr, "resistance", params) if len(pivot_highs) >= 2 else None
    lower_line = fit_line_robust(pivot_lows, atr, "support", params) if len(pivot_lows) >= 2 else None

    classification = classify_pattern(upper_line, lower_line, n, atr, price_scale, params)

    final_shapes = []
    x_min_idx = n
    x_max_idx = 0
    y_vals = []
    pat_desc = PATTERN_DESCRIPTIONS.get(classification["type"], "")

    if upper_line is not None:
        x0_idx, x1_idx = 0, n - 1
        y0 = upper_line["slope"] * x0_idx + upper_line["intercept"]
        y1 = upper_line["slope"] * x1_idx + upper_line["intercept"]
        d0, d1 = idx_to_date(x0_idx), idx_to_date(x1_idx)
        if d0 and d1:
            final_shapes.append({"type": "line", "x0": d0, "y0": float(y0), "x1": d1, "y1": float(y1),
                                  "line": {"color": "#FF2A6D", "width": 2, "dash": "dash"},
                                  "name": "resistance", "desc": pat_desc})
            x_min_idx = min(x_min_idx, x0_idx); x_max_idx = max(x_max_idx, x1_idx)
            y_vals.extend([y0, y1])

    if lower_line is not None:
        x0_idx, x1_idx = 0, n - 1
        y0 = lower_line["slope"] * x0_idx + lower_line["intercept"]
        y1 = lower_line["slope"] * x1_idx + lower_line["intercept"]
        d0, d1 = idx_to_date(x0_idx), idx_to_date(x1_idx)
        if d0 and d1:
            final_shapes.append({"type": "line", "x0": d0, "y0": float(y0), "x1": d1, "y1": float(y1),
                                  "line": {"color": "#05D9E8", "width": 2, "dash": "dash"},
                                  "name": "support", "desc": pat_desc})
            x_min_idx = min(x_min_idx, x0_idx); x_max_idx = max(x_max_idx, x1_idx)
            y_vals.extend([y0, y1])

    zoom_range = None
    if final_shapes and y_vals:
        x0_date = idx_to_date(max(0, x_min_idx - 10))
        x1_date = idx_to_date(min(n - 1, x_max_idx + 5))
        if x0_date and x1_date:
            zoom_range = {"x": [x0_date, x1_date],
                          "y": [min(y_vals) * 0.95, max(y_vals) * 1.05]}

    debug = {
        "lookback_bars": params["lookback_bars"], "pivot_order": params["pivot_order"],
        "pivot_high_count": len(pivot_highs), "pivot_low_count": len(pivot_lows),
        "atr_14": round(atr, 4), "price_scale": round(price_scale, 2),
        "method": "geometric",
    }
    if upper_line:
        debug["upper_line"] = {"slope": round(upper_line["slope"], 6),
                               "touch_count": upper_line["touch_count"],
                               "touches": upper_line["touch_indices"][:10],
                               "rmse": round(upper_line["rmse"], 4)}
    if lower_line:
        debug["lower_line"] = {"slope": round(lower_line["slope"], 6),
                               "touch_count": lower_line["touch_count"],
                               "touches": lower_line["touch_indices"][:10],
                               "rmse": round(lower_line["rmse"], 4)}
    debug["classification"] = {
        "pattern_type": classification["type"].name,
        "pattern_label": classification["type"].value,
        "confidence": round(classification["confidence"], 2),
        "convergence_ratio": round(classification["convergence_ratio"], 2) if classification["convergence_ratio"] else None,
        "validation_passed": classification["validation_passed"],
        "rejection_reason": classification["rejection_reason"],
    }
    debug["validation_checks"] = {
        "upper_touch_ok": upper_line is None or upper_line["touch_count"] >= params["min_touches"],
        "lower_touch_ok": lower_line is None or lower_line["touch_count"] >= params["min_touches"],
        "pattern_downgrade_applied": not classification["validation_passed"],
        "no_nan_values": all(np.isfinite(v) for v in y_vals) if y_vals else True,
    }

    is_stb = False
    try:
        if len(closes) > 5:
            last_p = closes[-1]
            last_idx = n - 1
            if upper_line:
                res_val = upper_line["slope"] * last_idx + upper_line["intercept"]
                # Direnç hattına yaklaşıyor: 0.5 ATR altında
                if 0 <= res_val - last_p <= 0.5 * atr:
                    is_stb = True
            if not is_stb and lower_line:
                sup_val = lower_line["slope"] * last_idx + lower_line["intercept"]
                # Destek hattına yaklaşıyor: 0.5 ATR üzerinde
                if 0 <= last_p - sup_val <= 0.5 * atr:
                    is_stb = True
    except Exception:
        pass

    # Geometrik formasyonlar son bara kadar uzanır — her zaman aktif
    # Geometrik formasyonlar için formed_bars_ago: en son pivot dokunuşundan bu yana
    # Destek/Direnç hattı son price touch'ını yakalar; Üçgen/Takoz/Kanal son dokunuşu
    _geo_last_touch = 0
    try:
        if upper_line and upper_line.get("touch_indices"):
            _geo_last_touch = max(_geo_last_touch, max(upper_line["touch_indices"]))
        if lower_line and lower_line.get("touch_indices"):
            _geo_last_touch = max(_geo_last_touch, max(lower_line["touch_indices"]))
    except Exception:
        _geo_last_touch = n - 1
    _geo_formed_bars_ago = max(0, (n - 1) - int(_geo_last_touch))
    _geo_stale_thr = _STALE_BARS_BY_TYPE.get(classification["type"], _STALE_BARS)
    _geo_is_stale  = _geo_formed_bars_ago > _geo_stale_thr

    # Convergence ratio: üçgen/takoz'larda apeks yakınlığı → kırılım aciliyeti
    _conv_ratio = classification.get("convergence_ratio")

    # İkincil formasyon (geometric path): advanced pattern düşük güvenle bulunduysa
    # secondary olarak eklenir. adv None ama ikinci aday varsa onu kullan.
    _geo_secondary = None
    _geo_sec_source = adv if adv is not None else _adv_secondary_candidate
    if _geo_sec_source is not None:
        try:
            _adv_type = _geo_sec_source.get("type", PatternType.NONE)
            _adv_conf = float(_geo_sec_source.get("confidence", 0.0))
            _adv_name = _adv_type.value if hasattr(_adv_type, "value") else str(_adv_type)
            if _adv_type != PatternType.NONE and _adv_name not in ("Formasyon Yok", "") and _adv_conf >= 0.40:
                _geo_secondary = {
                    "detected_type": _adv_name,
                    "confidence": _adv_conf,
                    "patterns": [],
                    "profile_relevance": _profile_relevance(_adv_name, profile_key),
                }
        except Exception:
            pass

    return {
        "patterns": final_shapes,
        "detected_type": classification["type"].value,
        "detected_desc": PATTERN_DESCRIPTIONS.get(classification["type"], ""),
        "confidence": classification["confidence"],
        "is_short_term_breakout": is_stb,
        "formed_bars_ago": _geo_formed_bars_ago,
        "is_stale": _geo_is_stale,
        "convergence_ratio": _conv_ratio,
        "profile_relevance": _profile_relevance(classification["type"].value, profile_key),
        "secondary_pattern": _geo_secondary,
        "zoom_range": zoom_range,
        "debug": debug,
    }


# ==========================================
# BACKWARD COMPATIBILITY WRAPPER (HOTFIX)
# ==========================================
class PatternDetector:
    """
    Wrapper class for backward compatibility with existing analysis engine.
    Delegates to functional detect_patterns_validated().
    """
    def __init__(self):
        pass

    def detect(self, df: pd.DataFrame, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return detect_patterns_validated(df, params)

