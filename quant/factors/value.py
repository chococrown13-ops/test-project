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


def value_subscore(
    per: float, eps_growth_pct: float, per_band: tuple[float, float], max_peg: float
) -> float:
    """PER 밴드 밖이면 0점. 밴드 안이면 PEG가 낮을수록(성장 대비 저평가) 고득점."""
    if not in_per_band(per, per_band):
        return 0.0
    peg = compute_peg(per, eps_growth_pct)
    if peg >= max_peg:
        return 0.0
    return max(0.0, 1 - peg / max_peg)
