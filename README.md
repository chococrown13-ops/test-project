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
| [`examples/example_script_lionel_messi_dribble.md`](examples/example_script_lionel_messi_dribble.md) | 템플릿을 채운 완성 예시 대본 (레전드 스토리텔링형) |
| [`examples/example_script_lee_kangin_atletico_transfer.md`](examples/example_script_lee_kangin_atletico_transfer.md) | 실제 최신 이적 소식(이강인 → 아틀레티코 마드리드, 2026.07)을 다룬 시사/이적 뉴스형 예시 대본, 출처 표기 포함 |
| [`scripts/generate_script.py`](scripts/generate_script.py) | 주제만 입력하면 대본 초안을 만들어주는 CLI 도구 |
| [`production/lee_kangin_atletico_shotlist.md`](production/lee_kangin_atletico_shotlist.md) | 이강인 이적 대본을 실제 영상으로 만들기 위한 씬별 AI 영상 프롬프트·타이밍·TTS·자막 조립 패키지 |
| [`production/lee_kangin_atletico_shots.json`](production/lee_kangin_atletico_shots.json) | 위 샷 리스트를 스크립트로 자동 생성할 수 있도록 구조화한 JSON |
| [`scripts/runway_generate.py`](scripts/runway_generate.py) | Runway API로 샷 리스트의 각 씬을 실제 영상 클립(mp4)으로 생성·다운로드하는 CLI |

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

## AI 영상 자동 생성 (Runway API)

Runway API를 연동해 씬별 프롬프트를 실제 mp4 클립으로 자동 생성할 수 있습니다.
**실제 API 호출은 Runway 크레딧을 소모하며 요금이 발생합니다.**

```bash
pip install -r requirements.txt
cp .env.example .env   # RUNWAYML_API_SECRET 값 채워넣기
export $(cat .env | xargs)

# 이강인 이적 샷 리스트 전체 생성
python3 scripts/runway_generate.py --shotlist production/lee_kangin_atletico_shots.json

# 특정 씬 하나만 생성
python3 scripts/runway_generate.py --shotlist production/lee_kangin_atletico_shots.json --scene scene1_hook
```

생성된 클립은 `output/<scene_id>.mp4`에 저장됩니다. 이후 CapCut 등에서
`production/lee_kangin_atletico_shotlist.md`의 조립 순서대로 자막·나레이션·BGM을
얹으면 완성됩니다. 새 대본에 대해 자동 생성을 하려면
`production/lee_kangin_atletico_shots.json`과 같은 형식의 JSON을 만들면 됩니다.
