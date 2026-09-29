#!/usr/bin/env python3
"""캐릭터 기준 이미지를 참조로 Gemini(Nano Banana) 장면 이미지를 만든다.

episode.json 의 장면에 있는 "image_prompt" 로 이미지를 만들어 그 장면의 "image" 경로에 저장한다.
참조 이미지는 기본으로 sns/brand/reference.png (궁금해달 캐릭터 시트).

키: 환경 변수 GEMINI_API_KEY, 또는 Claude Code 클라우드 환경의 API credential
    (generativelanguage.googleapis.com 에 x-goog-api-key 헤더)

사용법:
    python sns/tools/make_image.py sns/episodes/ep02/episode.json --scene 1
    python sns/tools/make_image.py sns/episodes/ep02/episode.json --scene 1 3 4 --count 2
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODEL = "gemini-3.1-flash-image"
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REF = os.path.join(HERE, "..", "brand", "reference.png")


def post(url, body):
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("GEMINI_API_KEY")
    if key:  # 없으면 클라우드 환경의 API credential 이 프록시에서 붙는다
        headers["x-goog-api-key"] = key
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}")


def inline(path):
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    with open(path, "rb") as f:
        return {"inline_data": {"mime_type": mime, "data": base64.b64encode(f.read()).decode()}}


def generate(prompt, refs, model):
    body = {
        "contents": [{"parts": [inline(p) for p in refs] + [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "9:16"}},
    }
    resp = post(f"{BASE}/models/{model}:generateContent", body)
    for cand in resp.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = part.get("inlineData") or part.get("inline_data")
            if data:
                return base64.b64decode(data["data"]), data.get("mimeType", "image/png")
    sys.exit("이미지가 없습니다 (안전 필터 등): " + json.dumps(resp, ensure_ascii=False)[:800])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("episode")
    ap.add_argument("--scene", type=int, nargs="+", required=True, help="장면 번호 (1부터)")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--ref", nargs="+", default=[DEFAULT_REF], help="참조 이미지 (캐릭터 시트 등)")
    ap.add_argument("--count", type=int, default=1, help="장면마다 몇 장 뽑을지 (2장 이상이면 _a, _b ... 로 저장)")
    args = ap.parse_args()

    with open(args.episode, encoding="utf-8") as f:
        ep = json.load(f)
    base_dir = os.path.dirname(os.path.abspath(args.episode))
    prefix = ep.get("image_prompt_prefix", "")
    for n in args.scene:
        sc = ep["scenes"][n - 1]
        if not sc.get("image_prompt"):
            sys.exit(f"장면 {n}: episode.json 에 image_prompt 가 필요합니다")
        prompt = (prefix + " " + sc["image_prompt"]).strip()
        out = os.path.join(base_dir, sc["image"])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        stem, _ = os.path.splitext(out)
        for i in range(args.count):
            print(f"장면 {n} 생성 {i + 1}/{args.count} ({args.model})")
            data, mime = generate(prompt, args.ref, args.model)
            ext = ".png" if "png" in mime else ".jpg"
            path = out if args.count == 1 and ext == os.path.splitext(out)[1] else \
                f"{stem}{'_' + 'abcdefgh'[i] if args.count > 1 else ''}{ext}"
            with open(path, "wb") as f:
                f.write(data)
            print(f"  저장: {path}")


if __name__ == "__main__":
    main()
