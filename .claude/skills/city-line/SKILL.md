---
name: city-line
description: 도시의 나이테 영상 제작 라인. "다음 영상 기획"이면 주제 고르기·사실 확인·장면 설계까지 해서 결재함에 올리고, "<편 id> 결재: 승인"이면 코드 모션 그래픽(render(t) → 프레임 → 배경음 → mp4)으로 만들어 자료실에 올립니다. "<편 id> 올렸어"면 업로드 완료로 표시합니다. "다음 영상 기획", "N02 결재", "영상 만들어줘" 같은 요청에 사용하세요.
---

# 도시의 나이테 제작 라인

채널 「도시의 나이테」는 **도시의 과거·발전 과정·미래**를 **코드로 그린 30초 세로 영상**으로 보여 줍니다(2026-10-30 대표 결정, `gunggeum/decisions.md`).
영상 생성 AI는 쓰지 않아요. 지도·건물·자막·배경음을 모두 코드로 그려서 **영상 제작비는 0원**이에요.

- 본보기 두 편: `gunggeum/devlog/jamsil/`(과거: 「잠실은 원래 섬이었다」) · `gunggeum/devlog/seoul2056/`(미래: 「2056년 서울」)
- 각 폴더: `index.html`(장면, `render(t)` 한 번 = 한 프레임) · `capture.cjs`(Playwright로 720장) · `audio.py`(numpy 배경음) · `publish.md`(근거 표·게시 문구)
- 주제 후보: `gunggeum/topics-city.md` · 편 번호: `N01`, `N02` …(사무실 db `episodes/N0x`)
- 사무실: https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi (db 도구 `ArtifactData`, 자료실 업로드는 Artifact 도구 `asset: true`)

## 원칙
- **주목이 먼저**: 첫 1초 문장이 영상의 전부예요. "잠실은 원래 섬이었다"처럼 아는 장소 + 뜻밖의 사실 한 줄.
- **사실은 기록으로**: 연도·숫자·지명은 공식 기록(국가기록원, 서울시, 통계청, 국토부, 기관 보도자료)이나 신뢰할 언론 보도로 확인하고 화면 아래에 출처를 적어요. 계획·추계는 "목표"·"추계"라고 써요. 확인 못 한 것은 화면에 쓰지 않아요.
- 지형·물길은 단순화한 그림이에요. 끝 장면에 "단순화한 그림" 한 줄을 넣어요.

## 지도 규칙 — 보는 사람이 "아, 거기!" 하게 (2026-11-07 대표 요청: 지도가 헷갈린다는 반응)
지어낸 모양(사인파 강, 네모 땅) 대신 **실제 지도 위에서** 보여 줘요. 본보기: `gunggeum/devlog/nonhyeon2/map_demo.html`(지금 → 옛 바다 겹침 → 공단).
1. **바탕 지도 만들기**(편마다 한 번, 돈 안 듦): `python3 gunggeum/tools/basemap.py gunggeum/devlog/<slug>/map --center 위도,경도 --zoom 15 --size 2200x2800 --place "아는 역" --place "다리·공원" --area "주인공 동네 이름, 구, 시" --area "옛 모습과 겹칠 곳"` → `map/map.json`(커밋) · `map/basemap.png`·`inset.png`·`map.js`(커밋 안 함, 같은 명령으로 다시 만듦). 동네 경계는 "논현2동, 남동구, 인천"처럼 구·시까지 넣어야 다른 지역 같은 이름과 안 헷갈려요. 못 찾은 장소는 `"이름=위도,경도"`.
2. **그리기**: `index.html`에서 `<script src="map/map.js">` + `<script src="../../tools/mapkit.js">` → `MapKit.load` · `drawBase`(톤: 지금 `light`, 옛날 `paper`) · `poly`(동네·겹칠 곳) · `pin`(이름표) · `label`(넓은 곳 이름) · `inset`(전국 위치) · `north`(북쪽) · `scale`(축척) · `legend`(색 뜻) · `credit`.
3. **첫 장면은 "지금"**: 실제 지도 + 주인공 동네 노란 테두리 + 누구나 아는 이름표 2~3개(지하철역·다리·큰 공원) + 전국 위치 작은 지도. 그다음 옛날로 돌아가요.
4. **옛 모습은 같은 지도 위에 겹쳐서**: 옛 바다·염전·섬은 지금 지도 위에 반투명으로. 정확한 옛 경계가 없으면 근거 있는 지금 자리(예: 매립한 공단 자리)로 그리고 "(대략)"이라고 써요. 옛 장면에도 지금 역 이름표 하나는 흐리게 남겨 "같은 자리"라는 걸 보여 줘요.
5. **늘 보이는 것**: 북쪽 화살표 · 축척 막대(1km 등) · 이름표 · 아래 오른쪽 "지도 © OpenStreetMap 기여자"(지도 쓴 편은 필수). 색 뜻은 범례로: 옛 바다=청록 빗금, 공장=회색, 주인공 동네=노랑.
6. 카메라는 천천히(장면 사이 1.5초 이상), 이름표가 화면 밖으로 잘리지 않게 미리보기에서 확인.
- 건강·의료 주제 금지. 재난·인구 감소 같은 주제는 겁주지 않는 차분한 말투로(유튜브가 불쾌한 콘텐츠의 광고를 막아요).
- 같은 틀만 반복하면 유튜브가 "찍어낸 영상"으로 봐요. 시리즈 안에서도 카메라 길·색·구성을 편마다 바꿔요.

## A. 다음 영상 기획 (돈 안 듦)
1. `topics-city.md`에서 아직 안 만든 주제 하나를 골라요. 결재 대기 편이 이미 있거나 오늘(KST) 이미 기획한 편이 있으면 새로 만들지 않고 "보류" — **하루 1편**(2026-10-31 대표 결정).
   - 보통은 시리즈 ① 「원래 ○○이었다」 순서대로.
   - **주 1편(7편에 1편)은 다른 시리즈**(② 미래 · ③ 크기 비교 · ④ 땅 밑, 새 시리즈도 가능)로 시험해요. **주제는 대표님이 골라요**(2026-10-31 대표 결정). `episodes`의 `corner`로 마지막 다른 시리즈 편 뒤(없으면 처음부터) 「원래 ○○이었다」가 몇 편인지 세요.
     - **5편째를 기획하는 날**(다음 날이 아니라 그다음 차례를 미리 준비): 이번 편은 평소대로 기획하고, 함께 아래 「다른 시리즈 후보 올리기」를 해요.
     - **6편이 찼으면 다른 시리즈 차례**: `topics-city.md` 맨 위 「▶ 대표 선정」 주제가 있으면 그걸로 기획하고 그 줄을 지워요(비면 「- (없음)」으로). 아직 안 골랐으면 멈추지 말고 오늘은 「원래 ○○이었다」로 기획해요(차례는 다음 날로 넘어감, 후보 카드는 그대로). 후보를 올린 적이 없으면 오늘 올려요.
   - **다른 시리즈 후보 올리기**: 3~5개. 각 후보는 첫 1초 문장 + 공식 기록·계획으로 확인 가능한지 미리 검색해 본 것만. db `strategy/series-<YYYYMMDD>` 에 `{title:"이번 주 다른 시리즈 주제 고르기", at, status:"결재 대기", agenda:[{id:"a1", question:"다음 다른 시리즈 편은 어떤 주제로 할까요?", options:[{key:"A"…, name:"<시리즈> · <첫 1초 문장>", pros:"왜 눈길을 끄는지", cons:"확인 어려운 점·주의", cost:"0원", ceoWork:"결재·업로드"}], recommend:"<key>", why, sources:[출처 링크]}]}` → 사무실 「전략 회의실」과 「대표 할 일」에 떠요. log 한 줄, 요청 결과(result)에도 "다른 시리즈 후보 n개를 전략 회의실에 올렸어요 — 골라 주세요" 덧붙이기. 같은 `series-` 카드가 결재 대기로 남아 있으면 새로 만들지 않아요.
2. WebSearch로 사실을 확인해요(이 환경은 WebFetch가 막힌 사이트가 많아요. 막히면 검색 결과를 여러 개 맞춰 보고, 엇갈리면 화면에서 뺍니다).
3. 장면 5~6개를 설계해요: 훅(0~3초, **지금 실제 지도에서 "여기가 어디"**) → 정거장 4~5개(연도 + 큰 제목 + 작은 설명 + 출처, 옛 모습은 같은 지도 위에 겹침) → 끝(다음 편 예고 + 댓글 질문). 장면표에 각 장면의 이름표(역·다리 등)도 적어요.
4. `gunggeum/devlog/<slug>/plan.md`에 근거 표와 장면표를 쓰고 커밋.
5. 사무실 db에 쓰기 (시각은 쓰기 직전 `date -u +%FT%TZ`):
   - `reviews/N0x` = `{summary, facts:[{verdict:"✅"|"⚠️", claim, line, source}], scenes:[{year, head, sub, src}], checks:[…], estCostUsd: 0}`
   - `episodes/N0x` = `{title, corner, status:"결재 대기", facts, ceoTodo:"결재함에서 장면·출처 확인 후 승인", link: plan.md GitHub 주소, costUsd:0}`
   - `log` 한 줄

## B. 결재: 승인 → 제작
1. `approvals/N0x` 메모를 읽고, 가장 비슷한 본보기 폴더를 복사해 `gunggeum/devlog/<slug>/`에서 `index.html`의 지도·시간표·자막·카메라를 바꿔요. 지도는 위 「지도 규칙」대로 실제 지도 바탕(`basemap.py` + `mapkit.js`)을 써요 — 그림 파일을 file:// 로 읽으면 영상으로 못 뽑으니 꼭 `map/map.js`로 불러요.
2. 미리보기: `node capture.cjs <스크래치>/prev 1.5,5,10,15,20,25,29` → 한 장으로 붙여 **직접 보고** 겹침·잘림·빈 화면을 고쳐요(최대 두 번).
3. 전체: `node capture.cjs <스크래치>/frames`(약 1분) → `python3 audio.py music.wav`(numpy 없으면 `python3 -m pip install numpy`) →
   `ffmpeg -framerate 24 -i frames/%04d.jpg -i music.wav -c:v libx264 -preset slow -crf 24 -maxrate 3.6M -bufsize 7M -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -ac 2 -shortest -movflags +faststart <slug>.mp4` (ffmpeg는 `python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`). 15MB 안이어야 자료실에 한 조각으로 올라가요.
4. 완성본에서 프레임 4장을 뽑아 다시 확인.
5. 자료실: Artifact 도구 publish(`url`=사무실, `asset: true`, `file_path`=mp4) → `files/<id>` `{name, episode:"N0x", kind:"video", parts:[asset id], sizeBytes, contentType:"video/mp4", from, note, createdAt}`.
   - **썸네일(필수, 2026-10-31 대표 요청)**: `node gunggeum/tools/make_thumb.cjs gunggeum/devlog/<slug> <초> "<제목 앞>|<제목 뒤(노랑)>" "<시리즈> #<n>" <slug>_thumb.jpg`. <초>는 정거장 글자가 사라진 사이(앞 정거장 b와 다음 a 사이)에서 주제가 한눈에 보이는 장면(예: 잠실 11.7 섬, 여의도 9.05 활주로). 결과를 직접 열어 보고 제목이 지도와 겹쳐 안 읽히면 초를 바꿔 다시. 자료실에 asset 업로드 → `files/N0x-thumb` `{name:"N0x <제목> 썸네일.jpg", episode:"N0x", kind:"image", parts:[asset id], sizeBytes, contentType:"image/jpeg", from:"gunggeum/tools/make_thumb.cjs", note, createdAt}` — 업로드 안내실에 미리보기가 떠요. jpg는 커밋 안 함.
6. `publish.md`(근거 표·제목·설명·고정 댓글·해시태그) 커밋(mp4는 커밋 안 함). `episodes/N0x` → `{status:"업로드 대기", ceoTodo:"업로드 안내실 보고 4곳에 올리기 → 'N0x 올렸어'", publish:{title, description(출처 포함), hashtags:["#서울역사" 처럼 # 붙여서, 주제 태그 먼저, 5개 이내], pinnedComment, threadsLine(질문형 한 줄), place(동네)}}`, log 한 줄. `publish`가 사무실 「📮 업로드 안내실」에 플랫폼별 문구로 떠요(유튜브 해시태그 3개·인스타/틱톡 5개까지 자동으로 자름). 고정 댓글에 아직 결재 안 된 다음 편 주제를 약속하지 않기.
- 수정 요청이면: 메모대로 plan.md·reviews를 고치고 다시 "결재 대기".

## C. 올렸어
`episodes/N0x` → `{status:"업로드 완료", ceoTodo:""}`, log 한 줄. `topics-city.md`에서 그 주제에 완료 표시.
