"""2단계: RS 점수 계산 + 상위 percentile 필터."""
from __future__ import annotations

import pandas as pd

from factors.momentum import compute_rs_percentile


def filter_by_rs(
    universe: pd.DataFrame, rs_raw_scores: pd.Series, percentile_cutoff: float
) -> pd.DataFrame:
    """universe: filter_universe()의 출력. index(ticker)가 rs_raw_scores와 일치해야 함."""
    percentiles = compute_rs_percentile(rs_raw_scores)
    result = universe.copy()
    result["rs_percentile"] = percentiles
    threshold = percentile_cutoff * 100
    return result[result["rs_percentile"] >= threshold]
