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
