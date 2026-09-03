"""모멘텀 팩터: RS(Relative Strength) 점수."""
from __future__ import annotations

import pandas as pd


def compute_rs_raw(price: pd.Series, lookback_months: list[int], weights: list[float]) -> float:
    """단일 종목의 가중 모멘텀 raw score. price는 일별 종가 시계열(최신이 마지막 행)."""
    if len(weights) != len(lookback_months):
        raise ValueError("lookback_months와 weights의 길이가 같아야 합니다")
    if abs(sum(weights) - 1.0) > 1e-6:
        raise ValueError("weights 합은 1.0이어야 합니다")

    score = 0.0
    for months, weight in zip(lookback_months, weights):
        trading_days = months * 21
        if len(price) <= trading_days:
            return float("nan")
        past = price.iloc[-trading_days - 1]
        current = price.iloc[-1]
        score += weight * (current / past - 1)
    return score


def compute_rs_percentile(raw_scores: pd.Series) -> pd.Series:
    """유니버스 내 백분위 순위 (0~100). 상위 20% 필터링에 사용."""
    return raw_scores.rank(pct=True) * 100


def rs_subscore(rs_percentile: float) -> float:
    """백분위(0~100)를 점수표용 0~1로 정규화."""
    return max(0.0, min(1.0, rs_percentile / 100))
