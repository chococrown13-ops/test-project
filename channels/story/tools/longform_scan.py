"""롱폼 이야기 영상 시장 훑기 (2026-11-11 대표 요청: "롱폼 영상과 소설 등을 분석해서 어떤 영상을 만들면 좋을지").

공식 YouTube Data API v3 (읽기 전용). 키는 Network secrets(www.googleapis.com) — 이 코드는 키 값을 모름/출력 안 함.
형식(키워드 묶음)마다 최근 N일 한국어 영상 중 조회수 높은 50개를 모아, 4분 넘는 롱폼만 남겨 비교:
  중간 조회수 · 하루 조회수 · 중간 길이 · 작은 채널(구독 10만 미만)도 10만 회 넘긴 비율(새 채널의 기회) · 대표 영상
쓰기: python3 channels/story/tools/longform_scan.py [--days 60] > out.json ; --md 로 표
할당량: 검색 1회 100 단위 × 형식 수 + 영상/채널 정보 몇 번
"""
import argparse
import json
import statistics as st
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "gunggeum" / "tools"))
from yt_trends import call, seconds  # noqa: E402  같은 API 호출·길이 계산 재사용

FORMATS = {
    "썰·사연 애니": ["썰 애니메이션", "사연 애니메이션"],
    "괴담·미스터리": ["괴담 애니메이션", "미스터리 사건 이야기"],
    "웹소설풍 판타지 애니": ["회귀 애니메이션", "웹소설 애니메이션"],
    "소설·오디오북 낭독": ["단편소설 낭독", "오디오북 소설"],
    "역사 이야기": ["조선시대 이야기", "역사 야사"],
    "전래·고전 이야기": ["전래동화 애니메이션", "고전소설 이야기"],
    "생활 상황극·3D 애니": ["3D 애니메이션 상황극", "단편 애니메이션 한국"],
    "과학·호기심 스토리": ["과학 이야기 애니메이션", "만약에 시뮬레이션"],
    "SF·미래 이야기": ["미래 이야기 애니메이션", "SF 단편 애니"],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--md", action="store_true")
    a = ap.parse_args()
    key = None  # Network secrets 가 헤더로 붙임
    now = datetime.now(timezone.utc)
    after = (now - timedelta(days=a.days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    found = {}
    for fmt, kws in FORMATS.items():
        for kw in kws:
            r = call("search", key, part="snippet", q=kw, type="video", regionCode="KR", relevanceLanguage="ko", order="viewCount", publishedAfter=after, maxResults=50)
            for it in r.get("items", []):
                found.setdefault(it["id"]["videoId"], set()).add(fmt)
    ids = list(found)
    vids = {}
    for i in range(0, len(ids), 50):
        for v in call("videos", key, part="snippet,statistics,contentDetails", id=",".join(ids[i:i + 50])).get("items", []):
            vids[v["id"]] = v
    chans = {v["snippet"]["channelId"] for v in vids.values()}
    subs = {}
    cl = list(chans)
    for i in range(0, len(cl), 50):
        for c in call("channels", key, part="statistics", id=",".join(cl[i:i + 50])).get("items", []):
            subs[c["id"]] = int(c["statistics"].get("subscriberCount", 0) or 0)
    rows = []
    for vid, v in vids.items():
        sec = seconds(v["contentDetails"]["duration"])
        if sec < 240:
            continue
        views = int(v["statistics"].get("viewCount", 0) or 0)
        pub = datetime.fromisoformat(v["snippet"]["publishedAt"].replace("Z", "+00:00"))
        days = max(1.0, (now - pub).total_seconds() / 86400)
        title = v["snippet"]["title"]
        ko = sum("가" <= ch <= "힣" for ch in title) >= 2
        if not ko:
            continue
        rows.append({"id": vid, "title": title, "channel": v["snippet"]["channelTitle"], "subs": subs.get(v["snippet"]["channelId"], 0),
                     "views": views, "perDay": round(views / days), "min": round(sec / 60, 1), "days": round(days),
                     "comments": int(v["statistics"].get("commentCount", 0) or 0), "formats": sorted(found[vid])})
    summary = {}
    for fmt in FORMATS:
        rs = [r for r in rows if fmt in r["formats"]]
        if not rs:
            summary[fmt] = {"n": 0}
            continue
        small = [r for r in rs if r["subs"] < 100_000]
        summary[fmt] = {
            "n": len(rs), "medViews": int(st.median(r["views"] for r in rs)), "medPerDay": int(st.median(r["perDay"] for r in rs)),
            "medMin": round(st.median(r["min"] for r in rs), 1),
            "small100k": f"{sum(r['views'] >= 100_000 for r in small)}/{len(small)}",
            "cmtPer10k": round(st.median((r["comments"] / max(1, r["views"]) * 10000) for r in rs), 1),
            "top": [{k: r[k] for k in ("title", "channel", "subs", "views", "perDay", "min", "id")} for r in sorted(rs, key=lambda r: -r["perDay"])[:4]],
        }
    out = {"at": now.isoformat(timespec="seconds"), "days": a.days, "videos": len(rows), "formats": summary}
    if not a.md:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return
    print(f"# 롱폼 이야기 영상 훑기 — 최근 {a.days}일, 4분 넘는 한국어 영상 {len(rows)}개 ({out['at'][:10]})\n")
    print("| 형식 | 영상 수 | 중간 조회수 | 하루 조회수(중간) | 중간 길이(분) | 작은 채널 10만+ | 댓글/만 회 |")
    print("|---|---|---|---|---|---|---|")
    for fmt, s in sorted(summary.items(), key=lambda kv: -kv[1].get("medPerDay", 0)):
        if s["n"]:
            print(f"| {fmt} | {s['n']} | {s['medViews']:,} | {s['medPerDay']:,} | {s['medMin']} | {s['small100k']} | {s['cmtPer10k']} |")
    for fmt, s in summary.items():
        if s.get("n"):
            print(f"\n## {fmt}")
            for r in s["top"]:
                print(f"- [{r['title'][:48]}](https://youtu.be/{r['id']}) — {r['channel']}(구독 {r['subs']:,}) · {r['views']:,}회 · 하루 {r['perDay']:,} · {r['min']}분")


if __name__ == "__main__":
    main()
