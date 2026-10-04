# 궁금해달 스튜디오 (sns/)

AI 직원들이 쇼츠 채널 「궁금해달」(@otter.curious)을 운영하는 스튜디오입니다.
주제(2026-10~): 🐾 반려동물(멍냥 팩트체크) : 🏠 살림(살림 팩트체크) = 1:1, 주 4편. 야생동물·문화는 제작 안 함.
대표(사용자)는 결재·목소리·업로드만 합니다.

- 한 편 만들기: `.claude/skills/studio/SKILL.md` ("다음 편 만들어줘")
- 직원: `.claude/agents/` — research-lead, scriptwriter, quality-guard(거부권), art-director, motion-director, publisher, editor, growth-analyst
- 설정(예산·결재·모델): `studio.config.json`
- 브랜드 규칙: `brand.md` / 주제·사실 확인: `topics.md` / 일정: `content-calendar.md`
- 도구: `tools/make_image.py`(이미지), `tools/make_clip.py`(Veo 영상), `tools/make_video.py`(편집·썸네일)
- API 키는 클라우드 환경의 API credentials로 들어옵니다. 키를 파일이나 채팅에 쓰지 않습니다.
- 픽셀 사무실(godseng AI company 템플릿): 비공개 저장소 `chococrown13-ops/otter-studio-ai-office`. 한 편의 상태가 바뀌면 그 저장소의 `studio.episodes.ts` 현황판도 같이 고칩니다.

## 📁 자료실 (영상·이미지 주고받기)
사무실 아티팩트 https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi 의 "자료실"에서 대표님이 파일을 올리고 받습니다.
- 목록: `ArtifactData` list, collection `files`. 문서 = {name, episode, kind, parts[asset id], sizeBytes, contentType, from, note, createdAt}. 문서 id = 첫 조각 id.
- 대표님 파일 받기: `Artifact` read, `path`=조각 asset id (하나씩) → 받은 조각을 `parts` 순서대로 이어 붙이면 원본(.mov 도 mp4 로 저장됨).
- 완성본 올리기: 한 조각 15MB 이하로 나눠(조각 첫 바이트가 `<` 이면 경계를 당김) `Artifact` publish `asset: true` → `files` 에 문서 추가(from "Claude").
- 지우기는 대표님이 요청할 때만.

## ✍️ 결재함
- 결재 대기 편은 office 저장소 `studio.episodes.ts` 의 `review`(사실 확인표·대본)를 채워 두면 사무실 결재함에 뜸.
- 대표님 결정: `ArtifactData` get, collection `approvals`, doc_id `EP03` 등 → {decision: "승인"|"수정 요청", memo, decidedAt}. "승인"일 때만 돈이 드는 단계로 넘어감.

- 업로드하지 않습니다. CapCut은 건드리지 않습니다.
- 사실 확인 판정표에 없는 내용은 대본·캡션에 넣지 않습니다.
- 예산(`budget_usd`)을 넘기지 않습니다. API 오류는 우회하지 말고 보고합니다.
- 사용자는 개발자가 아닙니다. 보고는 쉬운 한국어로 짧게.

## 🤖 자동 진행 (사무실 버튼 → 이 세션)
사무실 페이지 버튼은 루틴 `trig_01UZTKiduWXdSAZqYvFuRFLH`("궁금해달 스튜디오 버튼")를 불러 이 세션을 깨웁니다. 덧붙은 요청별로:

| 요청 | 할 일 |
|---|---|
| `다음 편 기획` | `content-calendar.md` 다음 순서 편으로 studio 스킬 0~3단계(리서치→대본→1차 검수). 결과를 db `reviews/<EP>`(Review 형식: estCostUsd, summary, facts[], script[], checks[])에 쓰고 `episodes/<EP>` 를 {title, corner, status:"결재 대기", facts, ceoTodo:"결재함에서 승인하기", link, costUsd:0} 로. 돈 드는 작업은 하지 않음 |
| `EPxx 결재: 승인` | db `approvals/<EP>` 확인 후 4~6단계(이미지·클립·게시 문구·2차 검수, 예산 안). 무음 미리보기·이미지·게시 문구를 자료실(`files`)에 올리고 `episodes/<EP>` status "목소리 대기", ceoTodo "목소리 녹음 → 자료실에 올리고 🎬 편집 맡기기" |
| `EPxx 결재: 수정 요청 — 메모` | 메모대로 대본 수정 → 1차 검수 → `reviews/<EP>` 갱신, `approvals/<EP>` 삭제(다시 결재 받게) |
| `목소리 편집: EPxx · 자료실 파일 <id>` | 자료실 파일 조각을 받아 이어 붙이고 → 음성 타이밍에 맞춰 `episode_own_audio.json` → 렌더·썸네일 → 자료실에 완성본·썸네일(from "Claude") → status "업로드 대기", ceoTodo "업로드 (AI 라벨 켜기) + 고정 댓글에 쿠팡 링크" |

- 단계마다 db `log` 에 {at: ISO, who: "Claude", text: 한 줄} 을 남깁니다 (대표님이 사무실에서 봄).
- 대표님이 업로드했다고 하면 `episodes/<EP>` status "업로드 완료", ceoTodo "".
- db 쓰기는 `ArtifactData` (url = 사무실 아티팩트). 페이지 다시 빌드 없이 현황판·결재함이 바뀝니다.
- 이 세션이 끝나면 루틴을 새 세션에 다시 묶어야 합니다 (`update_trigger` 또는 새 루틴 + `app/studioRuntime.ts` 의 STUDIO_TRIGGER_ID 교체).
