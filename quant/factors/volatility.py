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
