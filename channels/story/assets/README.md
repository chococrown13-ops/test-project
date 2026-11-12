# 무료 3D 모델 (모두 CC0 — 누구나 상업용으로 무료 사용, 출처 표기 의무 없음)

| 팩 | 받은 곳 (제작자 공식) | 쓰는 것 | 허락 |
|---|---|---|---|
| Kenney Mini Characters 2.0 | https://kenney.nl/assets/mini-characters | character-male-f(민재), male-a, female-b — 걷기·뛰기·앉기·고개 젓기 등 32가지 동작 | CC0 (`kenney/mini-characters/License.txt`) |
| Kenney Car Kit | https://kenney.nl/assets/car-kit | delivery(배달 트럭) | CC0 (`kenney/car-kit/License.txt`) |
| Kenney City Kit (Commercial) 2.1 | https://kenney.nl/assets/city-kit-commercial | building-skyscraper-a~e(2026년 빌딩) | CC0 (`kenney/city-kit-commercial/License.txt`) |

- 받은 날: 2026-11-12. 공식 사이트의 '기부 없이 받기' 버튼으로 받음(돈 안 듦).
- 페이지에서 쓰기: `python3 channels/story/tools/pack_assets.py <편>/models.js <팩폴더>:<모델>,…` → 페이지에 `three-gltf-0.149.0.min.js` + `models.js` + `engine2.js` 를 넣고 `Story.loadGLB` · `Story.rigChar`(움직이는 캐릭터, 얼굴은 우리 입 모양 그림) · `Story.model`(소품) · `Story.anim`(동작 순서).
- 설명란에 선택으로 남길 문구: "3D 모델: Kenney (kenney.nl, CC0)"
- 검토했지만 안 쓴 것: Quaternius Universal Base Characters(CC0) — 무료판엔 근육질 속옷 차림 2명뿐이라 우리 이야기에 안 맞음.
