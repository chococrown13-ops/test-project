"""데이터 캐싱 및 로딩 레이어 (parquet 로컬 캐시)."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from .sources.base import PriceDataSource

CACHE_DIR = Path(__file__).parent / "cache"


class PriceLoader:
    def __init__(self, source: PriceDataSource, cache_dir: Path = CACHE_DIR) -> None:
        self.source = source
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def load(self, ticker: str, start: date, end: date, force_refresh: bool = False) -> pd.DataFrame:
        cache_path = self.cache_dir / f"{ticker}.parquet"
        if cache_path.exists() and not force_refresh:
            cached = pd.read_parquet(cache_path)
            cached.index = pd.to_datetime(cached.index)
            has_start = cached.index.min().date() <= start
            has_end = cached.index.max().date() >= end
            if has_start and has_end:
                return cached.loc[str(start) : str(end)]

        fresh = self.source.get_ohlcv(ticker, start, end)
        fresh.to_parquet(cache_path)
        return fresh
