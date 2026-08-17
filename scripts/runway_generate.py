#!/usr/bin/env python3
"""Runway API로 샷 리스트(JSON)의 각 씬을 text-to-video 클립으로 생성.

사용법:
    export RUNWAYML_API_SECRET=key_...
    python3 scripts/runway_generate.py --shotlist production/lee_kangin_atletico_shots.json

씬별로 Runway에 생성 요청을 보내고, 완료될 때까지 폴링한 뒤
output/<scene_id>.mp4 로 다운로드합니다. 실제 API 호출은 Runway 크레딧을
소모하므로 요금이 발생합니다.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests

API_BASE = "https://api.dev.runwayml.com/v1"
API_VERSION = "2024-11-06"
TERMINAL_STATUSES = {"SUCCEEDED", "FAILED"}


def get_client():
    try:
        from runwayml import RunwayML
    except ImportError:
        print(
            "runwayml 패키지가 설치되어 있지 않습니다. "
            "`pip install runwayml` 후 다시 시도하세요.",
            file=sys.stderr,
        )
        sys.exit(1)

    import os

    if not os.environ.get("RUNWAYML_API_SECRET"):
        print("RUNWAYML_API_SECRET 환경변수가 설정되어 있지 않습니다.", file=sys.stderr)
        sys.exit(1)

    return RunwayML()


def create_task(client, scene: dict, default_ratio: str, default_model: str):
    prompt_image = scene.get("prompt_image")
    ratio = scene.get("ratio", default_ratio)
    model = scene.get("model", default_model)
    duration = scene.get("duration", 5)

    if prompt_image:
        return client.image_to_video.create(
            model=model,
            prompt_image=prompt_image,
            prompt_text=scene["prompt"],
            ratio=ratio,
            duration=duration,
        )
    return client.text_to_video.create(
        model=model,
        prompt_text=scene["prompt"],
        ratio=ratio,
        duration=duration,
    )


def wait_for_task(client, task_id: str, poll_interval: int, timeout: int):
    elapsed = 0
    while elapsed < timeout:
        task = client.tasks.retrieve(task_id)
        if task.status in TERMINAL_STATUSES:
            return task
        time.sleep(poll_interval)
        elapsed += poll_interval
    raise TimeoutError(f"task {task_id} did not finish within {timeout}s")


def download(url: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 16):
                f.write(chunk)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shotlist", required=True, help="씬 목록 JSON 파일 경로")
    parser.add_argument("--output-dir", default="output", help="다운로드한 클립을 저장할 디렉터리")
    parser.add_argument("--scene", help="특정 씬 id만 생성 (미지정 시 전체 생성)")
    parser.add_argument("--poll-interval", type=int, default=5, help="상태 확인 간격(초)")
    parser.add_argument("--timeout", type=int, default=600, help="씬당 최대 대기 시간(초)")
    args = parser.parse_args()

    with open(args.shotlist, encoding="utf-8") as f:
        shotlist = json.load(f)

    default_ratio = shotlist.get("ratio", "720:1280")
    default_model = shotlist.get("model", "gen4_turbo")
    scenes = shotlist["scenes"]
    if args.scene:
        scenes = [s for s in scenes if s["id"] == args.scene]
        if not scenes:
            print(f"씬 id '{args.scene}'를 찾을 수 없습니다.", file=sys.stderr)
            sys.exit(1)

    client = get_client()
    output_dir = Path(args.output_dir)

    results = []
    for scene in scenes:
        print(f"[{scene['id']}] 생성 요청 중...")
        task = create_task(client, scene, default_ratio, default_model)
        print(f"[{scene['id']}] task id={task.id}, 완료 대기 중...")
        try:
            task = wait_for_task(client, task.id, args.poll_interval, args.timeout)
        except TimeoutError as e:
            print(f"[{scene['id']}] 실패: {e}", file=sys.stderr)
            results.append((scene["id"], "TIMEOUT"))
            continue

        if task.status == "FAILED":
            print(f"[{scene['id']}] 생성 실패: {getattr(task, 'failure', '알 수 없는 오류')}", file=sys.stderr)
            results.append((scene["id"], "FAILED"))
            continue

        dest = output_dir / f"{scene['id']}.mp4"
        download(task.output[0], dest)
        print(f"[{scene['id']}] 완료 -> {dest}")
        results.append((scene["id"], "SUCCEEDED"))

    print("\n=== 결과 요약 ===")
    for scene_id, status in results:
        print(f"{scene_id}: {status}")


if __name__ == "__main__":
    main()
