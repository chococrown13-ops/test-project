"""데이터 정합성 검증.

개인 퀀트가 실패하는 지점은 대부분 데이터 단계입니다. 여기서 걸러야 할 것:
결측치, 가격 이상치(액면분할/유상증자 미반영), 데이터 공백, 생존편향.
"""
from __future__ import annotations

import pandas as pd


def check_missing(df: pd.DataFrame, max_gap_days: int = 5) -> list[str]:
    issues = []
    if df.isna().any().any():
        issues.append(f"결측치 존재: {df.isna().sum().to_dict()}")
    gaps = df.index.to_series().diff().dt.days
    n_gaps = int((gaps > max_gap_days).sum())
    if n_gaps > 0:
        issues.append(f"{max_gap_days}일 초과 데이터 공백 {n_gaps}건")
    return issues


def check_price_jumps(df: pd.DataFrame, max_daily_return: float = 0.30) -> list[str]:
    """액면분할/유상증자 미반영 등으로 인한 비정상 급등락 탐지."""
    daily_return = df["close"].pct_change().abs()
    jump_dates = daily_return[daily_return > max_daily_return].index.tolist()
    if jump_dates:
        return [f"{max_daily_return:.0%} 초과 일간 변동 {len(jump_dates)}건: {jump_dates[:5]}"]
    return []


def check_survivorship(universe_by_date: dict[str, list[str]]) -> list[str]:
    """유니버스가 날짜별로 달라지는지 확인. 전 기간 동일하면 생존편향(상장폐지 종목 누락) 의심."""
    unique_universes = {tuple(sorted(tickers)) for tickers in universe_by_date.values()}
    if len(unique_universes) == 1 and len(universe_by_date) > 1:
        return ["경고: 전체 기간 동안 유니버스가 변하지 않음 - 생존편향(상장폐지 종목 누락) 의심"]
    return []
