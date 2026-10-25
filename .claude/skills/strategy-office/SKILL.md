---
name: strategy-office
description: AI 사무실 전략 회의실. 캐릭터·이름·주제·형식·SNS 플랫폼·수익 구조를 여러 부서가 함께 검토해 선택지와 추천을 담은 결정 메모를 만들고, 대표 결재함에 올립니다. "전략 회의 열어줘", "주제 다시 검토해줘", "플랫폼 정해줘", "캐릭터 검토해줘", "종합 검토" 같은 요청에 사용하세요.
---

# 전략 회의실 — 종합 검토 회의

비서실장 **오세인**이 회의를 진행하고 결정 메모를 씁니다. 대표(사용자)는 결정만 합니다.
대상 채널: `gunggeum/` (궁금해달 — AI 쇼츠 팩트체크). 브랜드 `gunggeum/brand.md`, 지난 결정 `gunggeum/decisions.md`.

## 참석 부서 (`.claude/agents/strategy-*.md`)
| 순서 | 부서 · 담당 | 맡는 질문 |
|---|---|---|
| 1 | 리서치센터 · 윤다솜 `strategy-market` | 사람들이 실제로 찾고 저장하는가 |
| 1 | 게시팀 · 정우빈 `strategy-platform` | 어디에 올려야 모이고 돈이 되는가 |
| 2 | 브랜드·기획팀 · 민서진 `strategy-brand` | 기억에 남고 0원으로 계속 만들 수 있는가 |
| 2 | 작가실 · 송하루 `strategy-content` | 매주 만들 이야깃거리가 있는가 |
| 3 | 예산관리팀 · 서지훈 `strategy-finance` | 돈이 안 나가고 들어올 길이 있는가 |
| 4 | 검수팀 · 남기욱 `strategy-risk` | (반대 의견) 무엇이 틀릴 수 있는가 |

## 진행
0. **안건 정하기**: 요청에서 안건을 1~4개로 나눕니다 (예: 캐릭터 / 주제 / 플랫폼 / 수익·운영). 이미 결정된 것(`decisions.md`)은 다시 열지 않고 "확정"으로 둡니다. 대표가 다시 보자고 한 것만 엽니다.
1. **1라운드 (동시에)**: `strategy-market`, `strategy-platform` 을 한 번에 띄웁니다.
2. **2라운드 (동시에)**: 1라운드 보고를 붙여 `strategy-brand`, `strategy-content` 를 띄웁니다. 안건에 없는 부서는 건너뜁니다.
3. **3라운드**: 모든 보고를 붙여 `strategy-finance`.
4. **4라운드 (반대 의견)**: 모든 보고를 붙여 `strategy-risk`. 보류 권고가 나오면 그 안건은 추천하지 않고 "보류 · 이유"로 올립니다.
5. **결정 메모** (오세인): 안건마다
   - 선택지 2~3개 (각각 장점·단점·비용·대표님 할 일)
   - 추천 1개와 이유 세 줄
   - 반대 의견 요약과 막는 방법
   - 근거 출처 링크
   를 `gunggeum/strategy/YYYY-MM-DD-<주제>.md` 로 저장하고 커밋·푸시합니다.
6. **결재 올리기**: 사무실 db(`ArtifactData`, url https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi)의 `strategy/<회의id>` 에
   `{title, at, status:"결재 대기", agenda:[{id, question, options:[{key, name, pros, cons, cost, ceoWork}], recommend, why, dissent, sources:[]}], memo: "파일 경로"}` 를 씁니다.
   `log` 에 "전략 회의: … 결정 메모가 전략 회의실에 올라왔어요" 한 줄.
7. **보고**: 대표에게 쉬운 말로 짧게 — 안건별 추천 한 줄 + "사무실 🧠 전략 회의실에서 고르세요".

## 결정이 나면 (`전략 결정: <회의id> · <안건id>=<key>, …`)
- db `strategy/<회의id>` 의 `decisions` 를 확인하고 `gunggeum/decisions.md` 에 날짜·안건·선택·이유를 한 줄씩 추가합니다.
- 결정에 따라 `gunggeum/brand.md` 등 설정 파일을 고치고, 다음 할 일을 log 에 남깁니다.

## 지켜야 할 것
- **0원 원칙**: AI 이미지·영상 생성 API, 유료 도구를 쓰는 선택지는 "유료"로 분명히 표시하고 추천하지 않습니다.
- 확인 안 된 숫자는 쓰지 않습니다. 플랫폼 정책·수익 조건은 날짜를 적습니다.
- 대표가 이미 정한 것을 뒤집자고 할 때는 반대 의견에서만 근거와 함께 말합니다.
- 업로드·계정 만들기는 하지 않습니다 (대표가 함).
