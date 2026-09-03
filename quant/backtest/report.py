"""백테스트 결과 리포트."""
from __future__ import annotations

import pandas as pd

from .engine import BacktestState
from .metrics import cagr, expectancy_r, max_drawdown, score_bucket_performance, win_rate


def build_report(state: BacktestState) -> dict:
    equity_curve = pd.Series(
        [v for _, v in state.equity_history],
        index=[d for d, _ in state.equity_history],
    )
    trades = pd.DataFrame(
        [
            {
                "ticker": t.ticker,
                "entry_date": t.entry_date,
                "exit_date": t.exit_date,
                "entry_score": t.entry_score,
                "r_multiple": t.r_multiple,
            }
            for t in state.closed_trades
            if t.r_multiple is not None
        ]
    )

    report = {
        "cagr": cagr(equity_curve),
        "mdd": max_drawdown(equity_curve),
        "n_trades": len(trades),
    }
    if not trades.empty:
        report["win_rate"] = win_rate(trades["r_multiple"])
        report["expectancy_r"] = expectancy_r(trades["r_multiple"])
        report["score_bucket_performance"] = score_bucket_performance(trades)
    return report
