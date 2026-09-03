"""트렌드 템플릿 (추세 추종 스타일 4조건)."""
from __future__ import annotations

import pandas as pd


def trend_template_conditions(
    price: pd.DataFrame, ma_periods: list[int], low_buffer: float, high_buffer: float
) -> dict[str, bool]:
    """price: close 컬럼을 포함한 일별 시세 (최신 행이 마지막). 4개 조건의 판정을 반환."""
    close = price["close"]
    ma_short, ma_mid, ma_long = (close.rolling(p).mean() for p in ma_periods)

    current_price = close.iloc[-1]
    low_252 = close.iloc[-252:].min()
    high_252 = close.iloc[-252:].max()

    return {
        "price_above_all_ma": bool(
            current_price > ma_short.iloc[-1] > ma_mid.iloc[-1] > ma_long.iloc[-1]
        ),
        "ma_long_trending_up": bool(ma_long.iloc[-1] > ma_long.iloc[-21]),
        "above_52w_low": bool(current_price >= low_252 * (1 + low_buffer)),
        "near_52w_high": bool(current_price >= high_252 * high_buffer),
    }


def passes_trend_template(conditions: dict[str, bool]) -> bool:
    return all(conditions.values())


def trend_subscore(conditions: dict[str, bool]) -> float:
    """4조건 중 충족한 비율 (0~1). 전부 충족해야 커트라인을 넘기는 게 아니라
    점수표 배점(trend_score)에는 부분 충족도 반영한다."""
    if not conditions:
        return 0.0
    return sum(bool(v) for v in conditions.values()) / len(conditions)
