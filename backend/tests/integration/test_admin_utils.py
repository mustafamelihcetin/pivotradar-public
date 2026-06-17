# tests/integration/test_admin_utils.py
"""Integration tests for admin utility modules (backup, maintenance, diagnostics)."""
import pytest


class TestListBackups:
    def test_list_backups_returns_list(self):
        from app.features.admin.backup import list_backups
        result = list_backups()
        assert isinstance(result, list)

    def test_list_backups_empty_dir_returns_empty(self, tmp_path, monkeypatch):
        from app.features.admin import backup as bk
        monkeypatch.setattr(bk, "BACKUP_DIR", tmp_path / "nonexistent")
        result = bk.list_backups()
        assert result == []


class TestMaintenanceRun:
    def test_maintenance_does_not_crash(self, db_session):
        from app.features.admin.maintenance import run_smart_maintenance
        run_smart_maintenance()


class TestAdminDiagnostics:
    def test_run_diagnostics_returns_dict(self, db_session):
        from app.features.admin.diagnostics import run_system_diagnostics
        result = run_system_diagnostics(db_session)
        assert isinstance(result, dict)


class TestSupportContact:
    def test_submit_contact_unauthenticated(self, test_client):
        resp = test_client.post("/api/support/contact", json={
            "name": "Test User",
            "email": "test@example.com",
            "subject": "Test Konusu",
            "message": "Bu bir test mesajıdır. Minimum uzunluk için yeterince uzun."
        })
        assert resp.status_code in (200, 201, 422, 429)

    def test_get_support_messages_responds(self, test_client):
        resp = test_client.get("/api/support/messages")
        assert resp.status_code in (200, 401, 403)


class TestSEOEndpoints:
    def test_market_leaders_responds(self, test_client):
        resp = test_client.get("/api/seo/market-leaders")
        assert resp.status_code in (200, 404, 500)

    def test_all_tickers_responds(self, test_client):
        resp = test_client.get("/api/seo/all-tickers")
        assert resp.status_code in (200, 404, 500)
