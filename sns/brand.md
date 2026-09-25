# 궁금해달 브랜드 설정집

## 기본 정보

| 항목 | 값 |
|---|---|
| 채널 이름 | 궁금해달 |
| 아이디 (유튜브·인스타그램·틱톡 공통) | `@otter.curious` |
| 콘셉트 | 궁금한 게 생기면 못 참는 해달이 세계를 떠다니며 동물·문화·건축의 신기한 사실을 수첩에 적어 온다 |
| 이름 뜻 | "궁금해" + "해달" |

> `@curious.otter`는 다른 사람이 쓰고 있습니다. 헷갈리지 않도록 **세 플랫폼 모두 `@otter.curious`로 통일**하고,
> 프로필 이름 칸에는 항상 한글 "궁금해달"을 먼저 씁니다.

---

## 플랫폼별 프로필 문구

### 인스타그램
- **이름 칸** (검색에 가장 중요, 64자 이내)
  ```
  궁금해달 | 동물·세계 신기한 상식
  ```
- **소개** (150자 이내)
  ```
  🦦 궁금한 건 못 참는 해달
  🐾 동물 반전 상식 · 🌏 세계 문화 · 🏠 미니어처 세계 여행
  📒 매일 수첩 한 장씩
  🤖 AI로 제작하는 채널
  ```

### 유튜브
- **채널 이름**: `궁금해달`
- **채널 설명**
  ```
  궁금한 건 못 참는 해달이 세계를 떠다니며 알아 온 신기한 사실들을 1분 안에 들려드려요.

  🐾 동물 반전 상식
  🌏 이 나라에서 하면 안 되는 행동 · 세계 이상한 축제
  🏠 미니어처로 보는 세계 전통 가옥

  이 채널의 영상은 AI 도구로 제작하며, 모든 내용은 출처를 확인한 뒤 올립니다.
  틀린 내용이 있다면 댓글로 알려주세요. 해달이 수첩을 고쳐 적을게요.
  ```

### 틱톡
- **이름**: `궁금해달`
- **소개** (80자 이내)
  ```
  🦦 궁금한 건 못 참는 해달 · 동물·세계 상식 · AI 제작
  ```

---

## 캐릭터 설정

### 외형 (모든 이미지에서 고정)
- 작고 통통한 **해달**, 짙은 갈색 털에 얼굴 주변은 밝은 크림색
- 동그랗고 반짝이는 검은 눈, 짧은 수염
- **노란 표지의 작은 수첩**과 몽당연필을 늘 들고 있음 ← 캐릭터의 상징
- 목에 **하늘색 스카프**
- 여행 편에서만 작은 배낭 추가

### 성격과 말투
- 호기심 많고 조금 덜렁대지만, 틀린 건 꼭 고쳐 적는 성실한 성격
- 내레이션 말투: "~래요", "~거든요", "진짜예요?" 같은 가벼운 존댓말
- 놀라운 사실을 알면 "수첩에 적어둬야지!"

### 진짜 해달 습성을 캐릭터에 녹이기
캐릭터 설정이 실제 동물 지식과 이어지면 채널의 신뢰도와 개성이 함께 올라갑니다. (제작 전 사실 확인)
- 해달은 겨드랑이 아래 늘어진 피부 주머니에 먹이나 돌을 넣어 다닌다 → 궁금해달은 거기에 **수첩을 넣어 다닌다**
- 해달은 물 위에 누워 배를 식탁처럼 쓴다 → 궁금해달은 **배 위에 수첩을 펴고 메모한다**
- 해달은 잘 때 떠내려가지 않게 서로 붙잡거나 해초를 감는다 → 채널 첫 영상 소재로 좋음

### 배경 규칙 (사실 채널이므로 배경도 틀리지 않게)
- 해달은 **차가운 북태평양 연안**(캘리포니아, 알래스카, 러시아, 일본 북부 등)에 산다
- 물속 장면에 **산호초·열대어를 넣지 않는다.** 바닥은 회색 바위와 켈프 숲
- 수면은 스타일상 청록빛도 괜찮지만, 물속이 보이는 장면은 차가운 청록·청회색으로
- 프롬프트에 `cold-water kelp forest, rocky sea floor, no coral` 를 넣는다
- 털색이 밝아지면 `dark chocolate-brown fur exactly as in the reference image` 를 넣는다

### 고정 장면 (인트로·아웃트로)
매 영상 같은 인트로·아웃트로는 채널 브랜딩으로 인정되므로 반복 콘텐츠로 보지 않습니다.
- **인트로 (1초)**: 물 위에 누운 궁금해달이 배 위의 수첩을 펼침 + "오늘의 궁금증!"
- **아웃트로 (2초)**: 수첩을 탁 덮고 "다음엔 뭐가 궁금하세요?" + 구독 유도

---

## 이미지 생성 프롬프트

### 1) 캐릭터 기준 이미지 (가장 먼저 만들기)
여러 장 뽑아서 가장 마음에 드는 한 장을 **기준 이미지**로 정하고, 이후 모든 이미지 생성에 참조 이미지로 넣습니다.
(이미지 도구의 "캐릭터 참조" 또는 "참조 이미지" 기능 사용)

```
Character reference sheet of a small chubby sea otter mascot, dark brown fur with a light cream face,
round shiny black eyes, short whiskers, wearing a light sky-blue scarf, holding a tiny yellow notebook
and a short pencil. Front view, side view, back view, and three expressions (curious, surprised, happy).
Soft 3D render, warm natural lighting, clean white background, no text.
```

### 2) 인트로 장면
```
The same sea otter mascot floating on its back on calm turquoise water, opening a tiny yellow notebook
on its belly, curious expression, light sky-blue scarf, soft 3D render, warm morning light,
vertical 9:16, no text.
```

### 3) 여행·문화 편
```
The same sea otter mascot with a tiny backpack, standing in front of {장소 설명},
looking up in wonder while writing in a tiny yellow notebook, light sky-blue scarf,
soft 3D render, warm natural lighting, vertical 9:16, no text.
```

### 4) 미니어처 세계 편
```
Tilt-shift miniature diorama of {전통 가옥 설명}, handcrafted look, shallow depth of field,
the same small sea otter mascot with a light sky-blue scarf exploring the village like a tiny traveler,
soft 3D render, warm afternoon light, vertical 9:16, no text.
```

### 프로필 사진
원형으로 잘리므로 얼굴과 수첩만 크게, 배경은 단색으로 만듭니다.
```
Close-up portrait of the same sea otter mascot holding a tiny yellow notebook next to its face,
curious smile, light sky-blue scarf, plain soft turquoise background, centered, soft 3D render, no text.
```
