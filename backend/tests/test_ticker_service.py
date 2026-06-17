# backend/tests/test_ticker_service.py
"""
TickerService kontrat testleri.

get_data() → {"data": List[TickerItem], "market": MarketStatus}
TickerItem:  {"symbol": str, "value": float, "change": float}
"""
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
from app.features.dashboard.ticker_service import TickerService


@pytest.fixture(autouse=True)
def reset_cache():
    TickerService._cache = []
    TickerService._last_fetch = 0
    yield
    TickerService._cache = []
    TickerService._last_fetch = 0


def _make_fast_info(last_price: float, previous_close: float):
    fi = MagicMock()
    fi.last_price = last_price
    fi.previous_close = previous_close
    return fi


class TestTickerServiceContract:
    def test_get_data_returns_dict_with_data_and_market(self):
        with patch.object(TickerService, "_fetch_halkyatirim", return_value={}), \
             patch.object(TickerService, "_fetch_yfinance_fallback", return_value={
                 "XU100": (9500.0, 9400.0),
                 "USDTRY": (32.5, 32.3),
             }):
            result = TickerService.get_data()

        assert isinstance(result, dict), "get_data() dict dönmeli"
        assert "data" in result, "Anahtarlar: 'data' eksik"
        assert "market" in result, "Anahtarlar: 'market' eksik"

    def test_data_items_have_required_keys(self):
        with patch.object(TickerService, "_fetch_halkyatirim", return_value={}), \
             patch.object(TickerService, "_fetch_yfinance_fallback", return_value={
                 "XU100": (9500.0, 9400.0),
             }):
            result = TickerService.get_data()

        for item in result["data"]:
            assert "symbol" in item, f"'symbol' eksik: {item}"
            assert "value"  in item, f"'value' eksik: {item}"
            assert "change" in item, f"'change' eksik: {item}"
            assert isinstance(item["value"],  (int, float)), "'value' sayısal olmalı"
            assert isinstance(item["change"], (int, float)), "'change' sayısal olmalı"

    def test_change_calculation_is_correct(self):
        with patch.object(TickerService, "_fetch_halkyatirim", return_value={
            "XU100": (9600.0, 9500.0),  # +1.0526...%
        }):
            result = TickerService.get_data()

        xu100 = next((i for i in result["data"] if "BIST" in i["symbol"] or i["symbol"] == "XU100"), None)
        if xu100:
            expected = round((9600 - 9500) / 9500 * 100, 2)
            assert abs(xu100["change"] - expected) < 0.1, \
                f"Değişim hesabı yanlış: {xu100['change']} ≠ {expected}"

    def test_cache_returns_without_fetch(self):
        TickerService._cache = [{"symbol": "TEST", "value": 100.0, "change": 1.0}]
        TickerService._last_fetch = 9_999_999_999.0

        with patch.object(TickerService, "_fetch_halkyatirim") as mock_halk, \
             patch.object(TickerService, "_fetch_yfinance_fallback") as mock_yf:
            result = TickerService.get_data()
            mock_halk.assert_not_called()
            mock_yf.assert_not_called()

        assert result["data"][0]["symbol"] == "TEST"

    def test_zero_or_negative_price_filtered_out(self):
        with patch.object(TickerService, "_fetch_halkyatirim", return_value={}), \
             patch.object(TickerService, "_fetch_yfinance_fallback", return_value={
                 "XU100": (0.0, 9400.0),   # geçersiz fiyat
             }):
            result = TickerService.get_data()

        # 0 fiyatlı kayıt data'ya girmemeli
        for item in result["data"]:
            assert item["value"] > 0, f"Sıfır/negatif fiyat filtreden geçti: {item}"

    def test_extreme_change_filtered_out(self):
        """±95%'i aşan değişimler filtrelenmeli."""
        with patch.object(TickerService, "_fetch_halkyatirim", return_value={}), \
             patch.object(TickerService, "_fetch_yfinance_fallback", return_value={
                 "XU100": (20000.0, 100.0),  # +19900% — absürt değişim
             }):
            result = TickerService.get_data()

        for item in result["data"]:
            assert abs(item["change"]) <= 95, f"Aşırı değişim filtreden geçti: {item}"
