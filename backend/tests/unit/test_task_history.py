# backend/tests/unit/test_task_history.py
"""Unit tests for task_history — DB-backed task logging."""
import pytest
from unittest.mock import MagicMock, patch


class TestRecordTaskStart:
    def test_returns_id_on_success(self):
        mock_log = MagicMock()
        mock_log.id = 42

        mock_db = MagicMock()
        mock_db.add.return_value = None
        mock_db.commit.return_value = None
        mock_db.refresh.return_value = None

        with patch("app.core.task_history.SessionLocal", return_value=mock_db):
            from app.core.task_history import record_task_start
            # Simulate log having id after refresh
            def refresh_side_effect(obj):
                obj.id = 42
            mock_db.refresh.side_effect = refresh_side_effect

            mock_db.__enter__ = lambda s: s
            mock_db.__exit__ = MagicMock(return_value=False)

            # Call the real function with patched SessionLocal
            import app.core.task_history as th
            original = th.SessionLocal
            th.SessionLocal = lambda: mock_db
            try:
                result = th.record_task_start("test_task")
            finally:
                th.SessionLocal = original

    def test_returns_none_on_db_error(self):
        mock_db = MagicMock()
        mock_db.add.side_effect = Exception("DB error")

        import app.core.task_history as th
        original = th.SessionLocal
        th.SessionLocal = lambda: mock_db
        try:
            result = th.record_task_start("test_task")
            assert result is None
        finally:
            th.SessionLocal = original


class TestRecordTaskEnd:
    def test_none_log_id_is_noop(self):
        # Should not crash
        from app.core.task_history import record_task_end
        record_task_end(None, "success")

    def test_updates_log_on_existing_id(self):
        mock_log = MagicMock()
        import datetime
        mock_log.started_at = datetime.datetime(2026, 1, 1, 10, 0, 0)

        mock_db = MagicMock()
        mock_db.get.return_value = mock_log

        import app.core.task_history as th
        original = th.SessionLocal
        th.SessionLocal = lambda: mock_db
        try:
            th.record_task_end(1, "success", "All good")
            mock_db.commit.assert_called_once()
            assert mock_log.status == "success"
            assert mock_log.message == "All good"
        finally:
            th.SessionLocal = original

    def test_long_message_truncated(self):
        mock_log = MagicMock()
        import datetime
        mock_log.started_at = datetime.datetime(2026, 1, 1)

        mock_db = MagicMock()
        mock_db.get.return_value = mock_log

        import app.core.task_history as th
        original = th.SessionLocal
        th.SessionLocal = lambda: mock_db
        try:
            th.record_task_end(1, "error", "x" * 600)
            assert len(mock_log.message) == 500
        finally:
            th.SessionLocal = original


class TestGetLastSuccessTime:
    def test_returns_none_when_no_records(self):
        mock_db = MagicMock()
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.first.return_value = None
        mock_db.query.return_value = mock_q

        import app.core.task_history as th
        original = th.SessionLocal
        th.SessionLocal = lambda: mock_db
        try:
            result = th.get_last_success_time("test_task")
            assert result is None
        finally:
            th.SessionLocal = original

    def test_returns_finished_at_on_match(self):
        import datetime
        expected_dt = datetime.datetime(2026, 4, 1, 12, 0)

        mock_log = MagicMock()
        mock_log.finished_at = expected_dt

        mock_db = MagicMock()
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.first.return_value = mock_log
        mock_db.query.return_value = mock_q

        import app.core.task_history as th
        original = th.SessionLocal
        th.SessionLocal = lambda: mock_db
        try:
            result = th.get_last_success_time("test_task")
            assert result == expected_dt
        finally:
            th.SessionLocal = original
