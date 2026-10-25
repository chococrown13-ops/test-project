#!/usr/bin/env python3
"""장면 이미지를 첫 프레임으로 Gemini Omni(Gemini API) 영상 클립을 만든다. (Veo 는 2026-10 API 에서 빠짐)

episode.json 의 장면에 있는 "motion"(움직임 문구)과 에피소드의 "motion_suffix"(공통 문구)를 합쳐 프롬프트로 쓰고,
결과를 그 장면의 "video" 경로(예: clips/s3.mp4)에 저장한다. make_video.py 로 다시 렌더링하면 클립이 이미지 대신 들어간다.
쓴 돈은 응답의 토큰 수로 계산해 에피소드 폴더 cost.json 에 쌓고, 만들기 전에 월 한도를 확인한다.

키: 환경 변수 GEMINI_API_KEY, 또는 Claude Code 클라우드 환경의 API credential
    (generativelanguage.googleapis.com 에 x-goog-api-key 헤더)

사용법:
    python gunggeum/tools/make_clip.py gunggeum/episodes/s01/episode.json --scene 3
    python gunggeum/tools/make_clip.py gunggeum/episodes/s01/episode.json --scene 3 --seconds 4 --resolution 360p   # 싼 시험
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

from ledger import add_cost, check_budget, config

URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
# 달러 / 100만 토큰 (2026-10 기준, 2차 자료 — 응답의 실제 토큰 수에 곱한다)
USD_PER_M = {"video_out": 17.5, "text_out": 9.0, "in": 1.5}
# 만들기 전 한도 확인용 대략 비용 (달러/초)
EST_USD_PER_SEC = {"360p": 0.034, "720p": 0.102, "1080p": 0.152}


def post(body):
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("GEMINI_API_KEY")
    if key:  # 없으면 클라우드 환경의 API credential 이 프록시에서 붙는다
        headers["x-goog-api-key"] = key
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}")


def cost_of(usage):
    out = {m["modality"]: m["tokens"] for m in usage.get("output_tokens_by_modality", [])}
    video = out.get("video", 0)
    text = usage.get("total_output_tokens", 0) - video + usage.get("total_thought_tokens", 0)
    return (video * USD_PER_M["video_out"] + text * USD_PER_M["text_out"] + usage.get("total_input_tokens", 0) * USD_PER_M["in"]) / 1e6


def generate(image_path, prompt, model, resolution, seconds):
    mime = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
    with open(image_path, "rb") as f:
        img = base64.b64encode(f.read()).decode()
    body = {
        "model": model,
        "input": [
            {"type": "image", "data": img, "mime_type": mime},
            {"type": "text", "text": prompt},
        ],
        "response_format": {"type": "video", "aspect_ratio": "9:16", "resolution": resolution, "duration": f"{seconds}s"},
    }
    resp = post(body)
    if resp.get("status") != "completed":
        sys.exit("영상이 끝나지 않았어요: " + json.dumps({k: resp.get(k) for k in ("status", "error")}, ensure_ascii=False))
    for step in resp.get("steps", []):
        for part in step.get("content", []) or []:
            if part.get("type") == "video" and part.get("data"):
                return base64.b64decode(part["data"]), cost_of(resp.get("usage", {}))
    sys.exit("응답에 영상이 없어요 (안전 필터 등): " + json.dumps(resp.get("usage", {}), ensure_ascii=False))


def main():
    cfg = config()["clip"]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("episode")
    ap.add_argument("--scene", type=int, nargs="+", required=True, help="장면 번호 (1부터)")
    ap.add_argument("--model", default=cfg["model"])
    ap.add_argument("--resolution", default=cfg["resolution"], choices=list(EST_USD_PER_SEC))
    ap.add_argument("--seconds", type=int, default=cfg["seconds"], help="3~10초")
    args = ap.parse_args()

    with open(args.episode, encoding="utf-8") as f:
        ep = json.load(f)
    base_dir = os.path.dirname(os.path.abspath(args.episode))
    suffix = ep.get("motion_suffix", "")
    for n in args.scene:
        sc = ep["scenes"][n - 1]
        if not sc.get("motion") or not sc.get("video"):
            sys.exit(f"장면 {n}: episode.json 에 motion 과 video 경로가 필요합니다")
        image = os.path.join(base_dir, sc["image"])
        if not os.path.exists(image):
            sys.exit(f"장면 {n}: 첫 프레임 이미지가 없어요 ({image}) — make_image.py 먼저")
        spent = check_budget(EST_USD_PER_SEC[args.resolution] * args.seconds)
        prompt = (sc["motion"] + " " + suffix).strip()
        print(f"장면 {n} 클립 생성 ({args.model}, {args.resolution}, {args.seconds}초) · 이번 달 지금까지 ${spent:.2f}")
        data, usd = generate(image, prompt, args.model, args.resolution, args.seconds)
        out = os.path.join(base_dir, sc["video"])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        total = add_cost(base_dir, "clip", usd, f"장면 {n} {args.resolution} {args.seconds}초 ({args.model})")
        print(f"  저장: {out}  · 이번 클립 ${usd:.2f} · 이번 편 누적 ${total:.2f}")


if __name__ == "__main__":
    main()
