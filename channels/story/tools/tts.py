"""상황극 대사 → 목소리(wav) + 시간표. Google Cloud TTS (키는 Network secrets 로 붙음 — 키 값은 출력·저장 금지).
쓰기: python3 channels/story/tools/tts.py <편 폴더>
  읽음: <편>/script.json  {"start": 1.2, "gap": 0.3, "tail": 2.5, "cast": {이름: {"voice": "ko-KR-Chirp3-HD-Charon", "rate": 1.05, "pitch": 0}}, "lines": [{"who", "text", "mood"?, "sfx"?, "pause"?}]}
  만듦: <편>/voice/NN.wav (커밋 안 함) · <편>/timeline.js (window.TL = {dur, lines:[{who, text, mood, start, dur, env:[0~1 …24fps]}], sfx:[{t, kind}]}) · timeline.json
입 모양은 목소리 크기(24fps)로 움직임. 글자 수를 세어 한 달 무료 한도 관리용으로 남김(chars).
"""
import base64
import json
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


def main():
    ep = Path(sys.argv[1])
    sc = json.loads((ep / "script.json").read_text())
    (ep / "voice").mkdir(exist_ok=True)
    t = sc.get("start", 1.0)
    lines, chars = [], 0
    for i, ln in enumerate(sc["lines"]):
        t += ln.get("pause", 0)
        c = sc["cast"][ln["who"]]
        raw = synth(ln["text"], c["voice"], c.get("rate", 1.0), c.get("pitch", 0))
        chars += len(ln["text"])
        path = ep / "voice" / f"{i:02d}.wav"
        path.write_bytes(raw)  # LINEAR16 는 wav 머리말이 붙어 옴
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
        lines.append({**{k: v for k, v in ln.items() if k not in ("pause",)}, "start": round(t, 3), "dur": round(dur, 3), "env": env, "file": path.name})
        t += dur + sc.get("gap", 0.3)
    sfx = [{"t": round(l["start"] + s.get("at", 0), 3), "kind": s["kind"]} for l in lines for s in ([l["sfx"]] if isinstance(l.get("sfx"), dict) else l.get("sfx", []) or [])]
    sfx += sc.get("sfxAbs", [])
    tl = {"dur": round(t - sc.get("gap", 0.3) + sc.get("tail", 2.5), 2), "lines": lines, "sfx": sfx, "chars": chars}
    (ep / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1))
    (ep / "timeline.js").write_text("window.TL = " + json.dumps(tl, ensure_ascii=False) + ";\n")
    print(f"대사 {len(lines)}줄 · 길이 {tl['dur']}초 · 글자 {chars}자")


if __name__ == "__main__":
    main()
