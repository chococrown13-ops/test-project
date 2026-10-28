#!/usr/bin/env python3
"""장면 이미지를 첫 프레임으로 Gemini Omni(Gemini API) 영상 클립을 만든다. (Veo 는 2026-10 API 에서 빠짐)

episode.json 의 장면에 있는 "motion"(움직임 문구)과 에피소드의 "motion_suffix"(공통 문구)를 합쳐 프롬프트로 쓰고,
결과를 그 장면의 "video" 경로(예: clips/s3.mp4)에 저장한다. make_video.py 로 다시 렌더링하면 클립이 이미지 대신 들어간다.
쓴 돈은 응답의 토큰 수로 계산해 에피소드 폴더 cost.json 에 쌓고, 만들기 전에 월 한도를 확인한다.

해달 모습 고정: 장면 이미지는 첫 프레임(<FIRST_FRAME>), 기준 이미지(studio.config.json clip.reference_image)는
캐릭터 참조(<IMAGE_REF_0>)로 함께 넣는다 (--no-ref 로 끔).
이어 찍기: 장면에 "extend_from": <장면 번호> 가 있으면 그 장면 클립의 interaction id 로 영상을 이어서 늘린다
(첫 프레임 없이, 기준 이미지만 참조). 해달 연재처럼 5초 컷을 끊김 없이 이을 때 쓴다. id 는 clips/interactions.json 에 저장.

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

HERE = os.path.dirname(os.path.abspath(__file__))

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


REF_NOTE = ("Keep the otter exactly like <IMAGE_REF_0>: same face, dark chocolate-brown fur, cream face, "
            "light sky-blue knitted scarf and tiny yellow notebook. Use the reference image only as a character reference, not as a frame.")


def image_part(path):
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    with open(path, "rb") as f:
        return {"type": "image", "data": base64.b64encode(f.read()).decode(), "mime_type": mime}


def generate(image_path, prompt, model, resolution, seconds, ref_path=None, previous_id=None):
    """image_path = 첫 프레임 (이어 찍기면 None), ref_path = 캐릭터 기준 이미지, previous_id = 이어 찍을 클립의 interaction id"""
    parts, tags = [], []
    if previous_id:
        tags.append("[# Sources <PREVIOUS_VIDEO>@Video1]")
        prompt = "Extend this video. Continue the same shot with the same character. " + prompt
    else:
        parts.append(image_part(image_path))
        tags.append("[# Sources <FIRST_FRAME>@Image1]")
    if ref_path:
        parts.append(image_part(ref_path))
        tags.append(f"[# References <IMAGE_REF_0>@Image{len(parts)}]")
        prompt += " " + REF_NOTE
    parts.append({"type": "text", "text": " ".join(tags) + " " + prompt})
    fmt = {"type": "video", "resolution": resolution, "duration": f"{seconds}s"}
    if not previous_id:
        fmt["aspect_ratio"] = "9:16"
    body = {"model": model, "input": parts, "response_format": fmt}
    if previous_id:
        body["previous_interaction_id"] = previous_id
    resp = post(body)
    if resp.get("status") != "completed":
        sys.exit("영상이 끝나지 않았어요: " + json.dumps({k: resp.get(k) for k in ("status", "error")}, ensure_ascii=False))
    for step in resp.get("steps", []):
        for part in step.get("content", []) or []:
            if part.get("type") == "video" and part.get("data"):
                return base64.b64decode(part["data"]), cost_of(resp.get("usage", {})), resp.get("id")
    sys.exit("응답에 영상이 없어요 (안전 필터 등): " + json.dumps(resp.get("usage", {}), ensure_ascii=False))


def main():
    cfg = config()["clip"]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("episode")
    ap.add_argument("--scene", type=int, nargs="+", required=True, help="장면 번호 (1부터)")
    ap.add_argument("--model", default=cfg["model"])
    ap.add_argument("--resolution", default=cfg["resolution"], choices=list(EST_USD_PER_SEC))
    ap.add_argument("--seconds", type=int, default=cfg["seconds"], help="3~10초")
    ap.add_argument("--no-ref", action="store_true", help="기준 이미지(캐릭터 참조)를 넣지 않음")
    args = ap.parse_args()
    ref = None if args.no_ref else os.path.join(HERE, "..", cfg.get("reference_image", "brand/reference.png"))

    with open(args.episode, encoding="utf-8") as f:
        ep = json.load(f)
    base_dir = os.path.dirname(os.path.abspath(args.episode))
    suffix = ep.get("motion_suffix", "")
    ids_path = os.path.join(base_dir, "clips", "interactions.json")
    ids = json.load(open(ids_path, encoding="utf-8")) if os.path.exists(ids_path) else {}
    for n in args.scene:
        sc = ep["scenes"][n - 1]
        if not sc.get("motion") or not sc.get("video"):
            sys.exit(f"장면 {n}: episode.json 에 motion 과 video 경로가 필요합니다")
        image, previous_id = None, None
        if sc.get("extend_from"):
            previous_id = ids.get(str(sc["extend_from"]))
            if not previous_id:
                sys.exit(f"장면 {n}: 이어 찍을 장면 {sc['extend_from']} 의 클립 id 가 없어요 — 그 장면부터 만드세요")
        else:
            image = os.path.join(base_dir, sc["image"])
            if not os.path.exists(image):
                sys.exit(f"장면 {n}: 첫 프레임 이미지가 없어요 ({image}) — make_image.py 먼저")
        spent = check_budget(EST_USD_PER_SEC[args.resolution] * args.seconds)
        prompt = (sc["motion"] + " " + suffix).strip()
        how = f"장면 {sc['extend_from']} 이어 찍기" if previous_id else "첫 프레임"
        print(f"장면 {n} 클립 생성 ({args.model}, {args.resolution}, {args.seconds}초, {how}{', 기준 이미지 참조' if ref else ''}) · 이번 달 지금까지 ${spent:.2f}")
        data, usd, iid = generate(image, prompt, args.model, args.resolution, args.seconds, ref, previous_id)
        out = os.path.join(base_dir, sc["video"])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        if iid:
            ids[str(n)] = iid
            with open(ids_path, "w", encoding="utf-8") as f:
                json.dump(ids, f, ensure_ascii=False, indent=2)
        total = add_cost(base_dir, "clip", usd, f"장면 {n} {args.resolution} {args.seconds}초 ({args.model}, {how})")
        print(f"  저장: {out}  · 이번 클립 ${usd:.2f} · 이번 편 누적 ${total:.2f}")


if __name__ == "__main__":
    main()
