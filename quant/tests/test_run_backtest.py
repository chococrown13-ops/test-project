"""pipeline/run_backtest.py 테스트.

run_screening.py와 동일하게, 실제 HTTP 세션 대신 KisPriceSource/KrxPriceSource/
DartFundamentalSource와 같은 메서드 이름을 가진 스텁을 주입해서 검증한다.
"""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
import yaml

import pipeline.run_screening as run_screening
from pipeline.run_backtest import fetch_today_universe, run, weekly_rebalance_dates


def _uptrend_bars(n: int = 500, start: str = "2023-01-02") -> pd.DataFrame:
    dates = pd.bdate_range(start, periods=n)
    close = np.linspace(80, 200, n) + np.random.default_rng(0).normal(0, 0.5, n)
    return pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": np.full(n, 1_000_000.0)},
        index=dates,
    )


def _flat_bars(n: int = 500, start: str = "2023-01-02") -> pd.DataFrame:
    dates = pd.bdate_range(start, periods=n)
    close = np.full(n, 100.0)
    return pd.DataFrame(
        {"open": close, "high": close + 0.5, "low": close - 0.5, "close": close, "volume": np.full(n, 1_000_000.0)},
        index=dates,
    )


class StubKisSource:
    def __init__(self, pool: list[dict]) -> None:
        self.env = SimpleNamespace(configured=True)
        self._pool = pool

    def fetch_market_cap_universe(self, min_market_cap_eok: float, market: str = "all") -> list[dict]:
        return [row for row in self._pool if row["market_cap_eok"] >= min_market_cap_eok]


class StubKrxSource:
    def __init__(self, bars: dict[str, pd.DataFrame]) -> None:
        self._bars = bars

    def get_ohlcv(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        df = self._bars.get(ticker)
        if df is None:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
        mask = (df.index.date >= start) & (df.index.date <= end)
        return df[mask]


class StubDartSource:
    def __init__(self, configured: bool = False) -> None:
        self.env = SimpleNamespace(configured=configured)

    def get_financials(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        return pd.DataFrame(columns=["report_date"])


def test_weekly_rebalance_dates_picks_fridays_and_includes_last_date() -> None:
    bars = {"A": _uptrend_bars(n=60, start="2024-01-02")}
    start = date(2024, 1, 1)
    dates = weekly_rebalance_dates(bars, start, weekday=4)

    assert all(d.weekday() == 4 for d in dates[:-1])
    assert dates[-1] == bars["A"].index[-1]  # 마지막 거래일은 금요일이 아니어도 항상 포함


def test_fetch_today_universe_computes_shares_approx() -> None:
    pool = [{"code": "GOOD", "name": "good corp", "price": 100.0, "market_cap_eok": 1000.0}]
    kis_source = StubKisSource(pool)
    universe = fetch_today_universe(kis_source, {"min_market_cap": 0, "market": ["KOSPI", "KOSDAQ"]})

    assert universe.loc["GOOD", "market_cap"] == 1000.0 * 1e8
    assert universe.loc["GOOD", "shares_approx"] == pytest.approx(1000.0 * 1e8 / 100.0)


@pytest.fixture
def loose_config_dir(tmp_path, monkeypatch):
    """run_screening.CONFIG_DIR을 완화된 테스트 전용 config로 돌린다 (run_backtest.load_config가
    같은 함수를 재사용하므로 이 monkeypatch가 그대로 적용된다)."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    (config_dir / "universe.yaml").write_text(
        yaml.dump({"market": ["KOSPI", "KOSDAQ"], "min_market_cap": 0, "min_avg_trading_value_20d": 0, "min_price": 0}),
        encoding="utf-8",
    )
    (config_dir / "factors.yaml").write_text(
        yaml.dump(
            {
                "momentum": {"lookback_months": [1, 2, 3], "weights": [0.4, 0.35, 0.25], "universe_percentile_cutoff": 0.0},
                "trend_template": {"ma_periods": [5, 10, 20], "low_252d_buffer": 0.0, "high_252d_buffer": 0.0},
                "volatility": {"atr_period": 14, "atr_ratio_min": 0.0, "atr_ratio_max": 1.0},
                "quality": {"min_roic": 0.10, "ocf_gt_net_income": True, "min_interest_coverage": 5},
                "value": {"per_band": [0, 999999], "max_peg": 2.0},
            }
        ),
        encoding="utf-8",
    )
    (config_dir / "score_table.yaml").write_text(
        yaml.dump(
            {
                "cutoff": 10,
                "weights": {"rs_score": 25, "trend_score": 25, "quality_score": 25, "volatility_score": 15, "value_score": 10},
            }
        ),
        encoding="utf-8",
    )
    (config_dir / "backtest.yaml").write_text(
        yaml.dump(
            {
                "financial_data_lag_days": 60,
                "initial_capital": 100_000_000,
                "slippage_bps": 10,
                "transaction_tax": 0.002,
                "risk_per_trade": 0.01,
                "max_positions": 10,
                "atr_stop_multiplier": 2.0,
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(run_screening, "CONFIG_DIR", config_dir)
    return config_dir


def test_run_end_to_end_backtest_excludes_flat_and_trades_uptrend(loose_config_dir) -> None:
    today = date.today()
    n = 500
    good_bars = _uptrend_bars(n=n, start=(pd.Timestamp(today) - pd.tseries.offsets.BDay(n - 1)).strftime("%Y-%m-%d"))
    flat_bars = _flat_bars(n=n, start=good_bars.index[0].strftime("%Y-%m-%d"))

    pool = [
        {"code": "GOOD", "name": "good corp", "price": good_bars["close"].iloc[-1], "market_cap_eok": 1000.0},
        {"code": "FLAT", "name": "flat corp", "price": flat_bars["close"].iloc[-1], "market_cap_eok": 1000.0},
    ]
    kis_source = StubKisSource(pool)
    krx_source = StubKrxSource({"GOOD": good_bars, "FLAT": flat_bars})
    dart_source = StubDartSource(configured=False)

    report, trades = run(years=1, kis_source=kis_source, krx_source=krx_source, dart_source=dart_source)

    assert report["n_trades"] >= 1
    assert set(trades["ticker"]) <= {"GOOD"}  # FLAT은 ma_long_trending_up 조건에서 계속 탈락


def test_run_raises_without_krx_installed_is_not_required_for_stub(loose_config_dir) -> None:
    """krx_source가 주입되면 실제 pykrx 설치 여부와 무관하게 동작해야 한다."""
    pool = [{"code": "GOOD", "name": "good corp", "price": 100.0, "market_cap_eok": 1000.0}]
    kis_source = StubKisSource(pool)
    krx_source = StubKrxSource({})  # 가격 데이터 없음
    dart_source = StubDartSource(configured=False)

    report, trades = run(years=1, kis_source=kis_source, krx_source=krx_source, dart_source=dart_source)

    assert report["n_trades"] == 0
    assert trades.empty
