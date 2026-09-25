# EP01. 해달은 정말 손잡고 잘까?

| 항목 | 내용 |
|---|---|
| 코너 | 🔍 반은 맞고 반은 틀려요 (+ 채널 소개) |
| 길이 | 약 40초, 세로 9:16 |
| 게시 | 1주차 월요일, 유튜브 쇼츠·인스타 릴스·틱톡 동시 |
| 사실 확인 | [`topics.md`](../topics.md) 1번 (⚠️ 표현 주의 반영 완료) |

---

## 1. 대본

> 한국어 TTS 기준 약 40초 분량입니다. 괄호 안은 읽지 않습니다.

| 시간 | 장면 | 내레이션 | 화면 자막 |
|---|---|---|---|
| 0:00–0:02 | S1 | 해달이 손잡고 잔다고요? 반은 틀렸어요! | 해달이 손잡고 잔다? **반은 틀렸어요** |
| 0:02–0:04 | S2 | 오늘의 궁금증! | 📒 오늘의 궁금증 |
| 0:04–0:10 | S3 | 해달은 물 위에 누워서 자요. 그런데 자다가 파도에 떠내려가면 큰일이겠죠? | 물 위에서 자는 해달 🌊 떠내려가면? |
| 0:10–0:20 | S4 | 그래서 실제로 더 자주 쓰는 방법이 있어요. 바다 밑바닥에 붙어 자라는 긴 해초를 몸에 돌돌 감는 거예요. 해초가 닻처럼 몸을 붙잡아 주거든요. | 진짜 비법: **해초를 몸에 감기** |
| 0:20–0:28 | S5 | 손을 잡고 자는 모습도 있긴 해요. 다만 SNS에서 본 것만큼 흔하지는 않대요. | 손잡기도 있지만 **생각보다 드물어요** |
| 0:28–0:34 | S6 | 그래서 제 수첩엔 이렇게 고쳐 적었어요. "해달은 해초 이불 덮고 잔다!" | ✏️ 해달은 **해초 이불** 덮고 잔다 |
| 0:34–0:40 | S7 | 여러분이 알던 동물 상식 중에 수상한 거, 댓글로 알려주세요. 궁금해달이 확인해 올게요! | 수상한 동물 상식 👇 댓글로 제보 |

### 대본에서 일부러 뺀 것
- "손을 잡는다"는 부정하지 않음 → 실제로 있는 행동이라 "드물다"까지만 말함
- 해초가 얼마나 더 흔한지 구체적 비율 → 믿을 만한 수치를 못 찾아서 쓰지 않음
- 새끼 해달, 털 밀도, 겨드랑이 주머니 → 다음 편 소재로 아껴둠

---

## 2. 장면별 이미지 프롬프트

**모든 장면에 캐릭터 기준 이미지를 참조 이미지로 첨부하세요.**
다른 해달이 나오는 장면도 궁금해달과 같은 3D 스타일로 맞추고, 궁금해달만 **하늘색 스카프와 노란 수첩**을 가집니다.

**S1 — 훅**
```
The same sea otter mascot floating on its back on calm turquoise water, holding paws with another
plain sea otter, a big red question mark floating above them, playful surprised mood,
soft 3D render, warm daylight, vertical 9:16, no text.
```
카메라: 빠른 줌인

**S2 — 인트로 (매 영상 재사용)**
```
The same sea otter mascot floating on its back, opening a tiny yellow notebook on its belly,
curious excited expression, light sky-blue scarf, soft 3D render, warm morning light,
vertical 9:16, no text.
```
카메라: 정면 고정, 수첩 펼치는 순간 살짝 줌인

**S3 — 물 위에서 자는 해달**
```
The same sea otter mascot sleeping peacefully on its back on gently rolling ocean waves,
eyes closed, paws folded on its chest, a slight drift implied by small ripples,
soft 3D render, calm blue dusk light, vertical 9:16, no text.
```
카메라: 천천히 옆으로 흘러가듯 이동 (떠내려가는 느낌)

**S4 — 해초 감기 (핵심 장면)**
```
Split-level over-under shot, half above and half below the water surface.
Above the waterline: the same sea otter mascot with dark chocolate-brown fur exactly as in
the reference image, floating on its back AT THE SURFACE, head and chest above the water,
sleeping, wrapped snugly in golden-brown kelp fronds like a blanket, light sky-blue scarf.
Below the waterline: the kelp stalks stretch straight down through cool blue-green water
to a gray rocky sea floor with purple sea urchins, a cold-water kelp forest, no coral.
The otter is never underwater. Cozy expression, soft 3D render, calm blue dusk light,
vertical 9:16, no text.
```
카메라: 위에서 아래로 틸트 — 수면 위 해달 → 물속 해초 줄기 → 바닥

**S5 — 손잡기는 드물다**
```
A group of five plain gray-brown sea otters sleeping peacefully on their backs in a raft
on calm cool water, three of them wrapped in kelp, and in the center exactly two otters
clearly holding paws with their paws visibly clasped between them. Calm peaceful sleeping
faces, no tears. Every otter has one head and one normal body clearly visible.
The same sea otter mascot with dark chocolate-brown fur and a light sky-blue scarf floats
at the lower edge of the frame, awake, looking at the paw-holding pair with a curious,
thoughtful expression, holding its tiny yellow notebook. Soft 3D render, soft overcast
light, vertical 9:16, no text.
```
카메라: 넓게 보여준 뒤 손잡은 두 마리로 천천히 줌인

**S6 — 수첩에 고쳐 적기**
```
Close-up of the same sea otter mascot floating on its back, crossing out a line in its tiny
yellow notebook and writing a new one with a short pencil, proud little smile,
light sky-blue scarf, soft 3D render, warm light, vertical 9:16, no text.
```
카메라: 수첩 클로즈업 → 해달 얼굴로 빠지기
편집: 수첩 위에 "손잡고 잔다" 취소선 → "해초 이불 덮고 잔다" 손글씨 효과 (CapCut 텍스트 애니메이션)

**S7 — 아웃트로 (매 영상 재사용)**
```
The same sea otter mascot closing its tiny yellow notebook and waving at the viewer,
floating on turquoise water, friendly smile, light sky-blue scarf, soft 3D render,
warm light, vertical 9:16, no text.
```
카메라: 정면 고정

> S2, S7은 한 번 만들어두고 매 영상 같은 클립을 씁니다. (채널 브랜딩)

---

## 3. 편집 메모

| 항목 | 설정 |
|---|---|
| 목소리 (TTS) | 밝고 또렷한 젊은 목소리, 속도 1.05~1.1배. 한 번 정하면 계속 같은 목소리 |
| 자막 | 화면 가운데보다 약간 위, 굵은 흰 글씨 + 검은 테두리. 강조 단어는 노란색 (수첩 색과 통일) |
| 배경음악 | 잔잔하고 경쾌한 우쿨렐레·마림바 계열, 저작권 없는 음원 (CapCut 기본 음원, 유튜브 오디오 보관함) |
| 효과음 | S1 "띠용", S2 수첩 넘기는 소리, S6 연필 사각사각 |
| 이미지 움직임 | 영상 생성 AI 없이 시작한다면 각 이미지에 천천히 확대·이동 효과(켄 번스)만 줘도 충분 |
| 첫 프레임 | S1 이미지 + "반은 틀렸어요" 자막이 **0초부터** 보이게 (릴스 커버로도 사용) |

---

## 4. 게시 문구

### 유튜브 쇼츠
- **제목**
  ```
  해달은 정말 손잡고 잘까? 🦦 반은 틀렸어요
  ```
- **설명**
  ```
  해달이 자면서 떠내려가지 않는 진짜 방법은?
  📒 궁금해달의 「반은 맞고 반은 틀려요」 1편

  #해달 #동물상식 #shorts

  📚 출처
  - Monterey Bay Aquarium: https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/sea-otter
  - Discover Magazine: https://www.discovermagazine.com/sea-otters-hold-hands-while-sleeping-and-they-even-cuddle-46115

  이 영상은 AI 도구로 제작되었습니다.
  ```
- 업로드 시 **"변경되거나 합성된 콘텐츠" → 예** 체크

### 인스타그램 릴스
- **캡션**
  ```
  해달이 손잡고 잔다는 얘기, 반은 틀렸어요 🦦

  떠내려가지 않으려고 해달이 더 자주 쓰는 방법은 바로 '해초 이불'!
  손잡는 모습도 있지만 생각보다 드물대요.

  여러분이 알던 동물 상식 중에 수상한 거 있으면 댓글로 제보해주세요 👇
  궁금해달이 확인해 올게요 📒

  이 콘텐츠는 AI로 제작되었습니다.

  #해달 #동물상식 #동물 #신기한사실 #잡학상식 #반전상식 #해양동물 #seaotter #궁금해달 #릴스
  ```
- **AI 정보 라벨** 켜기
- 커버: S1 장면

### 틱톡
- **캡션**
  ```
  해달이 손잡고 잔다? 반은 틀렸어요 🦦 #해달 #동물상식 #신기한사실 #궁금해달
  ```
- **AI 생성 콘텐츠 라벨** 켜기

### 고정 댓글 (세 플랫폼 공통)
```
📚 오늘 내용의 출처는 설명란(인스타는 프로필 링크)에 적어뒀어요!
다음 편 예고: 해달 겨드랑이에는 '평생 쓰는 돌'이 들어 있다? 🪨
```

---

## 5. 게시 전 체크리스트
- [ ] 모든 장면에서 궁금해달의 스카프 색·수첩 색이 같은지 확인
- [ ] 이미지 속에 이상한 글자나 여분의 다리·손가락이 없는지 확인
- [ ] 자막 맞춤법 확인
- [ ] 세 플랫폼 모두 AI 라벨 체크
- [ ] 출처 링크 첨부
