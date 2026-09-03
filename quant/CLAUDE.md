# quant/ - 퀀트 스윙 트레이딩 파이프라인

국내 주식 스윙 트레이딩 규칙(스크리닝 4축 → 점수표 → 커트라인)을 코드로 고정하고,
과거 데이터로 기대값을 검증하기 위한 파이프라인입니다.

**중요**: 이 파이프라인이 구현하는 정확한 스크리닝 기준(스코어 배점, 유니버스 필터
수치 등)은 실제 "종목선정 가이드" 문서를 기준으로 삼아야 합니다. 해당 문서는 아직
이 저장소에 없습니다 (`docs/README.md` 참고). `score_table.yaml`의 quality/volatility/value
배점(20/15/10)은 가이드 부재로 사용자와 상의해 임시 배정한 값이므로, 가이드 문서가
`quant/docs/`에 추가되면 그 기준으로 반드시 재검토하세요.

## 구조

```
config/       # 유니버스/팩터/점수표/백테스트 파라미터 (YAML)
data/         # 시세·재무 데이터 소스, 캐싱, 정합성 검증
factors/      # 팩터 계산 (모멘텀/추세/변동성/퀄리티/밸류)
screening/    # 유니버스 필터 → RS 필터 → 트렌드 템플릿 → 점수표 채점
portfolio/    # ATR 기반 포지션 사이징, 리밸런싱
backtest/     # 이벤트 기반 백테스트 엔진, 비용 모델, 성과 지표, 리포트
pipeline/     # CLI 진입점 (run_screening.py)
tests/        # 룩어헤드/생존편향 검증 테스트 포함
scripts/      # cron/CI용 실행 스크립트
```

## 실행

```bash
cd quant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest                          # 테스트
python -m pipeline.run_screening --help    # 스크리닝 실행 (데이터 소스 연동 전까지 NotImplementedError)
```

## 원칙 (위반하면 안 되는 것)

1. **룩어헤드 금지**: 재무데이터는 `report_date + financial_data_lag_days <= as_of`인 것만 사용
   (`factors/quality.py::as_of_available_financials`, `tests/test_no_lookahead.py` 참고)
2. **생존편향 금지**: 유니버스는 항상 `as_of` 시점 스냅샷으로 조회 (상장폐지 종목 포함)
   (`data/validate.py::check_survivorship`)
3. **배점 합계 100 강제**: `screening/score.py::validate_weights()`가 검증. `score_table.yaml`에
   `null`이 남아있으면 파이프라인이 명시적으로 실패함 (조용히 넘어가지 않음)
4. **거래비용 반영**: 모든 백테스트 체결은 `backtest/costs.py`의 슬리피지+거래세를 통과
5. **파라미터 강건성**: 백테스트 결과를 하나의 파라미터 조합으로만 보지 말고, 핵심 파라미터를
   ±20% 흔들어도 성과가 유지되는지 확인 (과최적화 방지)

## 다음 단계 (구현 순서 권장)

1. `data/sources/krx.py` 실데이터 연동 확인 (pykrx 설치, 재무데이터는 별도 소스 필요)
2. quality/volatility/value 서브스코어를 0~1로 정규화하는 계산 함수 구현
   (`factors/quality.py`, `factors/volatility.py`, `factors/value.py`에 raw 계산 함수는
   이미 있음 — 이를 조합해 0~1 점수로 만드는 로직이 빠져 있음)
3. `pipeline/run_screening.py::run()`의 `NotImplementedError` 채우기 (docstring에 단계별 순서 있음)
4. 스크리닝 결과를 CSV로 뽑아 상위 10개가 합리적인지 육안 검증
5. `backtest/engine.py`로 과거 데이터 백테스트 → `backtest/report.py`의
   `score_bucket_performance`로 커트라인 70점이 실제로 유효한지 확인
6. 실행 결과가 안정적이면 `.github/workflows/quant-screening.yml`로 주말 자동화
7. 가이드 문서가 확보되면 `score_table.yaml`의 임시 배점(quality 20/volatility 15/value 10)을
   재검토
