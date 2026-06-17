# tests/diagnostics_report.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import json

# Basit ve stabil statüler (UI bağımsız)
STATUS_PASS = "PASS"
STATUS_WARN = "WARN"
STATUS_FAIL = "FAIL"
STATUS_SKIP = "SKIP"

SEV_GREEN = "GREEN"
SEV_YELLOW = "YELLOW"
SEV_RED = "RED"


@dataclass
class CheckResult:
    id: str
    name: str
    status: str  # PASS/WARN/FAIL/SKIP
    severity: str  # GREEN/YELLOW/RED
    message: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    suggestion: str = ""
    duration_ms: Optional[int] = None


@dataclass
class DiagnosticsReport:
    mode: str  # quick/deep
    started_at: str
    finished_at: str = ""
    duration_ms: int = 0

    overall: str = SEV_GREEN  # GREEN/YELLOW/RED
    confidence: int = 100

    checks: List[CheckResult] = field(default_factory=list)

    def compute_overall(self) -> None:
        # En kötü şeye göre overall
        sev_rank = {SEV_GREEN: 0, SEV_YELLOW: 1, SEV_RED: 2}
        worst = 0
        fail_count = 0
        warn_count = 0
        total = 0

        for c in self.checks:
            total += 1
            worst = max(worst, sev_rank.get(c.severity, 0))
            if c.status == STATUS_FAIL:
                fail_count += 1
            elif c.status == STATUS_WARN:
                warn_count += 1

        inv_rank = {0: SEV_GREEN, 1: SEV_YELLOW, 2: SEV_RED}
        self.overall = inv_rank.get(worst, SEV_GREEN)

        # Basit güven skoru: fail ağır, warn orta
        conf = 100
        conf -= fail_count * 25
        conf -= warn_count * 10
        if total == 0:
            conf = 0
        self.confidence = max(0, min(100, conf))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


def now_iso() -> str:
    # Yerel timezone ile ISO (saniye hassasiyeti)
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
