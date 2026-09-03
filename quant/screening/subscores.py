"""원시 팩터값 -> 0~1 정규화 서브스코어 조합.

score_candidates()가 요구하는 sub_scores DataFrame(columns == score_table.yaml의
weights 키)을 raw 팩터 데이터로부터 만들어낸다.
"""
from __future__ import annotations

import pandas as pd

from factors.momentum import rs_subscore
from factors.quality import quality_subscore
from factors.trend import trend_subscore
from factors.value import value_subscore
from factors.volatility import volatility_subscore

TREND_CONDITION_COLUMNS = [
    "price_above_all_ma",
    "ma_long_trending_up",
    "above_52w_low",
    "near_52w_high",
]


def build_sub_scores(raw: pd.DataFrame, factors_cfg: dict) -> pd.DataFrame:
    """raw: index=ticker, 다음 컬럼을 포함해야 함.

    rs_percentile,
    price_above_all_ma, ma_long_trending_up, above_52w_low, near_52w_high,
    operating_cash_flow, net_income, roic, interest_coverage,
    atr_ratio,
    per, eps_growth_pct

    factors_cfg: config/factors.yaml 로드 결과.
    반환: index=ticker, columns=[rs_score, trend_score, quality_score, volatility_score, value_score]
    (모두 0~1)
    """
    quality_cfg = factors_cfg["quality"]
    volatility_cfg = factors_cfg["volatility"]
    value_cfg = factors_cfg["value"]

    result = pd.DataFrame(index=raw.index)

    result["rs_score"] = raw["rs_percentile"].apply(rs_subscore)

    result["trend_score"] = raw[TREND_CONDITION_COLUMNS].apply(
        lambda row: trend_subscore(row.to_dict()), axis=1
    )

    result["quality_score"] = raw.apply(
        lambda row: quality_subscore(
            row["operating_cash_flow"],
            row["net_income"],
            row["roic"],
            row["interest_coverage"],
            quality_cfg["min_roic"],
            quality_cfg["min_interest_coverage"],
        ),
        axis=1,
    )

    result["volatility_score"] = raw["atr_ratio"].apply(
        lambda ratio: volatility_subscore(
            ratio, volatility_cfg["atr_ratio_min"], volatility_cfg["atr_ratio_max"]
        )
    )

    result["value_score"] = raw.apply(
        lambda row: value_subscore(
            row["per"], row["eps_growth_pct"], tuple(value_cfg["per_band"]), value_cfg["max_peg"]
        ),
        axis=1,
    )

    return result
