# 가이드 문서 자리

이 디렉터리는 실제 종목선정/매매 가이드 문서를 위한 자리입니다.

대화에서 언급된 두 가이드("종목선정 가이드", 스윙 점수표/커트라인/R-multiple 관련 문서)는
이 저장소(`test-project`, 축구 매니지먼트 게임 프로젝트)에 존재하지 않았습니다.
`quant/config/score_table.yaml`의 배점 중 `rs_score`(30점)와 `trend_score`(25점)만
대화 중 확인된 값이고, 나머지 45점(퀄리티/밸류/변동성)은 `null`로 남아 있습니다.

## 해야 할 일

1. 실제 가이드 문서(마크다운/PDF)를 이 디렉터리에 추가
2. `config/score_table.yaml`의 `null` 항목을 가이드 3-3 기준 배점으로 채우기
3. `config/universe.yaml`, `config/factors.yaml`의 구체적 수치(시총 하한, ATR 구간 등)를
   가이드 문서 기준으로 다시 검토
4. `screening/score.py::validate_weights()`가 배점 합계 100을 강제하므로,
   빠짐없이 채워야 파이프라인이 동작함
