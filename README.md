# ⚽ AI 축구 쇼츠/릴스 제작 키트

AI 영상 생성 도구를 활용해 축구 관련 유튜브 쇼츠 / 인스타그램 릴스 / 틱톡 콘텐츠를
빠르게 기획하고 제작하기 위한 스타터 키트입니다.

## 구성

| 경로 | 내용 |
|---|---|
| [`docs/content-strategy.md`](docs/content-strategy.md) | 채널 컨셉, 포맷, 후킹(hook) 전략, 주제 아이디어 50개 |
| [`docs/production-workflow.md`](docs/production-workflow.md) | 기획 → 스크립트 → 내레이션 → AI 영상 생성 → 편집 → 업로드 전체 워크플로우, 추천 도구 |
| [`docs/video-prompt-library.md`](docs/video-prompt-library.md) | Runway/Pika/Luma 등 AI 영상 생성 도구용 축구 특화 프롬프트 예시 |
| [`templates/script_template.md`](templates/script_template.md) | 15~60초 쇼츠 대본 템플릿 (훅-본문-CTA 구조) |
| [`examples/example_script_lionel_messi_dribble.md`](examples/example_script_lionel_messi_dribble.md) | 템플릿을 채운 완성 예시 대본 |
| [`scripts/generate_script.py`](scripts/generate_script.py) | 주제만 입력하면 대본 초안을 만들어주는 CLI 도구 |

## 빠른 시작

```bash
# 1. 대본 초안 생성 (템플릿 기반, API 키 없이도 동작)
python3 scripts/generate_script.py --topic "메시 vs 호날두 통산 기록 비교" --style "정보형"

# 2. Anthropic API 키가 있으면 Claude가 직접 대본을 다듬어줍니다
export ANTHROPIC_API_KEY=sk-ant-...
python3 scripts/generate_script.py --topic "메시 vs 호날두 통산 기록 비교" --style "정보형" --use-ai
```

생성된 대본을 바탕으로 `docs/video-prompt-library.md`의 프롬프트를 참고해
AI 영상 생성 도구(Runway, Pika, Luma Dream Machine, Sora 등)에서 클립을 만들고,
`docs/production-workflow.md`의 편집·업로드 단계를 따라가면 완성됩니다.
