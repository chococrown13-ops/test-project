"""screening/universe.py, rs_filter.py, trend_filter.py 단위 테스트 (기존에 누락되어 있었음)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from screening.rs_filter import filter_by_rs
from screening.trend_filter import filter_by_trend_template
from screening.universe import filter_universe


def test_filter_universe_applies_all_three_thresholds() -> None:
    snapshot = pd.DataFrame(
        {
            "market_cap": [200e8, 50e8, 200e8, 200e8],
            "avg_trading_value_20d": [20e8, 20e8, 5e8, 20e8],
            "close": [10000, 10000, 10000, 1000],
        },
        index=["OK", "SMALL_CAP", "LOW_LIQUIDITY", "PENNY"],
    )
    result = filter_universe(snapshot, min_market_cap=100e8, min_avg_trading_value_20d=10e8, min_price=2000)
    assert result.index.tolist() == ["OK"]


def test_filter_universe_boundary_is_inclusive() -> None:
    snapshot = pd.DataFrame(
        {"market_cap": [100e8], "avg_trading_value_20d": [10e8], "close": [2000]},
        index=["EXACT"],
    )
    result = filter_universe(snapshot, min_market_cap=100e8, min_avg_trading_value_20d=10e8, min_price=2000)
    assert result.index.tolist() == ["EXACT"]


def test_filter_by_rs_keeps_top_percentile() -> None:
    universe = pd.DataFrame(index=["A", "B", "C", "D", "E"])
    rs_raw = pd.Series({"A": 0.5, "B": 0.4, "C": 0.1, "D": -0.2, "E": 0.3})
    # 상위 10%(percentile>=90) -> 5종목 중 1등(A, percentile 100)만 남아야 함
    result = filter_by_rs(universe, rs_raw, percentile_cutoff=0.9)
    assert result.index.tolist() == ["A"]
    assert "rs_percentile" in result.columns


def test_filter_by_rs_empty_when_cutoff_too_high() -> None:
    universe = pd.DataFrame(index=["A", "B"])
    rs_raw = pd.Series({"A": 0.1, "B": 0.05})
    result = filter_by_rs(universe, rs_raw, percentile_cutoff=1.01)
    assert result.empty


def _uptrend_bars(n: int = 300) -> pd.DataFrame:
    close = np.linspace(80, 150, n) + np.random.default_rng(0).normal(0, 0.5, n)
    return pd.DataFrame({"high": close + 1, "low": close - 1, "close": close})


def _downtrend_bars(n: int = 300) -> pd.DataFrame:
    close = np.linspace(150, 80, n)
    return pd.DataFrame({"high": close + 1, "low": close - 1, "close": close})


def test_filter_by_trend_template_keeps_only_passing_tickers() -> None:
    candidates = pd.DataFrame(index=["UP", "DOWN"])
    price_by_ticker = {"UP": _uptrend_bars(), "DOWN": _downtrend_bars()}
    result = filter_by_trend_template(
        candidates, price_by_ticker, ma_periods=[50, 150, 200], low_buffer=0.30, high_buffer=0.75
    )
    assert result.index.tolist() == ["UP"]


def test_filter_by_trend_template_skips_insufficient_history() -> None:
    candidates = pd.DataFrame(index=["TOO_SHORT"])
    price_by_ticker = {"TOO_SHORT": _uptrend_bars(n=100)}  # max(ma_periods)=200 > 100
    result = filter_by_trend_template(
        candidates, price_by_ticker, ma_periods=[50, 150, 200], low_buffer=0.30, high_buffer=0.75
    )
    assert result.empty


def test_filter_by_trend_template_skips_missing_ticker() -> None:
    candidates = pd.DataFrame(index=["MISSING"])
    result = filter_by_trend_template(
        candidates, {}, ma_periods=[50, 150, 200], low_buffer=0.30, high_buffer=0.75
    )
    assert result.empty
