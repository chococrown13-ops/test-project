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
  sources/kis.py  # 한국투자증권(KIS) Open API — 실시간 스크리닝용 (아래 "데이터 소스" 참고)
  sources/krx.py  # pykrx — 과거 대량 이력/유니버스 스냅샷용
factors/      # 팩터 계산 (모멘텀/추세/변동성/퀄리티/밸류)
screening/    # 유니버스 필터 → RS 필터 → 트렌드 템플릿 → 점수표 채점
portfolio/    # ATR 기반 포지션 사이징, 리밸런싱
backtest/     # 이벤트 기반 백테스트 엔진, 비용 모델, 성과 지표, 리포트
pipeline/     # CLI 진입점 (run_screening.py)
tests/        # 룩어헤드/생존편향 검증 테스트 포함
scripts/      # cron/CI용 실행 스크립트
```

## 데이터 소스: KIS vs pykrx

두 소스를 용도별로 나눠 쓴다 (`data/sources/kis.py` 상단 docstring에 근거 정리됨).

| 용도 | 소스 | 이유 |
|---|---|---|
| 주말 스크리닝(오늘 시점 신호 생성) | `KisPriceSource` (`data/sources/kis.py`) | PER/PBR/EPS/BPS, 외국인·기관 순매수까지 실시간으로 제공, 무료 |
| 과거 수년치 대량 백테스트 | `KrxPriceSource` (`data/sources/krx.py`, pykrx) | KIS 일봉 조회는 호출당 최대 ~95거래일 캡이라 여러 번 나눠 호출해야 함(느림·불안정) |
| 특정 과거 시점 유니버스(생존편향 방지) | `KrxPriceSource` | KIS 랭킹 API는 "오늘 시점"만 가능. `KisPriceSource.get_universe()`는 오늘이 아닌 날짜에 `NotImplementedError`를 던지도록 명시적으로 막아둠 |
| 재무제표(ROIC/OCF/이자보상배율) | 둘 다 없음 — OpenDART 등 별도 연동 필요 | KIS는 PER/PBR/EPS/BPS 비율만 제공, 원본 재무 라인아이템 없음 |

KIS 인증 정보는 `.env.example`을 복사해 `.env`로 저장하고 채운다 (커밋 금지, `.gitignore`에 등록됨).
`data/sources/kis.py`의 우회 로직(가격구간 나눠 시총 랭킹 30종목 캡 우회, 일봉 청크 분할 등)은
`otterstock-ai-office`(chococrown13-ops) 저장소의 `worker/kis.ts`에서 실측 검증된 방식을 그대로 옮긴 것이다.

## 실행

```bash
cd quant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # KIS_APP_KEY 등 채우기
python -m pytest                   # 테스트
python -m pipeline.run_screening --out out/screening.csv   # 오늘 시점 스크리닝 실행
```

`pipeline/run_screening.py::run()`은 `KisPriceSource`를 그대로 연결해 동작한다
(유니버스 → 20일 평균 거래대금까지 채운 유니버스 필터 → RS 상위 percentile →
트렌드 템플릿 하드 필터 → 서브스코어 채점 → 커트라인). 단, **quality_score와
value_score의 PEG 부분은 KIS가 재무제표 원본/EPS 성장률을 제공하지 않아 0으로
고정**되어 있다 (`_build_raw_metrics()`, 사용자와 상의해 확정한 임시 조치).
그 결과 커트라인(70점)을 넘으려면 rs_score+trend_score+volatility_score(최대
70점)가 사실상 만점에 가까워야 한다 — OpenDART 등으로 재무데이터를 연동하기
전까지는 원래 의도보다 훨씬 엄격한 스크리너로 동작한다는 뜻이다.

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

1. ~~KIS API 데이터 소스 구현~~ 완료 — `data/sources/kis.py::KisPriceSource` (`.env`에 KIS
   자격증명 채우면 바로 사용 가능, `tests/test_kis_source.py`로 검증). `data/sources/krx.py`는
   pykrx 설치 후 과거 대량 이력/유니버스 스냅샷용으로 병행
2. ~~서브스코어 정규화 함수 구현~~ 완료 — `factors/*.py`의 `*_subscore()` 함수들과
   이를 조합하는 `screening/subscores.py::build_sub_scores()` 참고. raw 팩터값 →
   `build_sub_scores()` → `screening.score.score_candidates()` → `apply_cutoff()`까지
   체인이 동작함 (`tests/test_subscores.py`로 검증)
3. ~~`run()` 배선~~ 완료 — `KisPriceSource`로 유니버스→RS→트렌드템플릿→채점까지 연결됨
   (`tests/test_run_screening.py`로 검증). quality_score/value_score(PEG)는 KIS 데이터
   공백으로 0 고정 — 재무데이터(OpenDART) 연동 시 `_build_raw_metrics()`에서 실제 값으로
   교체할 것
4. 스크리닝 결과를 CSV로 뽑아 상위 10개가 합리적인지 육안 검증 (실제 KIS 계정으로 1회 실행 필요)
5. `backtest/engine.py`로 과거 데이터 백테스트(`KrxPriceSource` 사용) → `backtest/report.py`의
   `score_bucket_performance`로 커트라인 70점이 실제로 유효한지 확인
6. 실행 결과가 안정적이면 `.github/workflows/quant-screening.yml`로 주말 자동화
7. 가이드 문서가 확보되면 `score_table.yaml`의 임시 배점(quality 20/volatility 15/value 10)과
   `quality_subscore`/`value_subscore`/`volatility_subscore`의 정규화 방식(선형 스케일링,
   구간 중앙 피크 등)을 그 기준으로 재검토
