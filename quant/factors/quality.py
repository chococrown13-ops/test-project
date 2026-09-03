"""퀄리티 팩터: ROIC, OCF/순이익, 이자보상배율.

재무 데이터는 반드시 실제 공시일(report_date) 기준으로만 사용해야 합니다.
당기 실적을 분기 종료일에 알 수 있었던 것처럼 계산하면 룩어헤드 바이어스입니다.
"""
from __future__ import annotations

import pandas as pd


def compute_roic(operating_income: float, tax_rate: float, invested_capital: float) -> float:
    nopat = operating_income * (1 - tax_rate)
    if invested_capital == 0:
        return float("nan")
    return nopat / invested_capital


def ocf_exceeds_net_income(operating_cash_flow: float, net_income: float) -> bool:
    return operating_cash_flow > net_income


def compute_interest_coverage(operating_income: float, interest_expense: float) -> float:
    if interest_expense == 0:
        return float("inf")
    return operating_income / interest_expense


def as_of_available_financials(
    financials: pd.DataFrame, as_of: pd.Timestamp, lag_days: int
) -> pd.DataFrame:
    """as_of 시점에 실제로 '알 수 있었던' 재무데이터만 반환 (report_date + lag_days <= as_of).

    lag_days는 공시 이후 데이터 벤더 반영 지연을 보수적으로 감안한 버퍼
    (config/backtest.yaml의 financial_data_lag_days, 기본 60일).
    """
    cutoff = as_of - pd.Timedelta(days=lag_days)
    return financials[financials["report_date"] <= cutoff]
