# 땡그랑 (ttaeng/)

AI 사무실이 운영하는 생활 돈 계산 카드뉴스 채널 「땡그랑」(애칭 땡이)입니다.
대표(사용자)는 **결정과 업로드만** 합니다. 추가 비용 0원 원칙 (AI 이미지·영상 생성 API, 유료 도구 금지).

- 브랜드: `brand.md` · 대표 결정 기록: `decisions.md` · 전략 회의 메모: `strategy/`
- 캐릭터 그리기: `tools/ttaeng_svg.py` (코드 그림) · 글꼴: `tools/fonts/` · 영상 엮기(나중에): `tools/make_video.py`
- 전략 회의: `.claude/skills/strategy-office/SKILL.md` + `.claude/agents/strategy-*.md` (여섯 부서)
- AI 사무실(픽셀 오피스): 비공개 저장소 `chococrown13-ops/otter-studio-ai-office`, 화면 https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi

## 사무실 db (ArtifactData, url = 위 사무실 링크)
| 컬렉션 | 내용 |
|---|---|
| `strategy/<회의id>` | 전략 회의 결정 메모 {title, at, status, agenda[{id, question, options[{key,name,pros,cons,cost,ceoWork}], recommend, why, dissent, sources}], memo, decisions} |
| `episodes/<id>` | 현황판 (카드뉴스 편이 생기면) {title, corner, status, facts, ceoTodo, link, costUsd} |
| `reviews/<id>` · `approvals/<id>` | 결재함 기획안 · 대표 결정 |
| `files/<id>` | 자료실 목록 {name, episode, kind, parts[asset id], sizeBytes, contentType, from, note, createdAt} — 15MB 넘으면 조각(첫 바이트 `<` 피하기) |
| `log` | 진행 기록 {at: 실제 UTC 시각, who, text} |
| `locks/<키>` · `handoff/<id>` | 중복 실행 막기 · 푸시 못 한 작업 파일 |

## 🤖 자동 진행 (사무실 버튼 → 루틴 「땡그랑 사무실 작업」 → 새 세션)
| 요청 | 할 일 |
|---|---|
| `전략 회의: <안건>` | strategy-office 스킬로 여섯 부서 검토 → `strategy/` 메모 + db `strategy/<회의id>` |
| `전략 결정: <회의id> · A1=key, …` | 같은 스킬 "결정이 나면" → `decisions.md`·`brand.md` 갱신, log |
| `다음 카드뉴스 기획` | 제작 라인이 생기기 전까지는 "먼저 전략 회의실에서 주제·플랫폼을 정해 주세요" log 한 줄 |
| `연결 테스트` | 저장소·db·푸시 권한 확인 후 log 한 줄 |

- 예약 실행(매일 09:00 KST, 요청 없음): 결정할 것이 있으면 "오늘 대표님 할 일" 한 줄만 log, 없으면 아무것도 안 남김.
- 이전 채널(궁금해달)은 2026-10-13 에 저장소·사무실 db·자료실에서 모두 정리했어요. 되살리지 마세요.
- 카드뉴스 제작 라인(기획 → 사실 확인 → 카드 디자인 → 검수 → 결재)은 전략 회의 결정 뒤에 만듭니다.
- 업로드·계정 만들기 하지 않음. 커밋 전 `git pull --rebase`. 보고는 쉬운 한국어로 짧게.
