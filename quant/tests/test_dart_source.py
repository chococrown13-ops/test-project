"""DartFundamentalSource 테스트. 실제 네트워크 호출 없이 fake session/zip으로 검증한다."""
from __future__ import annotations

import io
import zipfile
from datetime import date

import pandas as pd
import pytest

from data.sources.base import FundamentalDataSource
from data.sources.dart import DartApiError, DartEnv, DartFundamentalSource, _parse_amount, _report_date_from_rcept_no


class FakeResponse:
    def __init__(self, json_data: dict | None = None, content: bytes | None = None, status_code: int = 200) -> None:
        self._json = json_data
        self.content = content or b""
        self.status_code = status_code
        self.ok = 200 <= status_code < 300

    def json(self) -> dict:
        return self._json or {}


class FakeSession:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self._get_queue: list[FakeResponse] = []

    def queue_get(self, response: FakeResponse) -> None:
        self._get_queue.append(response)

    def get(self, url: str, params: dict | None = None, timeout: float | None = None) -> FakeResponse:
        self.calls.append((url, params or {}))
        return self._get_queue.pop(0)


@pytest.fixture
def env() -> DartEnv:
    return DartEnv(api_key="test-key")


@pytest.fixture
def session() -> FakeSession:
    return FakeSession()


def _make_corp_code_zip() -> bytes:
    xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<result>
  <list><corp_code>00126380</corp_code><corp_name>\xec\x82\xbc\xec\x84\xb1\xec\xa0\x84\xec\x9e\x90</corp_name><stock_code>005930</stock_code><modify_date>20250101</modify_date></list>
  <list><corp_code>00164779</corp_code><corp_name>\xeb\xb9\x84\xec\x83\x81\xec\x9e\xa5</corp_name><stock_code> </stock_code><modify_date>20250101</modify_date></list>
</result>"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("CORPCODE.xml", xml)
    return buf.getvalue()


def test_is_fundamental_data_source(env: DartEnv, session: FakeSession) -> None:
    assert isinstance(DartFundamentalSource(env, session), FundamentalDataSource)


def test_parse_amount_handles_commas_and_parens_and_missing() -> None:
    assert _parse_amount("1,234,567") == 1234567.0
    assert _parse_amount("(1,234)") == -1234.0
    assert _parse_amount("-") is None
    assert _parse_amount(None) is None
    assert _parse_amount("abc") is None


def test_report_date_from_rcept_no() -> None:
    assert _report_date_from_rcept_no("20250515000123") == date(2025, 5, 15)


def test_get_raises_when_not_configured(session: FakeSession) -> None:
    source = DartFundamentalSource(DartEnv(), session)
    with pytest.raises(DartApiError, match="미설정"):
        source.fetch_financial_statement("00126380", "2024", "11011")


def test_get_raises_on_error_status(env: DartEnv, session: FakeSession) -> None:
    session.queue_get(FakeResponse({"status": "100", "message": "인증키가 유효하지 않습니다"}))
    source = DartFundamentalSource(env, session)
    with pytest.raises(DartApiError, match="인증키가 유효하지 않습니다"):
        source.fetch_financial_statement("00126380", "2024", "11011")


def test_no_data_status_returns_empty_list(env: DartEnv, session: FakeSession) -> None:
    session.queue_get(FakeResponse({"status": "013", "message": "조회된 데이타가 없습니다"}))
    source = DartFundamentalSource(env, session)
    result = source.fetch_financial_statement("00126380", "2024", "11011")
    assert result == []


def test_resolve_corp_code_downloads_and_caches(env: DartEnv, session: FakeSession, tmp_path) -> None:
    session.queue_get(FakeResponse(content=_make_corp_code_zip()))
    cache_path = tmp_path / "corp_codes.json"
    source = DartFundamentalSource(env, session, corp_code_cache_path=cache_path)

    corp_code = source.resolve_corp_code("005930")
    assert corp_code == "00126380"
    assert cache_path.exists()

    # 두 번째 조회는 캐시를 쓰므로 추가 GET이 없어야 함
    source2 = DartFundamentalSource(env, session, corp_code_cache_path=cache_path)
    assert source2.resolve_corp_code("005930") == "00126380"
    assert len(session.calls) == 1


def test_resolve_corp_code_unknown_stock_raises(env: DartEnv, session: FakeSession, tmp_path) -> None:
    session.queue_get(FakeResponse(content=_make_corp_code_zip()))
    source = DartFundamentalSource(env, session, corp_code_cache_path=tmp_path / "corp_codes.json")
    with pytest.raises(DartApiError, match="찾을 수 없습니다"):
        source.resolve_corp_code("999999")


def _sample_items(rcept_no: str = "20250515000123") -> list[dict]:
    return [
        {"rcept_no": rcept_no, "sj_div": "IS", "account_nm": "영업이익", "thstrm_amount": "1,000", "frmtrm_amount": "800"},
        {"rcept_no": rcept_no, "sj_div": "IS", "account_nm": "당기순이익", "thstrm_amount": "800", "frmtrm_amount": "600"},
        {"rcept_no": rcept_no, "sj_div": "IS", "account_nm": "법인세비용차감전순이익", "thstrm_amount": "1,000", "frmtrm_amount": "750"},
        {"rcept_no": rcept_no, "sj_div": "IS", "account_nm": "법인세비용", "thstrm_amount": "200", "frmtrm_amount": "150"},
        {"rcept_no": rcept_no, "sj_div": "IS", "account_nm": "이자비용", "thstrm_amount": "50", "frmtrm_amount": "40"},
        {"rcept_no": rcept_no, "sj_div": "CF", "account_nm": "영업활동으로인한현금흐름", "thstrm_amount": "900", "frmtrm_amount": "700"},
        {"rcept_no": rcept_no, "sj_div": "BS", "account_nm": "자산총계", "thstrm_amount": "10,000", "frmtrm_amount": "9,000"},
        {"rcept_no": rcept_no, "sj_div": "BS", "account_nm": "유동부채", "thstrm_amount": "3,000", "frmtrm_amount": "2,500"},
    ]


def test_debug_list_accounts() -> None:
    source = DartFundamentalSource(DartEnv(api_key="k"))
    pairs = source.debug_list_accounts(_sample_items())
    assert ("IS", "영업이익") in pairs
    assert ("CF", "영업활동으로인한현금흐름") in pairs


def test_parse_report_extracts_all_fields() -> None:
    source = DartFundamentalSource(DartEnv(api_key="k"))
    parsed = source._parse_report(_sample_items(), date(2025, 5, 15))

    assert parsed["operating_income"] == 1000.0
    assert parsed["net_income"] == 800.0
    assert parsed["operating_cash_flow"] == 900.0
    assert parsed["interest_expense"] == 50.0
    assert parsed["invested_capital"] == 10000.0 - 3000.0
    assert parsed["tax_rate"] == pytest.approx(200.0 / 1000.0)
    # eps_growth_pct_proxy = (800-600)/600*100
    assert parsed["eps_growth_pct_proxy"] == pytest.approx((800.0 - 600.0) / 600.0 * 100)


def test_parse_report_returns_none_when_core_fields_missing() -> None:
    source = DartFundamentalSource(DartEnv(api_key="k"))
    items = [{"rcept_no": "20250515000123", "sj_div": "BS", "account_nm": "자산총계", "thstrm_amount": "1,000"}]
    assert source._parse_report(items, date(2025, 5, 15)) is None


def test_parse_report_falls_back_to_default_tax_rate_when_missing() -> None:
    source = DartFundamentalSource(DartEnv(api_key="k"))
    items = [
        {"rcept_no": "x", "sj_div": "IS", "account_nm": "영업이익", "thstrm_amount": "1,000"},
        {"rcept_no": "x", "sj_div": "IS", "account_nm": "당기순이익", "thstrm_amount": "800"},
    ]
    parsed = source._parse_report(items, date(2025, 5, 15))
    assert parsed["tax_rate"] == pytest.approx(0.22)
    assert parsed["invested_capital"] is None
    assert parsed["eps_growth_pct_proxy"] is None


def test_get_financials_filters_to_date_range_and_sorts(env: DartEnv, session: FakeSession, tmp_path) -> None:
    # corp_code 조회 1회 + REPORT_CODES(4개) x 2개 연도 = 8회 재무제표 조회
    session.queue_get(FakeResponse(content=_make_corp_code_zip()))
    for i in range(8):
        rcept_no = f"2024{(i % 12) + 1:02d}15000{i:03d}"
        session.queue_get(FakeResponse({"status": "000", "list": _sample_items(rcept_no)}))

    source = DartFundamentalSource(env, session, corp_code_cache_path=tmp_path / "corp_codes.json")
    df = source.get_financials("005930", date(2024, 1, 1), date(2025, 12, 31))

    assert not df.empty
    assert list(df.columns) == [
        "report_date", "operating_income", "net_income", "operating_cash_flow",
        "interest_expense", "invested_capital", "tax_rate", "eps_growth_pct_proxy",
    ]
    assert df["report_date"].is_monotonic_increasing


def test_get_financials_skips_failed_years(env: DartEnv, session: FakeSession, tmp_path) -> None:
    session.queue_get(FakeResponse(content=_make_corp_code_zip()))
    # 모든 재무제표 조회가 "조회된 데이터 없음" 상태를 반환
    for _ in range(8):
        session.queue_get(FakeResponse({"status": "013", "list": []}))

    source = DartFundamentalSource(env, session, corp_code_cache_path=tmp_path / "corp_codes.json")
    df = source.get_financials("005930", date(2024, 1, 1), date(2025, 12, 31))
    assert df.empty
