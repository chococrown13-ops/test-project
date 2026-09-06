"""1단계: 유니버스 필터 (시총·거래대금·주가)."""
from __future__ import annotations

import pandas as pd


def filter_universe(
    snapshot: pd.DataFrame,
    min_market_cap: float,
    min_avg_trading_value_20d: float,
    min_price: float,
) -> pd.DataFrame:
    """snapshot columns: ticker(index), market_cap, avg_trading_value_20d, close."""
    mask = (
        (snapshot["market_cap"] >= min_market_cap)
        & (snapshot["avg_trading_value_20d"] >= min_avg_trading_value_20d)
        & (snapshot["close"] >= min_price)
    )
    return snapshot[mask].copy()
