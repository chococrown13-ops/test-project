#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# CI에서 여러 스텝이 같은 기준일을 써야 하므로 AS_OF를 환경변수로 덮어쓸 수 있게 둔다
# (스크립트 실행과 이후 스텝이 자정을 사이에 두면 날짜가 어긋난다).
AS_OF="${AS_OF:-$(date +%Y-%m-%d)}"
SCREENING_CSV="out/screening_${AS_OF}.csv"
BRIEF_MD="out/brief_${AS_OF}.md"

python -m pipeline.run_screening --as-of "$AS_OF" --out "$SCREENING_CSV"

# 지난주 결과(history/)와 비교해 브리핑을 쓰고, 이번 주 CSV를 history/에 보관한다.
# ANTHROPIC_API_KEY가 없으면 해설 없이 비교표만 담긴 브리핑이 나오고, 실패하지는 않는다.
python -m pipeline.weekly_brief \
  --current "$SCREENING_CSV" \
  --history history \
  --out "$BRIEF_MD"
