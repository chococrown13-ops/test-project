#!/usr/bin/env python3
"""장면 이미지를 첫 프레임으로 Veo(Gemini API) 영상 클립을 만든다.

episode.json 의 장면에 있는 "motion"(움직임 문구)과 에피소드의 "motion_suffix"(공통 문구)를
합쳐 프롬프트로 쓰고, 결과를 그 장면의 "video" 경로(예: clips/s4.mp4)에 저장한다.
make_video.py 로 다시 렌더링하면 클립이 이미지 대신 들어간다.

키: 환경 변수 GEMINI_API_KEY, 또는 Claude Code 클라우드 환경의 API credential
    (generativelanguage.googleapis.com 에 x-goog-api-key 헤더)

사용법:
    python sns/tools/make_clip.py sns/episodes/ep01/episode.json --scene 4
    python sns/tools/make_clip.py sns/episodes/ep01/episode.json --scene 3 5 --model veo-3.1-fast-generate-preview
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "veo-3.1-lite-generate-preview"


def request(url, body=None, raw=False):
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("GEMINI_API_KEY")
    if key:  # 없으면 클라우드 환경의 API credential 이 프록시에서 붙는다
        headers["x-goog-api-key"] = key
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.read() if raw else json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}")


def generate(image_path, prompt, model, duration, negative):
    mime = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    body = {
        "instances": [{"prompt": prompt, "image": {"bytesBase64Encoded": b64, "mimeType": mime}}],
        "parameters": {"aspectRatio": "9:16", "durationSeconds": duration},
    }
    if negative and "lite" not in model:  # Lite 모델은 negativePrompt 를 받지 않음
        body["parameters"]["negativePrompt"] = negative
    op = request(f"{BASE}/models/{model}:predictLongRunning", body)
    name = op["name"]
    print(f"  작업 시작: {name}")
    started = time.time()
    while not op.get("done"):
        time.sleep(10)
        op = request(f"{BASE}/{name}")
        print(f"  기다리는 중... {int(time.time() - started)}초")
    if "error" in op:
        sys.exit(f"생성 실패: {op['error']}")
    resp = op.get("response", {})
    samples = resp.get("generateVideoResponse", {}).get("generatedSamples", [])
    if not samples:
        sys.exit("영상이 없습니다 (안전 필터에 걸렸을 수 있음): " + json.dumps(resp, ensure_ascii=False)[:800])
    return samples[0]["video"]["uri"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("episode")
    ap.add_argument("--scene", type=int, nargs="+", required=True, help="장면 번호 (1부터)")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--duration", type=int, default=8, help="클립 길이(초)")
    args = ap.parse_args()

    with open(args.episode, encoding="utf-8") as f:
        ep = json.load(f)
    base_dir = os.path.dirname(os.path.abspath(args.episode))
    for n in args.scene:
        sc = ep["scenes"][n - 1]
        if not sc.get("motion") or not sc.get("video"):
            sys.exit(f"장면 {n}: episode.json 에 motion 과 video 가 필요합니다")
        prompt = sc["motion"] + " " + ep.get("motion_suffix", "")
        print(f"장면 {n} 생성 ({args.model}, {args.duration}초)")
        uri = generate(os.path.join(base_dir, sc["image"]), prompt.strip(), args.model,
                       args.duration, ep.get("motion_negative"))
        out = os.path.join(base_dir, sc["video"])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(request(uri, raw=True))
        print(f"  저장: {out}")


if __name__ == "__main__":
    main()
