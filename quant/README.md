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
  포지션 사이징, 이벤트 기반 백테스트 엔진, 룩어헤드/생존편향 방지 테스트까지 구현 완료 (71개 테스트 통과)
- `pipeline/run_screening.py`가 `KisPriceSource`(시세)와 `DartFundamentalSource`(재무, 선택)에
  연결되어 실제로 동작함: `.env` 채우고 `python -m pipeline.run_screening --out out/screening.csv`
  실행하면 오늘 시점 스크리닝 결과가 CSV로 나옴
- **알아둘 것**: `DART_API_KEY`를 채우면 quality_score/value_score(PEG)에 실제 재무데이터가
  들어간다. 비워두면 기존처럼 0점 처리되어 커트라인(70점) 통과가 훨씬 엄격해진다. DART 계정명
  매칭은 실제 API 키로 검증되지 않았으니 처음 연동할 때 `CLAUDE.md`의 "데이터 소스" 섹션을 먼저 볼 것
- 과거 대량 이력/유니버스 스냅샷(백테스트용)은 `data/sources/krx.py`(pykrx) 병행 필요
- `config/score_table.yaml`의 quality/volatility/value 배점은 실제 가이드 문서 부재로 임시 배정한 값
  (`docs/README.md` 참고)
