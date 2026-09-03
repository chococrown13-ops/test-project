"""거래비용/슬리피지 모델."""
from __future__ import annotations


def apply_buy_cost(price: float, shares: int, slippage_bps: float) -> float:
    effective_price = price * (1 + slippage_bps / 10_000)
    return effective_price * shares


def apply_sell_cost(price: float, shares: int, slippage_bps: float, transaction_tax: float) -> float:
    effective_price = price * (1 - slippage_bps / 10_000)
    proceeds = effective_price * shares
    tax = proceeds * transaction_tax
    return proceeds - tax
