"""이벤트 기반 백테스트 엔진 (스켈레톤).

핵심 원칙:
1. 매 리밸런싱 시점 t에서는 t 이전에 확정된 데이터만 사용 (재무데이터는 lag 적용)
2. 상장폐지/거래정지 종목은 유니버스 시점 스냅샷으로 처리 (생존편향 방지)
3. screening_fn/price_lookup_fn을 주입받는 구조라 실제 데이터 연동 전에도
   합성 데이터로 엔진 로직을 검증할 수 있음
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import pandas as pd

from .costs import apply_buy_cost, apply_sell_cost


@dataclass
class Trade:
    ticker: str
    entry_date: pd.Timestamp
    entry_price: float
    shares: int
    entry_score: float
    exit_date: pd.Timestamp | None = None
    exit_price: float | None = None
    risk_amount: float = 0.0

    @property
    def r_multiple(self) -> float | None:
        if self.exit_price is None or self.risk_amount == 0:
            return None
        pnl = (self.exit_price - self.entry_price) * self.shares
        return pnl / self.risk_amount


@dataclass
class BacktestState:
    cash: float
    open_trades: dict[str, Trade] = field(default_factory=dict)
    closed_trades: list[Trade] = field(default_factory=list)
    equity_history: list[tuple[pd.Timestamp, float]] = field(default_factory=list)


class BacktestEngine:
    """스크리닝 파이프라인 함수를 그대로 주입받아 실행하는 러너.

    screening_fn(as_of) -> pd.DataFrame (index=ticker, columns=[score, atr, close])
    price_lookup_fn(ticker, date) -> float | None (해당 날짜 체결가, None=거래정지)
    """

    def __init__(
        self,
        initial_capital: float,
        screening_fn: Callable[[pd.Timestamp], pd.DataFrame],
        price_lookup_fn: Callable[[str, pd.Timestamp], float | None],
        slippage_bps: float,
        transaction_tax: float,
        risk_per_trade: float,
        max_positions: int,
        atr_stop_multiplier: float = 2.0,
    ) -> None:
        self.screening_fn = screening_fn
        self.price_lookup_fn = price_lookup_fn
        self.slippage_bps = slippage_bps
        self.transaction_tax = transaction_tax
        self.risk_per_trade = risk_per_trade
        self.max_positions = max_positions
        self.atr_stop_multiplier = atr_stop_multiplier
        self.state = BacktestState(cash=initial_capital)

    def run(self, rebalance_dates: list[pd.Timestamp]) -> BacktestState:
        for as_of in rebalance_dates:
            self._close_positions_not_in_target(as_of)
            self._open_new_positions(as_of)
            self._record_equity(as_of)
        return self.state

    def _open_new_positions(self, as_of: pd.Timestamp) -> None:
        candidates = self.screening_fn(as_of)
        available_slots = self.max_positions - len(self.state.open_trades)
        for ticker, row in candidates.head(available_slots).iterrows():
            if ticker in self.state.open_trades:
                continue
            price = self.price_lookup_fn(ticker, as_of)
            if price is None:
                continue
            risk_amount = self.state.cash * self.risk_per_trade
            stop_distance = row["atr"] * self.atr_stop_multiplier
            if stop_distance <= 0:
                continue
            shares = int(risk_amount / stop_distance)
            if shares <= 0:
                continue
            cost = apply_buy_cost(price, shares, self.slippage_bps)
            if cost > self.state.cash:
                continue
            self.state.cash -= cost
            self.state.open_trades[ticker] = Trade(
                ticker=ticker,
                entry_date=as_of,
                entry_price=price,
                shares=shares,
                entry_score=row["score"],
                risk_amount=risk_amount,
            )

    def _close_positions_not_in_target(self, as_of: pd.Timestamp) -> None:
        candidates = self.screening_fn(as_of)
        target_tickers = set(candidates.index)
        for ticker in list(self.state.open_trades.keys()):
            if ticker in target_tickers:
                continue
            trade = self.state.open_trades.pop(ticker)
            price = self.price_lookup_fn(ticker, as_of)
            if price is None:
                price = trade.entry_price  # 거래정지 등으로 체결 불가 시 보수적 처리
            proceeds = apply_sell_cost(price, trade.shares, self.slippage_bps, self.transaction_tax)
            self.state.cash += proceeds
            trade.exit_date = as_of
            trade.exit_price = price
            self.state.closed_trades.append(trade)

    def _record_equity(self, as_of: pd.Timestamp) -> None:
        holdings_value = sum(
            (self.price_lookup_fn(t.ticker, as_of) or t.entry_price) * t.shares
            for t in self.state.open_trades.values()
        )
        self.state.equity_history.append((as_of, self.state.cash + holdings_value))
