"""요즘 한국 유튜브에서 뜨는 영상 모으기 — 매일 오후 4시 「오늘 뭐 만들까」 추천의 재료 (2026-11-10 대표 요청).

공식 YouTube Data API v3 (읽기 전용). 키는 yt_stats.py 와 같음:
  ① Network secrets (www.googleapis.com · X-goog-api-key 헤더, 이 코드는 키를 모름)  ② 환경 변수 YOUTUBE_API_KEY
키 값은 출력·파일·커밋 금지.

모으는 것
  1) 인기 급상승(mostPopular, 한국) — 전체 + 분야별(애니·키즈에 가까운 영화/애니, 엔터, 교육, 노하우, 사람/블로그, 게임)
  2) 최근 48시간 안에 올라온 조회수 높은 쇼츠 (#shorts 검색, 한국·한국어)
  3) 시간당 조회수(올린 뒤 몇 시간 만에 얼마나) 순으로 정렬, 길이(쇼츠/롱폼) 구분

쓰기:  python3 gunggeum/tools/yt_trends.py > /tmp/trends.json        (사람이 읽을 요약은 --md)
할당량: 인기 7번(각 1) + 검색 3번(각 100) + 영상 정보 몇 번 ≈ 하루 310 단위 (하루 한도 10,000)
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

API = "https://www.googleapis.com/youtube/v3/"
CATEGORIES = {"": "전체", "1": "영화·애니", "10": "음악", "17": "스포츠", "23": "코미디", "24": "엔터테인먼트", "27": "교육", "26": "노하우·스타일", "22": "인물·블로그", "20": "게임"}
SEARCHES = ["#shorts", "#쇼츠", "#키즈"]


def call(endpoint, key, **params):
    query = urllib.parse.urlencode({**params, **({"key": key} if key else {})})
    try:
        with urllib.request.urlopen(f"{API}{endpoint}?{query}", timeout=25) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        reason = ""
        try:
            reason = json.load(e)["error"]["errors"][0].get("reason", "")
        except Exception:
            pass
        print(f"  유튜브 API 오류 {e.code} {reason} ({endpoint})", file=sys.stderr)
        return {}


def seconds(iso):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def details(key, ids):
    out = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i : i + 50]
        for v in call("videos", key, part="snippet,statistics,contentDetails,status", id=",".join(chunk)).get("items", []):
            out[v["id"]] = v
    return out


def row(v, now, source):
    sn, st = v["snippet"], v.get("statistics", {})
    pub = datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
    hours = max(1.0, (now - pub).total_seconds() / 3600)
    views = int(st.get("viewCount", 0))
    dur = seconds(v.get("contentDetails", {}).get("duration"))
    return {
        "id": v["id"],
        "title": sn["title"],
        "channel": sn.get("channelTitle", ""),
        "category": CATEGORIES.get(sn.get("categoryId", ""), sn.get("categoryId", "")),
        "publishedAt": sn["publishedAt"],
        "hours": round(hours, 1),
        "views": views,
        "viewsPerHour": round(views / hours),
        "likes": int(st["likeCount"]) if "likeCount" in st else None,
        "comments": int(st.get("commentCount", 0)),
        "seconds": dur,
        "short": 0 < dur <= 180,
        "madeForKids": bool(v.get("status", {}).get("madeForKids")),
        "tags": (sn.get("tags") or [])[:8],
        "korean": bool(re.search("[가-힣]", sn["title"] + sn.get("channelTitle", ""))),
        "from": source,
        "url": (f"https://youtube.com/shorts/{v['id']}" if 0 < dur <= 180 else f"https://youtu.be/{v['id']}"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", action="store_true", help="사람이 읽을 요약(마크다운)으로")
    ap.add_argument("--top", type=int, default=15)
    a = ap.parse_args()
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    now = datetime.now(timezone.utc)

    rows = {}
    for cat, name in CATEGORIES.items():
        params = dict(part="snippet,statistics,contentDetails,status", chart="mostPopular", regionCode="KR", maxResults=50)
        if cat:
            params["videoCategoryId"] = cat
        for v in call("videos", key, **params).get("items", []):
            r = row(v, now, f"인기({name})")
            rows.setdefault(r["id"], r)

    since = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
    found = []
    for q in SEARCHES:
        res = call("search", key, part="id", q=q, type="video", videoDuration="short", order="viewCount",
                   regionCode="KR", relevanceLanguage="ko", publishedAfter=since, maxResults=50)
        found += [(i["id"]["videoId"], q) for i in res.get("items", []) if i.get("id", {}).get("videoId")]
    info = details(key, list({vid for vid, _ in found}))
    for vid, q in found:
        if vid in info and vid not in rows:
            rows[vid] = row(info[vid], now, f"48시간 쇼츠({q})")

    allrows = sorted(rows.values(), key=lambda r: r["viewsPerHour"], reverse=True)
    shorts = [r for r in allrows if r["short"] and r["korean"]]          # 한국어 쇼츠
    world = [r for r in allrows if r["short"] and not r["korean"]]       # 말 없이도 통하는 해외 쇼츠(참고)
    longs = [r for r in allrows if not r["short"]]
    kids = [r for r in allrows if r["madeForKids"]]
    out = {"at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "count": len(allrows), "shorts": shorts[:60], "worldShorts": world[:30], "long": longs[:40], "kids": kids[:30]}

    if not allrows:
        sys.exit("자료를 하나도 못 받았어요 — API 키(Network secrets)나 할당량을 확인해 주세요")
    if a.md:
        def table(rs):
            lines = ["| 시간당 조회 | 조회 | 길이 | 분야 | 제목 | 채널 |", "|---:|---:|---:|---|---|---|"]
            for r in rs[: a.top]:
                t = r["title"].replace("|", "/")[:60]
                lines.append(f"| {r['viewsPerHour']:,} | {r['views']:,} | {r['seconds']}초 | {r['category']} | [{t}]({r['url']}) | {r['channel'][:20]} |")
            return "\n".join(lines)
        print(f"# 요즘 뜨는 영상 ({out['at']}, {len(allrows)}개 중)\n\n## 한국어 쇼츠 (3분 이하)\n{table(shorts)}\n\n## 해외 쇼츠 (말 없이도 통하는 것 참고)\n{table(world)}\n\n## 키즈 표시 영상\n{table(kids)}\n\n## 긴 영상\n{table(longs)}")
    else:
        json.dump(out, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
