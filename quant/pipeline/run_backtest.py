"""실제 스크리닝 로직(유니버스 필터/RS/트렌드템플릿/quality·value 서브스코어/커트라인)을
그대로 재사용한 과거 백테스트 (CLI). backtest/engine.py에 매주 재스크리닝하는
screening_fn을 주입해서 돌린다.

사용 예:
    python -m pipeline.run_backtest --years 2 --out out/backtest

주의 — 이 백테스트는 근사치다 (실제 점검: 2026-09-04, 4종목 표본):
1. **유니버스가 시점별이 아니라 고정**: KIS Open API는 "오늘" 시점 유니버스만 제공하므로
   (data/sources/kis.py::KisPriceSource.get_universe 참고), 과거 매 리밸런싱 시점마다
   실제 그 날짜의 유니버스를 다시 구성하지 못한다. 대신 "오늘 KIS 유니버스"를 전체 backtest
   기간에 고정 후보 풀로 쓴다 — 상장폐지/신규상장이 반영되지 않아 생존편향이 있다
   (data/validate.py::check_survivorship가 이 사실을 경고로 출력한다). 완전한 시점별
   유니버스가 필요하면 KrxPriceSource로 과거 시가총액 스냅샷을 직접 구성해야 한다
   (이 환경에서는 pykrx의 시가총액/펀더멘털 스냅샷 엔드포인트가 깨져 있어 미구현).
2. **PER 근사**: 과거 시점 PER을 주는 무료 API가 이 환경에 없어(주1 참고), 발행주식수를
   "오늘 시총 / 오늘 종가"로 고정 근사한 뒤 과거 종가·DART 순이익으로 PER을 역산한다.
   액면분할/유상증자/자사주매입이 있었던 종목은 부정확하다.
3. RS/quality/value 서브스코어·커트라인은 run_screening.py와 동일한 함수(screening/*,
   factors/*, pipeline/dart_quality.py)를 그대로 쓴다 — 근사는 "무엇을 입력하는지"에만
   있고 "어떻게 채점하는지"는 실제 파이프라인과 동일하다.

DART API 주의: get_financials()는 종목 하나당 최대 수십 건의 HTTP 요청을 낸다. 다수 종목을
백테스트하면 반드시 DartFundamentalSource의 요청 쓰로틀(0.3초 간격, data/sources/dart.py
참고)이 걸린 상태로 실행해야 한다 — 그렇지 않으면 DART 서버가 버스트 요청을 어뷰징으로
보고 IP를 통째로 차단한다(실측: 20분 이상 모든 DART 연결이 리셋됨).
"""
from __future__ import annotations

import argparse
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from backtest.engine import BacktestEngine
from backtest.report import build_report
from data.sources.dart import DartEnv, DartFundamentalSource
from data.sources.kis import KisEnv, KisPriceSource
from data.sources.krx import KrxPriceSource
from data.validate import check_survivorship
from factors.momentum import compute_rs_raw
from factors.trend import trend_template_conditions
from factors.volatility import compute_atr_ratio
from pipeline.dart_quality import dart_quality_inputs
from pipeline.run_screening import _kis_market_param, load_config
from screening.rs_filter import filter_by_rs
from screening.score import apply_cutoff, score_candidates
from screening.subscores import build_sub_scores
from screening.trend_filter import filter_by_trend_template
from screening.universe import filter_universe

PRICE_HISTORY_BUFFER_DAYS = 365 * 3  # 200일선/252일 고저 계산용 버퍼 (백테스트 시작일 이전)


def fetch_today_universe(kis_source: KisPriceSource, universe_cfg: dict) -> pd.DataFrame:
    """오늘 시점 KIS 유니버스 + 근사 발행주식수(시총/가격). run()의 고정 후보 풀로 쓰인다."""
    pool = kis_source.fetch_market_cap_universe(
        min_market_cap_eok=universe_cfg["min_market_cap"] / 1e8,
        market=_kis_market_param(universe_cfg["market"]),
    )
    snapshot = pd.DataFrame(pool).set_index("code")
    snapshot["market_cap"] = snapshot["market_cap_eok"] * 1e8
    snapshot["shares_approx"] = snapshot["market_cap"] / snapshot["price"]
    return snapshot


def fetch_price_history(
    krx_source: KrxPriceSource, codes: list[str], start: date, end: date, log: bool = True
) -> dict[str, pd.DataFrame]:
    bars: dict[str, pd.DataFrame] = {}
    t0 = time.time()
    for i, code in enumerate(codes):
        df = krx_source.get_ohlcv(code, start, end)
        if df is None or df.empty:
            continue
        df.index = pd.to_datetime(df.index)
        bars[code] = df
        if log and (i + 1) % 50 == 0:
            print(f"      {i + 1}/{len(codes)} ({time.time() - t0:.0f}s 경과)")
    return bars


def weekly_rebalance_dates(bars: dict[str, pd.DataFrame], start: date, weekday: int = 4) -> list[pd.Timestamp]:
    """weekday=4는 금요일. 실제 거래일 중 해당 요일만 골라 리밸런싱일로 쓴다."""
    all_dates = sorted(set().union(*[set(b.index) for b in bars.values()]))
    all_dates = [d for d in all_dates if d.date() >= start]
    if not all_dates:
        return []
    dates = [d for d in all_dates if d.weekday() == weekday]
    if not dates or dates[-1] != all_dates[-1]:
        dates.append(all_dates[-1])
    return dates


def make_screening_fn(
    bars: dict[str, pd.DataFrame],
    shares_approx: dict[str, float],
    universe_cfg: dict,
    factors_cfg: dict,
    score_cfg: dict,
    dart_source: DartFundamentalSource,
    financial_data_lag_days: int,
):
    """backtest/engine.py::BacktestEngine에 주입할 screening_fn(as_of) -> DataFrame[score, atr, close].

    run_screening.py::run()과 동일하게 유니버스 필터 -> RS -> 트렌드템플릿 -> quality/value
    서브스코어 -> 커트라인 순서로 채점한다. DART 조회 결과는 종목별로 캐시해 같은 종목을
    여러 리밸런싱 시점에서 재조회하지 않는다.
    """
    momentum_cfg = factors_cfg["momentum"]
    trend_cfg = factors_cfg["trend_template"]
    vol_cfg = factors_cfg["volatility"]
    financials_cache: dict[str, pd.DataFrame] = {}  # code -> get_financials() 결과, 종목당 1회만 조회

    # RS(최장 lookback*21거래일)와 트렌드템플릿(최장 이동평균)이 요구하는 최소 히스토리 길이.
    # 이보다 짧으면 compute_rs_raw가 NaN을 반환하거나 이동평균이 부정확해지므로 아예 건너뛴다.
    min_history_days = max(max(momentum_cfg["lookback_months"]) * 21, max(trend_cfg["ma_periods"])) + 25

    def cached_quality_inputs(code: str, as_of: pd.Timestamp, close: float) -> dict:
        if code not in financials_cache:
            if dart_source.env.configured:
                try:
                    financials_cache[code] = dart_source.get_financials(
                        code, as_of - timedelta(days=PRICE_HISTORY_BUFFER_DAYS), date.today()
                    )
                except Exception:
                    financials_cache[code] = pd.DataFrame(columns=["report_date"])
            else:
                financials_cache[code] = pd.DataFrame(columns=["report_date"])

        result = dart_quality_inputs(
            dart_source, code, as_of.date(), financial_data_lag_days, financials=financials_cache[code]
        )
        shares = shares_approx.get(code)
        net_income = result["net_income"]
        result["per"] = 0.0
        if shares and net_income and net_income > 0:
            eps_approx = net_income / shares
            if eps_approx > 0:
                result["per"] = close / eps_approx
        return result

    def screening_fn(as_of: pd.Timestamp) -> pd.DataFrame:
        rows = {}
        for code, hist_full in bars.items():
            hist = hist_full[hist_full.index <= as_of]
            if len(hist) < min_history_days:
                continue
            shares = shares_approx.get(code)
            if not shares:
                continue
            close = hist["close"].iloc[-1]
            rows[code] = {
                "close": close,
                "market_cap": shares * close,
                "avg_trading_value_20d": (hist["close"] * hist["volume"]).tail(20).mean(),
            }
        if not rows:
            return pd.DataFrame(columns=["score", "atr", "close"])
        snapshot = pd.DataFrame.from_dict(rows, orient="index")

        filtered = filter_universe(
            snapshot, universe_cfg["min_market_cap"], universe_cfg["min_avg_trading_value_20d"], universe_cfg["min_price"]
        )
        if filtered.empty:
            return pd.DataFrame(columns=["score", "atr", "close"])

        rs_raw = pd.Series(
            {c: compute_rs_raw(bars[c][bars[c].index <= as_of]["close"], momentum_cfg["lookback_months"], momentum_cfg["weights"])
             for c in filtered.index}
        )
        rs_filtered = filter_by_rs(filtered, rs_raw, momentum_cfg["universe_percentile_cutoff"])
        if rs_filtered.empty:
            return pd.DataFrame(columns=["score", "atr", "close"])

        price_by_ticker = {c: bars[c][bars[c].index <= as_of] for c in rs_filtered.index}
        trend_filtered = filter_by_trend_template(
            rs_filtered, price_by_ticker, trend_cfg["ma_periods"], trend_cfg["low_252d_buffer"], trend_cfg["high_252d_buffer"]
        )
        if trend_filtered.empty:
            return pd.DataFrame(columns=["score", "atr", "close"])

        raw_rows = {}
        for code in trend_filtered.index:
            hist = price_by_ticker[code]
            conditions = trend_template_conditions(
                hist, trend_cfg["ma_periods"], trend_cfg["low_252d_buffer"], trend_cfg["high_252d_buffer"]
            )
            atr_ratio = compute_atr_ratio(hist, vol_cfg["atr_period"]).iloc[-1]
            close = hist["close"].iloc[-1]
            qv = cached_quality_inputs(code, as_of, close)
            raw_rows[code] = {
                "rs_percentile": trend_filtered.loc[code, "rs_percentile"],
                "price_above_all_ma": conditions["price_above_all_ma"],
                "ma_long_trending_up": conditions["ma_long_trending_up"],
                "above_52w_low": conditions["above_52w_low"],
                "near_52w_high": conditions["near_52w_high"],
                "operating_cash_flow": qv["operating_cash_flow"],
                "net_income": qv["net_income"],
                "roic": qv["roic"],
                "interest_coverage": qv["interest_coverage"],
                "atr_ratio": atr_ratio,
                "per": qv["per"],
                "eps_growth_pct": qv["eps_growth_pct"],
            }
        raw_metrics = pd.DataFrame.from_dict(raw_rows, orient="index")
        sub_scores = build_sub_scores(raw_metrics, factors_cfg)
        scored = score_candidates(trend_filtered, sub_scores, score_cfg["weights"])
        passed = apply_cutoff(scored, cutoff=score_cfg["cutoff"])
        if passed.empty:
            return pd.DataFrame(columns=["score", "atr", "close"])
        out = pd.DataFrame(index=passed.index)
        out["score"] = passed["total_score"]
        out["close"] = passed["close"]
        out["atr"] = raw_metrics.loc[passed.index, "atr_ratio"] * passed["close"]
        return out.sort_values("score", ascending=False)

    return screening_fn


def make_price_lookup_fn(bars: dict[str, pd.DataFrame]):
    def price_lookup_fn(ticker: str, as_of: pd.Timestamp) -> float | None:
        hist = bars.get(ticker)
        if hist is None:
            return None
        if as_of in hist.index:
            return float(hist.loc[as_of, "close"])
        prior = hist[hist.index <= as_of]
        if prior.empty:
            return None
        return float(prior["close"].iloc[-1])

    return price_lookup_fn


def run(years: int, kis_source: KisPriceSource | None = None, krx_source: KrxPriceSource | None = None,
        dart_source: DartFundamentalSource | None = None) -> tuple[dict, pd.DataFrame]:
    """지난 `years`년을 주간 리밸런싱으로 백테스트한다. (report_dict, trades_df) 반환."""
    universe_cfg = load_config("universe")
    factors_cfg = load_config("factors")
    score_cfg = load_config("score_table")
    backtest_cfg = load_config("backtest")

    kis_source = kis_source or KisPriceSource(KisEnv.from_env())
    krx_source = krx_source or KrxPriceSource()
    dart_source = dart_source or DartFundamentalSource(DartEnv.from_env())

    today = date.today()
    backtest_start = today - timedelta(days=365 * years)
    fetch_start = backtest_start - timedelta(days=PRICE_HISTORY_BUFFER_DAYS)

    print("[1/4] 오늘 KIS 유니버스 조회 (고정 후보 풀 — 모듈 docstring 주의사항 참고)...")
    universe = fetch_today_universe(kis_source, universe_cfg)
    print(f"      {len(universe)}종목")

    print(f"[2/4] pykrx 가격 히스토리 조회 ({fetch_start} ~ {today})...")
    bars = fetch_price_history(krx_source, list(universe.index), fetch_start, today)
    print(f"      {len(bars)}종목 확보")

    rebalance_dates = weekly_rebalance_dates(bars, backtest_start)
    print(f"[3/4] 리밸런싱(주간) 횟수: {len(rebalance_dates)}")

    # 고정 유니버스 근사(모듈 docstring 주1)라서 이 경고는 항상 뜬다 — 의도된 것이며,
    # data/validate.py의 기존 생존편향 점검 유틸을 그대로 재사용해 명시적으로 남긴다.
    universe_by_date = {str(d.date()): list(bars.keys()) for d in rebalance_dates}
    for w in check_survivorship(universe_by_date):
        print(f"      [경고] {w} (고정 유니버스 근사라 항상 발생 — 모듈 docstring 참고)")

    shares_approx = universe["shares_approx"].to_dict()
    screening_fn = make_screening_fn(
        bars, shares_approx, universe_cfg, factors_cfg, score_cfg, dart_source, backtest_cfg["financial_data_lag_days"]
    )
    price_lookup_fn = make_price_lookup_fn(bars)

    print("[4/4] 백테스트 실행 중...")
    engine = BacktestEngine(
        initial_capital=backtest_cfg["initial_capital"],
        screening_fn=screening_fn,
        price_lookup_fn=price_lookup_fn,
        slippage_bps=backtest_cfg["slippage_bps"],
        transaction_tax=backtest_cfg["transaction_tax"],
        risk_per_trade=backtest_cfg["risk_per_trade"],
        max_positions=backtest_cfg["max_positions"],
        atr_stop_multiplier=backtest_cfg["atr_stop_multiplier"],
    )
    state = engine.run(rebalance_dates)
    report = build_report(state)

    trades = pd.DataFrame(
        [
            {
                "ticker": t.ticker, "entry_date": t.entry_date, "exit_date": t.exit_date,
                "entry_price": t.entry_price, "exit_price": t.exit_price,
                "entry_score": t.entry_score, "r_multiple": t.r_multiple,
            }
            for t in state.closed_trades
        ]
    )
    return report, trades


def main() -> None:
    parser = argparse.ArgumentParser(description="실제 스크리닝 로직 기반 과거 백테스트 (근사 유니버스, 모듈 docstring 참고)")
    parser.add_argument("--years", type=int, default=2)
    parser.add_argument("--out", type=str, default="out/backtest")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    report, trades = run(args.years)

    print("\n=== 백테스트 결과 ===")
    cagr = report["cagr"]
    print(f"CAGR: {cagr:.2%}" if cagr == cagr else "CAGR: N/A")
    print(f"MDD: {report['mdd']:.2%}")
    print(f"거래 수: {report['n_trades']}")
    if report["n_trades"] > 0:
        print(f"승률: {report['win_rate']:.1%}")
        print(f"기대값(R): {report['expectancy_r']:.3f}")
        if "score_bucket_performance" in report:
            print("\n점수 구간별 성과 (커트라인 유효성 검증):")
            print(report["score_bucket_performance"].to_string())

    trades.to_csv(out_dir / "trades.csv", encoding="utf-8-sig", index=False)
    print(f"\n거래 내역 -> {out_dir / 'trades.csv'}")


if __name__ == "__main__":
    main()
