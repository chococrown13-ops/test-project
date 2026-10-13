---
name: studio-check
description: 땡그랑 스튜디오 점검실. 점검팀(시스템 inspect-system · 코드 inspect-code)이 루틴·사무실 db·자료실·사무실 화면·도구 코드가 잘 돌아가는지 확인하고 점검 보고서를 사무실에 올립니다. "스튜디오 점검", "시스템 점검", "잘 작동하는지 확인", "코드 문제 없는지 봐줘" 같은 요청에 사용하세요.
---

# 🩺 스튜디오 점검

점검팀장 **문가온**(시스템)과 **신유담**(코드)이 확인하고, 결과를 대표가 읽기 쉬운 보고서로 올립니다. 추가 비용 0원.
사무실: https://claude.ai/artifact/W4ym2MMMzq5snKeKZxRpSi (db 는 `ArtifactData`, 자료실·페이지는 `Artifact` 도구)

## 진행
1. **재료 모으기** (`ttaeng/checks/_snapshot/`, 커밋하지 않음)
   - `ArtifactData` list 로 `log`·`locks`·`strategy`·`episodes`·`reviews`·`approvals`·`files`·`checks` 를 `out_dir` 에 저장
   - `Artifact` list(scope "assets") 결과를 `assets.txt` 로 저장
   - `Artifact` read(url = 사무실) 로 받은 페이지 HTML 을 `office.html` 로 복사
   - `date -u +%FT%TZ` 를 `now.txt` 로
2. **점검 (동시에)**: `inspect-system`, `inspect-code` 를 한 번에 띄웁니다. Agent 도구가 없으면 두 파일의 점검표를 직접 따라 합니다.
3. **안전한 조치만 바로 하기** — 아래 두 가지만, 하면 보고서 `fixed` 에 적습니다.
   - 2시간 넘은 `locks/<키>` 삭제
   - 이 스킬이 전에 올린 `checks` 문서 중 최근 10개만 남기고 삭제
   그 밖의 수정(코드·설정·다른 사람이 쓴 기록)은 하지 않고 "고치는 법"으로 제안만 합니다.
4. **보고서 쓰기**
   - `ttaeng/checks/YYYY-MM-DD-HHMM.md` (표 그대로) → `git pull --rebase` 후 커밋·푸시
   - db `checks/<YYYYMMDD-HHMM>` = `{at: 실제 UTC, status: "정상"|"주의"|"문제", summary: 한 줄, items: [{area, name, result: "✅"|"⚠️"|"❌", detail, fix}], fixed: [문자열], report: 파일 경로}`
     — items 는 ⚠️·❌ 를 먼저, ✅ 는 영역별로 묶어 최대 12줄
   - `log` 한 줄: "스튜디오 점검: 정상/주의 n건/문제 n건 — 🩺 점검실에서 보기"
5. **대표 보고**: 쉬운 말로 3줄 — 결론, 가장 중요한 문제 하나와 고치는 법, 바로 한 조치.

## 결과 판정
- ❌ 하나라도 있으면 "문제", ⚠️ 만 있으면 "주의", 모두 ✅ 면 "정상".
- 점검을 못 한 항목(권한 없음 등)은 ⚠️ 로 적고 이유를 남깁니다. 못 했는데 ✅ 로 적지 않습니다.
