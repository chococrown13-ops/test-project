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
  포지션 사이징, 이벤트 기반 백테스트 엔진, 룩어헤드/생존편향 방지 테스트까지 구현 완료 (52개 테스트 통과)
- `pipeline/run_screening.py`가 `KisPriceSource`에 연결되어 실제로 동작함: `.env` 채우고
  `python -m pipeline.run_screening --out out/screening.csv` 실행하면 오늘 시점 스크리닝 결과가 CSV로 나옴
- **알아둘 것**: quality_score(20점)와 value_score의 PEG 부분은 KIS가 재무데이터/EPS 성장률을
  제공하지 않아 0점 고정됨 → 커트라인(70점) 통과가 원래 의도보다 훨씬 엄격함. 자세한 내용과
  KIS/pykrx 역할 분담은 `CLAUDE.md`의 "데이터 소스: KIS vs pykrx" 참고
- 과거 대량 이력/유니버스 스냅샷(백테스트용)은 `data/sources/krx.py`(pykrx) 병행 필요
- 재무데이터(ROIC/OCF/이자보상배율)는 KIS·pykrx 둘 다 제공하지 않음 — OpenDART 등 별도 연동 필요
- `config/score_table.yaml`의 quality/volatility/value 배점은 실제 가이드 문서 부재로 임시 배정한 값
  (`docs/README.md` 참고)
