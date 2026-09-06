"""백테스트 성과 지표: CAGR, MDD, 승률, R-multiple 기대값."""
from __future__ import annotations

import pandas as pd


def cagr(equity_curve: pd.Series) -> float:
    if len(equity_curve) == 0:
        return float("nan")
    n_years = (equity_curve.index[-1] - equity_curve.index[0]).days / 365.25
    if n_years <= 0:
        return float("nan")
    return (equity_curve.iloc[-1] / equity_curve.iloc[0]) ** (1 / n_years) - 1


def max_drawdown(equity_curve: pd.Series) -> float:
    running_max = equity_curve.cummax()
    drawdown = equity_curve / running_max - 1
    return drawdown.min()


def win_rate(trade_returns: pd.Series) -> float:
    if len(trade_returns) == 0:
        return float("nan")
    return (trade_returns > 0).mean()


def expectancy_r(trade_r_multiples: pd.Series) -> float:
    """R-multiple 기대값 = 평균(각 트레이드 손익 / 초기 리스크금액)."""
    return trade_r_multiples.mean()


def score_bucket_performance(
    trades: pd.DataFrame, score_col: str = "entry_score", r_col: str = "r_multiple", n_buckets: int = 5
) -> pd.DataFrame:
    """점수 구간별 평균 R 성과. 커트라인(70점)이 실제로 유효한지 검증하는 핵심 리포트."""
    trades = trades.copy()
    trades["score_bucket"] = pd.qcut(trades[score_col], n_buckets, duplicates="drop")
    grouped = trades.groupby("score_bucket")[r_col]
    return pd.DataFrame(
        {
            "mean_r": grouped.mean(),
            "count": grouped.count(),
            "win_rate": grouped.apply(lambda s: (s > 0).mean()),
        }
    )
