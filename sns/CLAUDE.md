# 궁금해달 스튜디오 (sns/)

AI 직원들이 쇼츠 채널 「궁금해달」(@otter.curious)을 운영하는 스튜디오입니다.
대표(사용자)는 결재·목소리·업로드만 합니다.

- 한 편 만들기: `.claude/skills/studio/SKILL.md` ("다음 편 만들어줘")
- 직원: `.claude/agents/` — research-lead, scriptwriter, quality-guard(거부권), art-director, motion-director, publisher, editor, growth-analyst
- 설정(예산·결재·모델): `studio.config.json`
- 브랜드 규칙: `brand.md` / 주제·사실 확인: `topics.md` / 일정: `content-calendar.md`
- 도구: `tools/make_image.py`(이미지), `tools/make_clip.py`(Veo 영상), `tools/make_video.py`(편집·썸네일)
- API 키는 클라우드 환경의 API credentials로 들어옵니다. 키를 파일이나 채팅에 쓰지 않습니다.
- 픽셀 사무실(godseng AI company 템플릿): 비공개 저장소 `chococrown13-ops/otter-studio-ai-office`. 한 편의 상태가 바뀌면 그 저장소의 `studio.episodes.ts` 현황판도 같이 고칩니다.

## 규칙
- 업로드하지 않습니다. CapCut은 건드리지 않습니다.
- 사실 확인 판정표에 없는 내용은 대본·캡션에 넣지 않습니다.
- 예산(`budget_usd`)을 넘기지 않습니다. API 오류는 우회하지 말고 보고합니다.
- 사용자는 개발자가 아닙니다. 보고는 쉬운 한국어로 짧게.
