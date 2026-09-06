"""서브스코어 정규화 함수 테스트 (0~1 매핑이 의도대로 동작하는지)."""
from __future__ import annotations

import pandas as pd
import pytest
import yaml

from factors.momentum import rs_subscore
from factors.quality import quality_subscore
from factors.trend import trend_subscore
from factors.value import value_subscore
from factors.volatility import volatility_subscore
from screening.subscores import build_sub_scores


def test_rs_subscore_clips_to_unit_range() -> None:
    assert rs_subscore(100) == 1.0
    assert rs_subscore(0) == 0.0
    assert rs_subscore(80) == pytest.approx(0.8)


def test_trend_subscore_fraction_of_conditions_met() -> None:
    all_pass = {"a": True, "b": True, "c": True, "d": True}
    half_pass = {"a": True, "b": False, "c": True, "d": False}
    none_pass = {"a": False, "b": False, "c": False, "d": False}

    assert trend_subscore(all_pass) == 1.0
    assert trend_subscore(half_pass) == 0.5
    assert trend_subscore(none_pass) == 0.0
    assert trend_subscore({}) == 0.0


def test_quality_subscore_at_threshold_gives_half_credit() -> None:
    # roic == min_roic, interest_coverage == min_interest_coverage -> 각각 0.5,
    # ocf > net_income -> 1.0 => 평균 (0.5+0.5+1.0)/3
    score = quality_subscore(
        operating_cash_flow=120,
        net_income=100,
        roic=0.10,
        interest_coverage=5,
        min_roic=0.10,
        min_interest_coverage=5,
    )
    assert score == pytest.approx((0.5 + 0.5 + 1.0) / 3)


def test_quality_subscore_double_threshold_gives_full_credit() -> None:
    score = quality_subscore(
        operating_cash_flow=120,
        net_income=100,
        roic=0.20,
        interest_coverage=10,
        min_roic=0.10,
        min_interest_coverage=5,
    )
    assert score == pytest.approx(1.0)


def test_quality_subscore_zero_when_all_fail() -> None:
    score = quality_subscore(
        operating_cash_flow=80,
        net_income=100,
        roic=0.0,
        interest_coverage=0,
        min_roic=0.10,
        min_interest_coverage=5,
    )
    assert score == 0.0


def test_volatility_subscore_peaks_at_range_center() -> None:
    center = volatility_subscore(0.04, min_ratio=0.02, max_ratio=0.06)
    edge = volatility_subscore(0.02, min_ratio=0.02, max_ratio=0.06)
    outside = volatility_subscore(0.10, min_ratio=0.02, max_ratio=0.06)

    assert center == pytest.approx(1.0)
    assert edge == pytest.approx(0.0)
    assert outside == 0.0


def test_value_subscore_outside_band_is_zero() -> None:
    assert value_subscore(per=40, eps_growth_pct=20, per_band=(5, 25), max_peg=2.0) == 0.0


def test_value_subscore_lower_peg_scores_higher() -> None:
    cheap = value_subscore(per=10, eps_growth_pct=20, per_band=(5, 25), max_peg=2.0)
    expensive = value_subscore(per=20, eps_growth_pct=10, per_band=(5, 25), max_peg=2.0)
    assert cheap > expensive
    assert 0.0 <= expensive <= 1.0


@pytest.fixture
def factors_cfg() -> dict:
    with open("config/factors.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_build_sub_scores_produces_expected_columns(factors_cfg: dict) -> None:
    raw = pd.DataFrame(
        {
            "rs_percentile": [95, 40],
            "price_above_all_ma": [True, False],
            "ma_long_trending_up": [True, False],
            "above_52w_low": [True, True],
            "near_52w_high": [True, False],
            "operating_cash_flow": [150, 80],
            "net_income": [100, 100],
            "roic": [0.25, 0.05],
            "interest_coverage": [12, 2],
            "atr_ratio": [0.04, 0.15],
            "per": [12, 40],
            "eps_growth_pct": [25, 5],
        },
        index=["AAA", "BBB"],
    )

    sub_scores = build_sub_scores(raw, factors_cfg)

    assert list(sub_scores.columns) == [
        "rs_score",
        "trend_score",
        "quality_score",
        "volatility_score",
        "value_score",
    ]
    assert (sub_scores >= 0).all().all()
    assert (sub_scores <= 1).all().all()
    # AAA는 전 항목에서 BBB보다 우월한 조건이므로 모든 서브스코어가 더 높아야 함
    assert (sub_scores.loc["AAA"] >= sub_scores.loc["BBB"]).all()
