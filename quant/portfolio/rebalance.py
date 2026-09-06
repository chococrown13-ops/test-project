"""리밸런싱 로직: 기존 보유 종목과 신규 스크리닝 결과 비교."""
from __future__ import annotations

import pandas as pd


def compute_rebalance_orders(
    current_holdings: pd.DataFrame, target_portfolio: pd.DataFrame
) -> dict[str, pd.DataFrame]:
    """current_holdings, target_portfolio: index=ticker.
    반환: {'sell': 청산할 종목, 'buy': 신규 진입할 종목, 'hold': 유지 종목}
    """
    current_tickers = set(current_holdings.index)
    target_tickers = set(target_portfolio.index)

    sell = current_holdings.loc[list(current_tickers - target_tickers)]
    buy = target_portfolio.loc[list(target_tickers - current_tickers)]
    hold = target_portfolio.loc[list(current_tickers & target_tickers)]

    return {"sell": sell, "buy": buy, "hold": hold}
