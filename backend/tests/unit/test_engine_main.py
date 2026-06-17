# backend/tests/unit/test_engine_main.py
"""
engine_main._run_with_retry için unit testler.
External module'lar mock'lanır — dosya sistemi veya DB erişimi yok.
"""
import sys
from pathlib import Path
from unittest.mock import patch, call
import pytest

# scripts/ dizini sys.path'te olmalı
_SCRIPTS_DIR = str(Path(__file__).resolve().parents[3] / "scripts")
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from engine_main import _run_with_retry, _run_script  # noqa: E402


class TestRunWithRetry:
    def test_succeeds_first_attempt(self):
        with patch("engine_main._run_script", return_value=(0, None)) as mock_run:
            code, err = _run_with_retry("some_module", max_retries=2, delay=0)
        assert code == 0
        assert err is None
        mock_run.assert_called_once_with("some_module")

    def test_retries_on_failure_then_succeeds(self):
        side_effects = [(1, "first fail"), (0, None)]
        with patch("engine_main._run_script", side_effect=side_effects) as mock_run, \
             patch("engine_main.time.sleep") as mock_sleep:
            code, err = _run_with_retry("some_module", max_retries=2, delay=5.0)
        assert code == 0
        assert mock_run.call_count == 2
        mock_sleep.assert_called_once_with(5.0)

    def test_exhausts_retries(self):
        with patch("engine_main._run_script", return_value=(1, "err")) as mock_run, \
             patch("engine_main.time.sleep"):
            code, err = _run_with_retry("some_module", max_retries=3, delay=0)
        assert code == 1
        assert err == "err"
        assert mock_run.call_count == 3

    def test_max_retries_one_means_single_attempt(self):
        with patch("engine_main._run_script", return_value=(1, "fail")) as mock_run, \
             patch("engine_main.time.sleep") as mock_sleep:
            code, _ = _run_with_retry("m", max_retries=1, delay=5.0)
        assert code == 1
        assert mock_run.call_count == 1
        mock_sleep.assert_not_called()

    def test_no_sleep_on_last_attempt(self):
        with patch("engine_main._run_script", return_value=(1, "fail")), \
             patch("engine_main.time.sleep") as mock_sleep:
            _run_with_retry("m", max_retries=2, delay=10.0)
        # 2 deneme → sadece 1 sleep (ilk başarısızlıktan sonra)
        assert mock_sleep.call_count == 1
