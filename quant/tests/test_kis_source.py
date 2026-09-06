"""KisPriceSource 테스트. 실제 네트워크 호출 없이 fake session으로 검증한다."""
from __future__ import annotations

from datetime import date

import pytest

from data.sources.base import PriceDataSource
from data.sources.kis import KisApiError, KisEnv, KisPriceSource


class FakeResponse:
    def __init__(self, json_data: dict, status_code: int = 200) -> None:
        self._json = json_data
        self.status_code = status_code
        self.ok = 200 <= status_code < 300

    def json(self) -> dict:
        return self._json


class FakeSession:
    """호출 순서대로 미리 큐에 넣어둔 응답을 돌려주는 가짜 requests.Session."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict]] = []
        self._get_queue: list[FakeResponse] = []
        self._post_queue: list[FakeResponse] = []

    def queue_get(self, response: FakeResponse) -> None:
        self._get_queue.append(response)

    def queue_post(self, response: FakeResponse) -> None:
        self._post_queue.append(response)

    def post(self, url: str, json: dict | None = None, timeout: float | None = None) -> FakeResponse:
        self.calls.append(("POST", url, json or {}))
        return self._post_queue.pop(0)

    def get(self, url: str, params: dict | None = None, headers: dict | None = None, timeout: float | None = None) -> FakeResponse:
        self.calls.append(("GET", url, params or {}))
        return self._get_queue.pop(0)


TOKEN_OK = FakeResponse({"access_token": "tok-123", "expires_in": 86400})


@pytest.fixture
def env() -> KisEnv:
    return KisEnv(app_key="key", app_secret="secret", account_no="12345678", env="real")


@pytest.fixture
def session() -> FakeSession:
    return FakeSession()


def test_is_price_data_source(env: KisEnv, session: FakeSession) -> None:
    assert isinstance(KisPriceSource(env, session), PriceDataSource)


def test_get_raises_when_not_configured(session: FakeSession) -> None:
    source = KisPriceSource(KisEnv(), session)
    with pytest.raises(KisApiError, match="미설정"):
        source.fetch_stock_quote("005930")


def test_token_is_cached_across_calls(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    session.queue_get(FakeResponse({"rt_cd": "0", "output": {"stck_prpr": "70000"}}))
    session.queue_get(FakeResponse({"rt_cd": "0", "output": {"stck_prpr": "71000"}}))

    source = KisPriceSource(env, session)
    source.fetch_stock_quote("005930")
    source.fetch_stock_quote("005930")

    post_calls = [c for c in session.calls if c[0] == "POST"]
    assert len(post_calls) == 1  # 두 번째 조회는 캐시된 토큰을 재사용


def test_token_error_raises_kis_api_error(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(FakeResponse({"error_description": "invalid appkey"}, status_code=401))
    source = KisPriceSource(env, session)
    with pytest.raises(KisApiError, match="invalid appkey"):
        source.fetch_stock_quote("005930")


def test_api_error_when_rt_cd_not_zero(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    session.queue_get(FakeResponse({"rt_cd": "1", "msg1": "조회할 자료가 없습니다"}))
    source = KisPriceSource(env, session)
    with pytest.raises(KisApiError, match="조회할 자료가 없습니다"):
        source.fetch_stock_quote("005930")


def test_fetch_stock_quote_parses_fields(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    session.queue_get(
        FakeResponse(
            {
                "rt_cd": "0",
                "output": {
                    "stck_prpr": "70000",
                    "prdy_ctrt": "1.5",
                    "per": "12.3",
                    "pbr": "1.1",
                    "eps": "5000",
                    "bps": "60000",
                    "hts_avls": "4000000",
                    "w52_hgpr": "85000",
                    "w52_lwpr": "55000",
                },
            }
        )
    )
    source = KisPriceSource(env, session)
    quote = source.fetch_stock_quote("005930")
    assert quote == {
        "code": "005930",
        "price": 70000.0,
        "change_rate": 1.5,
        "per": 12.3,
        "pbr": 1.1,
        "eps": 5000.0,
        "bps": 60000.0,
        "market_cap_eok": 4000000.0,
        "week52_high": 85000.0,
        "week52_low": 55000.0,
    }


def test_fetch_stock_quote_missing_code_raises(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    session.queue_get(FakeResponse({"rt_cd": "0", "output": {}}))
    source = KisPriceSource(env, session)
    with pytest.raises(KisApiError, match="종목코드를 찾을 수 없습니다"):
        source.fetch_stock_quote("999999")


def test_get_ohlcv_chunks_multiple_calls_and_concatenates(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    # 200일 구간(2024-12-01 ~ 2025-06-19) -> MAX_BARS_PER_CALL_DAYS(95일)로 나누면 3번 호출됨
    session.queue_get(
        FakeResponse(
            {
                "rt_cd": "0",
                "output2": [
                    {"stck_bsop_date": "20250619", "stck_oprc": "100", "stck_hgpr": "110", "stck_lwpr": "95", "stck_clpr": "105", "acml_vol": "1000"},
                ],
            }
        )
    )
    session.queue_get(
        FakeResponse(
            {
                "rt_cd": "0",
                "output2": [
                    {"stck_bsop_date": "20250301", "stck_oprc": "90", "stck_hgpr": "95", "stck_lwpr": "85", "stck_clpr": "92", "acml_vol": "800"},
                ],
            }
        )
    )
    session.queue_get(
        FakeResponse(
            {
                "rt_cd": "0",
                "output2": [
                    {"stck_bsop_date": "20241201", "stck_oprc": "80", "stck_hgpr": "85", "stck_lwpr": "75", "stck_clpr": "82", "acml_vol": "700"},
                ],
            }
        )
    )

    source = KisPriceSource(env, session)
    df = source.get_ohlcv("005930", date(2024, 12, 1), date(2025, 6, 19), pacing_seconds=0)

    get_calls = [c for c in session.calls if c[0] == "GET"]
    assert len(get_calls) == 3
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert len(df) == 3
    assert df.index.is_monotonic_increasing


def test_get_ohlcv_empty_result_returns_empty_frame(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    for _ in range(3):
        session.queue_get(FakeResponse({"rt_cd": "0", "output2": []}))
    source = KisPriceSource(env, session)
    df = source.get_ohlcv("005930", date(2024, 12, 1), date(2025, 6, 19), pacing_seconds=0)
    assert df.empty
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]


def test_get_universe_raises_for_past_date(env: KisEnv, session: FakeSession) -> None:
    source = KisPriceSource(env, session)
    with pytest.raises(NotImplementedError, match="과거 시점"):
        source.get_universe(date(2023, 1, 1))


def test_get_universe_today_calls_market_cap_universe(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    for _ in range(12):  # kospi+kosdaq x 6 price bands
        session.queue_get(
            FakeResponse(
                {
                    "rt_cd": "0",
                    "output": [
                        {"mksc_shrn_iscd": "005930", "hts_kor_isnm": "삼성전자", "stck_prpr": "70000", "prdy_ctrt": "1", "acml_vol": "100", "stck_avls": "4000000"},
                    ],
                }
            )
        )
    source = KisPriceSource(env, session)
    codes = source.get_universe(date.today(), pacing_seconds=0)
    assert codes == ["005930"]


def test_fetch_market_cap_universe_dedups_and_filters(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    rows_per_call = [
        [{"mksc_shrn_iscd": "005930", "hts_kor_isnm": "삼성전자", "stck_prpr": "70000", "prdy_ctrt": "1", "acml_vol": "100", "stck_avls": "4000000"}],
        [{"mksc_shrn_iscd": "005930", "hts_kor_isnm": "삼성전자", "stck_prpr": "70000", "prdy_ctrt": "1", "acml_vol": "100", "stck_avls": "4000000"}],
        [{"mksc_shrn_iscd": "000660", "hts_kor_isnm": "SK하이닉스", "stck_prpr": "150000", "prdy_ctrt": "2", "acml_vol": "50", "stck_avls": "500"}],
    ] + [[] for _ in range(9)]
    for rows in rows_per_call:
        session.queue_get(FakeResponse({"rt_cd": "0", "output": rows}))

    source = KisPriceSource(env, session)
    universe = source.fetch_market_cap_universe(min_market_cap_eok=1000, market="all", pacing_seconds=0)

    # 000660은 시총 500억으로 min_market_cap_eok(1000억) 미달이라 제외, 005930은 중복 제거되어 1건만 남음
    assert [row["code"] for row in universe] == ["005930"]


def test_fetch_investor_net_flow_20d_sums_last_20(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    rows = [{"frgn_ntby_qty": str(100 + i), "orgn_ntby_qty": str(-50 + i)} for i in range(30)]
    session.queue_get(FakeResponse({"rt_cd": "0", "output2": rows}))

    source = KisPriceSource(env, session)
    flow = source.fetch_investor_net_flow_20d("005930")

    expected_foreign = sum(100 + i for i in range(20))
    expected_inst = sum(-50 + i for i in range(20))
    assert flow == {"foreign_net_20": float(expected_foreign), "inst_net_20": float(expected_inst)}


def test_fetch_volume_rank_limits_count(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    rows = [
        {"mksc_shrn_iscd": f"{i:06d}", "hts_kor_isnm": f"종목{i}", "stck_prpr": "1000", "prdy_ctrt": "1", "acml_vol": "10"}
        for i in range(20)
    ]
    session.queue_get(FakeResponse({"rt_cd": "0", "output": rows}))

    source = KisPriceSource(env, session)
    ranked = source.fetch_volume_rank(count=5)
    assert len(ranked) == 5


def test_fetch_daily_bars_many_marks_failed_codes_as_none(env: KisEnv, session: FakeSession) -> None:
    session.queue_post(TOKEN_OK)
    # AAA: 성공 (구간 1번 호출로 충분한 짧은 범위)
    session.queue_get(FakeResponse({"rt_cd": "0", "output2": [{"stck_bsop_date": "20250301", "stck_oprc": "1", "stck_hgpr": "1", "stck_lwpr": "1", "stck_clpr": "1", "acml_vol": "1"}]}))
    # BBB: 3번 재시도 모두 실패
    for _ in range(3):
        session.queue_get(FakeResponse({"rt_cd": "1", "msg1": "실패"}))

    source = KisPriceSource(env, session)
    result = source.fetch_daily_bars_many(["AAA", "BBB"], date(2025, 3, 1), date(2025, 3, 1), pacing_seconds=0, retries=3)

    assert result["AAA"] is not None and not result["AAA"].empty
    assert result["BBB"] is None
