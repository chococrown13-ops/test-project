"""데이터 소스 공통 인터페이스."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

import pandas as pd


class PriceDataSource(ABC):
    @abstractmethod
    def get_ohlcv(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        """수정주가 기준 OHLCV. columns: open, high, low, close, volume."""

    @abstractmethod
    def get_universe(self, as_of: date) -> list[str]:
        """as_of 시점에 실제로 상장되어 있던 종목 코드 목록 (생존편향 방지)."""


class FundamentalDataSource(ABC):
    @abstractmethod
    def get_financials(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        """분기 재무제표. report_date(실제 공시일) 컬럼이 반드시 포함되어야 함."""
