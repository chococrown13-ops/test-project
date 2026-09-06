"""pykrx 기반 국내 시세 데이터 소스.

pykrx는 재무데이터를 제공하지 않으므로, 재무제표는 OpenDART 등 별도 소스가 필요합니다.
requirements.txt에서 pykrx 주석을 해제하고 `pip install pykrx` 후 사용하세요.
"""
from __future__ import annotations

from datetime import date

import pandas as pd

from .base import PriceDataSource


class KrxPriceSource(PriceDataSource):
    def __init__(self) -> None:
        try:
            import pykrx.stock as _pykrx
        except ImportError as exc:
            raise ImportError(
                "pykrx가 설치되어 있지 않습니다. `pip install pykrx`로 설치하세요."
            ) from exc
        self._pykrx = _pykrx

    def get_ohlcv(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        df = self._pykrx.get_market_ohlcv(
            start.strftime("%Y%m%d"), end.strftime("%Y%m%d"), ticker, adjusted=True
        )
        df = df.rename(
            columns={
                "시가": "open",
                "고가": "high",
                "저가": "low",
                "종가": "close",
                "거래량": "volume",
            }
        )
        return df[["open", "high", "low", "close", "volume"]]

    def get_universe(self, as_of: date) -> list[str]:
        # get_market_ticker_list(as_of)는 조회일 기준 실제 상장 종목만 반환하므로
        # 과거 시점을 그대로 넘기는 한 생존편향 없이 사용할 수 있음.
        return self._pykrx.get_market_ticker_list(as_of.strftime("%Y%m%d"), market="ALL")
