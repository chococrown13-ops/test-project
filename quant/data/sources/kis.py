"""한국투자증권(KIS) Open API 클라이언트 — 시세/랭킹/재무비율 조회 (읽기 전용).

비밀값은 코드에 두지 않는다. 환경변수로 주입한다 (KisEnv.from_env()):
    KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO, KIS_ACCOUNT_PRODUCT_CD(기본 "01"),
    KIS_ENV("real"|"demo", 기본 real), KIS_HTS_ID(관심종목 조회 전용, 여기선 미사용)

읽기 전용 조회만 수행한다. 매매 주문 API는 연결하지 않는다.

이 모듈의 우회 로직은 otterstock-ai-office 저장소(worker/kis.ts)에서 실제로 KIS API를
운영하며 확인된 제약과 대응 방식을 그대로 옮긴 것이다:

- 일봉 조회(inquire-daily-itemchartprice)는 호출 1회에 최대 약 100건만 반환한다.
  긴 구간은 여러 번 나눠 호출해 이어붙인다 (get_ohlcv). 그래도 수년치 대량
  백테스트에는 pykrx(data/sources/krx.py)가 훨씬 빠르고 안정적이다 — 이 소스는
  스크리닝(최근 ~200거래일 지표 계산)용으로 쓰는 것을 권장한다.
- 시가총액 랭킹 API는 연속조회(tr_cont)를 지원하지 않아 조건당 상위 30종목까지만
  반환한다. 가격 구간을 나눠 여러 번 호출한 뒤 합쳐서 우회한다 (fetch_market_cap_universe).
- 랭킹 API는 "오늘 시점" 조회만 가능하다. 과거 특정 날짜의 유니버스 스냅샷은
  제공하지 않으므로, get_universe()는 오늘이 아닌 날짜에 대해 명시적으로 실패한다.
  생존편향 방지가 필요한 백테스트에는 KrxPriceSource.get_universe()를 사용할 것.
- PER/PBR/EPS/BPS 같은 비율은 제공하지만 영업이익·투하자본·OCF·이자비용 같은
  재무제표 원본 라인아이템은 제공하지 않는다. factors/quality.py가 요구하는
  ROIC 등은 OpenDART 같은 별도 소스가 필요하다.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd
import requests

from .base import PriceDataSource

BASE_URL: dict[str, str] = {
    "real": "https://openapi.koreainvestment.com:9443",
    "demo": "https://openapivts.koreainvestment.com:29443",
}

# 일봉 조회 1회당 KIS가 실제로 돌려주는 건수 상한 (otterstock-ai-office에서 실측 확인)
MAX_BARS_PER_CALL_DAYS = 95

# 시가총액 랭킹 API의 "조건당 상위 30종목" 캡을 우회하기 위한 가격 구간
PRICE_BANDS: list[tuple[str, str]] = [
    ("0", "10000"),
    ("10000", "30000"),
    ("30000", "60000"),
    ("60000", "120000"),
    ("120000", "300000"),
    ("300000", "99999999"),
]


class KisApiError(Exception):
    """KIS API가 오류를 반환했거나(rt_cd != "0"), 인증/설정이 누락된 경우."""


@dataclass
class KisEnv:
    app_key: str | None = None
    app_secret: str | None = None
    account_no: str | None = None
    account_product_cd: str = "01"
    env: str = "real"
    hts_id: str | None = None

    @classmethod
    def from_env(cls) -> "KisEnv":
        return cls(
            app_key=os.environ.get("KIS_APP_KEY"),
            app_secret=os.environ.get("KIS_APP_SECRET"),
            account_no=os.environ.get("KIS_ACCOUNT_NO"),
            account_product_cd=os.environ.get("KIS_ACCOUNT_PRODUCT_CD", "01"),
            env=os.environ.get("KIS_ENV", "real"),
            hts_id=os.environ.get("KIS_HTS_ID"),
        )

    @property
    def configured(self) -> bool:
        return bool(self.app_key and self.app_secret and self.account_no)

    @property
    def kind(self) -> str:
        return "demo" if self.env == "demo" else "real"


class KisPriceSource(PriceDataSource):
    """KIS Open API 기반 시세/랭킹 소스. data/loader.py의 PriceLoader에 주입해서 쓴다."""

    def __init__(self, env: KisEnv | None = None, session: requests.Session | None = None) -> None:
        self.env = env or KisEnv.from_env()
        self.session = session or requests.Session()
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    # ── 인증 ─────────────────────────────────────────────

    def _get_access_token(self) -> str:
        if self._token and self._token_expires_at > time.time() + 60:
            return self._token

        response = self.session.post(
            f"{BASE_URL[self.env.kind]}/oauth2/tokenP",
            json={
                "grant_type": "client_credentials",
                "appkey": self.env.app_key,
                "appsecret": self.env.app_secret,
            },
            timeout=10,
        )
        data = response.json() if callable(getattr(response, "json", None)) else {}
        if not response.ok or "access_token" not in data:
            raise KisApiError(
                data.get("error_description") or data.get("msg1") or f"토큰 발급 실패 (HTTP {response.status_code})"
            )

        self._token = data["access_token"]
        self._token_expires_at = time.time() + float(data.get("expires_in", 86400))
        return self._token

    def _get(self, path: str, tr_id: str, params: dict[str, str]) -> dict:
        if not self.env.configured:
            raise KisApiError("KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCOUNT_NO 미설정")

        token = self._get_access_token()
        response = self.session.get(
            f"{BASE_URL[self.env.kind]}{path}",
            params=params,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": f"Bearer {token}",
                "appkey": self.env.app_key,
                "appsecret": self.env.app_secret,
                "tr_id": tr_id,
                "custtype": "P",
            },
            timeout=10,
        )
        data = response.json() if callable(getattr(response, "json", None)) else {}
        if not response.ok or data.get("rt_cd") != "0":
            raise KisApiError(data.get("msg1") or f"조회 실패 (HTTP {response.status_code})")
        return data

    # ── PriceDataSource 인터페이스 ─────────────────────────

    def get_ohlcv(self, ticker: str, start: date, end: date, *, pacing_seconds: float = 0.15) -> pd.DataFrame:
        """수정주가 기준 OHLCV. 긴 구간은 여러 번 나눠 호출해 이어붙인다 (docstring 상단 참고)."""
        chunks: list[pd.DataFrame] = []
        window_end = end
        while window_end >= start:
            window_start = max(start, window_end - timedelta(days=MAX_BARS_PER_CALL_DAYS))
            chunks.append(self._fetch_daily_bars_chunk(ticker, window_start, window_end))
            window_end = window_start - timedelta(days=1)
            if window_end >= start:
                time.sleep(pacing_seconds)

        if not chunks or all(chunk.empty for chunk in chunks):
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        combined = pd.concat(chunks).sort_index()
        return combined[~combined.index.duplicated(keep="last")]

    def get_universe(self, as_of: date, *, pacing_seconds: float = 0.2) -> list[str]:
        """as_of가 오늘이 아니면 명시적으로 실패한다 (docstring 상단 참고)."""
        if as_of != date.today():
            raise NotImplementedError(
                f"KIS API는 과거 시점({as_of}) 유니버스 스냅샷을 제공하지 않습니다. "
                "생존편향 방지가 필요한 백테스트에는 KrxPriceSource.get_universe()를 사용하세요."
            )
        universe = self.fetch_market_cap_universe(min_market_cap_eok=0, pacing_seconds=pacing_seconds)
        return [row["code"] for row in universe]

    # ── 일봉 ─────────────────────────────────────────────

    def _fetch_daily_bars_chunk(self, code: str, start: date, end: date) -> pd.DataFrame:
        """국내주식기간별시세(일봉)[v1_국내주식-016] 1회 호출."""
        data = self._get(
            "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
            "FHKST03010100",
            {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_INPUT_DATE_1": start.strftime("%Y%m%d"),
                "FID_INPUT_DATE_2": end.strftime("%Y%m%d"),
                "FID_PERIOD_DIV_CODE": "D",
                "FID_ORG_ADJ_PRC": "0",
            },
        )
        rows = data.get("output2") or []
        if not rows:
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        raw = pd.DataFrame(rows)
        raw["date"] = pd.to_datetime(raw["stck_bsop_date"])
        raw = raw.set_index("date").sort_index()
        result = pd.DataFrame(
            {
                "open": raw["stck_oprc"].astype(float),
                "high": raw["stck_hgpr"].astype(float),
                "low": raw["stck_lwpr"].astype(float),
                "close": raw["stck_clpr"].astype(float),
                "volume": raw["acml_vol"].astype(float),
            }
        )
        return result[result["close"] > 0]

    def fetch_daily_bars_many(
        self, codes: list[str], start: date, end: date, *, pacing_seconds: float = 0.2, retries: int = 3
    ) -> dict[str, pd.DataFrame | None]:
        """여러 종목의 일봉을 순차 조회. 종목 사이에 짧게 쉬어가고, 실패하면 재시도한다.
        끝까지 실패한 종목은 값이 None — 호출부가 걸러낸다 (조용히 빈 데이터로 넘기지 않는다).
        """
        result: dict[str, pd.DataFrame | None] = {}
        for code in codes:
            bars = None
            for attempt in range(retries):
                try:
                    bars = self.get_ohlcv(code, start, end)
                    break
                except KisApiError:
                    if attempt == retries - 1:
                        bars = None
                    else:
                        time.sleep(0.3 * (attempt + 1))
            result[code] = bars
            time.sleep(pacing_seconds)
        return result

    # ── 시가총액 유니버스 ────────────────────────────────

    def fetch_market_cap_universe(
        self, min_market_cap_eok: float, market: str = "all", *, pacing_seconds: float = 0.2
    ) -> list[dict]:
        """국내주식 시가총액 상위[v1_국내주식-091] — 가격 구간을 나눠 여러 번 호출한 뒤
        합쳐서 "조건당 상위 30종목" 캡을 우회한다. 결과는 시가총액 내림차순."""
        iscds = {"kospi": ["0001"], "kosdaq": ["1001"]}.get(market, ["0001", "1001"])

        rows: list[dict] = []
        for iscd in iscds:
            for low, high in PRICE_BANDS:
                rows.extend(self._fetch_market_cap_band(iscd, low, high))
                time.sleep(pacing_seconds)

        mapped = [
            {
                "code": row.get("mksc_shrn_iscd", ""),
                "name": row.get("hts_kor_isnm", ""),
                "price": float(row.get("stck_prpr", 0) or 0),
                "change_rate": float(row.get("prdy_ctrt", 0) or 0),
                "volume": float(row.get("acml_vol", 0) or 0),
                "market_cap_eok": float(row.get("stck_avls", 0) or 0),
            }
            for row in rows
            if row.get("mksc_shrn_iscd")
        ]

        # 가격 구간 경계에서 같은 종목이 두 번 잡힐 수 있어 종목코드로 중복 제거
        unique = list({row["code"]: row for row in mapped}.values())
        filtered = [row for row in unique if row["market_cap_eok"] >= min_market_cap_eok]
        return sorted(filtered, key=lambda r: r["market_cap_eok"], reverse=True)

    def _fetch_market_cap_band(self, iscd: str, low: str, high: str, retries: int = 3) -> list[dict]:
        for attempt in range(retries):
            try:
                data = self._get(
                    "/uapi/domestic-stock/v1/ranking/market-cap",
                    "FHPST01740000",
                    {
                        "fid_input_price_2": high,
                        "fid_cond_mrkt_div_code": "J",
                        "fid_cond_scr_div_code": "20174",
                        "fid_div_cls_code": "1",  # 보통주만 (우선주 제외)
                        "fid_input_iscd": iscd,
                        "fid_trgt_cls_code": "0",
                        "fid_trgt_exls_cls_code": "0",
                        "fid_input_price_1": low,
                        "fid_vol_cnt": "",
                    },
                )
                return data.get("output") or []
            except KisApiError:
                if attempt == retries - 1:
                    raise
                time.sleep(0.3 * (attempt + 1))
        return []

    # ── 개별 종목 시세/비율 ──────────────────────────────

    def fetch_stock_quote(self, code: str) -> dict:
        """주식현재가 시세[v1_국내주식-008] — 현재가·PER·PBR·EPS·BPS·52주 최고저."""
        data = self._get(
            "/uapi/domestic-stock/v1/quotations/inquire-price",
            "FHKST01010100",
            {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code},
        )
        row = data.get("output") or {}
        if isinstance(row, list):
            row = row[0] if row else {}
        if not row.get("stck_prpr"):
            raise KisApiError("종목코드를 찾을 수 없습니다. 6자리 코드가 맞는지 확인하세요.")

        return {
            "code": code,
            "price": float(row.get("stck_prpr", 0) or 0),
            "change_rate": float(row.get("prdy_ctrt", 0) or 0),
            "per": float(row.get("per", 0) or 0),
            "pbr": float(row.get("pbr", 0) or 0),
            "eps": float(row.get("eps", 0) or 0),
            "bps": float(row.get("bps", 0) or 0),
            "market_cap_eok": float(row.get("hts_avls", 0) or 0),
            "week52_high": float(row.get("w52_hgpr", 0) or 0),
            "week52_low": float(row.get("w52_lwpr", 0) or 0),
        }

    def fetch_investor_net_flow_20d(self, code: str) -> dict:
        """종목별 투자자매매동향(일별) — 최근 20거래일 외국인·기관 누적 순매수(주식 수).
        quant/config/factors.yaml에는 아직 없는 팩터. 필요하면 quality/value와 별도로 붙일 것."""
        today = date.today().strftime("%Y%m%d")
        data = self._get(
            "/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily",
            "FHPTJ04160001",
            {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_INPUT_DATE_1": today,
                "FID_ORG_ADJ_PRC": "",
                "FID_ETC_CLS_CODE": "",
            },
        )
        rows = data.get("output2") or []
        last20 = rows[:20]
        return {
            "foreign_net_20": sum(float(r.get("frgn_ntby_qty", 0) or 0) for r in last20),
            "inst_net_20": sum(float(r.get("orgn_ntby_qty", 0) or 0) for r in last20),
        }

    def fetch_volume_rank(self, count: int = 15) -> list[dict]:
        """거래량순위[v1_국내주식-047] — 오늘 거래가 활발한 종목 후보군."""
        data = self._get(
            "/uapi/domestic-stock/v1/quotations/volume-rank",
            "FHPST01710000",
            {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_COND_SCR_DIV_CODE": "20171",
                "FID_INPUT_ISCD": "0000",
                "FID_DIV_CLS_CODE": "0",
                "FID_BLNG_CLS_CODE": "0",
                "FID_TRGT_CLS_CODE": "111111111",
                "FID_TRGT_EXLS_CLS_CODE": "0000001100",
                "FID_INPUT_PRICE_1": "",
                "FID_INPUT_PRICE_2": "",
                "FID_VOL_CNT": "",
                "FID_INPUT_DATE_1": "",
            },
        )
        rows = data.get("output") or []
        return [
            {
                "code": row.get("mksc_shrn_iscd", ""),
                "name": row.get("hts_kor_isnm", ""),
                "price": float(row.get("stck_prpr", 0) or 0),
                "change_rate": float(row.get("prdy_ctrt", 0) or 0),
                "volume": float(row.get("acml_vol", 0) or 0),
            }
            for row in rows[:count]
        ]
