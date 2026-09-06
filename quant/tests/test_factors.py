"""팩터 계산 함수 단위 테스트."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from factors.momentum import compute_rs_percentile, compute_rs_raw
from factors.trend import passes_trend_template, trend_template_conditions
from factors.volatility import compute_atr_ratio, in_target_range


def test_compute_rs_raw_uptrend() -> None:
    price = pd.Series(np.linspace(100, 200, 300))
    score = compute_rs_raw(price, lookback_months=[3, 6, 12], weights=[0.4, 0.35, 0.25])
    assert score > 0


def test_compute_rs_raw_insufficient_history_returns_nan() -> None:
    price = pd.Series(np.linspace(100, 110, 30))
    score = compute_rs_raw(price, lookback_months=[3, 6, 12], weights=[0.4, 0.35, 0.25])
    assert np.isnan(score)


def test_compute_rs_raw_invalid_weights_raises() -> None:
    price = pd.Series(np.linspace(100, 110, 300))
    with pytest.raises(ValueError):
        compute_rs_raw(price, lookback_months=[3, 6, 12], weights=[0.5, 0.5, 0.5])


def test_compute_rs_percentile_ranks_correctly() -> None:
    raw = pd.Series({"A": 0.1, "B": 0.5, "C": -0.2, "D": 0.3})
    pct = compute_rs_percentile(raw)
    assert pct["B"] == 100.0
    assert pct["C"] == 25.0


@pytest.fixture
def uptrend_price() -> pd.DataFrame:
    n = 300
    close = np.linspace(80, 150, n) + np.random.default_rng(0).normal(0, 0.5, n)
    return pd.DataFrame({"high": close + 1, "low": close - 1, "close": close})


def test_trend_template_uptrend_passes(uptrend_price: pd.DataFrame) -> None:
    conditions = trend_template_conditions(
        uptrend_price, ma_periods=[50, 150, 200], low_buffer=0.30, high_buffer=0.75
    )
    assert passes_trend_template(conditions)


def test_trend_template_downtrend_fails() -> None:
    n = 300
    close = np.linspace(150, 80, n)
    price = pd.DataFrame({"high": close + 1, "low": close - 1, "close": close})
    conditions = trend_template_conditions(
        price, ma_periods=[50, 150, 200], low_buffer=0.30, high_buffer=0.75
    )
    assert not passes_trend_template(conditions)


def test_atr_ratio_in_range() -> None:
    n = 60
    close = pd.Series([100.0] * n)
    price = pd.DataFrame({"high": close + 2, "low": close - 2, "close": close})
    ratio = compute_atr_ratio(price, period=14).iloc[-1]
    assert in_target_range(ratio, 0.02, 0.06)
