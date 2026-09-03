"""전체 스크리닝 파이프라인 실행 (CLI).

사용 예:
    python -m pipeline.run_screening --as-of 2026-09-03 --out out/screening_2026-09-03.csv
"""
from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import yaml

CONFIG_DIR = Path(__file__).parent.parent / "config"


def load_config(name: str) -> dict:
    with open(CONFIG_DIR / f"{name}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def run(as_of: date) -> pd.DataFrame:
    load_config("universe")
    load_config("factors")
    load_config("score_table")

    raise NotImplementedError(
        "실제 데이터 소스(data/sources)를 연결한 뒤 아래 단계를 채우세요:\n"
        "1. data.loader로 유니버스 스냅샷 로드\n"
        "2. screening.universe.filter_universe()\n"
        "3. factors.momentum으로 RS 계산 -> screening.rs_filter.filter_by_rs()\n"
        "4. screening.trend_filter.filter_by_trend_template()\n"
        "5. 각 팩터 서브스코어 계산 -> screening.score.score_candidates()\n"
        "6. screening.score.apply_cutoff(cutoff=score_cfg['cutoff'])\n"
        "7. 결과 DataFrame 반환"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="주말 스크리닝 파이프라인")
    parser.add_argument("--as-of", type=str, default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--out", type=str, default="out/screening.csv")
    args = parser.parse_args()

    as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    result = run(as_of)
    result.to_csv(out_path, encoding="utf-8-sig")
    print(f"스크리닝 완료: {len(result)}개 종목 -> {out_path}")


if __name__ == "__main__":
    main()
