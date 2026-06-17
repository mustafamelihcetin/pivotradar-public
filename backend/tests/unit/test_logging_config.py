# backend/tests/unit/test_logging_config.py
"""Unit tests for JSON logging configuration."""
import json
import logging
import pytest

from app.core.logging_config import JsonFormatter, configure_json_logging


class TestJsonFormatter:
    def _make_record(self, msg="test message", level=logging.INFO, **kwargs):
        record = logging.LogRecord(
            name="test.logger",
            level=level,
            pathname="test.py",
            lineno=1,
            msg=msg,
            args=(),
            exc_info=None,
        )
        for k, v in kwargs.items():
            setattr(record, k, v)
        return record

    def test_basic_fields_present(self):
        formatter = JsonFormatter()
        record = self._make_record("hello world")
        output = formatter.format(record)
        data = json.loads(output)
        assert data["msg"] == "hello world"
        assert data["level"] == "INFO"
        assert data["logger"] == "test.logger"
        assert "ts" in data

    def test_extra_fields_included(self):
        formatter = JsonFormatter()
        record = self._make_record("req", user_id=42, endpoint="/api/scan", status_code=200)
        output = formatter.format(record)
        data = json.loads(output)
        assert data["user_id"] == 42
        assert data["endpoint"] == "/api/scan"
        assert data["status_code"] == 200

    def test_missing_extra_fields_omitted(self):
        formatter = JsonFormatter()
        record = self._make_record("no extras")
        output = formatter.format(record)
        data = json.loads(output)
        assert "user_id" not in data
        assert "endpoint" not in data

    def test_exception_info_included(self):
        formatter = JsonFormatter()
        try:
            raise ValueError("boom")
        except ValueError:
            import sys
            exc_info = sys.exc_info()
        record = logging.LogRecord(
            name="test", level=logging.ERROR,
            pathname="test.py", lineno=1,
            msg="error occurred", args=(), exc_info=exc_info,
        )
        output = formatter.format(record)
        data = json.loads(output)
        assert "exc" in data
        assert "ValueError" in data["exc"]

    def test_output_is_valid_json(self):
        formatter = JsonFormatter()
        record = self._make_record("türkçe mesaj: çığır açan")
        output = formatter.format(record)
        data = json.loads(output)
        assert "türkçe" in data["msg"]

    def test_warning_level(self):
        formatter = JsonFormatter()
        record = self._make_record("warn msg", level=logging.WARNING)
        output = formatter.format(record)
        data = json.loads(output)
        assert data["level"] == "WARNING"


class TestConfigureJsonLogging:
    def test_production_uses_json_formatter(self):
        configure_json_logging("production")
        root = logging.getLogger()
        assert any(
            isinstance(h.formatter, JsonFormatter)
            for h in root.handlers
        )

    def test_development_uses_plain_formatter(self):
        configure_json_logging("development")
        root = logging.getLogger()
        assert any(
            not isinstance(h.formatter, JsonFormatter)
            for h in root.handlers
        )

    def test_noisy_loggers_silenced(self):
        configure_json_logging("production")
        assert logging.getLogger("yfinance").level == logging.WARNING
        assert logging.getLogger("urllib3").level == logging.WARNING
