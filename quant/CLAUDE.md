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
  sources/kis.py   # 한국투자증권(KIS) Open API — 실시간 시세/랭킹용 (아래 "데이터 소스" 참고)
  sources/krx.py   # pykrx — 과거 대량 이력/유니버스 스냅샷용
  sources/dart.py  # OpenDART — 재무제표 원본(ROIC/OCF/이자보상배율/EPS성장률용)
factors/      # 팩터 계산 (모멘텀/추세/변동성/퀄리티/밸류)
screening/    # 유니버스 필터 → RS 필터 → 트렌드 템플릿 → 점수표 채점
portfolio/    # ATR 기반 포지션 사이징, 리밸런싱
backtest/     # 이벤트 기반 백테스트 엔진, 비용 모델, 성과 지표, 리포트
pipeline/     # CLI 진입점 (run_screening.py)
tests/        # 룩어헤드/생존편향 검증 테스트 포함
scripts/      # cron/CI용 실행 스크립트
```

## 데이터 소스: KIS vs pykrx vs DART

세 소스를 용도별로 나눠 쓴다 (`data/sources/kis.py`, `data/sources/dart.py` 상단 docstring에 근거 정리됨).

| 용도 | 소스 | 이유 |
|---|---|---|
| 주말 스크리닝(오늘 시점 신호 생성) | `KisPriceSource` (`data/sources/kis.py`) | PER/PBR/EPS/BPS, 외국인·기관 순매수까지 실시간으로 제공, 무료 |
| 과거 수년치 대량 백테스트 | `KrxPriceSource` (`data/sources/krx.py`, pykrx) | KIS 일봉 조회는 호출당 최대 ~95거래일 캡이라 여러 번 나눠 호출해야 함(느림·불안정) |
| 특정 과거 시점 유니버스(생존편향 방지) | `KrxPriceSource` | KIS 랭킹 API는 "오늘 시점"만 가능. `KisPriceSource.get_universe()`는 오늘이 아닌 날짜에 `NotImplementedError`를 던지도록 명시적으로 막아둠 |
| 재무제표(ROIC/OCF/이자보상배율/EPS성장률) | `DartFundamentalSource` (`data/sources/dart.py`) | OpenDART가 유일하게 재무제표 원본 라인아이템을 제공. KIS·pykrx 둘 다 없음 |

KIS·DART 인증 정보는 `.env.example`을 복사해 `.env`로 저장하고 채운다 (커밋 금지, `.gitignore`에
등록됨). `DART_API_KEY`는 선택 사항 — 없으면 quality_score/value_score(PEG)가 0으로 처리된 채
기존처럼 동작한다.

`data/sources/kis.py`의 우회 로직(가격구간 나눠 시총 랭킹 30종목 캡 우회, 일봉 청크 분할 등)은
`otterstock-ai-office`(chococrown13-ops) 저장소의 `worker/kis.ts`에서 실측 검증된 방식을 그대로 옮긴 것이다.

`data/sources/dart.py`는 2026-09-04에 실제 API 키로 검증했다. 계정명 매칭 후보
(`ACCOUNT_CANDIDATES`)는 삼성전자/SK하이닉스 실제 응답으로 확인했고, `interest_expense`는
본표에 `이자비용` 대신 `금융비용`으로 잡히는 경우가 많아 fallback을 추가했다(더 넓은 개념이라
이자보상배율이 실제보다 보수적으로 나올 수 있는 근사치). 다른 종목/업종에서 quality_score가
비정상적으로 0에 몰려 있으면 여전히 `DartFundamentalSource.debug_list_accounts()`로 실제
응답의 (sj_div, account_nm)을 확인해 `ACCOUNT_CANDIDATES`를 보정할 것.
EPS 성장률은 실제 EPS가 아니라 당기순이익 YoY 성장률로 근사한다(`eps_growth_pct_proxy`,
발행주식수 변동 미반영). ROIC의 투하자본은 `자산총계 - 유동부채`로 근사한다(이자부채만 분리한
정밀 계산 아님) — 둘 다 실용적 근사치이며 필요하면 더 정밀하게 다듬을 수 있다.

**DART 요청 폭주 주의**: `get_financials()`는 종목 하나당 (연도 x 보고서유형) 최대 수십 건의
HTTP 요청을 낸다. 실측 결과 지연 없이 여러 종목을 연속 조회하면(예: 백테스트) DART의
방화벽/WAF가 버스트를 어뷰징으로 보고 해당 IP의 모든 연결을 20분 이상 강제 리셋시켰다.
`DartFundamentalSource._get()`에 요청 간 최소 0.3초 간격(`MIN_REQUEST_INTERVAL_SECONDS`)이
걸려있으니 다수 종목을 조회하는 새 코드를 짤 때도 이 소스를 통해서만 호출할 것 — 직접
`requests`로 우회하지 말 것.

## 실행

```bash
cd quant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # KIS_APP_KEY 등, 선택적으로 DART_API_KEY 채우기
python -m pytest                   # 테스트
python -m pipeline.run_screening --out out/screening.csv   # 오늘 시점 스크리닝 실행
```

`pipeline/run_screening.py::run()`은 `KisPriceSource`(시세·유니버스)와 `DartFundamentalSource`
(재무데이터, 선택)를 연결해 동작한다: 유니버스 → 20일 평균 거래대금까지 채운 유니버스 필터 →
RS 상위 percentile → 트렌드 템플릿 하드 필터 → 서브스코어 채점 → 커트라인.

`DART_API_KEY`가 설정되어 있으면 `_build_raw_metrics()`가 `pipeline/dart_quality.py::
dart_quality_inputs()`(run_backtest.py와 공유)를 통해 quality_score·value_score(PEG)에
실제 재무데이터를 채운다. 없거나 특정 종목의 DART 조회가 실패하면 **그 종목만** 기존처럼
0으로 처리된다 — 파이프라인 전체가 죽지 않는다. DART 없이 KIS만 연결된 상태에서는
커트라인(70점)을 넘으려면 rs_score+trend_score+volatility_score(최대 70점)가 사실상
만점에 가까워야 한다는 점은 여전히 유효하다.

## 백테스트

```bash
python -m pipeline.run_backtest --years 2 --out out/backtest   # 실제 스크리닝 로직 기반 과거 백테스트
```

`pipeline/run_backtest.py::run()`은 `backtest/engine.py`에 매주(금요일) 재스크리닝하는
`screening_fn`을 주입한다 — 유니버스 필터→RS→트렌드템플릿→quality/value 서브스코어→커트라인까지
`run_screening.py`와 완전히 동일한 함수(`screening/*`, `factors/*`, `pipeline/dart_quality.py`)를
그대로 쓴다. 다만 **두 가지 근사**가 있다 (모듈 docstring에 상세):
1. KIS는 "오늘" 유니버스만 제공하므로, 오늘 유니버스를 전체 백테스트 기간의 고정 후보 풀로
   쓴다 — 상장폐지/신규상장 미반영, 생존편향 있음 (`data/validate.py::check_survivorship`
   경고가 항상 뜬다, 의도된 것)
2. 과거 시점 PER을 주는 무료 API가 이 환경에 없어(pykrx의 시가총액/펀더멘털 스냅샷
   엔드포인트가 이 환경에서 깨져있음, `get_ohlcv`만 정상 동작), 발행주식수를 "오늘 시총/오늘
   종가"로 고정 근사해 과거 PER을 역산한다

2026-09-04 실제 KIS/DART로 2년치(319종목 근사 유니버스, 119건 거래) 백테스트한 결과:
CAGR +37.5%, 기대값 +1.07R, 커트라인 바로 위(70~74점) 구간이 가장 약한 성과(평균 0.11R)를
보여 커트라인 자체는 대체로 타당하나 "턱걸이 통과"는 신뢰도가 낮다는 정황을 확인했다. 위
근사들 때문에 정밀한 숫자보다는 방향성 참고용으로 볼 것.

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
   (`tests/test_run_screening.py`로 검증)
3b. ~~OpenDART 연동~~ 완료 — `data/sources/dart.py::DartFundamentalSource`가 quality_score/
    value_score(PEG)에 실제 재무데이터를 채움 (`tests/test_dart_source.py`로 검증). **단,
    계정명 매칭이 실제 API로 미검증** — 실제 키로 첫 실행 시 `debug_list_accounts()`로 확인 필요
    (위 "데이터 소스" 섹션 참고)
4. ~~스크리닝 결과 실제 KIS/DART 계정으로 1회 실행~~ 완료 (2026-09-04) — 첫 실행은 커트라인
   0종목이었는데, 원인이 volatility 밴드(2~6%)가 실제 트렌드템플릿 통과 종목의 ATR 분포
   (5.5~10%)와 안 맞아서였음을 확인하고 상한을 10%로 조정(`config/factors.yaml`). 조정 후
   4종목 통과. 이 값도 하루치 표본 기반 임시값이라 재검증 필요 (`config/factors.yaml` 주석 참고)
5. ~~`backtest/engine.py`로 과거 데이터 백테스트~~ 완료 — `pipeline/run_backtest.py`가
   `KrxPriceSource`(가격) + `DartFundamentalSource`(재무) + `score_bucket_performance`로
   커트라인 70점의 유효성을 확인함 (위 "백테스트" 섹션 참고). **단, 완전한 시점별 유니버스가
   아니라 "오늘 유니버스 고정" 근사** — 이 환경에서 pykrx의 시가총액/펀더멘털 스냅샷
   엔드포인트가 깨져 있어 진짜 생존편향 없는 유니버스 재구성은 아직 미구현
6. 실행 결과가 안정적이면 `.github/workflows/quant-screening.yml`로 주말 자동화
7. 가이드 문서가 확보되면 `score_table.yaml`의 임시 배점(quality 20/volatility 15/value 10)과
   `quality_subscore`/`value_subscore`/`volatility_subscore`의 정규화 방식(선형 스케일링,
   구간 중앙 피크 등)을 그 기준으로 재검토
8. (신규) `pipeline/run_backtest.py`의 "오늘 유니버스 고정" 근사를 진짜 시점별 유니버스로
   교체 — pykrx의 `get_market_cap_by_ticker`/`get_market_fundamental_by_date`가 이 환경에서
   깨져 있는 원인을 파악하거나(로그인 필요 여부 등), 다른 데이터 소스로 과거 시가총액 스냅샷을
   확보해야 함
