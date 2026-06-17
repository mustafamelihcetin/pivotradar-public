# core/llm_client.py
from __future__ import annotations

"""LLM client (DEPRECATED / DISABLED).

PivotRadar'da LLM tamamen kaldırıldı. Bu modül artık yalnızca geriye dönük import
uyumluluğu için tutuluyor; tüm public API'ler 'ok=False' döner.

Amaç:
- Uygulama akışını bozmadan LLM'i komple devre dışı bırakmak
- PyInstaller paketinden llama-cpp / gguf / modelleri çıkarmak
"""

import time
from typing import Any, Dict, Optional, List

def resolve_gguf_path(path_like: Optional[str] = None) -> str:
    _ = path_like
    return ""

def hard_disable_llm(reason: str) -> None:
    _ = reason
    return

def ai_preflight(
    gguf_path: Optional[str] = None,
    do_init_test: bool = False,
    force: bool = False,
) -> Dict[str, Any]:
    _ = (gguf_path, do_init_test, force)
    now = time.time()
    return {
        "llm_enabled_setting": False,
        "gguf_path": "",
        "gguf_exists": False,
        "llama_cpp_import_ok": False,
        "llama_cpp_error": "LLM_REMOVED",
        "llama_runtime_ok": False,
        "llama_runtime_error": "LLM_REMOVED",
        "hard_disabled": True,
        "disable_reason": "LLM_REMOVED",
        "llm_ready": False,
        "checked_at_unix": now,
        "do_init_test": bool(do_init_test),
    }

def llm_summarize(
    payload: Dict[str, Any],
    gguf_path: Optional[str] = None,
    profile: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    _ = (payload, gguf_path, profile, kwargs)
    return {
        "ok": False,
        "error": "LLM_REMOVED",
        "meta": {
            "elapsed_sec": 0.0,
            "mode": "n/a",
            "llm_note": "LLM kaldırıldı.",
        },
    }

def llm_summarize_many(
    rows: List[Dict[str, Any]],
    limit: int = 5,
    gguf_path: Optional[str] = None,
    profile: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    _ = (rows, limit, gguf_path, profile, kwargs)
    return {
        "ok": False,
        "error": "LLM_REMOVED",
        "meta": {
            "elapsed_sec": 0.0,
            "mode": "n/a",
            "llm_note": "LLM kaldırıldı.",
        },
    }
