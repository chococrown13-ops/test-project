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


NATIVE = {1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱", 8: "여덟", 9: "아홉", 10: "열", 11: "열한", 12: "열두",
          20: "스물", 30: "서른", 40: "마흔"}


def native(n):
    """고유어 수(시·번·개 앞): 28 → 스물여덟, 4 → 네. 49 넘으면 그대로."""
    if n in NATIVE and n <= 12: return NATIVE[n]
    if n > 49: return str(n)
    t, o = n // 10 * 10, n % 10
    head = "스물" if t == 20 else NATIVE.get(t, "")
    return head + (NATIVE[o] if o else "")


def speakable(text):
    """화면 자막은 그대로 두고, 읽는 글만 사람 말투로: 시·번은 고유어, 영어 약자는 한글 소리, 말줄임표는 쉼표."""
    import re
    t = re.sub(r"(\d+)\s*시(?![대작간])", lambda m: native(int(m.group(1))) + " 시", text)
    t = re.sub(r"(\d+)\s*번(?!째)", lambda m: native(int(m.group(1))) + " 번", t)
    for a, b in {"CCTV": "씨씨티비", "VIP": "브이아이피", "KTX": "케이티엑스"}.items():
        t = t.replace(a, b)
    t = re.sub(r"^[…\s]+", "", t)          # 맨 앞 말줄임표는 읽지 않음
    t = re.sub(r"\s*…\s*", ", ", t)        # 가운데 말줄임표 → 잠깐 쉼
    t = re.sub(r",\s*([?!.])", r"\1", t)
    return t.strip()


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
    gv = json.loads((ep / "voices.json").read_text()) if (ep / "voices.json").exists() else None   # 있으면 Gemini 목소리
    if gv:
        import tts_gemini
        sc["normalize"] = True
        for name, v in gv["cast"].items():
            sc["cast"][name] = {"engine": "gemini", "model": gv.get("model", "gemini-3.8-flash-tts"), **v}
    qa = []
    t = sc.get("start", 1.0)
    lines, chars = [], 0
    exe = rhubarb() if sc.get("lipsync", True) else None
    for i, ln in enumerate(sc["lines"]):
        t += ln.get("pause", 0)
        c = sc["cast"][ln["who"]]
        path = ep / "voice" / f"{i:02d}.wav"
        say = ln.get("say") or (speakable(ln["text"]) if sc.get("normalize") else ln["text"])
        note = (gv or {}).get("notes", {}).get(str(i), "")
        key = json.dumps([say, c, note] if gv else [say, c], ensure_ascii=False, sort_keys=True)
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
            if c.get("engine") == "gemini":
                prev = sc["lines"][i - 1]["text"] if i else ""
                path.write_bytes(tts_gemini.synth(say, c["voice"], tts_gemini.prompt(c["profile"], gv.get("scene", ""), note, prev), c["model"], log=qa, fallback=c.get("fallback", [])))
                if qa[-1]["model"] != c["model"]:   # 한도 때문에 바뀐 모델은 그 인물 남은 줄에도 계속 씀
                    c["fallback"] = [m for m in c.get("fallback", []) if m != qa[-1]["model"]]; c["model"] = qa[-1]["model"]
                print(f"  {i:03d} {ln['who']} {qa[-1]['score']} ×{qa[-1]['tries']} {qa[-1]['model']}", flush=True)
                (ep / "voice" / f"{i:02d}.qa").write_text(json.dumps({"i": i, "who": ln["who"], **qa[-1]}, ensure_ascii=False))
            else:
                path.write_bytes(synth(say, c["voice"], c.get("rate", 1.0), c.get("pitch", 0)))  # LINEAR16 는 wav 머리말이 붙어 옴
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
    if gv:   # 받아쓰기 점검 기록(사람이 다시 볼 줄: 점수 0.85 미만). 이어서 만든 경우도 줄마다 남긴 기록을 모음
        qa = [json.loads(p.read_text()) for p in sorted((ep / "voice").glob("*.qa"))]
        (ep / "voice_check.json").write_text(json.dumps(qa, ensure_ascii=False, indent=1))
        bad = [q for q in qa if q["score"] < 0.85]
        print(f"받아쓰기 점검: {len(qa)}줄 중 다시 볼 줄 {len(bad)}개")
    (ep / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1))
    (ep / "timeline.js").write_text("window.TL = " + json.dumps(tl, ensure_ascii=False) + ";\n")
    print(f"대사 {len(lines)}줄 · 길이 {tl['dur']}초 · 이번에 새로 만든 글자 {chars}자")


if __name__ == "__main__":
    main()
