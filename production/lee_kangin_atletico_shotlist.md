# 프로덕션 패키지 — "이강인, 아틀레티코 마드리드 이적"

원본 대본: [`examples/example_script_lee_kangin_atletico_transfer.md`](../examples/example_script_lee_kangin_atletico_transfer.md)

이 문서는 대본을 실제 영상으로 만들기 위해 **AI 영상 생성 도구(Runway/Pika/Luma/Kling),
TTS(ElevenLabs), 편집 툴(CapCut)** 에 그대로 붙여넣을 수 있는 샷 단위 프롬프트와
타이밍을 정리한 것입니다. 이 저장소/세션에는 영상·음성을 직접 생성하는 도구가 없어서,
아래 패키지를 각 서비스에 붙여넣어 실행하시면 됩니다.

- 캔버스: **9:16 세로**, 1080x1920
- 총 길이: 40초 (5개 씬)
- 톤: 뉴스/정보형, 신뢰감 있는 톤

> 💡 아래 프롬프트를 손으로 복붙하는 대신, Runway API로 자동 생성하려면
> [`scripts/runway_generate.py`](../scripts/runway_generate.py)와
> [`production/lee_kangin_atletico_shots.json`](lee_kangin_atletico_shots.json)을
> 사용하세요. 자세한 실행 방법은 [README](../README.md#ai-영상-자동-생성-runway-api) 참고.

---

## Scene 1 — 훅 (0:00~0:02, 2초)

**나레이션:** "이강인이 3년 만에 다시 스페인으로 돌아갑니다."

**영상 생성 프롬프트 (Runway Gen-4 / Luma 추천):**
```
Dark cinematic intro, red and white light streaks sweeping across frame
(Atletico Madrid club colors), fast dynamic camera movement, particles
and light flares, stadium ambience, no visible faces, 9:16 vertical,
photorealistic, dramatic
```

**화면 텍스트 (자막, CapCut에서 오버레이):** "이강인, 새 둥지 확정"
자막 스타일: 굵은 산세리프, 흰색 + 붉은 아웃라인, 화면 중앙 정렬

**TTS 디렉션 (ElevenLabs):** 강하고 임팩트 있는 톤, 속도 1.0x, 문장 끝 살짝 강조

**BGM/SFX 큐:** 임팩트 드럼 히트 1회 (0:00 진입과 동시에), 이후 배경음 페이드인

---

## Scene 2 — 문제 제기 (0:02~0:08, 6초)

**나레이션:** "왜 파리를 떠나 마드리드를 선택했을까요?"

**영상 생성 프롬프트 (Runway 또는 Kling):**
```
Top-down holographic tactics board style animation, glowing route line
travelling from a Paris icon to a Madrid icon on an abstract dark map,
blue and gold UI elements, smooth camera drift, minimalist futuristic
style, 9:16 vertical
```

**화면 텍스트:** "PSG → 아틀레티코"

**TTS 디렉션:** 질문형 억양, 살짝 궁금증을 유발하는 톤

---

## Scene 3 — 본문 (0:08~0:32, 24초) — 3개 포인트, 각 8초

### 3-1. 이적료 (0:08~0:16)
**나레이션:** "이적료는 기본 3천500만 유로에 옵션 500만 유로, 총 4천만 유로 — 우리 돈 약 665억 원입니다."

**영상 생성 프롬프트 (Runway):**
```
Abstract dark background with glowing golden number "€40M" materializing
in the center, particle light effects, subtle camera zoom in, futuristic
data visualization style, 9:16 vertical
```
> ⚠️ AI 영상 생성 도구는 정확한 숫자/텍스트 표현이 불안정합니다. 숫자 "€40M"는
> AI 생성 결과에서 깨질 가능성이 높으니, **배경 영상만 AI로 생성하고 숫자는
> CapCut/Canva에서 모션 그래픽 텍스트로 직접 얹는 것을 강력 추천**합니다.

**화면 텍스트 (CapCut 오버레이, AI 생성 대신 직접 삽입):** "€40M / 약 665억원"

### 3-2. 계약 조건 (0:16~0:24)
**나레이션:** "계약 기간은 2031년까지, 등번호는 7번을 받았습니다."

**영상 생성 프롬프트 (Runway/Luma):**
```
Close-up of a football jersey back with spotlight illuminating the
number "7" area (avoid rendering readable text/numbers via AI — see
note below), red and white striped fabric, dramatic rim lighting,
slow motion fabric movement, 9:16 vertical
```
> ⚠️ 등번호 "7" 역시 AI 영상에서 정확히 렌더링되지 않을 수 있습니다.
> 조명이 비추는 유니폼 등판 클립만 AI로 만들고, 숫자 "7"은 CapCut에서
> 텍스트/스티커로 합성하세요.

**화면 텍스트:** "계약기간 2031년까지 · 등번호 7"

### 3-3. 커리어 경로 (0:24~0:32)
**나레이션:** "이강인은 발렌시아 유스에서 성장해 마요르카를 거쳐 PSG로 갔던 선수 — 이번이 3년 만의 스페인 복귀입니다."

**영상 생성 프롬프트 (Runway/Kling):**
```
Animated glowing route line connecting four location markers on a
stylized dark map of Europe (Valencia, Mallorca, Paris, Madrid),
minimalist holographic UI style, smooth continuous camera pan,
blue and white light trails, 9:16 vertical
```

**화면 텍스트:** "발렌시아 → 마요르카 → PSG → 아틀레티코"

---

## Scene 4 — 반전/결론 (0:32~0:37, 5초)

**나레이션:** "PSG에서는 스타팅 경쟁이 치열했지만, 아틀레티코에서는 출전 시간 확대가 기대됩니다."

**영상 생성 프롬프트 (Luma Dream Machine):**
```
Bright sunlit football stadium, empty pitch with warm golden hour light,
slow forward tracking shot toward the center circle, optimistic
uplifting mood, cinematic, 9:16 vertical
```

**화면 텍스트:** "출전 시간 확대 기대"

**TTS 디렉션:** 톤을 살짝 밝게 전환 (기대감)

---

## Scene 5 — CTA (0:37~0:40, 3초)

**나레이션:** "이강인의 라리가 첫 경기, 같이 지켜볼까요? 팔로우하고 다음 소식도 받아보세요."

**영상 생성 프롬프트 (Runway):**
```
Atletico Madrid red and white color gradient background, subtle light
particles floating upward, calm outro mood, space reserved for text
overlay in center, 9:16 vertical
```

**화면 텍스트:** "다음 편: 이강인 라리가 데뷔전 리뷰 예정 👉 팔로우"

---

## 조립 순서 (CapCut 기준)

1. Scene 1~5 AI 생성 클립을 시간 순서대로 타임라인에 배치 (각 씬 길이에 맞춰 트림)
2. ElevenLabs로 생성한 나레이션 오디오를 오디오 트랙에 얹고, 영상 길이를 나레이션 속도에 맞춰 미세 조정
3. 자막은 CapCut 자동 자막 기능으로 1차 생성 후 오탈자 수정 (특히 숫자: €40M, 7번, 2031년)
4. 무료 라이선스 BGM(YouTube Audio Library 등) 배경음 삽입, 나레이션보다 6~10dB 낮게 볼륨 조절
5. 인트로 0.5초 이내에 훅 텍스트가 보이도록 타이밍 확인
6. 내보내기: 1080x1920, 30fps, mp4

## 체크리스트

- [ ] 각 씬 AI 영상 클립 생성 완료 (Runway/Luma/Kling 중 택1, 스타일 통일 위해 가급적 한 도구로 통일)
- [ ] 숫자/텍스트가 들어가는 부분(이적료, 등번호, 계약연도)은 AI 생성이 아닌 CapCut 텍스트로 직접 삽입했는가?
- [ ] ElevenLabs 나레이션 생성 및 다운로드
- [ ] BGM 저작권 확인 (무료 라이선스만 사용)
- [ ] 업로드 전 최신 기사로 이적료/계약 조건 재확인 (변동 가능성)
