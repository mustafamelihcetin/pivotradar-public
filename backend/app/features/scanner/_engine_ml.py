# _engine_ml.py
# -*- coding: utf-8 -*-
"""
PivotRadar - ML model selection helper.

_pick_latest_ml_model() and MLScorer loading logic extracted from engine.py.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

# Re-export MLScorer so callers can do: from ._engine_ml import MLScorer
from app.features.scoring.ml.ai_score import MLScorer  # noqa: F401

logger = logging.getLogger("PivotRadar.Engine")


# =========================
# ML model selection helper
# =========================
def _pick_latest_ml_model(models_dir: Optional[Path] = None):
    """Bulletproof model selection for Docker/Production environments."""
    import json as _json
    from pathlib import Path
    import os

    # Priority search directories
    search_dirs = []
    if models_dir: search_dirs.append(Path(models_dir))

    # Standard paths (Docker & Local)
    search_dirs.extend([
        Path("/app/assets/models"),
        Path("/app/models"),
        Path(os.getcwd()) / "assets" / "models",
        Path(os.getcwd()) / "models"
    ])

    all_candidates = []
    primary_candidates = []

    logger.info("[ML_ENGINE] Searching for models in: %s", [str(d) for d in search_dirs if d.exists()])
    for d in search_dirs:
        if not d.exists(): continue
        try:
            for p in d.glob("*.joblib"):
                all_candidates.append(p)
                # Meta sidecar check
                meta1 = p.with_suffix(p.suffix + ".meta.json")
                meta2 = p.with_suffix(".meta.json")
                meta = meta1 if meta1.exists() else (meta2 if meta2.exists() else None)

                if meta:
                    try:
                        m = _json.loads(meta.read_text())
                        m_type = str(m.get("type", m.get("model_type", ""))).lower()
                        if m_type not in ("blend", "meta", "base", "calibration", "profile"):
                            primary_candidates.append(p)
                    except Exception as e:
                        logger.debug(f"JSON load failed for {meta}: {e}")
        except Exception as e:
            logger.debug(f"Search directory failed for {d}: {e}")

    if primary_candidates:
        selected = max(primary_candidates, key=lambda x: x.stat().st_mtime)
        logger.info("[ML_ENGINE] SELECTED: %s", selected.name)
        return selected

    # 2. Fallback: Any joblib
    if all_candidates:
        selected = max(all_candidates, key=lambda x: x.stat().st_mtime)
        logger.error(f">>> [ML_ENGINE] FALLBACK: Using latest joblib: {selected.name}")
        return selected

    logger.error(">>> [ML_ENGINE] NO MODELS FOUND.")
    return None
