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
  포지션 사이징, 이벤트 기반 백테스트 엔진, 룩어헤드/생존편향 방지 테스트까지 구현 완료 (40개 테스트 통과)
- `data/sources/kis.py::KisPriceSource` — 한국투자증권 Open API 연동 완료 (`.env.example` 참고).
  실시간 스크리닝용. 과거 대량 이력/유니버스 스냅샷은 `data/sources/krx.py`(pykrx) 병행 필요
  — 자세한 사유는 `CLAUDE.md`의 "데이터 소스: KIS vs pykrx" 참고
- 재무데이터(ROIC/OCF/이자보상배율)는 KIS·pykrx 둘 다 제공하지 않음 — OpenDART 등 별도 연동 필요
- `config/score_table.yaml`의 quality/volatility/value 배점은 실제 가이드 문서 부재로 임시 배정한 값
  (`docs/README.md` 참고)
