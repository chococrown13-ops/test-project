"""3단계: 트렌드 템플릿 통과 종목만 남기기."""
from __future__ import annotations

import pandas as pd

from factors.trend import passes_trend_template, trend_template_conditions


def filter_by_trend_template(
    candidates: pd.DataFrame,
    price_by_ticker: dict[str, pd.DataFrame],
    ma_periods: list[int],
    low_buffer: float,
    high_buffer: float,
) -> pd.DataFrame:
    passed_tickers = []
    for ticker in candidates.index:
        price = price_by_ticker.get(ticker)
        if price is None or len(price) < max(ma_periods):
            continue
        conditions = trend_template_conditions(price, ma_periods, low_buffer, high_buffer)
        if passes_trend_template(conditions):
            passed_tickers.append(ticker)
    return candidates.loc[passed_tickers]
