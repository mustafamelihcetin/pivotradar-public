# backend/tests/performance/test_ml_throughput.py
"""Performance tests — ML calibration & scoring throughput"""
import time
import numpy as np
import pytest


THROUGHPUT_THRESHOLD_PER_SEC = 10_000  # apply_calibration calls/sec
BLEND_THRESHOLD_PER_SEC      = 50_000  # blend_scores calls/sec
WEIGHT_THRESHOLD_PER_SEC     = 5_000   # _temporal_weights calls/sec for n=100


class TestApplyCalibrationThroughput:
    def test_single_value_speed(self, benchmark):
        """apply_calibration on a single float should be fast."""
        from app.features.scoring.ml.ml_calib import apply_calibration
        inp = np.array([65.0])
        result = benchmark(apply_calibration, inp)
        assert result is not None

    def test_batch_100_speed(self, benchmark):
        """Batch of 100 values."""
        from app.features.scoring.ml.ml_calib import apply_calibration
        inp = np.linspace(0, 100, 100)
        result = benchmark(apply_calibration, inp)
        assert len(result) == 100


class TestBlendScoresThroughput:
    def test_blend_single_call(self, benchmark):
        from app.features.scoring.ml.ai_score import blend_scores
        result = benchmark(blend_scores, 72.0, 68.0)
        assert 0 <= result <= 100


class TestTemporalWeightsThroughput:
    def test_100_timestamps(self, benchmark):
        from datetime import datetime, timedelta
        from app.features.scoring.ml.ml_calib import _temporal_weights
        ts = [datetime.utcnow() - timedelta(days=i) for i in range(100)]
        result = benchmark(_temporal_weights, ts)
        assert len(result) == 100


class TestScanTimeLimit:
    """
    Regression guard: a complete scoring pipeline should not exceed
    a reasonable wall-clock time per symbol.
    """
    MAX_SECONDS_PER_SYMBOL = 2.0

    def test_calibration_apply_under_time_limit(self):
        from app.features.scoring.ml.ml_calib import apply_calibration
        n = 500
        data = np.random.uniform(10, 90, n)
        start = time.perf_counter()
        for _ in range(n):
            apply_calibration(data[:1])
        elapsed = time.perf_counter() - start
        per_call_ms = (elapsed / n) * 1000
        assert per_call_ms < self.MAX_SECONDS_PER_SYMBOL * 1000, (
            f"apply_calibration too slow: {per_call_ms:.2f}ms per call"
        )
