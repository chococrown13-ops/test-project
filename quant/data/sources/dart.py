"""OpenDART(전자공시시스템 Open API) 클라이언트 — 재무제표 원본 조회 (읽기 전용).

비밀값은 코드에 두지 않는다. 환경변수로 주입한다 (DartEnv.from_env()):
    DART_API_KEY — https://opendart.fss.or.kr 가입 → "인증키 신청/관리"에서 즉시 발급

factors/quality.py가 요구하는 ROIC/OCF/이자보상배율과 value_subscore의 PEG 계산에 필요한
EPS 성장률(근사치)을 채우기 위한 소스다. KIS API에는 없는 재무제표 원본(영업이익·투하자본·
OCF·이자비용)이 여기서 나온다 — CLAUDE.md의 "데이터 소스: KIS vs pykrx" 표 참고.

⚠️ 계정명 매칭 미검증: ACCOUNT_CANDIDATES의 한국어 계정명 후보는 DART 공식 API 문서와
일반적인 IFRS 표준계정명을 근거로 작성했지만, 실제 발급된 API 키로 호출해 검증하지는
못했다 (이 작업 환경에는 DART_API_KEY가 없음). 회사·업종·연도에 따라 계정명 표기가
달라질 수 있으므로, 실제 연동 후 quality_score가 비정상적으로 0에 몰려 있다면 이
후보 목록부터 의심할 것 — debug_list_accounts()로 실제 응답의 (sj_div, account_nm)을
확인해 후보를 보정하면 된다.

이 소스는 "있으면 쓰고 없으면 0 처리"로 설계했다. DART_API_KEY가 없거나 특정 종목의
조회가 실패해도 파이프라인 전체가 죽지 않고, 그 종목의 quality_score/value_score만
기존(KIS 전용) 동작과 동일하게 0으로 떨어진다 — pipeline/run_screening.py 참고.
"""
from __future__ import annotations

import io
import json
import os
import time
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pandas as pd
import requests

from .base import FundamentalDataSource

BASE_URL = "https://opendart.fss.or.kr/api"
CORP_CODE_CACHE_PATH = Path(__file__).parent.parent / "cache" / "dart_corp_codes.json"
CORP_CODE_CACHE_MAX_AGE_DAYS = 7

# 1분기보고서 / 반기보고서 / 3분기보고서 / 사업보고서(연간)
REPORT_CODES: list[str] = ["11013", "11012", "11014", "11011"]

# 재무 개념 -> (검색할 sj_div들, account_nm 후보들). sj_div: BS=재무상태표, IS=손익계산서,
# CIS=포괄손익계산서, CF=현금흐름표. 모듈 docstring의 미검증 경고 참고.
ACCOUNT_CANDIDATES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "operating_income": (("IS", "CIS"), ("영업이익", "영업이익(손실)")),
    "net_income": (
        ("IS", "CIS"),
        ("당기순이익", "당기순이익(손실)", "분기순이익(손실)", "반기순이익(손실)", "당기순이익(손실)"),
    ),
    "pretax_income": (
        ("IS", "CIS"),
        ("법인세비용차감전순이익(손실)", "법인세비용차감전순이익", "법인세차감전순이익(손실)"),
    ),
    "tax_expense": (("IS", "CIS"), ("법인세비용", "법인세비용(수익)")),
    # "이자비용"은 본표에 없고 주석에만 나오는 경우가 많아(fnlttSinglAcntAll.json은 주석 미포함)
    # 실제 API 응답 확인 결과(삼성전자/SK하이닉스) "금융비용"으로 fallback. 금융비용은 이자비용보다
    # 넓은 개념(외환손실 등 포함)이라 이자보상배율이 실제보다 보수적으로 나올 수 있는 근사치다.
    "interest_expense": (("IS", "CIS"), ("이자비용", "금융비용")),
    "operating_cash_flow": (
        ("CF",),
        ("영업활동으로인한현금흐름", "영업활동현금흐름", "영업활동으로 인한 현금흐름"),
    ),
    "total_assets": (("BS",), ("자산총계",)),
    "current_liabilities": (("BS",), ("유동부채", "유동부채총계")),
}

# 실효세율을 직접 계산 못할 때의 fallback (한국 법인세 실효세율 근사치)
DEFAULT_TAX_RATE = 0.22


class DartApiError(Exception):
    """DART API가 오류를 반환했거나(status != "000"), 인증/설정이 누락된 경우."""


@dataclass
class DartEnv:
    api_key: str | None = None

    @classmethod
    def from_env(cls) -> "DartEnv":
        return cls(api_key=os.environ.get("DART_API_KEY"))

    @property
    def configured(self) -> bool:
        return bool(self.api_key)


def _parse_amount(raw: str | None) -> float | None:
    """DART 금액 문자열("1,234,567", "(1,234)"=음수, "-"=값 없음)을 float로."""
    if raw is None:
        return None
    text = raw.strip().replace(",", "")
    if text in ("", "-"):
        return None
    negative = text.startswith("(") and text.endswith(")")
    if negative:
        text = text[1:-1]
    try:
        value = float(text)
    except ValueError:
        return None
    return -value if negative else value


def _report_date_from_rcept_no(rcept_no: str) -> date:
    """rcept_no(접수번호)는 YYYYMMDD + 일련번호 형식 — 앞 8자리가 실제 공시 접수일이다."""
    return date(int(rcept_no[:4]), int(rcept_no[4:6]), int(rcept_no[6:8]))


class DartFundamentalSource(FundamentalDataSource):
    """OpenDART 기반 재무제표 소스.

    get_financials()가 factors/quality.py::as_of_available_financials()가 바로 소비할 수 있는
    report_date 컬럼 포함 DataFrame을 반환한다 — 룩어헤드 방지 체인에 그대로 연결된다.
    """

    def __init__(
        self,
        env: DartEnv | None = None,
        session: requests.Session | None = None,
        corp_code_cache_path: Path = CORP_CODE_CACHE_PATH,
    ) -> None:
        self.env = env or DartEnv.from_env()
        self.session = session or requests.Session()
        self.corp_code_cache_path = corp_code_cache_path
        self._corp_codes: dict[str, str] | None = None

    def _get(self, path: str, params: dict[str, str]) -> dict:
        if not self.env.configured:
            raise DartApiError("DART_API_KEY 미설정")
        response = self.session.get(f"{BASE_URL}/{path}", params={**params, "crtfc_key": self.env.api_key}, timeout=15)
        data = response.json() if callable(getattr(response, "json", None)) else {}
        status = data.get("status")
        if status != "000":
            if status == "013":  # "조회된 데이터가 없습니다" — 오류가 아니라 빈 결과
                return {"status": status, "list": []}
            raise DartApiError(data.get("message") or f"조회 실패 (status={status})")
        return data

    # ── 종목코드 -> corp_code ─────────────────────────

    def _load_corp_codes(self) -> dict[str, str]:
        if self._corp_codes is not None:
            return self._corp_codes

        if self.corp_code_cache_path.exists():
            age_days = (time.time() - self.corp_code_cache_path.stat().st_mtime) / 86400
            if age_days < CORP_CODE_CACHE_MAX_AGE_DAYS:
                self._corp_codes = json.loads(self.corp_code_cache_path.read_text(encoding="utf-8"))
                return self._corp_codes

        if not self.env.configured:
            raise DartApiError("DART_API_KEY 미설정")

        response = self.session.get(f"{BASE_URL}/corpCode.xml", params={"crtfc_key": self.env.api_key}, timeout=30)
        content = response.content if hasattr(response, "content") else b""
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            xml_bytes = zf.read("CORPCODE.xml")

        root = ET.fromstring(xml_bytes)
        mapping: dict[str, str] = {}
        for item in root.iter("list"):
            stock_code = (item.findtext("stock_code") or "").strip()
            corp_code = (item.findtext("corp_code") or "").strip()
            if stock_code:
                mapping[stock_code] = corp_code

        self.corp_code_cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.corp_code_cache_path.write_text(json.dumps(mapping, ensure_ascii=False), encoding="utf-8")
        self._corp_codes = mapping
        return mapping

    def resolve_corp_code(self, stock_code: str) -> str:
        mapping = self._load_corp_codes()
        corp_code = mapping.get(stock_code)
        if not corp_code:
            raise DartApiError(f"종목코드 {stock_code}에 대응하는 DART corp_code를 찾을 수 없습니다")
        return corp_code

    # ── 재무제표 ─────────────────────────────────────

    def fetch_financial_statement(
        self, corp_code: str, bsns_year: str, reprt_code: str, fs_div: str = "CFS"
    ) -> list[dict]:
        """단일회사 전체 재무제표[fnlttSinglAcntAll.json] 원본 계정 목록."""
        data = self._get(
            "fnlttSinglAcntAll.json",
            {"corp_code": corp_code, "bsns_year": bsns_year, "reprt_code": reprt_code, "fs_div": fs_div},
        )
        return data.get("list") or []

    def debug_list_accounts(self, items: list[dict]) -> list[tuple[str, str]]:
        """(sj_div, account_nm) 쌍 목록. ACCOUNT_CANDIDATES 보정용 — 모듈 docstring 참고."""
        return sorted({(item.get("sj_div", ""), item.get("account_nm", "")) for item in items})

    def _extract(self, items: list[dict], concept: str, field: str = "thstrm_amount") -> float | None:
        sj_divs, names = ACCOUNT_CANDIDATES[concept]
        for item in items:
            if item.get("sj_div") in sj_divs and (item.get("account_nm") or "").strip() in names:
                value = _parse_amount(item.get(field))
                if value is not None:
                    return value
        return None

    def _parse_report(self, items: list[dict], report_date: date) -> dict | None:
        operating_income = self._extract(items, "operating_income")
        net_income = self._extract(items, "net_income")
        # 핵심 두 항목이 아예 안 잡히면 이 보고서는 통째로 버린다 — 절반만 채워진 값으로
        # 넘기면 "진짜 0"인지 "계정명을 못 찾아서 결측"인지 구분이 안 된다.
        if operating_income is None or net_income is None:
            return None

        ocf = self._extract(items, "operating_cash_flow")
        interest_expense = self._extract(items, "interest_expense")
        total_assets = self._extract(items, "total_assets")
        current_liabilities = self._extract(items, "current_liabilities")
        pretax_income = self._extract(items, "pretax_income")
        tax_expense = self._extract(items, "tax_expense")
        prior_net_income = self._extract(items, "net_income", field="frmtrm_amount")

        invested_capital = (
            total_assets - current_liabilities
            if total_assets is not None and current_liabilities is not None
            else None
        )
        tax_rate = (
            tax_expense / pretax_income
            if tax_expense is not None and pretax_income not in (None, 0)
            else DEFAULT_TAX_RATE
        )
        eps_growth_pct_proxy = (
            (net_income - prior_net_income) / abs(prior_net_income) * 100
            if prior_net_income not in (None, 0)
            else None
        )

        return {
            "report_date": report_date,
            "operating_income": operating_income,
            "net_income": net_income,
            "operating_cash_flow": ocf,
            "interest_expense": interest_expense,
            "invested_capital": invested_capital,
            "tax_rate": tax_rate,
            # 실제 EPS 성장률이 아니라 당기순이익 YoY 성장률로 근사한 값 (주식수 변동 미반영).
            # 정확한 EPS 성장률을 쓰려면 발행주식수(계정명 "발행할주식의총수" 등)를 추가로 뽑아야 함.
            "eps_growth_pct_proxy": eps_growth_pct_proxy,
        }

    def get_financials(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        """PriceDataSource와 짝을 이루는 FundamentalDataSource 인터페이스 구현.

        start~end에 걸치는 회계연도의 분기·반기·사업보고서를 모두 모아 report_date 오름차순으로
        반환한다. 호출부는 as_of_available_financials()로 룩어헤드 없이 걸러 쓰면 된다.
        """
        columns = [
            "report_date", "operating_income", "net_income", "operating_cash_flow",
            "interest_expense", "invested_capital", "tax_rate", "eps_growth_pct_proxy",
        ]
        corp_code = self.resolve_corp_code(ticker)

        rows: list[dict] = []
        for year in range(start.year, end.year + 1):
            for reprt_code in REPORT_CODES:
                try:
                    items = self.fetch_financial_statement(corp_code, str(year), reprt_code)
                except DartApiError:
                    continue
                if not items:
                    continue
                rcept_no = items[0].get("rcept_no", "")
                if not rcept_no:
                    continue
                parsed = self._parse_report(items, _report_date_from_rcept_no(rcept_no))
                if parsed is not None:
                    rows.append(parsed)

        if not rows:
            return pd.DataFrame(columns=columns)

        df = pd.DataFrame(rows).sort_values("report_date").reset_index(drop=True)
        df["report_date"] = pd.to_datetime(df["report_date"])
        return df[(df["report_date"] >= pd.Timestamp(start)) & (df["report_date"] <= pd.Timestamp(end))]
