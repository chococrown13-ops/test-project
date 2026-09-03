"""밸류 팩터: PER 밴드, PEG, FCF Yield."""
from __future__ import annotations


def in_per_band(per: float, band: tuple[float, float]) -> bool:
    low, high = band
    return low <= per <= high


def compute_peg(per: float, eps_growth_pct: float) -> float:
    if eps_growth_pct <= 0:
        return float("inf")
    return per / eps_growth_pct


def compute_fcf_yield(free_cash_flow: float, market_cap: float) -> float:
    if market_cap == 0:
        return float("nan")
    return free_cash_flow / market_cap
