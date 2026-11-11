"""상황극 소리 섞기: 대사(voice/*.wav) + 배경음(분위기별, 코드로 만듦) + 효과음(timeline 의 sfx).
쓰기: python3 channels/story/tools/mix.py <편 폴더> <out.wav> [분위기: cozy|mystery|tense]"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

ep, outp = Path(sys.argv[1]), sys.argv[2]
mood = sys.argv[3] if len(sys.argv) > 3 else "cozy"
tl = json.loads((ep / "timeline.json").read_text())
SR, DUR = 48000, float(tl["dur"])
N = int(SR * DUR)
t = np.arange(N) / SR
out = np.zeros((N, 2))


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tone(t0, f, dur, vol, shape="sine", pan=0.5, decay=6.0):
    i0, n = int(t0 * SR), int(dur * SR)
    if i0 >= N:
        return
    n = min(n, N - i0)
    d = np.arange(n) / SR
    ph = 2 * np.pi * f * d
    w = np.sin(ph) if shape == "sine" else (2 / np.pi) * np.arcsin(np.sin(ph))
    s = w * np.exp(-d * (decay / dur))
    out[i0:i0 + n, 0] += s * vol * (1 - pan)
    out[i0:i0 + n, 1] += s * vol * pan


# 배경음
BPM = {"cozy": 96, "mystery": 84, "tense": 120}[mood]
PROG = {"cozy": [60, 57, 53, 55], "mystery": [57, 53, 50, 52], "tense": [52, 52, 48, 50]}[mood]
beat = 60 / BPM
for i in range(int(DUR / beat)):
    b0, root = i * beat, PROG[(i // 4) % 4]
    tone(b0, note(root - 24), 0.3, 0.12, "tri", 0.5)
    if i % 2 == 1:
        tone(b0, 1800, 0.03, 0.02, "tri", 0.6)
    if i % 4 == 0:
        for k, iv in enumerate([0, 4 if mood == "cozy" else 3, 7]):
            tone(b0, note(root + iv), beat * 4, 0.025, "sine", 0.3 + 0.2 * k, 2.5)
    if mood == "cozy" and i % 4 in (1, 3):
        tone(b0 + beat / 2, note(root + 12 + [7, 9, 12, 9][(i // 2) % 4]), 0.3, 0.025, "sine", 0.6)

# 효과음
rng = np.random.default_rng(1)
for s in tl.get("sfx", []):
    t0, k = s["t"], s["kind"]
    if k == "ding":
        for j, m in enumerate([84, 91]):
            tone(t0 + j * 0.12, note(m), 0.8, 0.12, "sine", 0.5, 4)
    elif k == "pop":
        tone(t0, 700, 0.12, 0.12, "sine", 0.5, 8); tone(t0 + 0.05, 1100, 0.1, 0.08, "sine", 0.5, 8)
    elif k == "door":
        i0 = int(t0 * SR); n = min(int(0.5 * SR), N - i0)
        if n > 0:
            nz = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 6) * 0.06
            out[i0:i0 + n] += nz[:, None]
        tone(t0, 90, 0.3, 0.15, "sine", 0.5, 5)
    elif k == "whoosh":
        i0 = int(t0 * SR); n = min(int(0.7 * SR), N - i0)
        if n > 0:
            env = np.sin(np.linspace(0, np.pi, n)) * 0.07
            nz = rng.standard_normal(n)
            nz = nz - np.convolve(nz, np.ones(16) / 16, mode="same")
            out[i0:i0 + n] += (nz * env)[:, None]
    elif k == "magic":
        for j, m in enumerate([79, 83, 86, 91, 95]):
            tone(t0 + j * 0.07, note(m), 0.6, 0.06, "sine", 0.3 + 0.1 * j, 4)
    elif k == "thud":
        tone(t0, 60, 0.35, 0.3, "sine", 0.5, 6)
    elif k == "bell":  # 큰 범종: 낮은 울림 + 배음, 길게 사라짐
        for f, v, d in [(98, 0.22, 5.0), (196, 0.10, 3.5), (262, 0.07, 3.0), (415, 0.05, 2.2), (588, 0.03, 1.6)]:
            tone(t0, f, 4.5, v, "sine", 0.5, d)
    elif k == "sting":
        for j, m in enumerate([55, 58, 62]):
            tone(t0, note(m), 1.2, 0.08, "tri", 0.3 + 0.2 * j, 3)

# 대사 (배경음은 대사 동안 살짝 줄임)
voices = []
duck = np.ones(N)
try:  # 문 밖 목소리처럼 먹먹하게 (script.json cast 의 "muffle": true)
    MUFFLE = {k for k, v in json.loads((ep / "script.json").read_text())["cast"].items() if v.get("muffle")}
except Exception:
    MUFFLE = set()
for ln in tl["lines"]:
    with wave.open(str(ep / "voice" / ln["file"])) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
        if w.getnchannels() == 2:
            a = a.reshape(-1, 2).mean(axis=1)
    if ln["who"] in MUFFLE:
        for _ in range(3):
            a = np.convolve(a, np.ones(24) / 24, mode="same")
        a = a * 1.6 + np.concatenate([np.zeros(2400), a[:-2400]]) * 0.25 if len(a) > 2400 else a
    i0 = int(ln["start"] * SR)
    n = min(len(a), N - i0)
    if n > 0:
        voices.append((i0, a[:n]))
        duck[max(0, i0 - 2400):i0 + n + 2400] = 0.5
duck = np.convolve(duck, np.ones(2400) / 2400, mode="same")  # 부드럽게
out *= duck[:, None]
for i0, a in voices:
    out[i0:i0 + len(a), 0] += a * 0.9
    out[i0:i0 + len(a), 1] += a * 0.9
out *= np.clip(t / 0.3, 0, 1)[:, None] * np.clip((DUR - t) / 1.0, 0, 1)[:, None]
out = out / max(1e-6, np.max(np.abs(out))) * 0.9
with wave.open(outp, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("ok", outp, DUR)
