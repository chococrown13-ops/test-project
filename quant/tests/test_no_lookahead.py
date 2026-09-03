"""룩어헤드 바이어스 검증 테스트.

핵심 아이디어: as_of 시점에 조회한 재무데이터에는 as_of 이후 공시된 데이터가
절대 섞이면 안 된다. lag_days를 적용하면 공시일 당일 데이터도 아직 보이면 안 된다.
"""
from __future__ import annotations

import pandas as pd
import pytest

from factors.quality import as_of_available_financials


@pytest.fixture
def financials() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": pd.to_datetime(
                ["2025-05-15", "2025-08-14", "2025-11-14", "2026-03-15"]
            ),
            "net_income": [100, 110, 90, 130],
        }
    )


def test_future_report_excluded(financials: pd.DataFrame) -> None:
    as_of = pd.Timestamp("2025-09-01")
    available = as_of_available_financials(financials, as_of, lag_days=0)
    assert available["report_date"].max() <= as_of
    assert len(available) == 2


def test_lag_days_pushes_cutoff_earlier(financials: pd.DataFrame) -> None:
    as_of = pd.Timestamp("2025-08-14")
    available_no_lag = as_of_available_financials(financials, as_of, lag_days=0)
    available_with_lag = as_of_available_financials(financials, as_of, lag_days=60)

    assert (available_no_lag["report_date"] == pd.Timestamp("2025-08-14")).any()
    assert not (available_with_lag["report_date"] == pd.Timestamp("2025-08-14")).any()


def test_no_future_data_ever_leaks(financials: pd.DataFrame) -> None:
    for as_of in pd.date_range("2025-01-01", "2026-06-01", freq="MS"):
        available = as_of_available_financials(financials, as_of, lag_days=60)
        assert (available["report_date"] + pd.Timedelta(days=60) <= as_of).all()
