# tests/test_scenarios.py
from __future__ import annotations

import pandas as pd
import pytest

from tests.sentinel import validate_df, validate_meta


def test_sentinel_catches_price_missing():
    df = pd.DataFrame({"Sembol": ["AAA"], "Kırılım Gücü": [90.0]})
    issues = validate_df(df)
    assert any(i.code == "DF_NO_PRICE" for i in issues)


def test_sentinel_accepts_good_meta():
    issues = validate_meta({"total_time": 2.5, "scan_date": "2025-01-01 12:00:00"})
    assert issues == []
