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

- 팩터 계산(RS/트렌드템플릿/ATR비율/퀄리티/밸류), 스크리닝 파이프라인, 포지션 사이징,
  이벤트 기반 백테스트 엔진, 룩어헤드/생존편향 방지 테스트까지 스켈레톤 구현 완료 (16개 테스트 통과)
- 실제 데이터 소스(pykrx/재무데이터) 연동은 아직 미완성 — `data/sources/krx.py`, `docs/README.md` 참고
- `config/score_table.yaml`의 배점 중 절반은 실제 가이드 문서 기준으로 채워야 함 (현재 `null`)
