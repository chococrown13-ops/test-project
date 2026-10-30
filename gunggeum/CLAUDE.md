# 도시의 나이테 (gunggeum/)

AI 사무실이 운영하는 쇼츠 채널 「도시의 나이테」입니다. **도시의 과거·발전 과정·미래**를 **코드로 그린 30초 세로 영상**으로 보여 줘요(2026-10-30 대표 결정, `decisions.md`). 폴더 이름 `gunggeum/`은 이전 채널 「궁금해달」 때 이름 그대로예요.
대표(사용자)는 **결정·결재·업로드만** 합니다. 직접 녹화 없음. 월 예산 한도 약 5만 원이지만 코드 영상은 **제작비 0원**이에요.

- 제작 라인: `.claude/skills/city-line/SKILL.md` (기획 → 결재함 → 코드 렌더 → 자료실) · 주제 후보 `topics-city.md`
- 본보기 영상: `devlog/jamsil/`(N01 「잠실은 원래 섬이었다」) · `devlog/seoul2056/`(「2056년 서울」 시범) — 각 폴더에 `index.html`(render(t)) · `capture.cjs` · `audio.py` · `publish.md`
- 채널 프로필 사진: `brand/channel/profile.png`(B 시간 고리, 코드 원본 `profile.html`) · 글꼴 `tools/fonts/`(Pretendard)
- 대표 결정 기록: `decisions.md` · 전략 회의 메모: `strategy/` · 점검 보고서: `checks/` · 조사 보고서: 「조회수·수익 늘리기 조사 보고서」(Claude Docs)
- 전략 회의: `.claude/skills/strategy-office/SKILL.md` + `.claude/agents/strategy-*.md` · 스튜디오 점검: `.claude/skills/studio-check/SKILL.md` + `.claude/agents/inspect-*.md`
- AI 사무실 화면(픽셀 오피스): https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi · 화면 원본 저장소 `chococrown13-ops/otter-studio-ai-office` 브랜치 `claude/city-rings-office` (2026-10-30 원래 디자인 그대로 이름·문구만 「도시의 나이테」로. 캐피탈 데스크 레이아웃 시안은 `office/desk-layout-draft.html`에 보관만)
- 지난 채널: 「궁금해달」(해달 캐릭터, 2026-10-30 중단 — `episodes/`·`brand.md`·`tools/make_*.py`·`.claude/skills/shorts-line/`은 기록으로만 남김), 「땡그랑」(2026-10-25 종료, 커밋 ad79e37의 `ttaeng/`)

## 사무실 db (ArtifactData, url = 위 사무실 링크)
| 컬렉션 | 내용 |
|---|---|
| `episodes/<id>` | 현황판 {title, corner, status: 결재 대기/제작 중/업로드 대기/업로드 완료/취소, facts, ceoTodo, link, costUsd} — 새 채널 편은 `N01`… |
| `reviews/<id>` · `approvals/<id>` | 결재함 기획안 {summary, facts[{verdict, claim, line, source}], scenes[{year, head, sub, src}], checks, estCostUsd} · 대표 결정 {decision, memo, decidedAt} |
| `files/<id>` | 자료실 {name, episode, kind, parts[asset id], sizeBytes, contentType, from, note, createdAt} — 19MB 넘으면 조각 |
| `log` | 진행 기록 {at: 실제 UTC 시각, who, text} |
| `requests/<id>` | 버튼 요청 추적 {at, text, kind, by, status: 전달 중→전달됨→진행 중→완료/실패/건너뜀/보류(→멈춤), startedAt, doneAt, result, error} |
| `strategy/<회의id>` · `checks/<id>` | 전략 회의 메모 · 점검 보고서 |
| `locks/<키>` · `handoff/<id>` | 중복 실행 막기 · 푸시 못 한 작업 파일 |

## 🤖 자동 진행 (사무실 버튼 → 예약 작업 「도시의 나이테 사무실 작업」 → 새 세션)
| 요청 | 할 일 |
|---|---|
| `다음 영상 기획` | city-line A (주제·사실 확인·장면 설계 → 결재함, 돈 안 듦) |
| `<편 id> 결재: 승인/수정 요청` | city-line B (승인이면 코드 영상 제작 → 자료실, 수정이면 기획 고쳐 다시 결재함) |
| `<편 id> 올렸어` (채팅) | city-line C (업로드 완료 표시) |
| `전략 회의: <안건>` · `전략 결정: …` | strategy-office 스킬 |
| `스튜디오 점검` | studio-check 스킬 |
| `연결 테스트` | 저장소·db·푸시 권한 확인 후 log 한 줄 |

- 요청 끝 `[req:<id>]` → 시작할 때 `requests/<id>` {status:"진행 중", startedAt}, 끝날 때 {status:"완료"|"실패"|"보류", doneAt, result: 대표님이 읽을 한 줄}. 실패해도 반드시 남김.
- 예약 실행(매일 17:52 KST): 결재 대기 편이 없으면 `다음 영상 기획`, 멈춘 요청 정리, 월요일엔 스튜디오 점검.
- 업로드·계정 만들기·결제는 하지 않음. 커밋 전 `git pull --rebase`. 보고는 쉬운 한국어로 짧게.
