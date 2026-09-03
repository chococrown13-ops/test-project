"""pipeline/run_screening.py 테스트.

전체 파이프라인 통합 테스트는 실제 KIS HTTP 세션이 아니라, KisPriceSource와 같은
메서드 이름을 가진 스텁(StubKisSource)을 주입해서 검증한다 — HTTP 레벨(토큰/재시도/
청크 분할)은 tests/test_kis_source.py가 이미 검증하므로, 여기서는 파이프라인 배선
(유니버스->RS->트렌드->채점 순서와 KIS 데이터 공백 처리)만 확인하면 충분하다.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
import yaml

import pipeline.run_screening as run_screening
from data.sources.kis import KisEnv, KisPriceSource
from pipeline.run_screening import _build_raw_metrics, _kis_market_param, run


def test_kis_market_param_mapping() -> None:
    assert _kis_market_param(["KOSPI"]) == "kospi"
    assert _kis_market_param(["KOSDAQ"]) == "kosdaq"
    assert _kis_market_param(["KOSPI", "KOSDAQ"]) == "all"


def test_run_rejects_non_today_date() -> None:
    with pytest.raises(ValueError, match="오늘"):
        run(date(2020, 1, 1))


def test_run_requires_configured_source() -> None:
    unconfigured = KisPriceSource(KisEnv())  # 앱키 등 없음
    with pytest.raises(RuntimeError, match="설정되지 않았습니다"):
        run(date.today(), source=unconfigured)


def _uptrend_bars(n: int = 300) -> pd.DataFrame:
    close = np.linspace(80, 150, n) + np.random.default_rng(0).normal(0, 0.5, n)
    return pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": np.full(n, 1000.0)}
    )


def _downtrend_bars(n: int = 300) -> pd.DataFrame:
    close = np.linspace(150, 80, n)
    return pd.DataFrame(
        {"open": close, "high": close + 1, "low": close - 1, "close": close, "volume": np.full(n, 1000.0)}
    )


class StubKisSource:
    """KisPriceSource와 같은 메서드 이름만 흉내내는 테스트 전용 스텁 (HTTP 없음)."""

    def __init__(self, pool: list[dict], bars: dict[str, pd.DataFrame]) -> None:
        self.env = SimpleNamespace(configured=True)
        self._pool = pool
        self._bars = bars

    def fetch_market_cap_universe(self, min_market_cap_eok: float, market: str = "all") -> list[dict]:
        return [row for row in self._pool if row["market_cap_eok"] >= min_market_cap_eok]

    def fetch_daily_bars_many(self, codes: list[str], start, end, **kwargs) -> dict:
        return {code: self._bars.get(code) for code in codes}

    def fetch_stock_quote(self, code: str) -> dict:
        return {"per": 15.0}


@pytest.fixture
def loose_config_dir(tmp_path, monkeypatch):
    """임계값을 낮춘 테스트 전용 config를 만들고 run_screening.CONFIG_DIR을 거기로 돌린다."""
    config_dir = tmp_path / "config"
    config_dir.mkdir()

    (config_dir / "universe.yaml").write_text(
        yaml.dump({"market": ["KOSPI", "KOSDAQ"], "min_market_cap": 0, "min_avg_trading_value_20d": 0, "min_price": 0}),
        encoding="utf-8",
    )
    (config_dir / "factors.yaml").write_text(
        yaml.dump(
            {
                "momentum": {"lookback_months": [1, 2, 3], "weights": [0.4, 0.35, 0.25], "universe_percentile_cutoff": 0.0},
                "trend_template": {"ma_periods": [5, 10, 20], "low_252d_buffer": 0.30, "high_252d_buffer": 0.75},
                "volatility": {"atr_period": 14, "atr_ratio_min": 0.0, "atr_ratio_max": 1.0},
                "quality": {"min_roic": 0.10, "ocf_gt_net_income": True, "min_interest_coverage": 5},
                "value": {"per_band": [0, 999999], "max_peg": 2.0},
            }
        ),
        encoding="utf-8",
    )
    (config_dir / "score_table.yaml").write_text(
        yaml.dump(
            {
                "cutoff": 10,
                "weights": {"rs_score": 25, "trend_score": 25, "quality_score": 25, "volatility_score": 15, "value_score": 10},
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(run_screening, "CONFIG_DIR", config_dir)
    return config_dir


def test_run_end_to_end_excludes_downtrend_and_scores_uptrend(loose_config_dir) -> None:
    pool = [
        {"code": "GOOD", "name": "good corp", "price": 150.0, "change_rate": 1.0, "volume": 1000.0, "market_cap_eok": 1000.0},
        {"code": "BAD", "name": "bad corp", "price": 80.0, "change_rate": -1.0, "volume": 1000.0, "market_cap_eok": 1000.0},
    ]
    bars = {"GOOD": _uptrend_bars(), "BAD": _downtrend_bars()}
    source = StubKisSource(pool, bars)

    result = run(date.today(), source=source)

    assert result.index.tolist() == ["GOOD"]  # BAD는 트렌드 템플릿에서 탈락
    assert result.loc["GOOD", "total_score"] >= 10  # cutoff
    assert result.loc["GOOD", "total_score"] <= 65  # rs(25)+trend(25)+vol(15) 상한, quality/value는 0점 처리


def test_build_raw_metrics_zeroes_out_kis_unavailable_fields() -> None:
    factors_cfg = {
        "trend_template": {"ma_periods": [5, 10, 20], "low_252d_buffer": 0.30, "high_252d_buffer": 0.75},
        "volatility": {"atr_period": 14},
    }
    bars = _uptrend_bars()
    survivors = pd.DataFrame({"rs_percentile": [90.0]}, index=["GOOD"])
    source = StubKisSource(pool=[], bars={"GOOD": bars})

    raw = _build_raw_metrics(source, survivors, {"GOOD": bars}, factors_cfg)

    assert raw.loc["GOOD", "operating_cash_flow"] == 0.0
    assert raw.loc["GOOD", "net_income"] == 0.0
    assert raw.loc["GOOD", "roic"] == 0.0
    assert raw.loc["GOOD", "interest_coverage"] == 0.0
    assert raw.loc["GOOD", "eps_growth_pct"] == 0.0
    assert raw.loc["GOOD", "per"] == 15.0  # StubKisSource.fetch_stock_quote 값
    assert raw.loc["GOOD", "rs_percentile"] == 90.0
    assert raw.loc["GOOD", "atr_ratio"] > 0
