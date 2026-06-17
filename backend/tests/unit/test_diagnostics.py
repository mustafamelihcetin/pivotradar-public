# backend/tests/unit/test_diagnostics.py
"""Unit tests for admin diagnostics — mocked DB and network."""
import pytest
from unittest.mock import MagicMock, patch


class TestRunSystemDiagnostics:
    """
    Diagnostics paralel çalıştığından ve her check kendi SessionLocal açtığından,
    DB mock'ları SessionLocal üzerinden yapılır.
    """

    def _make_db(self):
        db = MagicMock()
        db.execute.return_value = MagicMock(scalar=lambda: 5)
        count_q = MagicMock()
        count_q.count.return_value = 10
        count_q.filter.return_value = count_q
        count_q.first.return_value = None
        count_q.order_by.return_value = count_q
        db.query.return_value = count_q
        return db

    def _run_with_mocks(self):
        """Diagnostics çalıştır; DB ve ağ isteklerini mockla."""
        from app.features.admin.diagnostics import run_system_diagnostics
        db_mock = self._make_db()
        with patch("app.features.admin.diagnostics._db_session", return_value=db_mock), \
             patch("requests.get") as mock_get, \
             patch("app.features.admin.diagnostics._check_redis",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_system_resources",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_ml_model_file",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_ml_in_memory",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_ml_inference",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_scheduler",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_scanner_stuck",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_analyze_cache",
                   return_value={"status": "ok", "message": "mock ok"}), \
             patch("app.features.admin.diagnostics._check_market_data_connectivity",
                   return_value={"status": "ok", "message": "mock ok"}):
            mock_get.return_value = MagicMock(status_code=200)
            return run_system_diagnostics(None)

    def test_returns_dict_with_checks(self):
        result = self._run_with_mocks()
        assert isinstance(result, dict)
        assert "checks" in result
        assert "timestamp" in result
        assert "status" in result

    def test_checks_list_nonempty(self):
        result = self._run_with_mocks()
        assert len(result["checks"]) > 0

    def test_summary_keys_present(self):
        result = self._run_with_mocks()
        s = result["summary"]
        assert "ok" in s and "warning" in s and "fail" in s and "total" in s

    def test_db_check_passes(self):
        result = self._run_with_mocks()
        # Yeni Türkçe isim: "Veritabanı Bağlantısı"
        db_check = next(
            (c for c in result["checks"] if "Veritabanı" in c["name"] and "Bağlantı" in c["name"]),
            None,
        )
        assert db_check is not None, f"DB check bulunamadı. Checkler: {[c['name'] for c in result['checks']]}"
        assert db_check["status"] in ("ok", "pass", "warning")

    def test_db_failure_marks_db_check_failed(self):
        """Veritabanı bağlantısı kesildiğinde ilgili check fail olmalı."""
        from app.features.admin.diagnostics import run_system_diagnostics

        failing_db = MagicMock()
        failing_db.execute.side_effect = Exception("connection refused")
        failing_db.close = MagicMock()

        with patch("app.features.admin.diagnostics._db_session", return_value=failing_db), \
             patch("app.features.admin.diagnostics._check_redis",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_system_resources",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_ml_model_file",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_ml_in_memory",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_ml_inference",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_scheduler",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_scanner_stuck",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_analyze_cache",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_market_data_connectivity",
                   return_value={"status": "ok", "message": "ok"}):
            result = run_system_diagnostics(None)

        db_check = next(
            (c for c in result["checks"] if "Veritabanı" in c["name"] and "Bağlantı" in c["name"]),
            None,
        )
        assert db_check is not None
        assert db_check["status"] == "fail"

    def test_network_fail_still_returns(self):
        from app.features.admin.diagnostics import run_system_diagnostics
        db_mock = self._make_db()
        with patch("app.features.admin.diagnostics._db_session", return_value=db_mock), \
             patch("app.features.admin.diagnostics._check_market_data_connectivity",
                   side_effect=Exception("timeout")), \
             patch("app.features.admin.diagnostics._check_redis",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_system_resources",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_ml_model_file",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_ml_in_memory",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_ml_inference",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_scheduler",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_scanner_stuck",
                   return_value={"status": "ok", "message": "ok"}), \
             patch("app.features.admin.diagnostics._check_analyze_cache",
                   return_value={"status": "ok", "message": "ok"}):
            result = run_system_diagnostics(None)
        assert isinstance(result, dict)
        assert len(result["checks"]) > 0
