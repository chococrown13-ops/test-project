"""비중 공식: ATR 기반 리스크 포지션 사이징.

포지션당 리스크를 계좌 자본의 일정 비율로 고정 → ATR(변동성)이 클수록 수량은 작아짐.
"""
from __future__ import annotations

import pandas as pd


def position_size(
    account_equity: float,
    risk_per_trade: float,
    entry_price: float,
    atr: float,
    atr_stop_multiplier: float = 2.0,
) -> int:
    risk_amount = account_equity * risk_per_trade
    stop_distance = atr * atr_stop_multiplier
    if stop_distance <= 0:
        return 0
    return int(risk_amount / stop_distance)


def allocate_portfolio(
    scored_candidates: pd.DataFrame,
    account_equity: float,
    risk_per_trade: float,
    max_positions: int,
    atr_col: str = "atr",
    price_col: str = "close",
    atr_stop_multiplier: float = 2.0,
) -> pd.DataFrame:
    """상위 max_positions개 종목에 대해 종목별 수량 산출."""
    top = scored_candidates.head(max_positions).copy()
    top["shares"] = top.apply(
        lambda row: position_size(
            account_equity, risk_per_trade, row[price_col], row[atr_col], atr_stop_multiplier
        ),
        axis=1,
    )
    top["position_value"] = top["shares"] * top[price_col]
    return top
