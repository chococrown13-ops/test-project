"""변동성 팩터: ATR 비율."""
from __future__ import annotations

import pandas as pd


def compute_atr(price: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = price["high"], price["low"], price["close"]
    prev_close = close.shift(1)
    true_range = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return true_range.ewm(alpha=1 / period, adjust=False).mean()


def compute_atr_ratio(price: pd.DataFrame, period: int = 14) -> pd.Series:
    return compute_atr(price, period) / price["close"]


def in_target_range(atr_ratio: float, min_ratio: float, max_ratio: float) -> bool:
    return min_ratio <= atr_ratio <= max_ratio


def volatility_subscore(atr_ratio: float, min_ratio: float, max_ratio: float) -> float:
    """target range(min_ratio~max_ratio) 밖이면 0점, 구간 중앙에 가까울수록 만점에 근접.

    너무 잔잔한 종목(익절 어려움)과 너무 거친 종목(스탑 잦음) 둘 다 감점된다.
    """
    if not in_target_range(atr_ratio, min_ratio, max_ratio):
        return 0.0
    mid = (min_ratio + max_ratio) / 2
    half_width = (max_ratio - min_ratio) / 2
    if half_width == 0:
        return 1.0
    distance = abs(atr_ratio - mid)
    return 1 - distance / half_width
