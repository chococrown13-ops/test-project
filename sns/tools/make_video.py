#!/usr/bin/env python3
"""궁금해달 쇼츠 자동 편집기.

에피소드 JSON(장면별 이미지, 내레이션, 자막, 카메라 움직임)을 읽어
1080x1920 세로 영상(mp4)을 만든다.

- 카메라 움직임: 확대, 좌우 이동, 위아래 이동 (켄 번스)
- 자막: 장면 제목(위쪽, 큰 글씨) + 내레이션 자막(선택)
  `**강조**` 는 노란색, `~~취소~~` 는 취소선
- 음성: 환경 변수 GOOGLE_TTS_API_KEY 가 있거나 --tts 를 주면 Google Cloud TTS 로 내레이션을 만들고
  음성 길이에 맞춰 장면 길이를 정한다. 없으면 JSON 의 duration 으로 무음 영상을 만든다.
  (Claude Code 클라우드 환경의 "API credentials" 에 키를 넣으면 프록시가 헤더를 붙여 주므로
  키 없이 --tts 만 주면 된다.)
- 배경음악: --bgm 파일을 주면 내레이션 아래에 작게 깐다.
- AI 영상 클립: 장면에 "video" 가 있고 그 파일이 있으면 이미지 대신 클립을 쓴다.
  클립이 장면보다 짧으면 앞으로 재생 후 거꾸로 재생(pingpong)해서 길이를 채운다.

사용법:
    pip install pillow imageio-ffmpeg
    python sns/tools/make_video.py sns/episodes/ep01/episode.json -o ep01.mp4
"""

import argparse
import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import wave

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
YELLOW = (255, 214, 64)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FONT = os.path.join(HERE, "fonts", "Pretendard-ExtraBold.otf")

TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"
TTS_RATE = 24000
GAP_BETWEEN_LINES = 0.12  # 내레이션 문장 사이 쉼(초)
SCENE_TAIL = 0.25  # 장면 끝 여유(초)


# ---------------------------------------------------------------- 음성

def synthesize(text, key, voice, rate, pitch=0.0):
    config = {"audioEncoding": "LINEAR16", "sampleRateHertz": TTS_RATE, "speakingRate": rate}
    if pitch:  # 반음 단위, -20 ~ +20 (Chirp3-HD 목소리는 지원하지 않음)
        config["pitch"] = pitch
    body = {
        "input": {"text": text},
        "voice": {"languageCode": "ko-KR", "name": voice},
        "audioConfig": config,
    }
    headers = {"Content-Type": "application/json"}
    if key:  # 키가 없으면 클라우드 환경의 API credential 이 프록시에서 붙는다
        headers["X-Goog-Api-Key"] = key
    req = urllib.request.Request(TTS_URL, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        wav_bytes = base64.b64decode(json.load(r)["audioContent"])
    with wave.open(io.BytesIO(wav_bytes)) as w:
        return w.readframes(w.getnframes())  # 16-bit mono PCM


def silence(seconds):
    return b"\x00\x00" * int(TTS_RATE * seconds)


def build_timeline(scenes, tts, key, voice, rate, pitch=0.0):
    """장면마다 (길이, [(문장, 시작, 끝)]) 을 정하고, 음성이 있으면 PCM 도 이어 붙인다."""
    pcm = bytearray()
    for sc in scenes:
        lines = sc.get("narration", [])
        timed, t = [], 0.0
        if tts:
            chunk = bytearray()
            for line in lines:
                audio = synthesize(line, key, voice, rate, pitch)
                dur = len(audio) / 2 / TTS_RATE
                timed.append((line, t, t + dur))
                chunk += audio + silence(GAP_BETWEEN_LINES)
                t += dur + GAP_BETWEEN_LINES
            total = max(t + SCENE_TAIL, sc.get("min_duration", 0))
            chunk += silence(total - len(chunk) / 2 / TTS_RATE)
            pcm += chunk
        else:
            total = sc["duration"]
            weights = [max(len(l), 1) for l in lines]
            for line, wgt in zip(lines, weights):
                dur = total * wgt / sum(weights)
                timed.append((line, t, t + dur))
                t += dur
        sc["_duration"], sc["_lines"] = total, timed
    return bytes(pcm) if tts else None


# ---------------------------------------------------------------- 자막

def parse_markup(line):
    """'**강조**', '~~취소~~' 를 (글자, 색, 취소선) 조각으로 나눈다."""
    parts = []
    for m in re.finditer(r"\*\*(.+?)\*\*|~~(.+?)~~|([^*~]+)", line):
        if m.group(1):
            parts.append((m.group(1), YELLOW, False))
        elif m.group(2):
            parts.append((m.group(2), WHITE, True))
        else:
            parts.append((m.group(3), WHITE, False))
    return parts


def wrap_parts(parts, font, max_w, draw):
    """조각들을 단어 단위로 끊어 max_w 안에 들어가는 줄들로 만든다."""
    words = []
    for text, color, strike in parts:
        for i, word in enumerate(re.split(r"(\s+)", text)):
            if word:
                words.append((word, color, strike))
    lines, cur, cur_w = [], [], 0
    for word, color, strike in words:
        ww = draw.textlength(word, font=font)
        if cur and cur_w + ww > max_w and not word.isspace():
            lines.append(cur)
            cur, cur_w = [], 0
        if not cur and word.isspace():
            continue
        cur.append((word, color, strike))
        cur_w += ww
    if cur:
        lines.append(cur)
    return lines


def render_text(text, font, box=False, max_w=W - 120, stroke=None):
    """여러 줄 자막을 투명 배경 RGBA 이미지로 그린다."""
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    stroke = stroke if stroke is not None else max(4, font.size // 11)
    rows = []
    for raw in text.split("\n"):
        rows += wrap_parts(parse_markup(raw), font, max_w, probe)
    line_h = int(font.size * 1.28)
    widths = [sum(probe.textlength(w, font=font) for w, _, _ in row) for row in rows]
    pad = 28 if box else stroke + 4
    img_w = int(max(widths)) + pad * 2
    img_h = line_h * len(rows) + pad * 2
    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if box:
        d.rounded_rectangle([0, 0, img_w - 1, img_h - 1], radius=26, fill=(0, 0, 0, 150))
    for i, (row, rw) in enumerate(zip(rows, widths)):
        x = (img_w - rw) / 2
        y = pad + i * line_h
        for word, color, strike in row:
            ww = d.textlength(word, font=font)
            d.text((x, y), word, font=font, fill=color,
                   stroke_width=0 if box else stroke, stroke_fill=BLACK)
            if strike and not word.isspace():
                sy = y + font.size * 0.62
                d.line([(x - 4, sy), (x + ww + 4, sy)], fill=(255, 70, 70), width=max(6, font.size // 9))
            x += ww
    return img


# ---------------------------------------------------------------- 화면

def ease(t, kind):
    if kind == "linear":
        return t
    if kind == "out":
        return 1 - (1 - t) ** 3
    return t * t * (3 - 2 * t)  # 부드럽게 시작하고 끝남


def lerp(a, b, t):
    return a + (b - a) * t


def cover(img, w, h):
    """이미지를 w x h 를 꽉 채우도록 확대(잘림 허용)."""
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def camera_frame(src, cam, t, out_w, out_h):
    """cam = {from:{zoom,x,y}, to:{zoom,x,y}, ease} 에 따라 src 의 일부를 잘라 확대."""
    a, b = cam.get("from", {}), cam.get("to", cam.get("from", {}))
    k = ease(t, cam.get("ease", "smooth"))
    zoom = lerp(a.get("zoom", 1.0), b.get("zoom", a.get("zoom", 1.0)), k)
    cx = lerp(a.get("x", 0.5), b.get("x", a.get("x", 0.5)), k)
    cy = lerp(a.get("y", 0.5), b.get("y", a.get("y", 0.5)), k)
    cw, ch = src.width / zoom, src.height / zoom
    x0 = min(max(cx * src.width - cw / 2, 0), src.width - cw)
    y0 = min(max(cy * src.height - ch / 2, 0), src.height - ch)
    return src.resize((out_w, out_h), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))


def conform_clip(path, dur, size, mode, tmpdir):
    """AI 영상 클립을 30fps, 화면 크기, 장면 길이에 맞춘 임시 mp4 로 바꾼다."""
    import imageio_ffmpeg
    _, secs = imageio_ffmpeg.count_frames_and_secs(path)
    w, h = size
    fit = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1"
    if mode == "pingpong" and secs < dur:
        graph = (f"[0:v]fps={FPS},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,"
                 f"{fit},tpad=stop_mode=clone:stop_duration={dur}[v]")
        loop = []
    else:
        graph = f"[0:v]fps={FPS},{fit},tpad=stop_mode=clone:stop_duration={dur}[v]"
        loop = ["-stream_loop", "-1"] if mode == "loop" else []
    out = os.path.join(tmpdir, os.path.basename(path) + ".conformed.mp4")
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", *loop, "-i", path,
                    "-filter_complex", graph, "-map", "[v]", "-t", f"{dur:.3f}", "-an",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", out], check=True)
    return out


def clip_frames(sc):
    """맞춰 둔 클립의 프레임을 PIL 이미지로 하나씩 돌려준다."""
    import imageio_ffmpeg
    reader = imageio_ffmpeg.read_frames(sc["_clip"])
    next(reader)  # 메타데이터
    for data in reader:
        yield Image.frombytes("RGB", sc["_fg_size"], data)


def prepare_scene(sc, base_dir, fonts, tmpdir):
    img = Image.open(os.path.join(base_dir, sc["image"])).convert("RGB")
    fit = sc.get("fit", 1.0)
    fg_w, fg_h = round(W * fit), round(H * fit)
    sc["_src"] = cover(img, fg_w * 2, fg_h * 2)  # 2배로 미리 키워 움직일 때 선명하게
    sc["_fg_size"] = (fg_w, fg_h)
    clip = os.path.join(base_dir, sc["video"]) if sc.get("video") else None
    if clip and os.path.exists(clip):
        sc["_clip"] = conform_clip(clip, sc["_duration"], sc["_fg_size"],
                                   sc.get("video_mode", "pingpong"), tmpdir)
        print(f"  영상 클립 사용: {sc['video']}")
    if fit < 1.0:
        sc["_bg"] = cover(img, W, H).filter(ImageFilter.GaussianBlur(40))
        sc["_fg_pos"] = ((W - fg_w) // 2, round(H * sc.get("fit_top", 0.02)))
    if sc.get("title"):
        sc["_title"] = render_text(sc["title"], fonts["title"])
    if sc.get("captions", True):
        sc["_caps"] = [(render_text(line, fonts["caption"], box=True), s, e)
                       for line, s, e in sc["_lines"]]


def draw_frame(sc, t_local, clip_frame=None):
    """clip_frame 이 있으면 AI 영상 프레임을, 없으면 이미지에 카메라 움직임을 준 프레임을 쓴다."""
    if clip_frame is not None:
        fg = clip_frame
    else:
        p = min(t_local / sc["_duration"], 1.0)
        fg = camera_frame(sc["_src"], sc.get("camera", {}), p, *sc["_fg_size"])
    if "_bg" in sc:
        frame = sc["_bg"].copy()
        frame.paste(fg, sc["_fg_pos"])
    else:
        frame = fg
    frame = frame.convert("RGBA")
    if "_title" in sc:
        ti = sc["_title"]
        frame.alpha_composite(ti, ((W - ti.width) // 2, round(H * sc.get("title_y", 0.1))))
    for cap, s, e in sc.get("_caps", []):
        if s <= t_local < e:
            frame.alpha_composite(cap, ((W - cap.width) // 2, round(H * sc.get("caption_y", 0.24))))
    return frame.convert("RGB")


# ---------------------------------------------------------------- 출력

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("episode", help="에피소드 JSON 경로")
    ap.add_argument("-o", "--output", default="output.mp4")
    ap.add_argument("--bgm", help="배경음악 파일 (mp3/wav)")
    ap.add_argument("--bgm-volume", type=float, default=0.12)
    ap.add_argument("--font", default=DEFAULT_FONT)
    ap.add_argument("--voice", default=None, help="Google TTS 목소리 (기본: 에피소드 JSON 의 voice)")
    ap.add_argument("--tts", action="store_true",
                    help="환경 변수에 키가 없어도 음성 만들기 (클라우드 환경의 API credential 사용)")
    ap.add_argument("--silent", action="store_true", help="API 키가 있어도 음성 없이 만들기")
    ap.add_argument("--preview", action="store_true", help="장면마다 가운데 프레임만 PNG 로 저장")
    args = ap.parse_args()

    with open(args.episode, encoding="utf-8") as f:
        ep = json.load(f)
    base_dir = os.path.dirname(os.path.abspath(args.episode))
    scenes = ep["scenes"]
    key = os.environ.get("GOOGLE_TTS_API_KEY")
    tts = not args.silent and (args.tts or bool(key))
    voice = args.voice or ep.get("voice", "ko-KR-Neural2-A")

    print("음성: " + (f"Google TTS ({voice})" if tts else "없음 (무음 영상)"))
    pcm = build_timeline(scenes, tts, key, voice, ep.get("speaking_rate", 1.08), ep.get("pitch", 0.0))
    fonts = {"title": ImageFont.truetype(args.font, ep.get("title_size", 78)),
             "caption": ImageFont.truetype(args.font, ep.get("caption_size", 50))}
    tmp = tempfile.mkdtemp()
    for sc in scenes:
        prepare_scene(sc, base_dir, fonts, tmp)

    if args.preview:
        stem = os.path.splitext(args.output)[0]
        for i, sc in enumerate(scenes, 1):
            mid = sc["_lines"][len(sc["_lines"]) // 2][1] + 0.05 if sc.get("_caps") else sc["_duration"] / 2
            frame = None
            if "_clip" in sc:
                for n, frame in enumerate(clip_frames(sc)):
                    if n >= int(mid * FPS):
                        break
            draw_frame(sc, mid, frame).save(f"{stem}_s{i}.png")
        print(f"미리보기 저장: {stem}_s1.png ...")
        return

    total = sum(sc["_duration"] for sc in scenes)
    audio = os.path.join(tmp, "voice.wav")
    with wave.open(audio, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TTS_RATE)
        w.writeframes(pcm if pcm else silence(total))

    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ffmpeg, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", audio]
    if args.bgm:
        cmd += ["-stream_loop", "-1", "-i", args.bgm,
                "-filter_complex",
                f"[2:a]volume={args.bgm_volume},afade=t=out:st={max(total - 1.5, 0)}:d=1.5[m];"
                f"[1:a][m]amix=inputs=2:duration=first:normalize=0[a]",
                "-map", "0:v", "-map", "[a]"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart",
            args.output]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = 0
    for sc in scenes:
        frames = round(sc["_duration"] * FPS)
        clip = clip_frames(sc) if "_clip" in sc else None
        last = None
        for f in range(frames):
            if clip is not None:
                last = next(clip, last)  # 클립이 한두 프레임 짧으면 마지막 프레임 유지
            proc.stdin.write(draw_frame(sc, f / FPS, last).tobytes())
        if clip is not None:
            clip.close()
        n += frames
        print(f"  장면 {scenes.index(sc) + 1}/{len(scenes)} 완료 ({sc['_duration']:.1f}초)")
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg 오류")
    print(f"완성: {args.output} ({total:.1f}초, {n}프레임)")


if __name__ == "__main__":
    main()
