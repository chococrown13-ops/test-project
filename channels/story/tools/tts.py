"""상황극 대사 → 목소리(wav) + 시간표. Google Cloud TTS (키는 Network secrets 로 붙음 — 키 값은 출력·저장 금지).
쓰기: python3 channels/story/tools/tts.py <편 폴더>
  읽음: <편>/script.json  {"start": 1.2, "gap": 0.3, "tail": 2.5, "cast": {이름: {"voice": "ko-KR-Chirp3-HD-Charon", "rate": 1.05, "pitch": 0}}, "lines": [{"who", "text", "mood"?, "sfx"?, "pause"?}]}
  만듦: <편>/voice/NN.wav (커밋 안 함) · <편>/timeline.js (window.TL = {dur, lines:[{who, text, mood, start, dur, env:[0~1 …24fps]}], sfx:[{t, kind}]}) · timeline.json
입 모양은 목소리 크기(24fps)로 움직임. 글자 수를 세어 한 달 무료 한도 관리용으로 남김(chars).
"""
import base64
import json
import os
import shutil
import subprocess
import math
import struct
import sys
import time
import urllib.request
import wave
from pathlib import Path

API = "https://texttospeech.googleapis.com/v1/text:synthesize"
SR = 48000


def synth(text, voice, rate=1.0, pitch=0.0):
    cfg = {"audioEncoding": "LINEAR16", "sampleRateHertz": SR, "speakingRate": rate}
    if pitch and "Chirp" not in voice:  # Chirp3-HD 는 음높이 조절을 지원하지 않음
        cfg["pitch"] = pitch
    body = {"input": {"text": text}, "voice": {"languageCode": voice[:5], "name": voice}, "audioConfig": cfg}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return base64.b64decode(json.load(r)["audioContent"])
        except Exception as e:  # 키 값이 섞이지 않게 오류 종류만
            if i == 2:
                sys.exit(f"목소리 만들기 실패: {type(e).__name__} {getattr(e, 'code', '')}")
            time.sleep(2 * (i + 1))


RHUBARB_URL = "https://github.com/DanielSWolf/rhubarb-lip-sync/releases/download/v1.14.0/Rhubarb-Lip-Sync-1.14.0-Linux.zip"


def rhubarb():
    """입 모양 도구(Rhubarb Lip Sync, MIT, 공식 GitHub 배포본). 없으면 ~/.cache 에 한 번 받아 둠."""
    exe = os.environ.get("RHUBARB") or shutil.which("rhubarb")
    if exe:
        return exe
    home = Path.home() / ".cache" / "rhubarb"
    exe = home / "Rhubarb-Lip-Sync-1.14.0-Linux" / "rhubarb"
    if not exe.exists():
        import zipfile, io
        print("입 모양 도구를 한 번 받아요 (약 87MB)…")
        data = urllib.request.urlopen(RHUBARB_URL, timeout=300).read()
        home.mkdir(parents=True, exist_ok=True)
        zipfile.ZipFile(io.BytesIO(data)).extractall(home)
        exe.chmod(0o755)
    return str(exe)


def mouth_cues(exe, wav):
    """목소리 → 입 모양 순서 [[시작초, 모양(A~H, X)]…] (언어 상관없는 phonetic 인식)."""
    try:
        out = subprocess.run([exe, "-r", "phonetic", "-f", "json", "--extendedShapes", "GHX", "-q", str(wav)], capture_output=True, text=True, timeout=300)
        cues = json.loads(out.stdout)["mouthCues"]
        return [[round(c["start"], 2), c["value"]] for c in cues]
    except Exception as e:
        print(f"  입 모양 계산 실패({type(e).__name__}) — 목소리 크기로 대신 움직여요")
        return None


def main():
    ep = Path(sys.argv[1])
    sc = json.loads((ep / "script.json").read_text())
    (ep / "voice").mkdir(exist_ok=True)
    t = sc.get("start", 1.0)
    lines, chars = [], 0
    exe = rhubarb() if sc.get("lipsync", True) else None
    for i, ln in enumerate(sc["lines"]):
        t += ln.get("pause", 0)
        c = sc["cast"][ln["who"]]
        path = ep / "voice" / f"{i:02d}.wav"
        key = json.dumps([ln["text"], c], ensure_ascii=False, sort_keys=True)
        keyf = ep / "voice" / f"{i:02d}.key"
        if not (path.exists() and keyf.exists() and keyf.read_text() == key):
            for kf in (ep / "voice").glob("*.key"):  # 순서만 바뀐 같은 대사면 그 파일을 옮겨 씀
                if kf != keyf and kf.read_text() == key and kf.with_suffix(".wav").exists():
                    shutil.copy(kf.with_suffix(".wav"), ep / "voice" / f"_{i:02d}.tmp")
                    break
        tmp = ep / "voice" / f"_{i:02d}.tmp"
        if tmp.exists():
            tmp.replace(path); keyf.write_text(key)
        if not (path.exists() and keyf.exists() and keyf.read_text() == key):  # 같은 대사·목소리면 다시 안 만듦(글자 아끼기)
            path.write_bytes(synth(ln["text"], c["voice"], c.get("rate", 1.0), c.get("pitch", 0)))  # LINEAR16 는 wav 머리말이 붙어 옴
            keyf.write_text(key)
            chars += len(ln["text"])
        with wave.open(str(path)) as w:
            n, sr = w.getnframes(), w.getframerate()
            pcm = w.readframes(n)
        samples = struct.unpack(f"<{n}h", pcm[: n * 2])
        dur = n / sr
        hop = sr // 24
        env = []
        for k in range(0, n, hop):
            seg = samples[k:k + hop]
            rms = math.sqrt(sum(s * s for s in seg) / max(1, len(seg))) / 32768
            env.append(round(min(1.0, rms * 6), 3))
        cues = mouth_cues(exe, path) if exe else None
        lines.append({**{k: v for k, v in ln.items() if k not in ("pause",)}, "start": round(t, 3), "dur": round(dur, 3), "env": env, "cues": cues, "file": path.name})
        t += dur + sc.get("gap", 0.3)
    sfx = [{"t": round(l["start"] + s.get("at", 0), 3), "kind": s["kind"]} for l in lines for s in ([l["sfx"]] if isinstance(l.get("sfx"), dict) else l.get("sfx", []) or [])]
    sfx += sc.get("sfxAbs", [])
    tl = {"dur": round(t - sc.get("gap", 0.3) + sc.get("tail", 2.5), 2), "lines": lines, "sfx": sfx, "chars": chars}
    if sc.get("cards"):
        tl["cards"] = sc["cards"]  # 대본 도우미가 만든 정보 카드
    (ep / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1))
    (ep / "timeline.js").write_text("window.TL = " + json.dumps(tl, ensure_ascii=False) + ";\n")
    print(f"대사 {len(lines)}줄 · 길이 {tl['dur']}초 · 이번에 새로 만든 글자 {chars}자")


if __name__ == "__main__":
    main()
