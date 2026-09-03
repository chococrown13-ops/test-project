# 가이드 문서 자리

이 디렉터리는 실제 종목선정/매매 가이드 문서를 위한 자리입니다.

대화에서 언급된 두 가이드("종목선정 가이드", 스윙 점수표/커트라인/R-multiple 관련 문서)는
이 저장소(`test-project`, 축구 매니지먼트 게임 프로젝트)에 존재하지 않았습니다.

## 점수표 배점 (현재 상태)

`quant/config/score_table.yaml`의 배점은 다음과 같이 채워져 있습니다.

| 항목 | 배점 | 근거 |
|---|---|---|
| rs_score | 30 | 대화 중 확인된 값 |
| trend_score | 25 | 대화 중 확인된 값 |
| quality_score | 20 | 가이드 부재로 임시 배정: 모멘텀과 상관관계가 낮아 분산 효과가 있는 요소를 상대적으로 높게 |
| volatility_score | 15 | 가이드 부재로 임시 배정: ATR 2~6% 구간에서 스윙 트레이딩에 적합한 변동성을 스코어링 |
| value_score | 10 | 가이드 부재로 임시 배정: 모멘텀과 대체로 역상관이라 비중을 낮게 둠 |

**주의**: `quality_score`/`volatility_score`/`value_score`(총 45점)의 정확한 배점은 실제
가이드 문서가 없어 사용자와 상의해 임시로 정한 값입니다. 가이드 문서가 확보되면
반드시 그 기준으로 재검토하세요.

## 해야 할 일

1. 실제 가이드 문서(마크다운/PDF)를 이 디렉터리에 추가
2. `config/score_table.yaml`의 임시 배점을 가이드 3-3 기준으로 재검토/수정
3. `config/universe.yaml`, `config/factors.yaml`의 구체적 수치(시총 하한, ATR 구간 등)를
   가이드 문서 기준으로 다시 검토
4. `screening/score.py::validate_weights()`가 배점 합계 100을 강제하므로,
   빠짐없이 채워야 파이프라인이 동작함
5. 각 서브스코어(quality_score 등)를 0~1로 정규화하는 계산 함수가 아직 없음 —
   `factors/*.py`의 raw 계산 함수(compute_roic, in_per_band 등)는 있지만, 이를 조합해
   0~1 점수로 만드는 로직은 `screening/score.py::score_candidates()`를 호출하기 전
   별도로 구현해야 함
