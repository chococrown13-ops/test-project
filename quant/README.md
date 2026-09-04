# Quant Swing Trading Pipeline

국내 주식 스윙 트레이딩용 퀀트 스크리닝/백테스트 파이프라인 스켈레톤.

세부 구조와 원칙, 다음 구현 단계는 [`CLAUDE.md`](./CLAUDE.md)를 참고하세요.

## 빠른 시작

```bash
cd quant
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -v
```

## 상태

- 팩터 계산(RS/트렌드템플릿/ATR비율/퀄리티/밸류), 서브스코어 정규화, 스크리닝 파이프라인,
  포지션 사이징, 이벤트 기반 백테스트 엔진, 룩어헤드/생존편향 방지 테스트까지 구현 완료 (75개 테스트 통과)
- `pipeline/run_screening.py`가 `KisPriceSource`(시세)와 `DartFundamentalSource`(재무, 선택)에
  연결되어 실제로 동작함: `.env` 채우고 `python -m pipeline.run_screening --out out/screening.csv`
  실행하면 오늘 시점 스크리닝 결과가 CSV로 나옴. 2026-09-04 실제 계정으로 검증 완료
  (DART 계정명 매칭 버그 발견·수정, ATR 변동성 밴드 조정 — `CLAUDE.md` 참고)
- `pipeline/run_backtest.py`가 실제 스크리닝 로직(유니버스/RS/트렌드템플릿/quality·value/커트라인)을
  그대로 재사용해 과거 데이터를 백테스트함: `python -m pipeline.run_backtest --years 2 --out out/backtest`.
  "오늘 유니버스 고정" 근사(생존편향 있음)와 PER 역산 근사가 있으니 `CLAUDE.md`의 "백테스트" 섹션을
  먼저 볼 것
- **알아둘 것**: `DART_API_KEY`를 채우면 quality_score/value_score(PEG)에 실제 재무데이터가
  들어간다. 비워두면 기존처럼 0점 처리되어 커트라인(70점) 통과가 훨씬 엄격해진다. 다수 종목을
  조회할 때(백테스트 등) DART가 버스트 요청에 IP를 차단할 수 있으니 반드시
  `DartFundamentalSource`를 통해서만 호출할 것(요청 쓰로틀 내장)
- `config/score_table.yaml`의 quality/volatility/value 배점은 실제 가이드 문서 부재로 임시 배정한 값
  (`docs/README.md` 참고)
