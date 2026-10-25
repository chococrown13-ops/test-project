# 궁금해달 (gunggeum/)

AI 사무실이 운영하는 쇼츠 채널 「궁금해달」입니다. 궁금한 건 못 참는 해달이 떠도는 상식을 확인하고, 틀린 건 노란 수첩에 고쳐 적어요.
대표(사용자)는 **결정·결재·업로드만** 합니다. **직접 녹화 없음**(화면 녹화·얼굴 촬영 안 함, 목소리는 AI 목소리). 하루 1편, 월 예산 약 3만 원.

- 캐릭터·말투·장면 규칙·이미지 프롬프트: `brand.md` · 기준 이미지 `brand/reference.png`(AI 이미지·영상에 항상 참조로) · 코드 그림 `tools/otter_svg.py`
- 대표 결정 기록: `decisions.md` · 전략 회의 메모: `strategy/` · 점검 보고서: `checks/`
- 편집기: `tools/make_video.py` (이미지·클립 → 1080×1920, 켄 번스, 자막, TTS) · 글꼴 `tools/fonts/` · 사무실 화면 자동 점검 `tools/office_smoke.mjs`
- 전략 회의: `.claude/skills/strategy-office/SKILL.md` + `.claude/agents/strategy-*.md` (여섯 부서)
- 스튜디오 점검·요청 추적: `.claude/skills/studio-check/SKILL.md` + `.claude/agents/inspect-*.md` (운영관리팀)
- AI 사무실(픽셀 오피스): 저장소 `chococrown13-ops/otter-studio-ai-office`, 화면 https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi
- 이전 채널 「땡그랑」(생활 돈 계산 카드뉴스, 동전 캐릭터)은 2026-10-25 종료. 자료는 git 기록에만 남아 있어요 (커밋 ad79e37 시점의 `ttaeng/` 폴더).

## 쇼츠 시험 (2026-10-25 결정, `decisions.md`)
- 새 채널 · 캐릭터 궁금해달 · 시험 후보 3개 × 5편: ① 「이거 진짜야?」 상식 팩트체크 ② 돈·바뀐 제도 ③ 심리학·뇌과학
- 도구: 지금은 **자동(API)** — 이미지 4장(약 $0.18) + 5초 720p 클립 1개(약 $0.51) ≈ 편당 $0.7, 월 한도 $21. (Google AI Pro 를 구독하면 `video_mode: flow` 로 바꿔 대표님이 Flow 에서 클립 생성 — 아직 아님)
- 판정은 「분명히 나쁜 후보 탈락」만 (3초 유지율·저장·공유). 건강·의료 주제 금지, 모든 편에 기준일·출처 표기
- **제작 라인**: `.claude/skills/shorts-line/SKILL.md` — 기획(리서치 → 대본 → 1차 검수 → 게시 문구 → 결재함) / 승인 뒤 제작(이미지 4장 → S1 클립 → AI 목소리 편집 → 2차 검수 → 자료실). 직원: `.claude/agents/` 의 research-lead·scriptwriter·quality-guard·art-director·motion-director·editor·publisher·growth-analyst
- 편 폴더 `episodes/sNN/` (plan.md · episode.json · images/ · clips/ · cost.json · publish.md, 완성본 out/ 은 커밋 안 함) · 틀 `episodes/_template/` · 고정 장면 `brand/scenes/`(intro·notebook·outro) · 주제 후보 `topics.md` · 설정·예산 `studio.config.json` · 장부 `tools/ledger.py`
- 도구: `tools/make_image.py`(Gemini 이미지, 기준 이미지 참조) · `tools/make_clip.py`(Gemini Omni 영상 — Veo 는 2026-10 API 에서 빠짐) · `tools/make_video.py --tts`(편집·AI 목소리)

## 사무실 db (ArtifactData, url = 위 사무실 링크)
| 컬렉션 | 내용 |
|---|---|
| `strategy/<회의id>` | 전략 회의 결정 메모 {title, at, status, agenda[{id, question, options[{key,name,pros,cons,cost,ceoWork}], recommend, why, dissent, sources}], memo, decisions} |
| `episodes/<id>` | 현황판 {title, corner, status, facts, ceoTodo, link, costUsd} |
| `reviews/<id>` · `approvals/<id>` | 결재함 기획안 · 대표 결정 |
| `files/<id>` | 자료실 목록 {name, episode, kind, parts[asset id], sizeBytes, contentType, from, note, createdAt} — 15MB 넘으면 조각(첫 바이트 `<` 피하기) |
| `log` | 진행 기록 {at: 실제 UTC 시각, who, text} |
| `locks/<키>` · `handoff/<id>` | 중복 실행 막기 · 푸시 못 한 작업 파일 |
| `requests/<id>` | 버튼 요청 추적 {at, text, kind, by, status: 전달 중→전달됨→진행 중→완료/실패/건너뜀/보류(→멈춤), startedAt, doneAt, result, error} — 버튼이 만들고 루틴이 상태를 바꿈 |
| `checks/<YYYYMMDD-HHMM>` | 점검 보고서 {at, status: 정상/주의/문제, summary, items[{area, name, result, detail, fix}], fixed[], report} |

## 🤖 자동 진행 (사무실 버튼 → 루틴 「궁금해달 사무실 작업」 → 새 세션)
| 요청 | 할 일 |
|---|---|
| `전략 회의: <안건>` | strategy-office 스킬로 여섯 부서 검토 → `strategy/` 메모 + db `strategy/<회의id>` |
| `전략 결정: <회의id> · A1=key, …` | 같은 스킬 "결정이 나면" → `decisions.md`·`brand.md` 갱신, log |
| `다음 쇼츠 기획` (예전 이름 `다음 카드뉴스 기획`) | shorts-line 스킬 A (기획 → 결재함, 돈 안 듦) |
| `<편 id> 결재: 승인/수정 요청` | shorts-line 스킬 B (승인이면 제작 → 자료실, 수정이면 대본 고쳐 다시 결재함) |
| `<편 id> 올렸어` (채팅) | shorts-line 스킬 C (업로드 완료 표시) |
| `스튜디오 점검` | studio-check 스킬 → 운영관리팀 두 명 → `checks/` 보고서 + db `checks/<id>` |
| `연결 테스트` | 저장소·db·푸시 권한 확인 후 log 한 줄 |

- **요청 추적 (운영관리팀)**: 요청 끝에 `[req:<id>]` 가 붙어 오면 시작할 때 `requests/<id>` 를 {status:"진행 중", startedAt} 로, 끝날 때 {status:"완료"|"실패"|"보류", doneAt, result: 대표님이 읽을 한 줄} 로 바꿉니다. 잠금 때문에 건너뛰면 "건너뜀". 실패해도 반드시 "실패"+error 로 남깁니다.
- 예약 실행(**매일 저녁 17:52 KST**, 요청 없음): **다음 쇼츠 기획(shorts-line A)** 을 해서 결재함에 올림 — 돈 드는 제작은 대표님 승인 뒤에만. 이미 결재 대기 편이 있거나 오늘 기획했으면 보류. 이어서 멈춘 요청 정리, 월요일에는 스튜디오 점검. 끝나면 대표님 휴대폰으로 알림.
- 업로드·계정 만들기·결제는 하지 않음. 커밋 전 `git pull --rebase`. 보고는 쉬운 한국어로 짧게.
