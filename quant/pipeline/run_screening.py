"""전체 스크리닝 파이프라인 실행 (CLI). KIS Open API로 "오늘" 시점만 스크리닝한다.

사용 예:
    cp .env.example .env   # KIS_APP_KEY 등을 채운 뒤
    python -m pipeline.run_screening --out out/screening.csv

주의 — quality_score/value_score 관련 데이터 공백 (사용자 확인된 임시 조치):
KIS Open API는 재무제표 원본(영업이익/투하자본/OCF/이자비용)과 EPS 성장률을 제공하지
않는다. 이 파이프라인은 그 값들을 0으로 채워 quality_score와 value_score의 PEG
부분을 명시적으로 0점 처리한다 (완전히 다른 결과를 조용히 만들어내는 대신, 데이터가
없다는 사실을 그대로 반영). 그 결과 score_table.yaml 기본 배점(quality 20 + value 10)
기준으로는 커트라인(70점)을 넘으려면 rs_score+trend_score+volatility_score(최대 70점)가
거의 만점에 가까워야 한다. OpenDART 등으로 재무데이터를 연동하면 이 공백이 채워진다
(quant/CLAUDE.md "데이터 소스: KIS vs pykrx" 참고).
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import yaml

from data.sources.kis import KisApiError, KisEnv, KisPriceSource
from factors.momentum import compute_rs_raw
from factors.trend import trend_template_conditions
from factors.volatility import compute_atr_ratio
from screening.rs_filter import filter_by_rs
from screening.score import apply_cutoff, score_candidates
from screening.subscores import build_sub_scores
from screening.trend_filter import filter_by_trend_template
from screening.universe import filter_universe

CONFIG_DIR = Path(__file__).parent.parent / "config"


def load_config(name: str) -> dict:
    with open(CONFIG_DIR / f"{name}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _kis_market_param(markets: list[str]) -> str:
    normalized = {m.upper() for m in markets}
    if normalized == {"KOSPI"}:
        return "kospi"
    if normalized == {"KOSDAQ"}:
        return "kosdaq"
    return "all"


def _build_raw_metrics(
    source: KisPriceSource,
    survivors: pd.DataFrame,
    bars_by_code: dict[str, pd.DataFrame],
    factors_cfg: dict,
) -> pd.DataFrame:
    """트렌드 템플릿까지 통과한 종목들의 raw 지표를 build_sub_scores()가 요구하는 형태로 조립.

    quality(영업이익/투하자본/OCF/이자비용)와 eps_growth_pct는 KIS가 제공하지 않으므로
    0으로 채운다 — quality_score와 value_score(PEG 부분)가 0점 처리된다는 뜻이다
    (모듈 docstring 참고).
    """
    trend_cfg = factors_cfg["trend_template"]
    volatility_cfg = factors_cfg["volatility"]

    rows: dict[str, dict] = {}
    for code in survivors.index:
        bars = bars_by_code[code]
        conditions = trend_template_conditions(
            bars, trend_cfg["ma_periods"], trend_cfg["low_252d_buffer"], trend_cfg["high_252d_buffer"]
        )
        atr_ratio = compute_atr_ratio(bars, volatility_cfg["atr_period"]).iloc[-1]

        try:
            per = source.fetch_stock_quote(code)["per"]
        except KisApiError:
            per = 0.0

        rows[code] = {
            "rs_percentile": survivors.loc[code, "rs_percentile"],
            "price_above_all_ma": conditions["price_above_all_ma"],
            "ma_long_trending_up": conditions["ma_long_trending_up"],
            "above_52w_low": conditions["above_52w_low"],
            "near_52w_high": conditions["near_52w_high"],
            # KIS 미제공 — quality_score를 명시적으로 0점 처리하기 위한 플레이스홀더
            "operating_cash_flow": 0.0,
            "net_income": 0.0,
            "roic": 0.0,
            "interest_coverage": 0.0,
            "atr_ratio": atr_ratio,
            "per": per,
            # KIS 미제공 — PEG를 inf로 만들어 value_score를 명시적으로 0점 처리하기 위한 플레이스홀더
            "eps_growth_pct": 0.0,
        }

    return pd.DataFrame.from_dict(rows, orient="index")


def run(as_of: date, source: KisPriceSource | None = None) -> pd.DataFrame:
    """KIS Open API로 as_of(오늘) 시점 스크리닝을 실행한다.

    1. 시가총액 유니버스 조회 (오늘 시점만 가능)
    2. 일봉 히스토리 확보 (20일 평균 거래대금·RS·추세템플릿·ATR 계산용)
    3. 유니버스 필터 (시총 + 20일 평균 거래대금 + 주가)
    4. RS 필터 (상위 percentile)
    5. 트렌드 템플릿 하드 필터 (4조건 전부 충족)
    6. 서브스코어 채점 + 커트라인
    """
    if as_of != date.today():
        raise ValueError(
            f"KisPriceSource는 오늘({date.today()}) 시점만 지원합니다 (요청: {as_of}). "
            "과거 시점 스크리닝/백테스트에는 KrxPriceSource 기반 파이프라인을 사용하세요."
        )

    universe_cfg = load_config("universe")
    factors_cfg = load_config("factors")
    score_cfg = load_config("score_table")

    source = source or KisPriceSource(KisEnv.from_env())
    if not source.env.configured:
        raise RuntimeError(
            "KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCOUNT_NO가 설정되지 않았습니다. "
            "quant/.env.example을 복사해 .env로 저장하고 값을 채운 뒤 다시 실행하세요."
        )

    print("[1/6] 시가총액 유니버스 조회 중...")
    pool = source.fetch_market_cap_universe(
        min_market_cap_eok=universe_cfg["min_market_cap"] / 1e8,
        market=_kis_market_param(universe_cfg["market"]),
    )
    if not pool:
        return pd.DataFrame()
    snapshot = pd.DataFrame(pool).set_index("code")
    snapshot["close"] = snapshot["price"]
    snapshot["market_cap"] = snapshot["market_cap_eok"] * 1e8
    print(f"      시가총액 조건 통과: {len(snapshot)}종목")

    print("[2/6] 일봉 히스토리 조회 중... (종목 수에 비례해 수 분 소요될 수 있음)")
    start = as_of - timedelta(days=400)
    bars_by_code = source.fetch_daily_bars_many(list(snapshot.index), start, as_of)
    bars_by_code = {code: bars for code, bars in bars_by_code.items() if bars is not None and not bars.empty}
    snapshot = snapshot.loc[snapshot.index.intersection(list(bars_by_code.keys()))]
    print(f"      일봉 확보: {len(snapshot)}종목")
    if snapshot.empty:
        return pd.DataFrame()

    snapshot["avg_trading_value_20d"] = pd.Series(
        {code: (bars_by_code[code]["close"] * bars_by_code[code]["volume"]).tail(20).mean() for code in snapshot.index}
    )

    filtered = filter_universe(
        snapshot,
        min_market_cap=universe_cfg["min_market_cap"],
        min_avg_trading_value_20d=universe_cfg["min_avg_trading_value_20d"],
        min_price=universe_cfg["min_price"],
    )
    print(f"[3/6] 유니버스 필터(시총·거래대금·주가) 통과: {len(filtered)}종목")
    if filtered.empty:
        return pd.DataFrame()

    momentum_cfg = factors_cfg["momentum"]
    rs_raw = pd.Series(
        {
            code: compute_rs_raw(bars_by_code[code]["close"], momentum_cfg["lookback_months"], momentum_cfg["weights"])
            for code in filtered.index
        }
    )
    rs_filtered = filter_by_rs(filtered, rs_raw, momentum_cfg["universe_percentile_cutoff"])
    print(f"[4/6] RS 상위 {(1 - momentum_cfg['universe_percentile_cutoff']) * 100:.0f}% 필터 통과: {len(rs_filtered)}종목")
    if rs_filtered.empty:
        return pd.DataFrame()

    trend_cfg = factors_cfg["trend_template"]
    trend_price_by_ticker = {code: bars_by_code[code] for code in rs_filtered.index}
    trend_filtered = filter_by_trend_template(
        rs_filtered,
        trend_price_by_ticker,
        trend_cfg["ma_periods"],
        trend_cfg["low_252d_buffer"],
        trend_cfg["high_252d_buffer"],
    )
    print(f"[5/6] 트렌드 템플릿 통과: {len(trend_filtered)}종목")
    if trend_filtered.empty:
        return pd.DataFrame()

    raw_metrics = _build_raw_metrics(source, trend_filtered, bars_by_code, factors_cfg)
    sub_scores = build_sub_scores(raw_metrics, factors_cfg)
    scored = score_candidates(trend_filtered, sub_scores, score_cfg["weights"])
    passed = apply_cutoff(scored, cutoff=score_cfg["cutoff"])
    print(f"[6/6] 커트라인({score_cfg['cutoff']}점) 통과: {len(passed)}종목")

    return passed


def main() -> None:
    parser = argparse.ArgumentParser(description="주말 스크리닝 파이프라인 (KIS Open API, 오늘 시점만 지원)")
    parser.add_argument("--as-of", type=str, default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--out", type=str, default="out/screening.csv")
    args = parser.parse_args()

    as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = run(as_of)
    except (ValueError, RuntimeError) as error:
        print(f"실행 중단: {error}")
        raise SystemExit(1) from error

    result.to_csv(out_path, encoding="utf-8-sig")
    print(f"스크리닝 완료: {len(result)}개 종목 -> {out_path}")


if __name__ == "__main__":
    main()
