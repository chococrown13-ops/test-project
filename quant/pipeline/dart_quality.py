"""DART 재무데이터 -> quality_score/value_score(PEG) 입력값 조립 (lookahead-safe).

run_screening.py(오늘 시점)와 run_backtest.py(과거 시점 반복)가 공유한다. "있으면 쓰고
없으면 0 처리" 원칙: dart_source가 없거나, 설정이 안 됐거나, 이 종목의 조회에 실패하면
전부 0 — 그 종목만 quality_score/value_score(PEG)가 0으로 떨어지고 파이프라인 전체는
죽지 않는다 (quant/CLAUDE.md "데이터 소스" 섹션 참고).
"""
from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from data.sources.dart import DartApiError, DartFundamentalSource
from factors.quality import as_of_available_financials, compute_interest_coverage, compute_roic

DART_QUALITY_DEFAULTS: dict[str, float] = {
    "operating_cash_flow": 0.0,
    "net_income": 0.0,
    "roic": 0.0,
    "interest_coverage": 0.0,
    "eps_growth_pct": 0.0,
}


def dart_quality_inputs(
    dart_source: DartFundamentalSource | None,
    code: str,
    as_of: date,
    lag_days: int,
    lookback_days: int = 730,
    financials: pd.DataFrame | None = None,
) -> dict[str, float]:
    """DART에서 구할 수 있는 값만 채우고 나머지는 0으로 둔다 (quality_subscore는 세 항목의
    평균이라 부분적으로 채워져도 동작한다).

    financials를 넘기면 dart_source.get_financials() 호출을 건너뛰고 그 값을 그대로 쓴다 —
    여러 as_of에 걸쳐 같은 종목을 반복 조회하는 호출부(예: run_backtest.py)가 재무데이터를
    한 번만 받아 캐시해두고 재사용할 때 쓴다. get_financials()는 종목 하나당 최대 수십 건의
    HTTP 요청을 내므로(연도 x 보고서유형), 캐시 없이 반복 호출하면 DART 서버 요청 폭주로
    이어진다.
    """
    if financials is None:
        if dart_source is None or not dart_source.env.configured:
            return dict(DART_QUALITY_DEFAULTS)
        try:
            financials = dart_source.get_financials(code, as_of - timedelta(days=lookback_days), as_of)
        except DartApiError:
            return dict(DART_QUALITY_DEFAULTS)

    available = as_of_available_financials(financials, pd.Timestamp(as_of), lag_days)

    if available.empty:
        return dict(DART_QUALITY_DEFAULTS)

    latest = available.iloc[-1]
    result = dict(DART_QUALITY_DEFAULTS)
    result["operating_cash_flow"] = latest["operating_cash_flow"] or 0.0
    result["net_income"] = latest["net_income"] or 0.0
    if latest["invested_capital"]:
        result["roic"] = compute_roic(latest["operating_income"], latest["tax_rate"], latest["invested_capital"])
    if latest["interest_expense"]:
        result["interest_coverage"] = compute_interest_coverage(latest["operating_income"], latest["interest_expense"])
    # pandas가 DataFrame 컬럼을 만들 때 None을 NaN으로 바꿔버리므로 "is not None"은 NaN을
    # 걸러내지 못한다 (NaN is not None == True) — pd.notna로 실제 결측 여부를 확인해야 한다.
    if pd.notna(latest["eps_growth_pct_proxy"]):
        result["eps_growth_pct"] = latest["eps_growth_pct_proxy"]
    return result
