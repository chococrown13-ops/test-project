"""유튜브 공개 통계 읽기 — 내 채널 영상의 조회수·좋아요·댓글 수 (YouTube Data API v3, 읽기 전용).

필요한 것: 환경 변수 YOUTUBE_API_KEY (대표님이 클라우드 환경 설정에 넣음 — 채팅·파일·저장소에 쓰지 않음).
채널: studio.config.json 의 "handle" (예: "@도시의나이테") 또는 --handle.

쓰기:  python3 tools/yt_stats.py [--handle @이름] [--max 50] > stats.json
결과:  {"at", "channel": {id, title, subscribers, views, videos}, "videos": [{id, title, publishedAt, views, likes, comments, url}]}
할당량: 채널 1 + 목록 1 + 영상 1 = 약 3 단위/회 (하루 한도 10,000).
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://www.googleapis.com/youtube/v3/"
CONFIG = Path(__file__).resolve().parent.parent / "studio.config.json"


def call(endpoint: str, key: str, **params) -> dict:
    query = urllib.parse.urlencode({**params, "key": key})
    try:
        with urllib.request.urlopen(f"{API}{endpoint}?{query}", timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # 키 값이 섞여 나오지 않게 상태 코드와 이유만 남긴다
        reason = ""
        try:
            reason = json.load(e)["error"]["errors"][0].get("reason", "")
        except Exception:
            pass
        sys.exit(f"유튜브 API 오류 {e.code} {reason} ({endpoint})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--handle", default="")
    ap.add_argument("--max", type=int, default=50)
    args = ap.parse_args()

    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        sys.exit("YOUTUBE_API_KEY 가 없어요 — 대표님이 클라우드 환경 설정에 넣어야 해요")
    handle = args.handle or json.loads(CONFIG.read_text()).get("handle", "")
    if not handle:
        sys.exit("채널 핸들이 없어요 — studio.config.json 의 handle 을 채우거나 --handle 로 주세요")

    ch = call("channels", key, part="snippet,statistics,contentDetails", forHandle=handle)
    if not ch.get("items"):
        sys.exit(f"채널을 못 찾았어요: {handle}")
    c = ch["items"][0]
    uploads = c["contentDetails"]["relatedPlaylists"]["uploads"]
    stats = c.get("statistics", {})

    items = call("playlistItems", key, part="contentDetails", playlistId=uploads, maxResults=min(args.max, 50)).get("items", [])
    ids = [i["contentDetails"]["videoId"] for i in items]
    videos = []
    if ids:
        for v in call("videos", key, part="snippet,statistics", id=",".join(ids)).get("items", []):
            s = v.get("statistics", {})
            videos.append(
                {
                    "id": v["id"],
                    "title": v["snippet"]["title"],
                    "publishedAt": v["snippet"]["publishedAt"],
                    "views": int(s.get("viewCount", 0)),
                    # 좋아요를 숨긴 영상은 likeCount 가 없다
                    "likes": int(s["likeCount"]) if "likeCount" in s else None,
                    "comments": int(s.get("commentCount", 0)),
                    "url": f"https://youtube.com/shorts/{v['id']}",
                }
            )

    json.dump(
        {
            "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "channel": {
                "id": c["id"],
                "title": c["snippet"]["title"],
                "subscribers": None if stats.get("hiddenSubscriberCount") else int(stats.get("subscriberCount", 0)),
                "views": int(stats.get("viewCount", 0)),
                "videos": int(stats.get("videoCount", 0)),
            },
            "videos": sorted(videos, key=lambda v: v["publishedAt"]),
        },
        sys.stdout,
        ensure_ascii=False,
        indent=1,
    )


if __name__ == "__main__":
    main()
