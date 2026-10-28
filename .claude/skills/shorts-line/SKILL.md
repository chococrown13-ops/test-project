---
name: shorts-line
description: 궁금해달 쇼츠·카드뉴스 제작 라인. "다음 쇼츠 기획"·"다음 카드뉴스 기획"이면 주제 확인·대본·검수까지 해서 결재함에 올리고, "<편 id> 결재: 승인"이면 이미지·영상 클립·AI 목소리 편집·게시 문구까지 만들어 자료실에 올립니다. "다음 쇼츠 만들어줘", "쇼츠 기획", "S03 결재", "K02 결재" 같은 요청에 사용하세요.
---

# 궁금해달 쇼츠 제작 라인 (하루 1편)

대표님은 **결재와 업로드만** 합니다. 녹화·녹음 없음(목소리는 AI). 월 예산 `gunggeum/studio.config.json` 의 `monthly_budget_usd`(**약 5만 원 = $35**, 2026-10-28 결정), 편당 목표는 `per_episode_target_usd`(정보 편 약 $1.4 · 해달 연재 약 $1.8). 주간 계획은 `weekly_plan`(해달 연재 풀 모션 주 3 · 정보 영상 주 2 · 카드뉴스 주 2 · 스레드 주 3) — 해달 연재 제작 틀은 준비 중이라 그 전까지는 아래 정보 편 흐름(A·B)을 쓰고, 카드뉴스는 D 흐름을 씁니다. 정보 편 클립은 `clips_per_episode.info`(2개: S1 훅 + 핵심 장면).
사무실: https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi (db 는 `ArtifactData`, 자료실 파일은 `Artifact` 도구)

편 번호: `S01`, `S02` … (폴더 `gunggeum/episodes/s01/`). 다음 번호 = 폴더 중 가장 큰 번호 + 1.

직원(`.claude/agents/*.md`)은 Agent 도구가 있으면 따로 띄우고, 없으면 **그 직원 파일을 읽고 그 역할·점검표대로 직접** 합니다. 이때 검수(quality-guard)는 대본을 쓴 뒤 **새로 읽는 마음으로** 점검표를 하나씩 체크하고, 결과에 "검수는 같은 세션에서 했어요"라고 밝힙니다. 웹 페이지를 직접 못 열면 검색 결과 2곳 이상으로 확인하고 그렇다고 적습니다.

## A. 기획 — 요청 "다음 쇼츠 기획" (돈 안 듦)
1. **중복 확인**: db `episodes` 에 status "결재 대기" 인 편이 이미 있으면 새로 만들지 말고 요청을 "보류"(result: "S0n 결재가 먼저예요 — 결재함에서 승인해 주세요"). 오늘(KST) 이미 기획한 편이 있어도 "보류"(하루 1편).
2. **리서치** (`research-lead`): 주제·판정표·출처. 확인 안 되면 다음 후보로 — 세 번 실패하면 멈추고 보고.
3. **대본** (`scriptwriter`): 판정표만 가지고 장면 7개.
4. **1차 검수** (`quality-guard`): 반려면 작가에게 한 번 고치게 하고 다시 검수. 두 번 반려면 멈추고 대표님께.
5. **게시 문구** (`publisher`) — 대본 확정 뒤 바로.
6. 파일 만들기 (`gunggeum/episodes/sNN/`):
   - `plan.md`: 주제·시리즈·판정표(출처 링크)·대본 표·검수 결과·게시 문구·다음 편 예고
   - `episode.json`: `_template/episode.json` 을 복사해 제목·장면·`image_prompt`(영어)·`motion`(S1)·`cover` 를 채움
   - `topics.md` 에서 쓴 후보를 `[x] (S0n)` 으로 표시
   커밋·푸시.
7. **결재 올리기** (db):
   - `episodes/S0n` = {title, corner, status:"결재 대기", facts:"✅n · ⚠️n · ❌n 요약", ceoTodo:"결재함에서 대본 확인 후 승인", link: plan.md 의 GitHub 주소, costUsd:0}
   - `reviews/S0n` = {estCostUsd: 1.2, summary: "시리즈 #n · 약 n초 · 새 이미지 4장 + 움직이는 장면 2개(S1 훅·핵심 장면) · AI 목소리", facts:[{claim, verdict, line}], script:[{time, scene, narration, title, image}], checks:[검수 결과·출처 수·주의점]}
   - log 한 줄, 요청 추적 "완료"(result: "S0n 「제목」 기획안이 결재함에 올라왔어요").
   GitHub 주소: `https://github.com/chococrown13-ops/test-project/blob/claude/sns-account-strategy-h9eu1q/gunggeum/episodes/s0n/plan.md`

## B. 제작 — 요청 "S0n 결재: 승인" (돈 듦)
0. db `approvals/S0n` 의 decision 이 "승인"인지 확인. "수정 요청"이면 memo 대로 A-3~5 를 다시 해서 `reviews/S0n` 을 고치고 다시 "결재 대기"(요청 "완료", result "고친 대본을 다시 올렸어요"). 이미 "업로드 대기"·"업로드 완료"면 다시 만들지 않음("건너뜀").
1. 시작 전 `python3 gunggeum/tools/ledger.py` — 남은 돈이 $1.4 보다 적으면 멈추고 보고(요청 "보류", result "이번 달 예산이 거의 다 썼어요").
2. episodes/S0n status "제작 중", ceoTodo "".
3. **이미지** (`art-director`): 새 장면 4장(S1·S3·S4·S5). 고정 장면은 `gunggeum/brand/scenes/` 재사용.
4. **클립** (`motion-director`): `clips_per_episode.info` 개(S1 훅 + 핵심 장면 하나, episode.json 에 motion·video 를 채움). 기준 이미지는 make_clip.py 가 자동으로 함께 넣음. 실패하면 이미지로 대신.
5. **편집** (`editor`): AI 목소리 넣어 `out/sNN.mp4`, `out/cover.jpg`.
6. **2차 검수** (`quality-guard`): 반려 사항은 해당 팀이 한 번 고침. 그래도 반려면 멈추고 보고.
7. **자료실에 올리기**: `Artifact` 도구 publish(url=사무실, asset: true)로 `out/sNN.mp4`(15MB 넘으면 조각으로 나눠 첫 바이트가 `<` 아니게)와 `out/cover.jpg`, `publish.md` 를 올리고 db `files/<첫 조각 asset id>` = {name, episode:"S0n", kind, parts:[asset id…], sizeBytes, contentType, from:"Claude", note, createdAt}.
8. 마무리:
   - `publish.md` 저장(`_template/publish.md` 모양 그대로 — 유튜브·인스타·틱톡 복사 칸, AI 표기 켜는 곳, 고정 댓글, 체크리스트), `cost.json`·`clips/`·`images/` 커밋·푸시 (`out/` 은 커밋 안 함)
   - episodes/S0n = {status:"업로드 대기", costUsd: cost.json 합계, ceoTodo:"자료실에서 받아 올리기 (게시 문구는 publish.md)"}
   - log 한 줄(이번 편 비용·이번 달 누적), 요청 추적 "완료"(result: "S0n 완성본과 게시 문구가 자료실에 올라왔어요 · 비용 $x").

## C. 업로드 뒤 — 대표님이 "S0n 올렸어" 라고 하면
episodes/S0n status "업로드 완료", ceoTodo "". 5편마다 `growth-analyst` 로 성과 정리(대표님이 숫자를 주면).

## D. 카드뉴스 — 요청 "다음 카드뉴스 기획" / "K0n 결재: 승인" (0원)
번호 `K01`, `K02` … (폴더 `gunggeum/cards/kNN/`, 다음 번호 = 가장 큰 번호 + 1, k01 은 도구 시험 샘플). 그림은 글자를 코드로 얹는 `tools/make_cards.mjs` 라 돈이 안 들어서, **기획 단계에서 카드까지 그려** 결재함에서 실제 모습을 보고 승인하게 합니다.
1. **중복 확인**: 결재 대기 중인 K 편이 있으면 "보류"(result "K0n 결재가 먼저예요").
2. **리서치** (`research-lead`): `studio.config.json` 의 `topics.save`(돈 받는 제도·직장 돈·가격 해석) 중 하나, 공식 출처 2곳 이상, 판정표. `topics.hold` 는 쓰지 않음.
3. **카드 글** (`scriptwriter`): 6~8장 — 1장 표지(훅 2줄, `**강조**`) → 받는 사람·조건(list) → 핵심 2~3개(point) → 해야 할 일(list) → 한눈에(table) → 끝장(end: 요약 2줄·공유 부탁·출처·기준일). 한 장은 혼자 봐도 이해되게, 장당 2~3문장.
4. **1차 검수** (`quality-guard`): 숫자·기한·대상이 판정표와 같은지, "받아요" 단정 대신 "대상이면" 같은 표현, 끝장 출처·기준일·"사람마다 다를 수 있어요".
5. 파일: `cards/kNN/plan.md`(판정표·출처·검수) · `card.json` · `publish.md`(인스타 캡션·해시태그·스레드 글·올리기 전 체크리스트) → `node gunggeum/tools/make_cards.mjs gunggeum/cards/kNN/card.json` 로 `out/01.png…` 그림 → 커밋·푸시(`out/` 제외).
6. **자료실에 결재용으로 올리기**: `Artifact` publish(asset, file_paths)로 out 의 PNG 전부와 publish.md, db `files/<asset id>` = {name:"kNN-01.png", episode:"K0n", kind:"image", note:"K0n 「제목」 n/N — 결재 대기(승인 전엔 올리지 마세요)", …}.
7. **결재 올리기**: `episodes/K0n` = {title, corner:"🗂️ 카드뉴스", status:"결재 대기", facts, ceoTodo:"자료실에서 카드 n장을 보고 결재함에서 승인", link: plan.md 주소, costUsd:0} · `reviews/K0n` = {estCostUsd:0, summary:"카드뉴스 n장 · 0원 · 자료실에서 그림 확인", facts, script:[{scene:"n장", title: 제목, narration: 본문 요약}], checks} · log · 요청 "완료".
8. **승인되면** ("K0n 결재: 승인"): 자료실 그 편 파일들의 note 를 "K0n 「제목」 n/N — 올려도 돼요"로 바꾸고, `episodes/K0n` = {status:"업로드 대기", ceoTodo:"자료실에서 카드 n장을 01번부터 받아 인스타 게시물로 (문구는 publish.md)"} · log · 요청 "완료". **수정 요청**이면 memo 대로 card.json 을 고쳐 다시 그리고(5~7) 다시 "결재 대기".
9. **올린 뒤**: "K0n 올렸어" → status "업로드 완료".

## 규칙
- 돈 드는 생성은 B 에서만, 승인된 편만. 다시 뽑기는 장면당 한 번까지.
- 건강·의료·투자 권유 금지, 💰 편은 기준일과 "공식 사이트에서 확인" 필수.
- 시각은 `date -u +%FT%TZ` 실제 값. 업로드·계정·결제는 하지 않음.
