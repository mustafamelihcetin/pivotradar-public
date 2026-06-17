# backend/tests/unit/test_admin_utils.py
import pytest
from unittest.mock import MagicMock
from datetime import datetime
from app.features.admin.utils import get_system_setting, is_trading_hours, get_system_load, DEFAULT_SETTINGS

def test_get_system_setting_default():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    
    val = get_system_setting(db, "non_existent_key", default="fallback")
    assert val == "fallback"
    
    # Check if it pulls from DEFAULT_SETTINGS if key exists there
    val = get_system_setting(db, "backtest_config")
    assert val == DEFAULT_SETTINGS["backtest_config"]

def test_get_system_setting_db_hit():
    db = MagicMock()
    mock_row = MagicMock()
    mock_row.value = {"custom": "value"}
    db.query.return_value.filter.return_value.first.return_value = mock_row
    
    val = get_system_setting(db, "prism_config")
    assert val == {"custom": "value"}

def test_is_trading_hours():
    # Weekday at 14:00 (Trading)
    dt_trading = datetime(2026, 4, 22, 14, 0) # Wednesday
    # Mock is_business_day to return True
    with pytest.MonkeyPatch.context() as m:
        m.setattr("app.features.admin.utils.is_business_day", lambda x: True)
        assert is_trading_hours(dt_trading) is True
        
        # Weekday at 20:00 (Closed)
        dt_closed = datetime(2026, 4, 22, 20, 0)
        assert is_trading_hours(dt_closed) is False

def test_get_system_load():
    load = get_system_load()
    assert "cpu" in load
    assert "ram" in load
    assert isinstance(load["cpu"], float)
    assert isinstance(load["ram"], float)


def test_log_admin_action_success():
    from app.features.admin.utils import log_admin_action
    from unittest.mock import patch, MagicMock

    db = MagicMock()
    user = MagicMock()
    user.id = 1

    # Patch the import inside the function
    import app.features.admin.models as admin_models
    original = admin_models.AdminAuditLog
    mock_log_cls = MagicMock()
    mock_log = MagicMock()
    mock_log_cls.return_value = mock_log
    admin_models.AdminAuditLog = mock_log_cls
    try:
        log_admin_action(db, user, "scan_start", target="THYAO", details={"n": 5})
        db.add.assert_called_once_with(mock_log)
        db.commit.assert_called_once()
    finally:
        admin_models.AdminAuditLog = original


def test_log_admin_action_handles_exception():
    from app.features.admin.utils import log_admin_action

    db = MagicMock()
    db.add.side_effect = Exception("db error")
    user = MagicMock()
    user.id = 1
    # Should not raise
    log_admin_action(db, user, "test_action")
