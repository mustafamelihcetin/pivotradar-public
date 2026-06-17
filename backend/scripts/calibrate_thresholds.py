#!/usr/bin/env python
"""
scripts/calibrate_thresholds.py
QRS bullish/bearish threshold calibration from historical scan_scores.

Analyzes evaluated scan_scores to find per-profile QRS cutoffs that
maximise F1 (or precision at min-recall) for bullish/bearish predictions.

Usage:
    python scripts/calibrate_thresholds.py [--min-recall 0.4] [--output json|table]

Output: recommended PROFILE_BULLISH_THRESHOLD / PROFILE_BEARISH_THRESHOLD
values per profile to paste into config_profiles.py.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Ensure project root is on path when called directly
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)


def _connect():
    from app.core.database import SessionLocal
    return SessionLocal()


def _load_evaluated_rows(db, profile: Optional[str] = None, min_rows: int = 30):
    """Load evaluated scan_scores with qrs_score and hit_status."""
    from app.features.scanner.models import ScanScore
    from sqlalchemy import and_

    q = db.query(
        ScanScore.profile_name,
        ScanScore.target_direction,
        ScanScore.qrs_score,
        ScanScore.hit_status,
        ScanScore.directional_hit,
        ScanScore.target_hit,
    ).filter(
        and_(
            ScanScore.evaluated_at.isnot(None),
            ScanScore.qrs_score.isnot(None),
            ScanScore.hit_status.isnot(None),
        )
    )
    if profile:
        q = q.filter(ScanScore.profile_name == profile)

    rows = q.all()
    return rows


def _f1(tp: int, fp: int, fn: int) -> float:
    if tp == 0:
        return 0.0
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def _find_best_threshold(
    scores: List[float],
    labels: List[int],   # 1 = success, 0 = failure
    min_recall: float = 0.35,
    direction: str = "bullish",
) -> Tuple[float, float, float, float]:
    """Grid-search threshold that maximises F1 at min_recall."""
    candidates = sorted(set(scores))
    best_thresh = candidates[len(candidates) // 2] if candidates else 60.0
    best_f1 = 0.0
    best_prec = 0.0
    best_recall = 0.0

    total_pos = sum(labels)
    if total_pos == 0:
        return best_thresh, 0.0, 0.0, 0.0

    for t in candidates:
        predicted = [1 if s >= t else 0 for s in scores]
        tp = sum(1 for p, l in zip(predicted, labels) if p == 1 and l == 1)
        fp = sum(1 for p, l in zip(predicted, labels) if p == 1 and l == 0)
        fn = total_pos - tp
        if tp + fp == 0:
            continue
        prec = tp / (tp + fp)
        rec  = tp / total_pos
        if rec < min_recall:
            continue
        f = _f1(tp, fp, fn)
        if f > best_f1:
            best_f1    = f
            best_thresh = t
            best_prec  = prec
            best_recall = rec

    return best_thresh, best_f1, best_prec, best_recall


def calibrate(min_recall: float = 0.35, output_format: str = "table") -> Dict:
    db = _connect()
    try:
        rows = _load_evaluated_rows(db)
    finally:
        db.close()

    if not rows:
        print("No evaluated rows found. Run the evaluator first.", file=sys.stderr)
        sys.exit(1)

    from collections import defaultdict
    # profile → direction → list of (qrs_score, success_label)
    buckets: Dict[str, Dict[str, List]] = defaultdict(lambda: {"bullish": [], "bearish": []})

    for row in rows:
        profile = (row.profile_name or "UNKNOWN").upper()
        direction = (row.target_direction or "neutral").lower()
        if direction not in ("bullish", "bearish"):
            continue
        qrs = row.qrs_score
        if qrs is None:
            continue
        # success = target_hit OR directional_hit at minimum
        success = int(
            bool(row.target_hit) or
            bool(row.directional_hit) or
            row.hit_status in ("target_hit", "near_miss")
        )
        buckets[profile][direction].append((float(qrs), success))

    results: Dict[str, Dict] = {}
    for profile, dirs in sorted(buckets.items()):
        results[profile] = {}
        for direction in ("bullish", "bearish"):
            items = dirs.get(direction, [])
            if len(items) < 15:
                results[profile][direction] = {
                    "threshold": None,
                    "n": len(items),
                    "note": "insufficient data (<15 evaluated rows)",
                }
                continue
            scores = [s for s, _ in items]
            labels = [l for _, l in items]
            thresh, f1, prec, rec = _find_best_threshold(
                scores, labels, min_recall=min_recall, direction=direction
            )
            results[profile][direction] = {
                "threshold": round(thresh, 1),
                "f1": round(f1, 3),
                "precision": round(prec, 3),
                "recall": round(rec, 3),
                "n": len(items),
                "n_success": sum(labels),
            }

    if output_format == "json":
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        _print_table(results)

    return results


def _print_table(results: Dict) -> None:
    header = f"{'Profile':<18} {'Dir':<10} {'Threshold':>10} {'F1':>7} {'Prec':>7} {'Recall':>7} {'N':>6} {'N_ok':>6}"
    print(header)
    print("-" * len(header))
    for profile, dirs in sorted(results.items()):
        for direction in ("bullish", "bearish"):
            d = dirs.get(direction, {})
            thresh = d.get("threshold")
            if thresh is None:
                note = d.get("note", "")
                print(f"{profile:<18} {direction:<10} {'—':>10}  —  {note}")
            else:
                f1   = d.get("f1", 0)
                prec = d.get("precision", 0)
                rec  = d.get("recall", 0)
                n    = d.get("n", 0)
                nok  = d.get("n_success", 0)
                print(f"{profile:<18} {direction:<10} {thresh:>10.1f} {f1:>7.3f} {prec:>7.3f} {rec:>7.3f} {n:>6} {nok:>6}")

    print()
    print("Suggested PROFILE_BULLISH_THRESHOLD update:")
    print("{")
    for profile, dirs in sorted(results.items()):
        t = dirs.get("bullish", {}).get("threshold")
        if t is not None:
            print(f'    "{profile}": {t},')
    print("}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Calibrate QRS thresholds from scan_scores history.")
    parser.add_argument("--min-recall", type=float, default=0.35,
                        help="Minimum recall to accept a threshold candidate (default: 0.35)")
    parser.add_argument("--output", choices=["table", "json"], default="table",
                        help="Output format (default: table)")
    args = parser.parse_args()
    calibrate(min_recall=args.min_recall, output_format=args.output)
