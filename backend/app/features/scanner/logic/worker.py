# backend/app/features/scanner/logic/worker.py
import time
import threading
import uuid
from typing import Dict, Any
import logging
logger = logging.getLogger(__name__)
from app.features.scanner.engine import run_pipeline
from .state import STATE_LOCK, STOP_EVENT, ACTIVE, QUEUE, SCAN_TIMEOUT_SEC
from .progress import write_progress
from .persistence import persist_scan_results
from app.core.database import SessionLocal

_LIVE_REFRESH_TOP_N = 50  # En yüksek QRS skorlu N sembol için canlı fiyat çek


def _live_refresh(results_df, history: list) -> tuple:
    """
    Tarama sonrası top-N sembol için BigPara/YF'den anlık kapanış fiyatı çeker
    ve results_df ile history'nin en güncel barını günceller.
    Hata olursa orijinal veriler değişmeden döner.
    """
    import pandas as pd
    try:
        from app.features.market_data.data.yf_client import get_live_close_many
        score_col = next((c for c in ("qrs", "yzdsh", "qrs_score") if c in results_df.columns), None)
        if score_col:
            top_syms = results_df.nlargest(_LIVE_REFRESH_TOP_N, score_col)["symbol"].tolist()
        else:
            top_syms = results_df.head(_LIVE_REFRESH_TOP_N)["symbol"].tolist()

        live = get_live_close_many(top_syms, max_items=_LIVE_REFRESH_TOP_N)

        now_iso = pd.Timestamp.utcnow().isoformat()

        # --- results_df güncelle ---
        updated = 0
        for sym, data in live.items():
            price = data.get("price")
            if not price or price <= 0:
                continue
            mask = results_df["symbol"] == sym
            if not mask.any():
                continue
            old_close = float(results_df.loc[mask, "close"].iloc[0] or 0)
            results_df.loc[mask, "close"] = price
            results_df.loc[mask, "last"]  = price
            if old_close > 0:
                results_df.loc[mask, "change_pct"] = round((price - old_close) / old_close * 100, 2)
            if data.get("change_pct") is not None:
                results_df.loc[mask, "change_pct"] = data["change_pct"]
            results_df.loc[mask, "timestamp"] = now_iso
            updated += 1

        # --- history'nin en güncel barını güncelle (j=1 → en son satır) ---
        # history düz liste; her sembol için en son timestamp'e sahip kayıt = güncel bar
        sym_latest: dict = {}
        for entry in history:
            s = entry.get("symbol")
            if s not in sym_latest or entry.get("timestamp", "") > sym_latest[s][1]:
                sym_latest[s] = (entry, entry.get("timestamp", ""))

        for sym, data in live.items():
            price = data.get("price")
            if not price or price <= 0 or sym not in sym_latest:
                continue
            sym_latest[sym][0]["close"] = price
            sym_latest[sym][0]["timestamp"] = now_iso

        if updated:
            logger.info("Live refresh: %d/%d sembol anlık fiyatla güncellendi.", updated, len(top_syms))
        else:
            logger.debug("Live refresh: güncel fiyat alınamadı (piyasa kapalı veya kaynak erişilemiyor).")

    except Exception as e:
        logger.debug("Live refresh atlandı: %s", e)

    return results_df, history


def _get_scan_timeout() -> int:
    """Timeout değerini admin ayarlarından okur, yoksa varsayılan 600s."""
    try:
        from app.core.database import SessionLocal
        from app.features.admin.utils import get_system_setting
        db = SessionLocal()
        try:
            cfg = get_system_setting(db, "scanner_config", {})
            return int(cfg.get("scan_timeout_sec", SCAN_TIMEOUT_SEC))
        finally:
            db.close()
    except Exception:
        return SCAN_TIMEOUT_SEC


def _watchdog(stop_event: threading.Event, timeout_sec: int):
    """Periodically checks if scan has exceeded timeout instead of sleeping the full duration."""
    elapsed = 0
    interval = 10
    while elapsed < timeout_sec:
        time.sleep(interval)
        elapsed += interval
        if stop_event.is_set():
            return
    if not stop_event.is_set():
        logger.warning("[WATCHDOG] Scan timed out after %ds! Setting stop event.", timeout_sec)
        write_progress("IDLE", 0, "TIMEOUT", "Tarama zaman aşımına uğradı — kısmi sonuçlar gösteriliyor.")
        stop_event.set()

def scan_worker():
    """Background thread that pulls tasks from QUEUE and runs them."""
    while True:
        target_task: Dict[str, Any] = {}
        with STATE_LOCK:
            if not QUEUE:
                ACTIVE["user_id"] = None
                ACTIVE["user_email"] = None
                ACTIVE["started_at"] = None
                write_progress("IDLE", 0, "IDLE", "Beklemede.")
                break
            target_task = QUEUE.pop(0)
            ACTIVE["user_id"] = target_task["user_id"]
            ACTIVE["user_email"] = target_task["user_email"]
            ACTIVE["started_at"] = time.time()
            STOP_EVENT.clear()

        # Start watchdog with admin-configurable timeout
        _timeout = _get_scan_timeout()
        threading.Thread(target=_watchdog, args=(STOP_EVENT, _timeout), daemon=True, name="scan-watchdog").start()

        try:
            payload = target_task["payload"]

            # İlk progress yazımı — bulk prefetch başlamadan önce.
            write_progress("SCANNING", 0, "BAŞLATILIYOR", "Veri kaynakları hazırlanıyor...", 0, len(QUEUE))

            try:
                from app.core.metrics import record_scan_start
                _scan_t0 = record_scan_start()
            except Exception:
                _scan_t0 = time.monotonic()

            def progress_hook(stage, pct, msg):
                if STOP_EVENT.is_set():
                    raise InterruptedError("User or system requested stop.")
                logger.info("[PROGRESS] %d%% - %s: %s", pct, stage, msg)
                write_progress("SCANNING", pct, stage, msg, 0, len(QUEUE))

            results_df, meta, history = run_pipeline(
                max_symbols=payload.get("max_symbols", 1000),
                profile_name=payload.get("profile_name", "Güvenli Liman"),
                expert_mode=payload.get("expert_mode", False),
                prefilter_top_n=payload.get("prefilter_top_n"),
                vol_min=payload.get("vol_min"),
                rsi_min=payload.get("rsi_min"),
                overrides=payload.get("overrides", {}),
                progress_cb=progress_hook,
                max_threads=payload.get("max_threads"),
                is_background=payload.get("is_background", False)
            )

            if results_df is not None and not results_df.empty:
                write_progress("SAVING", 92, "CANLI", "Güncel fiyatlar alınıyor...")
                results_df, history = _live_refresh(results_df, history)

                write_progress("SAVING", 95, "KAYIT", "Sonuçlar veritabanına işleniyor...")
                # 1. Persist to ScanScore (Results)
                persist_scan_results(results_df, payload)
                
                # 2. Persist to SymbolDataCache (History)
                try:
                    from app.features.scanner.user_scorer import persist_cache
                    db_tmp = SessionLocal()
                    try:
                        batch_id = meta.get("batch_id") or str(uuid.uuid4())
                        # Note: persist_cache expects a list of dicts from the pipeline's internal format
                        # Pipeline returns 'history' as a list of dicts.
                        if history:
                             persist_cache(history, batch_id, db_tmp)
                    finally:
                        db_tmp.close()
                except Exception as pe:
                    logger.warning("Failed to persist history cache: %s", pe)

                write_progress("DONE", 100, "TAMAMLANDI", f"{len(results_df)} hisse tarandı.")
                try:
                    from app.core.metrics import record_scan_complete
                    signal_count = int((results_df.get("qrs_score", results_df.get("yzdsh", 0)) > 0).sum()) if hasattr(results_df, "get") else len(results_df)
                    record_scan_complete(_scan_t0, len(results_df), signal_count)
                except Exception:
                    pass
                # Scan bitti — tüm profiller için analyze cache'ini arka planda ısıt
                try:
                    from app.features.scanner.routers.api_scan import warm_analyze_cache
                    warm_analyze_cache()
                except Exception as _we:
                    logger.warning("Cache warm trigger failed: %s", _we)
            else:
                write_progress("DONE", 100, "TAMAMLANDI", "Tarama tamamlandı (sonuç yok).")

        except InterruptedError:
            write_progress("IDLE", 0, "IDLE", "Tarama durduruldu.")
            try:
                from app.core.metrics import record_scan_failed
                record_scan_failed()
            except Exception:
                pass
        except Exception as e:
            err_type = type(e).__name__
            err_msg  = str(e) or repr(e)
            logger.error("Worker error [%s]: %s", err_type, err_msg, exc_info=True)
            write_progress("ERROR", 0, "HATA", f"{err_type}: {err_msg}")
            try:
                from app.core.metrics import record_scan_failed
                record_scan_failed()
            except Exception:
                pass
        finally:
            STOP_EVENT.set()
            # Always clear ACTIVE so future scans are not permanently blocked
            # if this thread crashed or was never interrupted cleanly.
            with STATE_LOCK:
                ACTIVE["user_id"] = None
                ACTIVE["user_email"] = None
                ACTIVE["started_at"] = None
            # Release cross-worker DB lock so other workers can scan on next cycle.
            try:
                from sqlalchemy import text as _text
                _db_rel = SessionLocal()
                try:
                    _db_rel.execute(_text("DELETE FROM system_locks WHERE lock_key = 'auto_scan_running'"))
                    _db_rel.commit()
                finally:
                    _db_rel.close()
            except Exception:
                pass
            time.sleep(1)  # Gap between tasks — ERROR daemon thread completes in this window
            # Synchronous IDLE write: dosyanın ERROR state'de kalmamasını garantiler.
            try:
                import json as _j
                from app.core import settings as _s
                _s.PROGRESS_FILE.write_text(
                    _j.dumps({"state": "IDLE", "percent": 0, "stage": "IDLE"}),
                    encoding="utf-8"
                )
            except Exception:
                pass
