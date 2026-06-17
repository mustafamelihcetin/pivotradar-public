# backend/app/features/charts/engine.py
import pandas as pd
import logging

logger = logging.getLogger(__name__)
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import traceback
import math
import threading
import time as _time
from datetime import datetime, time, timedelta
from typing import Any, Dict, List, Optional
from ...core import settings
from ..market_data.service import MarketDataService
from .patterns import detect_patterns_validated, PATTERN_DESCRIPTIONS, PatternType
from ...core.config_profiles import PROFILE_MAX_TARGET_PCT, PROFILE_DURATION_DAYS, normalize_profile
from ...core.time_utils import now_utc
from ...shared.ohlcv import MarketDataBundle

# ── GLOBAL ENGINE STATE ───────────────────────────────────────────────────────
# Shared across requests to prevent redundant yfinance calls and rate-limiting
_FETCH_LOCK = threading.Lock()
_QUEUE_LOCK = threading.Lock()
_WAITING_FOR_CHART = 0       # Thread-safe via _QUEUE_LOCK
_CHART_QUEUE_TIMESTAMPS: list = []  # Entry timestamps to detect stuck increments
_CHART_QUEUE_TIMEOUT_SEC = 120      # Entries older than this are considered stale

def _chart_queue_inc():
    global _WAITING_FOR_CHART
    with _QUEUE_LOCK:
        now = _time.monotonic()
        _CHART_QUEUE_TIMESTAMPS.append(now)
        # Purge stale entries (stuck requests that never decremented)
        cutoff = now - _CHART_QUEUE_TIMEOUT_SEC
        stale = sum(1 for ts in _CHART_QUEUE_TIMESTAMPS if ts < cutoff)
        if stale:
            del _CHART_QUEUE_TIMESTAMPS[:stale]
            _WAITING_FOR_CHART = max(0, _WAITING_FOR_CHART - stale)
        _WAITING_FOR_CHART += 1

def _chart_queue_dec():
    global _WAITING_FOR_CHART
    with _QUEUE_LOCK:
        _WAITING_FOR_CHART = max(0, _WAITING_FOR_CHART - 1)
        if _CHART_QUEUE_TIMESTAMPS:
            _CHART_QUEUE_TIMESTAMPS.pop(0)

def get_chart_queue_depth() -> int:
    """Public accessor for router/progress endpoint — avoids circular import."""
    return _WAITING_FOR_CHART

_SHARED_INDEX_CACHE = {} # Key: "^XU100_PERIOD", Val: (df, timestamp)
_INDEX_CACHE_LOCK = threading.Lock()  # Guards _SHARED_INDEX_CACHE reads/writes

def _is_bist_active() -> bool:
    """Detects if Borsa Istanbul is currently in an active trading session (UTC+3)."""
    # BIST Hours: Mon-Fri 10:00 - 18:00 (Closing session until 18:10)
    # Buffering: 09:50 - 18:20
    now_tr = now_utc().replace(tzinfo=None) + timedelta(hours=3)
    if now_tr.weekday() >= 5: return False # Weekend
    curr_t = now_tr.time()
    return time(9, 50) <= curr_t <= time(18, 20)

def _get_index_ttl() -> int:
    """Returns number of seconds the index cache remains valid based on market state."""
    return 600 if _is_bist_active() else 21600 # 10m if active, 6h if closed

# ── CONSTANTS ─────────────────────────────────────────────────────────────────
FIB_RATIOS = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
FIB_COLORS = {
    0.0:   "#6b7280",
    0.236: "#3b82f6",
    0.382: "#22d3ee",
    0.5:   "#a78bfa",
    0.618: "#f59e0b",
    0.786: "#f87171",
    1.0:   "#6b7280",
}

def _compute_fibonacci(df: pd.DataFrame, lookback: int = 200) -> Dict[str, Any]:
    window = df.tail(lookback)
    if len(window) < 10: return {}
    high = float(window["High"].max()) if "High" in window.columns else float(window["Close"].max())
    low  = float(window["Low"].min())  if "Low"  in window.columns else float(window["Close"].min())
    if not (math.isfinite(high) and math.isfinite(low) and high > low): return {}
    mid = len(window) // 2
    first_avg  = float(window["Close"].iloc[:mid].mean())
    second_avg = float(window["Close"].iloc[mid:].mean())

    # Trend gücü: ikinci yarının birinci yarıya göre değişim yüzdesi
    trend_pct = (second_avg - first_avg) / first_avg * 100 if first_avg else 0.0
    if trend_pct >= 1.5:
        direction = "up"
    elif trend_pct <= -1.5:
        direction = "down"
    else:
        direction = "sideways"

    span = high - low
    levels = []
    for ratio in FIB_RATIOS:
        # Uptrend: retracement levels from high downward (support zones)
        # Downtrend: retracement levels from low upward (resistance zones)
        # Sideways: midpoint-anchored levels (both directions shown)
        if direction == "up":
            price = high - span * ratio
        elif direction == "down":
            price = low + span * ratio
        else:
            # Sideways: center the levels around the midpoint
            mid_price = (high + low) / 2.0
            price = mid_price + span * (0.5 - ratio)

        if math.isfinite(price):
            levels.append({
                "ratio": ratio, "price": round(price, 4), "color": FIB_COLORS.get(ratio, "#6b7280"),
                "label": f"Fib {ratio*100:.1f}%" if ratio not in (0.0, 1.0) else ("Tepe" if ratio == 0.0 else "Dip")
            })
    return {
        "levels": levels, "swing_high": round(high, 4), "swing_low": round(low, 4),
        "direction": direction, "trend_pct": round(trend_pct, 2),
        "x_start": str(window.index[0]), "x_end": str(window.index[-1])
    }

def _fibonacci_to_shapes(fib: Dict) -> List[Dict]:
    shapes = []
    if not fib or not fib.get("levels"): return shapes
    x0, x1 = fib["x_start"], fib["x_end"]
    for lv in fib["levels"]:
        shapes.append({
            "type": "line", "x0": x0, "x1": x1, "y0": lv["price"], "y1": lv["price"], "xref": "x", "yref": "y",
            "line": {"color": lv["color"], "width": 1.0, "dash": "dot"}, "opacity": 0.6, "name": lv["label"], "fib_ratio": lv["ratio"]
        })
    return shapes

def _compute_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    from ...shared.ohlcv import compute_rsi_wilder, compute_atr_wilder
    result = {}
    close = df["Close"]
    
    # Standard ATR
    df["ATR"] = compute_atr_wilder(df, period=14)
    
    if len(close) >= 20:
        sma = close.rolling(20).mean()
        # ddof=0 (population std): TradingView/Bloomberg ile uyumlu.
        # Pandas varsayılanı ddof=1 (sample std) — dar bantlarda %5'e kadar sapma yaratır.
        std = close.rolling(20).std(ddof=0)
        result["bb_upper"], result["bb_lower"], result["bb_mid"] = (sma + 2*std).tolist(), (sma - 2*std).tolist(), sma.tolist()
    
    # Standard RSI
    rsi_series = compute_rsi_wilder(close, period=14)
    result["rsi"] = [round(v, 2) if math.isfinite(v) else None for v in rsi_series]

    if len(close) >= 26:
        e12, e26 = close.ewm(span=12, adjust=False).mean(), close.ewm(span=26, adjust=False).mean()
        macd = e12 - e26
        signal = macd.ewm(span=9, adjust=False).mean()
        result["macd"], result["macd_signal"], result["macd_hist"] = macd.tolist(), signal.tolist(), (macd-signal).tolist()
    
    result["ema5"] = close.ewm(span=5, adjust=False).mean().tolist()
    result["ema20"] = close.ewm(span=20, adjust=False).mean().tolist()
    
    if "Volume" in df.columns:
        result["volume"] = df["Volume"].tolist()
        # OBV (On-Balance Volume): kurumsal alım/satım tespiti için kritik.
        # Her kapanışın bir öncekine göre yönüne bakılır; o yöne hacim eklenir/çıkarılır.
        direction = df["Close"].diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
        obv = (df["Volume"] * direction).fillna(0).cumsum()
        result["obv"] = [round(float(v), 0) if math.isfinite(float(v)) else None for v in obv]
    return result

def _get_variant(variants: List[str], symbol: str, salt: str = "") -> str:
    """Selects a phrasing variant using symbol + indicator salt for cross-stock diversity."""
    if not variants: return ""
    import hashlib
    key = (symbol + salt).encode()
    h = int(hashlib.md5(key).hexdigest(), 16)
    return variants[h % len(variants)]

def _duration_label(days_float: float) -> str:
    if days_float < 0.25: return "~2-4 saat"
    elif days_float < 1.2: return "~1 iş günü"
    elif days_float < 3.5: return f"~{round(days_float):.0f} iş günü"
    elif days_float < 10: return f"~{round(days_float):.0f} iş günü"
    elif days_float < 22: return f"~{round(days_float/5):.0f} hafta"
    else: return f"~{round(days_float/21,1):.1f} ay"

def _generate_expert_analysis(df: pd.DataFrame, indicators: Dict, fib: Dict, symbol: str = "", ml_score: Optional[float] = None, qrs_score: Optional[float] = None, index_df: Optional[pd.DataFrame] = None, profile_name: str = "Güvenli Liman", bundle: Optional["MarketDataBundle"] = None) -> tuple[str, dict]:
    try:
        if df.empty: return "", {}
        sym = symbol.upper()
        close = float(df["Close"].iloc[-1])
        atr = float(df["ATR"].dropna().iloc[-1]) if "ATR" in df.columns and not df["ATR"].dropna().empty else close * 0.02
        
        # ── [REFACTORED V5] Unified PRISM Decision Engine ──────────────────────────
        from ..scoring.prism_service import UnifiedPRISM
        
        # Prepare indicators for the unified engine
        ema5 = [v for v in (indicators.get("ema5") or []) if v is not None]
        ema20 = [v for v in (indicators.get("ema20") or []) if v is not None]
        trend = (ema5[-1] > ema20[-1]) if len(ema5) > 0 and len(ema20) > 0 else False
        
        vol_ratio = 1.0
        if "Volume" in df.columns and len(df) >= 5:
            vol_avg = df["Volume"].tail(5).mean()
            vol_now = df["Volume"].iloc[-1]
            vol_ratio = vol_now / vol_avg if vol_avg else 1.0

        rsi_list = indicators.get("rsi") or []
        rsi_scalar = float(rsi_list[-1]) if isinstance(rsi_list, list) and rsi_list else (float(rsi_list) if rsi_list else 50.0)
        verdict = UnifiedPRISM.evaluate(
            indicators={
                "rsi_val": rsi_scalar,
                "trend": trend,
                "atr_pct": (atr / close * 100) if close else 2.0,
                "vol_ratio": vol_ratio,
                "close": close
            },
            ml_score=ml_score,
            profile_name=profile_name,
            symbol=symbol,
            bundle=bundle
        )

        direction = verdict["direction"]
        comp_score = verdict["qrs"]
        signals = verdict["signals"]
        
        target = verdict["target_price"]
        target_label = "PRISM Projeksiyonu"
        
        pn_key = normalize_profile(profile_name)
        max_target_pct = PROFILE_MAX_TARGET_PCT.get(pn_key, 12.0)

        if fib and fib.get("levels"):
            lv = sorted(fib["levels"], key=lambda l: l["price"])
            # QRS büyüklüğüne göre kaç Fibonacci seviyesi atlanacağını belirle:
            # Güçlü sinyal (QRS>80) → iki üst seviye, orta (65-80) → bir üst, düşük → en yakın
            if comp_score >= 80:
                fib_skip = 2
            elif comp_score >= 65:
                fib_skip = 1
            else:
                fib_skip = 0
            if direction == "bullish":
                candidates = [l for l in lv if l["price"] > close * 1.005]
            elif direction == "bearish":
                candidates = [l for l in reversed(lv) if l["price"] < close * 0.995]
            else:
                candidates = []
            # QRS büyüdükçe daha iddialı seviye seç; tavan aşılırsa bir alt seviyeye in
            if candidates:
                idx = min(fib_skip, len(candidates) - 1)
                chosen = None
                while idx >= 0:
                    candidate = candidates[idx]
                    fib_pct = abs(candidate["price"] - close) / close * 100
                    if fib_pct <= max_target_pct:
                        chosen = candidate
                        break
                    idx -= 1
                if chosen:
                    target, target_label = chosen["price"], f"Fib %{chosen['ratio']*100:.1f} {'direnci' if direction == 'bullish' else 'desteği'}"

        # Nötr sinyalde yön belli değil — tek yönlü ATR hedefi üretme.
        # Yalnızca bullish/bearish yönü netleşmişse anlamlı hedef göster.
        signal_confirmed = direction in ("bullish", "bearish")
        if target is None:
            if direction == "bullish":
                target = close + (atr * 1.5)
                target_label = "ATR Üst Bant"
            elif direction == "bearish":
                target = close - (atr * 1.5)
                target_label = "ATR Alt Bant"
            else:
                # Nötr: hedef yok, sadece referans direnç seviyesi göster
                target = close + (atr * 1.0)   # yakın direnç (1x ATR, daha muhafazakâr)
                target_label = "ATR Direnç Referansı"

        target = round(float(target), 2)
        pct_move = (target - close) / close * 100

        # Vade: yalnızca sinyal onaylandığında anlamlı; nötrde formasyon kırılım süresini göster
        atr_pct_val = (atr / close * 100) if close else 2.0
        daily_progress_pct = max(0.1, atr_pct_val * 0.40)
        dist_days = max(1, int(abs(pct_move) / daily_progress_pct))
        dur_min, dur_max = PROFILE_DURATION_DAYS.get(pn_key, (3, 30))
        if not signal_confirmed:
            # Nötr: kırılım bekleme süresi (daha geniş pencere)
            dur_min = max(dur_min, 5)
        duration_days_computed = max(dur_min, min(dur_max, dist_days))
        duration_str = _duration_label(duration_days_computed)



        # ── Intelligence Archetyping ──────────────────────────────────────────
        archetype = "GENERIC"
        if any(s['key'] == "alpha_leader" for s in signals) and direction == "bullish":
            archetype = "DIVERGENT_LEADER"
        elif any(s['key'] == "bb_squeeze" for s in signals):
            archetype = "SLEEPING_GIANT"
        elif any(s['key'] == "overbought_exhaustion" for s in signals):
            archetype = "EXHAUSTED_SPRINTER"
        elif any(s['key'] == "vol_climax_bottom" for s in signals):
            archetype = "REVERSAL_CANDIDATE"
        elif any(s['key'] == "institutional_accumulation" for s in signals):
            archetype = "ACCUMULATION_PHASE"
        elif any(s['key'] == "vol_price_divergence_bear" for s in signals) and direction == "bullish":
            archetype = "LIQUIDITY_TRAP"
        elif direction == "bullish" and comp_score > 80:
            archetype = "ELITE_MOMENTUM"
        elif direction == "bullish" and any(s['key'] == "macd_accelerating" for s in signals):
            archetype = "TREND_ACCELERATION"
        elif direction == "bearish" and any(s['key'] == "alpha_laggard" for s in signals):
            archetype = "SYSTEMIC_WEAKNESS"

        # Sayısal bağlam değişkenleri — tüm metin şablonlarında kullanılır
        rsi_val  = round(rsi_scalar, 1)
        qrs_val  = round(comp_score, 1)
        ml_val   = round(float(ml_score), 1) if ml_score is not None else 0.0
        vol_lbl  = f"{vol_ratio:.1f}x" if vol_ratio >= 1.0 else f"{vol_ratio:.2f}x"
        atr_lbl  = f"{atr_pct_val:.1f}%"
        ema5_val = round(ema5[-1], 2) if ema5 else 0.0
        ema20_val= round(ema20[-1], 2) if ema20 else 0.0
        ema_gap  = round((ema5_val - ema20_val) / ema20_val * 100, 2) if ema20_val else 0.0
        close_lbl= f"{close:.2f} TL"
        tgt_lbl  = f"{target:.2f} TL"
        pct_lbl  = f"+{pct_move:.1f}%" if pct_move >= 0 else f"{pct_move:.1f}%"

        # ── Bağlam değişkenleri ───────────────────────────────────────────────
        _rsi_lbl  = "aşırı alım ⚠" if rsi_val >= 70 else ("aşırı satım ⚠" if rsi_val <= 30 else "sağlıklı ivme bandında")
        _vol_note = "gerçek alıcı katılımını" if vol_ratio >= 1.3 else ("düşük piyasa katılımını" if vol_ratio < 0.8 else "ortalama katılımı")
        _trend_dir = f"EMA5-EMA20 arasındaki %{abs(ema_gap):.1f}'lik {'pozitif' if trend else 'negatif'} açı"
        _qrs_why  = (
            "hacim, EMA hizalanması ve RSI'ın eş zamanlı pozitif gelmesi" if (trend and vol_ratio >= 1.3 and 40 <= rsi_val <= 70)
            else "RSI baskısına rağmen EMA hizalanmasının korunması" if (trend and rsi_val > 70)
            else "düşük hacim ve EMA uyumsuzluğunun baskısı" if (not trend and vol_ratio < 0.9)
            else "mevcut teknik koşulların bileşimi"
        )

        # Formasyon bağlamı — pattern varsa ek bir cümle
        _pat_name = indicators.get("pattern_name") or ""
        _pat_score = float(indicators.get("pattern_score") or 0.0)
        _pattern_ctx = ""
        if _pat_name and _pat_score > 0:
            # PATTERN_DESCRIPTIONS keys are PatternType enums; match by enum value string
            _matched_pt = next((pt for pt in PatternType if pt.value == _pat_name), None)
            _pat_desc = PATTERN_DESCRIPTIONS.get(_matched_pt, "") if _matched_pt else ""
            _pat_label = _pat_name
            _pat_impl = (
                f"Bu formasyon tarihsel olarak kırılım yönünde sert harekete öncülük eder ve hacim onayı geldiğinde hedef güvenilirliği artar."
                if any(x in _pat_name.upper() for x in ["UCGEN","FLAG","PENNANT","CUP","WEDGE","KIRILIM"])
                else f"Bu formasyon dönüş sinyali taşır; EMA5'in EMA20'yi geçmesi ile birleşince güç kazanır."
                if any(x in _pat_name.upper() for x in ["DOJI","HAMMER","ENGULF","MORNING","REVERSAL"])
                else f"Bu formasyon mevcut trend yönünü destekleyici nitelikte; diğer göstergelerle birlikte değerlendirilmeli."
            )
            _pattern_ctx = f"Tespit edilen **{_pat_label}** formasyonu QRS hesabına katkı sağladı. {_pat_impl}"

        POOLS = {
            "INTRO": {
                "DIVERGENT_LEADER": [
                    f"**{sym}** ({close_lbl}) piyasa baskısına direniyor — endeks gerilerken bu hisse pozitif ayrışıyor. "
                    f"Bu tablo rastlantısal değil: {_trend_dir} ve {vol_lbl} hacim, arkasında organize talep olduğuna işaret ediyor. "
                    f"RSI {rsi_val} {_rsi_lbl} — yani ivme var ama henüz 'geç kalınmış' değil. QRS **{qrs_val}** bu bileşimi güçlü buluyor.",

                    f"**{sym}** ({close_lbl}) başka hisseler düşerken ivme kazanıyor; piyasadan bağımsız hareket etmesi kurumsal talep izinin klasik göstergesi. "
                    f"{_qrs_why.capitalize()} QRS'i **{qrs_val}** seviyesine taşıdı. RSI {rsi_val} ile alım doygunluğu henüz oluşmadı; hacim {vol_lbl} talebi teyit ediyor.",

                    f"**{sym}** ({close_lbl}): Piyasa satarken bu hisse direnç gösteriyor, bu teknik olarak 'alfa üretimi'nin tanımıdır. "
                    f"{_trend_dir} trendin bütünlüğünü koruyor; {_vol_note} gösteren {vol_lbl} hacim, yükselişin spekülatif olmadığının kanıtı. QRS **{qrs_val}**.",
                ],
                "SLEEPING_GIANT": [
                    f"**{sym}** ({close_lbl}) ATR {atr_lbl} ile olağandışı dar bir bantta sıkışmış durumda. "
                    f"Volatilitenin bu denli düşmesi enerji birikimine işaret eder — bu tür sıkışmalar çoğunlukla sert ve hızlı kırılımla sonuçlanır, ancak yön önceden bilinmez. "
                    f"QRS {qrs_val} nötr; hacim {vol_lbl} büyük oyuncunun henüz elini göstermediğini söylüyor.",

                    f"**{sym}** ({close_lbl}) konsolidasyon içinde: RSI {rsi_val} ve ATR {atr_lbl} ile fiyat kasılmış, hacim {vol_lbl} ile katılım azalmış. "
                    f"Bu kombinasyon genellikle kırılım öncesi sessizliğe benzer. QRS {qrs_val} — yön teyidi gelmeden acele etmemek rasyonel.",

                    f"**{sym}** ({close_lbl}) baskı altında bekliyor; fiyat EMA'lar arasında sıkışmış, ATR {atr_lbl} günlük hareket alanını daraltmış. "
                    f"Kırılım anında hacim 1.5x üzerine çıkarsa yön teyidi alınmış sayılır — o ana kadar QRS {qrs_val} ile net sinyal üretilemiyor.",
                ],
                "EXHAUSTED_SPRINTER": [
                    f"**{sym}** ({close_lbl}) güçlü bir ralli yaşadı; RSI **{rsi_val}** ile fiyat artık 'doygunluk noktası'nda. "
                    f"QRS {qrs_val} trendin bitmediğini söylüyor, ancak {rsi_val} seviyesinde yeni alım yapmak ideal giriş fiyatını kaçırmak anlamına gelir. "
                    f"EMA20 ({ema20_val:.2f} TL) desteğine geri çekilme, çok daha sağlıklı bir giriş fırsatı sunar.",

                    f"**{sym}** ({close_lbl}) RSI **{rsi_val}** ile yorgunluk sinyali veriyor — bu RSI seviyesinde yeni alımlar genellikle kısa vadeli geri çekilmeyle karşılaşır. "
                    f"Trend hâlâ yukarı (QRS {qrs_val}); hedef {tgt_lbl} ({pct_lbl}) geçerliliğini koruyor, ancak sabırsız giriş riski yüksek.",

                    f"**{sym}** ({close_lbl}): Hisse ivme kazanmış ama RSI **{rsi_val}** aşırı alım bölgesinde. "
                    f"Bu, momentumun tükendiği değil, nefes aldığı bir evredir. {_trend_dir} bütünlüğünü koruyor; EMA20 ({ema20_val:.2f} TL) testini beklemek, riski önemli ölçüde azaltır.",
                ],
                "REVERSAL_CANDIDATE": [
                    f"**{sym}** ({close_lbl}) RSI **{rsi_val}** ile aşırı satım bölgesine inmiş — panik satışının olgunlaştığına dair ilk sinyal bu. "
                    f"Ancak dip yakalamak için tek başına yeterli değil: EMA5'in EMA20'yi ({ema20_val:.2f} TL) hacimle geçmesi, dönüşün teyidi sayılır. QRS {qrs_val} henüz bekleme modunda.",

                    f"**{sym}** ({close_lbl}) teknik toparlanma adayı: RSI **{rsi_val}** tükenme sinyali veriyor, hacim {vol_lbl} satış baskısının azaldığını gösteriyor. "
                    f"Fakat QRS **{qrs_val}** güçlü alım sinyali üretene kadar bu tabloyu 'potansiyel' olarak okumak daha güvenli.",

                    f"**{sym}** ({close_lbl}): Sert düşüş sonrası RSI **{rsi_val}** ile fiyat olası bir dip bölgesinde. "
                    f"ATR {atr_lbl} ile günlük hareket kapasitesi hâlâ mevcut; QRS {qrs_val} dönüşü onaylamadı — EMA5-EMA20 kesişimi geldiğinde pozisyon açmak daha rasyonel.",
                ],
                "ELITE_MOMENTUM": [
                    f"**{sym}** ({close_lbl}) nadir görülen bir teknik uyum içinde: RSI {rsi_val} güç bandında, {_trend_dir} güçlü, hacim {vol_lbl} talebin arkasında. "
                    f"Bu üç faktörün aynı anda pozitif gelmesi QRS'i **{qrs_val}**'e taşıdı — sistem bunu 'Elit Momentum' olarak sınıflandırıyor. Hedef **{tgt_lbl}** ({pct_lbl}), vade **{duration_str}**.",

                    f"**{sym}** ({close_lbl}): Sistem en güçlü sinyal kategorisini tetikledi. RSI {rsi_val}, {_trend_dir} ve {vol_lbl} hacim eş zamanlı uyumlu — {_qrs_why.capitalize()} QRS **{qrs_val}** seviyesine ulaştırdı. "
                    f"ATR {atr_lbl} günlük hareket kapasitesini yeterli gösteriyor; {tgt_lbl} ({pct_lbl}) hedefi {duration_str} içinde geçerli.",

                    f"**{sym}** ({close_lbl}) tüm göstergelerin aynı yönü işaret ettiği güçlü bir kurulum. "
                    f"QRS **{qrs_val}** bu hissede hem teknik hem model bazında tam uyum olduğunu gösteriyor. RSI {rsi_val} ile aşırı alım baskısı yok; {vol_lbl} hacim yükselişin sağlam zemine oturduğunu teyit ediyor. Hedef {tgt_lbl} ({pct_lbl}), {duration_str}.",
                ],
                "TREND_ACCELERATION": [
                    f"**{sym}** ({close_lbl}) ivme kazanıyor: {_trend_dir} genişliyor, RSI {rsi_val} güç bandında, hacim {vol_lbl} {_vol_note} işaret ediyor. "
                    f"Bu kombinasyon spekülatif değil gerçek talep bazlı bir yükselişin göstergesi — QRS **{qrs_val}** bu tabloyu onaylıyor. Hedef {tgt_lbl} ({pct_lbl}), {duration_str}.",

                    f"**{sym}** ({close_lbl}) trend hızlanma fazında: EMA'ların birbirinden uzaklaşması (%{abs(ema_gap):.1f}) momentum'un güçlendiğini gösteriyor. "
                    f"RSI {rsi_val} ve {vol_lbl} hacim ile yükseliş spekülatif değil; QRS **{qrs_val}** bu kurulumu model bazında da destekliyor. Hedef {tgt_lbl} ({pct_lbl}).",

                    f"**{sym}** ({close_lbl}): EMA açısı %{abs(ema_gap):.1f} ile genişliyor — bu, trendin güçlendiğinin teknik göstergesi. "
                    f"RSI {rsi_val} aşırı alım sınırından uzak, {_vol_note} gösteren {vol_lbl} hacim yükselişi destekliyor. QRS **{qrs_val}** ile hedef {tgt_lbl} ({pct_lbl}) {duration_str} içinde geçerli.",
                ],
                "SYSTEMIC_WEAKNESS": [
                    f"**{sym}** ({close_lbl}) piyasa toparlanırken bile ivme kazanamıyor — bu, iç satış baskısının sürdüğünün işareti. "
                    f"{_trend_dir} olumsuz; {vol_lbl} hacim düşüşü organize satışla destekleniyor. QRS **{qrs_val}** ile sistem bu hissede toparlanma potansiyeli görmüyor.",

                    f"**{sym}** ({close_lbl}): Endeks yükselirken bu hissenin geride kalması sistematik bir zayıflığa işaret eder. "
                    f"EMA uyumsuzluğu ve RSI {rsi_val} tabloyu olumsuz çerçevliyor; QRS **{qrs_val}** güçlü toparlanma sinyali verene kadar beklemek daha güvenli.",

                    f"**{sym}** ({close_lbl}) hâlâ baskı altında: RSI {rsi_val} ve {_trend_dir} aleyhte. "
                    f"Tepki alımları kısa süreli olabilir; QRS **{qrs_val}** 50 üzerine çıkıp EMA5, EMA20'yi ({ema20_val:.2f} TL) hacimle geçene kadar trende dönüş konuşmak erken.",
                ],
                "ACCUMULATION_PHASE": [
                    f"**{sym}** ({close_lbl}) göz önünde olmayan ama istikrarlı bir toplanma evresinde: {_trend_dir} pozitif, RSI {rsi_val} sağlıklı, hacim {vol_lbl} sabırlı alımı gösteriyor. "
                    f"Bu tablo ani değil, planlı bir harekete işaret ediyor — {_qrs_why.capitalize()} QRS **{qrs_val}** seviyesine ulaştırdı. Hedef {tgt_lbl} ({pct_lbl}), {duration_str}.",

                    f"**{sym}** ({close_lbl}) toplanma evresinde: RSI {rsi_val} ne aşırı alım ne aşırı satım — bu 'sağlıklı ivme bandı', trendin devamı için en güvenilir zemin. "
                    f"Hacim {vol_lbl} ile alım sabırlı ve planlı; QRS **{qrs_val}** bu kurulumu model bazında da onaylıyor. Hedef {tgt_lbl} ({pct_lbl}), {duration_str}.",

                    f"**{sym}** ({close_lbl}) sakin ama kararlı bir yükseliş içinde. RSI {rsi_val} güç bandında, {_trend_dir} ile momentum doğrulanmış, {vol_lbl} hacim {_vol_note}. "
                    f"QRS **{qrs_val}** — toplanma evresi teyitli; {tgt_lbl} ({pct_lbl}) hedefi {duration_str} projeksiyonu içinde geçerli.",
                ],
                "LIQUIDITY_TRAP": [
                    f"**{sym}** ({close_lbl}) fiyat yükseliyor ancak {vol_lbl} hacim bu yükselişi besleyecek katılımı sağlamıyor. "
                    f"Hacim desteği olmayan fiyat artışları 'sahte kırılım' riskini taşır — QRS **{qrs_val}** da bu nedenle ihtiyatlı bir değerlendirme yapıyor.",

                    f"**{sym}** ({close_lbl}): RSI {rsi_val} ve {_trend_dir} göstergeler yükselişe işaret etse de {vol_lbl} hacim yetersiz. "
                    f"Piyasaya katılımın bu kadar düşük olması, yükselişin kalıcı olmayabileceğine dair uyarı; QRS **{qrs_val}** hacim onayını bekliyor.",

                    f"**{sym}** ({close_lbl}): Fiyat yukarı hareket ediyor ama {vol_lbl} hacim {_vol_note}. "
                    f"Bu uyumsuzluk QRS **{qrs_val}**'in bu kurulumu 'ikna edici' bulmamasının temel nedeni — hacim 1.5x üzerine çıkmadan pozisyon açmak erken.",
                ],
                "GENERIC_BULLISH": [
                    f"**{sym}** ({close_lbl}) yükseliş tablosu içinde: RSI {rsi_val} {_rsi_lbl}, {_trend_dir} yukarıyı gösteriyor ve hacim {vol_lbl} {_vol_note} işaret ediyor. "
                    f"Bu üç faktörün aynı anda uyumlu gelmesi QRS **{qrs_val}**'in temel nedeni. Hedef **{tgt_lbl}** ({pct_lbl}), tahmini süre **{duration_str}**.",

                    f"**{sym}** ({close_lbl}) alım baskısı altında: {_qrs_why.capitalize()} QRS **{qrs_val}** seviyesine taşıdı. "
                    f"RSI {rsi_val} henüz aşırı alım sınırında değil; {vol_lbl} hacim ise katılımın gerçek olduğunu gösteriyor. Hedef {tgt_lbl} ({pct_lbl}), {duration_str}.",

                    f"**{sym}** ({close_lbl}): RSI {rsi_val} {_rsi_lbl} ve {_trend_dir} ile teknik tablo pozitif. "
                    f"Hacim {vol_lbl} yükselişin boşlukta kalmadığını teyit ediyor — {_qrs_why.capitalize()} QRS'i **{qrs_val}**'e çıkardı. {tgt_lbl} ({pct_lbl}) hedefi {duration_str} içinde geçerli.",
                ],
                "GENERIC_BEARISH": [
                    f"**{sym}** ({close_lbl}) baskı altında: {_trend_dir} olumsuz, RSI {rsi_val} ve hacim {vol_lbl} tabloyu ağırlaştırıyor. "
                    f"QRS **{qrs_val}** ile sistem bu hissede toparlanma potansiyeli görmüyor; EMA20 ({ema20_val:.2f} TL) üzerine hacimli kapanış gelmeden sinyal değişmez.",

                    f"**{sym}** ({close_lbl}): RSI {rsi_val}, {_trend_dir} ve {vol_lbl} hacim — bu üçlü QRS **{qrs_val}**'in düşük kalmasının nedeni. "
                    f"Tepki alımları mevcut trend içinde tuzak riski taşır; gerçek dönüş sinyali EMA kesişiminde aranmalı.",

                    f"**{sym}** ({close_lbl}) teknik görünümü zayıf: {_trend_dir} aleyhte, RSI {rsi_val} baskıyı onaylıyor, hacim {vol_lbl} satışın devam ettiğini gösteriyor. "
                    f"QRS **{qrs_val}** — EMA20 ({ema20_val:.2f} TL) üzerinde hacimli kapanış olmadan dip yakalamanın anlamı yok.",
                ],
                "GENERIC_NEUTRAL": [
                    f"**{sym}** ({close_lbl}) net yön tercihi olmaksızın seyir izliyor: RSI {rsi_val} {_rsi_lbl}, {_trend_dir} baskın değil, hacim {vol_lbl} ile katılım kararsız. "
                    f"QRS **{qrs_val}** — herhangi bir yönde pozisyon açmak için kırılım ve hacim teyidi beklemek rasyonel.",

                    f"**{sym}** ({close_lbl}) konsolidasyon evresinde: ATR {atr_lbl} ile günlük hareket sınırlı, QRS **{qrs_val}** ve RSI {rsi_val} net sinyal üretmiyor. "
                    f"EMA20 ({ema20_val:.2f} TL) üzerinde hacimli kapanış yukarı yönü, altında sert kırılım aşağı yönü teyit eder.",

                    f"**{sym}** ({close_lbl}): {_trend_dir} kararsız, RSI {rsi_val} ve hacim {vol_lbl} ile herhangi bir yönde baskın güç yok. "
                    f"QRS **{qrs_val}** — bu aşamada beklemek, hacimsiz kırılımları kovalamaktan çok daha rasyonel.",
                ],
            },

            "STRATEGIC_RISKS": {
                "bullish": [
                    f"**Strateji:** Hedef **{tgt_lbl}** ({target_label}, {pct_lbl}), tahmini vade **{duration_str}**. "
                    f"EMA20 ({ema20_val:.2f} TL) altında kapanış trend bozulmasını işaret eder ve bu sinyali geçersiz kılar.",

                    f"**Projeksiyon:** {tgt_lbl} ({pct_lbl}), {duration_str} içinde birincil hedef ({target_label}). "
                    f"Stop referansı olarak EMA20 ({ema20_val:.2f} TL) kullanılabilir; hacimsiz yükselişlerde pozisyon büyüklüğü küçük tutulmalı.",

                    f"**Hedef:** {tgt_lbl} ({pct_lbl}) · Vade: {duration_str} · Stop: EMA20 {ema20_val:.2f} TL ({target_label}). "
                    f"ATR {atr_lbl} baz alınarak stop kalibre edilebilir — EMA20 altında kapanış sinyalin geçerliliğini sona erdirir.",
                ],
                "bearish": [
                    f"**Uyarı:** Tepki alımları 'bull trap' riski taşır — QRS **{qrs_val}** gerçek dönüş sinyali verene kadar beklemek en akıllıca yaklaşım. "
                    f"EMA20 ({ema20_val:.2f} TL) üzerine hacimli kapanış, trende dönüş için asgari koşul.",

                    f"**Dikkat:** Düşüş trendinde yeni pozisyon yüksek risk barındırıyor. "
                    f"QRS {qrs_val} 50'nin üzerine çıkana ve EMA5, EMA20'yi ({ema20_val:.2f} TL) geçene kadar seyirci kalmak tercih edilmeli.",

                    f"**Risk:** QRS **{qrs_val}** düşük, RSI {rsi_val} baskıyı onaylıyor. "
                    f"EMA20 ({ema20_val:.2f} TL) kritik direnç — bu seviyenin üzerine hacimli kapanış olmadan toparlanmaya katılmak yüksek risk.",
                ],
                "neutral": [
                    f"**Bekle:** QRS **{qrs_val}** ve RSI {rsi_val} ile net sinyal yok — yeni pozisyon düşük beklenti-risk oranı sunar. "
                    f"EMA20 ({ema20_val:.2f} TL) üzerinde hacimli kapanış veya altında kırılım, harekete geçmek için doğru tetikleyici.",

                    f"**Strateji:** ATR {atr_lbl} ile günlük hareket sınırlı; kırılım yönü netleşmeden pozisyon açmak gereksiz risk. "
                    f"Hedef bölge {tgt_lbl} ({pct_lbl}) — yön teyidi gelirse {duration_str} içinde geçerli.",

                    f"**Karar:** QRS **{qrs_val}**, RSI {rsi_val} — net yön vermiyor. "
                    f"EMA20 ({ema20_val:.2f} TL) kırılım referansı; hacim onayı olmadan spekülasyon yapmak komisyon ve psikoloji kaybına yol açar.",
                ],
            }
        }

        # ── RAPOR DERLEME ─────────────────────────────────────────────────────
        _rsi_bucket = str(int(rsi_val / 15))
        _qrs_bucket = str(int(comp_score / 20))
        _variant_salt = f"{_rsi_bucket}_{_qrs_bucket}"

        intro_key = archetype if archetype in POOLS["INTRO"] else f"GENERIC_{direction.upper()}"
        intro = _get_variant(POOLS["INTRO"][intro_key], sym, salt=_variant_salt)
        risk_note = _get_variant(POOLS["STRATEGIC_RISKS"].get(direction, POOLS["STRATEGIC_RISKS"]["neutral"]), sym, salt=_variant_salt)

        # Göstergeler — özlü tek satır (sayısal referans; raporun altına)
        _signal_summary = (
            f"**Göstergeler:** RSI {rsi_val} · EMA açısı %{abs(ema_gap):.1f} {'↑' if trend else '↓'} · "
            f"Hacim {vol_lbl} · ATR {atr_lbl} · QRS {qrs_val}/100"
        )

        # Formasyon satırı varsa araya ekle
        _mid_block = f"\n\n{_pattern_ctx}" if _pattern_ctx else ""

        report = f"{intro}{_mid_block}\n\n{_signal_summary}\n\n{risk_note}"
        
        setup = {
            "target": round(target, 2), "target_label": target_label, "pct_move": round(pct_move, 2),
            "duration": duration_str, "days_est": float(duration_days_computed),
            "direction": direction, "composite_score": comp_score,
            "confidence": int(round(comp_score)),
            "signal_confirmed": signal_confirmed,
            "atr": round(atr, 4),
            "is_divergent": verdict.get("is_divergent", False),
            "quality_label": verdict.get("quality_label", ""),
        }
        return report, setup

    except Exception as e:
        traceback.print_exc()
        return f"Analiz hesaplama hatası: {str(e)}", {}

class ChartEngine:
    def __init__(self):
        self.market_data = MarketDataService()

    def _get_index_df(self, period: str) -> Optional[pd.DataFrame]:
        cache_key = f"^XU100_{period}"
        now = _time.time()

        # 1. Shared cache hit check (thread-safe read)
        with _INDEX_CACHE_LOCK:
            cached = _SHARED_INDEX_CACHE.get(cache_key)
        if cached is not None:
            val, ts = cached
            if (now - ts) < _get_index_ttl():
                return val

        # 2. Fetch outside the lock to avoid blocking other threads during network I/O
        bundle = self.market_data.fetch_price_df("^XU100", lookback_days=180)
        idx_df = bundle.df
        if not idx_df.empty:
            with _INDEX_CACHE_LOCK:
                _SHARED_INDEX_CACHE[cache_key] = (idx_df, now)
        return idx_df

    def build_chart_for_symbol(self, symbol: str, mode: str = "candle", days: int = 180, ml_score: Optional[float] = None, qrs_score: Optional[float] = None, start_date: Optional[str] = None, profile_name: str = "Güvenli Liman", precomputed_pattern: Optional[Dict] = None) -> Dict[str, Any]:
        global _WAITING_FOR_CHART
        sym = symbol.upper()
        
        # Atomic queue tracking
        with _QUEUE_LOCK:
            _WAITING_FOR_CHART += 1
        
        try:
            # ── SERIALIZED ANALYSIS LOCK ──
            # Prevents multiple concurrent network calls to yfinance
            with _FETCH_LOCK:
                if _WAITING_FOR_CHART > 1:
                    import logging as _l
                    _l.getLogger(__name__).debug("[CHART] %s: %d request waiting", sym, _WAITING_FOR_CHART - 1)
                
                bundle = self.market_data.fetch_price_df(sym)
                df = bundle.df
                if df.empty: return {"status": "error", "message": "Veri yok"}
                
                # Fetch Index for Alpha calculation (uses global cache)
                index_df = self._get_index_df("6M")
            
            if start_date:
                # [V31] Extremely Robust TZ Handling
                try:
                    # 1. Ensure Index is DatetimeIndex
                    if not isinstance(df.index, pd.DatetimeIndex):
                        df.index = pd.to_datetime(df.index)
                    
                    start_ts = pd.to_datetime(start_date)
                    
                    # 2. Extract TZ if exists
                    idx_tz = getattr(df.index, 'tz', None)
                    
                    # 3. Align start_ts TZ with Index
                    if idx_tz is not None:
                        if getattr(start_ts, 'tzinfo', None) is None:
                            start_ts = start_ts.tz_localize(idx_tz)
                        else:
                            start_ts = start_ts.tz_convert(idx_tz)
                    else:
                        if getattr(start_ts, 'tzinfo', None) is not None:
                            start_ts = start_ts.replace(tzinfo=None)
                    
                    # 4. Final safety: If comparison still fails, strip ALL timezones
                    try:
                        df_plot = df[df.index >= start_ts].copy()
                    except TypeError:
                        try:
                            naive_idx = df.index.tz_localize(None) if idx_tz else df.index
                        except TypeError:
                            # Mixed tz-aware/naive index: strip per-element
                            naive_idx = pd.DatetimeIndex([pd.Timestamp(t).replace(tzinfo=None) for t in df.index])
                        naive_ts = start_ts.replace(tzinfo=None) if getattr(start_ts, 'tzinfo', None) else start_ts
                        df_plot = df[naive_idx >= naive_ts].copy()
                except Exception as e:
                    logger.warning(f"Chart TZ handling failed: {e}")
                    df_plot = df.tail(days).copy()
            else:
                df_plot = df.tail(days).copy()
            
            if df_plot.empty: 
                df_plot = df.tail(days).copy()

            inds_all = _compute_indicators(df)
            plot_indices = df_plot.index
            inds = {k: (pd.Series(v, index=df.index).reindex(plot_indices).tolist() if isinstance(v, list) and len(v)==len(df) else v) for k,v in inds_all.items()}

            x, close_arr = [str(t)[:10] for t in plot_indices], df_plot["Close"].tolist()
            fig = make_subplots(rows=4, cols=1, shared_xaxes=True, row_heights=[0.55, 0.15, 0.15, 0.15], vertical_spacing=0.05)
            if mode == "candle" and all(c in df_plot.columns for c in ["Open", "High", "Low", "Close"]):
                fig.add_trace(go.Candlestick(
                    x=x,
                    open=df_plot["Open"].tolist(),
                    high=df_plot["High"].tolist(),
                    low=df_plot["Low"].tolist(),
                    close=close_arr,
                    increasing_line_color="#22D3EE",
                    decreasing_line_color="#F87171",
                    showlegend=False,
                    name="Fiyat",
                    hovertemplate=(
                        "<b>%{x}</b><br>"
                        "Açılış: &nbsp;%{open:.2f} ₺<br>"
                        "Yüksek: %{high:.2f} ₺<br>"
                        "Düşük: &nbsp;%{low:.2f} ₺<br>"
                        "Kapanış: %{close:.2f} ₺"
                        "<extra></extra>"
                    ),
                ), row=1, col=1)
            else: fig.add_trace(go.Scatter(x=x, y=close_arr, mode="lines", line=dict(color="#22D3EE", width=2), fill="tozeroy", fillcolor="rgba(34,211,238,0.05)", showlegend=False, name="Fiyat"), row=1, col=1)
            
            _ht = lambda lbl, fmt=".4f": f"<b>{lbl}</b>: %{{y:{fmt}}} TL<extra></extra>"
            fig.add_trace(go.Scatter(x=x, y=inds["ema5"],  name="Har. Ort. (5)",  line=dict(color="rgba(148,163,184,0.5)", width=1), showlegend=False, hovertemplate=_ht("Har. Ort. (5)")), row=1, col=1)
            fig.add_trace(go.Scatter(x=x, y=inds["ema20"], name="Har. Ort. (20)", line=dict(color="rgba(251,191,36,0.6)",  width=1), showlegend=False, hovertemplate=_ht("Har. Ort. (20)")), row=1, col=1)

            if "bb_upper" in inds:
                fig.add_trace(go.Scatter(x=x, y=inds["bb_upper"], name="BB Üst Bant",   line=dict(color="rgba(167,139,250,0.1)", width=0.5), showlegend=False, hovertemplate=_ht("BB Üst Bant")), row=1, col=1)
                fig.add_trace(go.Scatter(x=x, y=inds["bb_lower"], name="BB Alt Bant",   line=dict(color="rgba(167,139,250,0.1)", width=0.5), fill='tonexty', fillcolor='rgba(167,139,250,0.05)', showlegend=False, hovertemplate=_ht("BB Alt Bant")), row=1, col=1)
                fig.add_trace(go.Scatter(x=x, y=inds["bb_mid"],   name="BB Orta Bant", line=dict(color="rgba(167,139,250,0.3)", width=1, dash='dot'), showlegend=False, hovertemplate=_ht("BB Orta Bant")), row=1, col=1)

            if "volume" in inds:
                v_c = ["rgba(34,211,238,0.5)" if i==0 or close_arr[i]>=close_arr[i-1] else "rgba(248,113,113,0.5)" for i in range(len(close_arr))]
                fig.add_trace(go.Bar(x=x, y=inds["volume"], marker_color=v_c, showlegend=False, name="Hacim", hovertemplate="<b>Hacim</b>: %{y:,.0f}<extra></extra>"), row=2, col=1)
            if "rsi" in inds:
                fig.add_trace(go.Scatter(x=x, y=inds["rsi"], line=dict(color="#f59e0b", width=1.5), showlegend=False, name="RSI (14)", hovertemplate="<b>RSI (14)</b>: %{y:.1f}<extra></extra>"), row=3, col=1)
                fig.add_hrect(y0=70, y1=100, fillcolor="rgba(248,113,113,0.06)", line_width=0, row=3, col=1)
                fig.add_hrect(y0=0,  y1=30,  fillcolor="rgba(34,211,238,0.06)",  line_width=0, row=3, col=1)
            if "macd" in inds:
                h_c = ["rgba(34,211,238,0.6)" if (v or 0)>=0 else "rgba(248,113,113,0.6)" for v in inds["macd_hist"]]
                fig.add_trace(go.Bar   (x=x, y=inds["macd_hist"],   marker_color=h_c, showlegend=False, name="MACD Bar",      hovertemplate="<b>MACD Bar</b>: %{y:.4f}<extra></extra>"), row=4, col=1)
                fig.add_trace(go.Scatter(x=x, y=inds["macd"],       line=dict(color="#22d3ee", width=1.5), showlegend=False, name="MACD",          hovertemplate="<b>MACD</b>: %{y:.4f}<extra></extra>"), row=4, col=1)
                fig.add_trace(go.Scatter(x=x, y=inds["macd_signal"], line=dict(color="#f87171", width=1),  showlegend=False, name="Sinyal Hattı", hovertemplate="<b>Sinyal Hattı</b>: %{y:.4f}<extra></extra>"), row=4, col=1)

            fig.update_layout(
                template="plotly_dark",
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
                margin=dict(l=0, r=64, t=8, b=8),
                xaxis=dict(rangeslider=dict(visible=False), hoverformat="%d.%m.%Y"),
                hoverlabel=dict(
                    bgcolor="rgba(5,7,10,0.92)",
                    bordercolor="rgba(34,211,238,0.25)",
                    font=dict(color="rgba(255,255,255,0.85)", size=11, family="monospace"),
                ),
            )
            
            last_close = float(df_plot["Close"].iloc[-1])
            prev_close = float(df_plot["Close"].iloc[-2]) if len(df_plot) > 1 else last_close
            change_pct = ((last_close - prev_close) / prev_close) * 100 if prev_close != 0 else 0
            # Extract last bar date for frontend sync
            last_bar_date = str(df_plot.index[-1])[:10] if len(df_plot) > 0 else None
            
            fib_d = _compute_fibonacci(df, lookback=200)
            report, setup = _generate_expert_analysis(df, inds_all, fib_d, sym, ml_score, qrs_score=qrs_score, index_df=index_df, profile_name=profile_name, bundle=bundle)
            # Grafik-Liste tutarlılığı: scanner'ın önceden hesapladığı sonuç varsa kullan.
            # Shapes absolute tarih içeriyor → farklı data window'da da geçerli.
            # Yoksa veya stale ise fresh detection yap (fallback).
            if precomputed_pattern and precomputed_pattern.get("detected_type") and \
               precomputed_pattern.get("detected_type") not in ("NONE", "Formasyon Yok", ""):
                p = precomputed_pattern
            else:
                p = detect_patterns_validated(df, profile_name=profile_name)
            # profile_relevance her zaman viewer'ın profiline göre hesaplanır (cache'e bağımlı değil)
            from .patterns import _profile_relevance, _PROFILE_NAME_MAP
            _pkey = _PROFILE_NAME_MAP.get((profile_name or "").strip(), None)
            _prel = _profile_relevance(p.get("detected_type", ""), _pkey)
            ai_v = {
                "detected_type":       p.get("detected_type", PatternType.NONE.value),
                "detected_desc":       p.get("detected_desc", ""),
                "is_short_term_breakout": bool(p.get("is_short_term_breakout", False)),
                "expert_report":       report,
                "setup":               setup,
                "confidence":          float(p.get("confidence", 0.0)),
                "formed_bars_ago":     p.get("formed_bars_ago", 0),
                "is_stale":            bool(p.get("is_stale", False)),
                "profile_relevance":   _prel,
                "secondary_pattern":   p.get("secondary_pattern"),
                "fibonacci":           fib_d,
                "fibonacci_shapes":    _fibonacci_to_shapes(fib_d),
                "patterns":            p.get("patterns", []),
            }
            
            return {
                "status": "success", "symbol": sym, "last_close": round(last_close, 2), "change_pct": round(change_pct, 2),
                "data_date": last_bar_date,
                "ml_score": ml_score, "figure": fig.to_dict(), "ai_vision": ai_v
            }
        except Exception as e:
            traceback.print_exc()
            # [V32] CRITICAL FALLBACK: If Plotly or engine fails, return raw data so frontend can attempt local render
            return {
                "status": "success", "symbol": sym, "last_close": round(last_close, 2) if 'last_close' in locals() else 0.0, 
                "change_pct": round(change_pct, 2) if 'change_pct' in locals() else 0.0,
                "data_date": last_bar_date if 'last_bar_date' in locals() else None, 
                "ml_score": ml_score, "figure": None, "raw_df_json": df_plot.to_json(orient="split") if 'df_plot' in locals() else None
            }
        finally:
            with _QUEUE_LOCK:
                _WAITING_FOR_CHART = max(0, _WAITING_FOR_CHART - 1)

_engine = ChartEngine()
def build_chart_for_symbol(symbol: str, mode: str = "candle", days: int = 180, ml_score: Optional[float] = None, qrs_score: Optional[float] = None, start_date: Optional[str] = None, profile_name: str = "Güvenli Liman", precomputed_pattern: Optional[Dict] = None) -> Dict[str, Any]:
    return _engine.build_chart_for_symbol(symbol, mode, days=days, ml_score=ml_score, qrs_score=qrs_score, start_date=start_date, profile_name=profile_name, precomputed_pattern=precomputed_pattern)
