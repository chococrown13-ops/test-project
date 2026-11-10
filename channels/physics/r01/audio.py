"""물리 시뮬레이션 #1 배경음: 물리 계산에서 나온 충돌 순간(events.json)에 맞춰 소리를 냄.
못=실로폰(구슬마다 다른 음), 범퍼=통, 시소·물레방아=딸깍, 도미노=톡, 종=딩, 결승=빰빠밤. 밑에 잔잔한 리듬.
쓰기: python3 audio.py <events.json> <music.wav>"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1]))
SR, DUR = 48000, float(ev["dur"])
t = np.arange(int(SR * DUR)) / SR
out = np.zeros((len(t), 2))
rng = np.random.default_rng(3)


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def hit(t0, f, dur, vol, shape="sine", pan=0.5, decay=6.0):
    i0 = int(t0 * SR)
    n = int(dur * SR)
    if i0 >= len(t) or vol <= 0:
        return
    n = min(n, len(t) - i0)
    d = np.arange(n) / SR
    ph = 2 * np.pi * f * d
    if shape == "sine":
        w = np.sin(ph)
    elif shape == "tri":
        w = (2 / np.pi) * np.arcsin(np.sin(ph))
    else:  # 나무 소리: 사인 + 높은 배음
        w = np.sin(ph) + 0.4 * np.sin(2.7 * ph)
    s = w * np.exp(-d * (decay / dur))
    out[i0:i0 + n, 0] += s * vol * (1 - pan)
    out[i0:i0 + n, 1] += s * vol * pan


# 잔잔한 리듬 (100bpm, C-Am-F-G)
beat = 0.6
PROG = [48, 45, 41, 43]
for i in range(int(DUR / beat)):
    b0 = i * beat
    root = PROG[(i // 4) % 4]
    hit(b0, 55, 0.2, 0.25)
    if i % 2:
        hit(b0, 2400, 0.03, 0.03, "tri", 0.6)
    if i % 4 == 0:
        for k, iv in enumerate([12, 16, 19]):
            hit(b0, note(root + iv), 2.2, 0.025, "sine", 0.3 + 0.2 * k, 3)

SCALE = {"red": [72, 74, 76, 79, 81], "blue": [74, 76, 79, 81, 84], "green": [76, 79, 81, 84, 86], "yellow": [79, 81, 84, 86, 88]}
PAN = {"red": 0.25, "blue": 0.45, "green": 0.6, "yellow": 0.78}
last = {}
for h in ev["hits"]:
    k, v, kind, t0 = h["id"], h["v"], h["kind"], h["t"]
    if t0 - last.get((k, kind), -1) < 0.05:  # 같은 구슬이 너무 촘촘히 부딪히면 한 번만
        continue
    last[(k, kind)] = t0
    vol = min(0.22, 0.04 + v * 0.018)
    if kind == "peg":
        hit(t0, note(SCALE[k][int(rng.integers(0, 5))]), 0.5, vol, "sine", PAN[k])
    elif kind == "bumper":
        hit(t0, 180, 0.25, vol * 1.3, "tri", PAN[k], 5)
        hit(t0, 360, 0.15, vol * 0.6, "sine", PAN[k])
    elif kind in ("seesaw", "wheel", "domino"):
        hit(t0, 900 if kind == "domino" else 600, 0.08, vol * 0.9, "wood", PAN[k], 8)
    elif kind == "bell":
        for m in (88, 95):
            hit(t0, note(m), 1.6, 0.16, "sine", 0.3, 3)
    elif kind in ("ramp", "box", "floor", "side", "stopper", "gate"):
        hit(t0, 300 + v * 20, 0.05, vol * 0.35, "wood", PAN[k], 8)

# 결승: 1등은 크게, 나머지는 짧게
for i, q in enumerate(ev["finish"]):
    base = [72, 67, 64, 60][i]
    for j, iv in enumerate([0, 4, 7, 12] if i == 0 else [0, 7]):
        hit(q["t"] + j * 0.09, note(base + iv), 0.9 if i == 0 else 0.4, 0.13 if i == 0 else 0.07, "tri", 0.5)
# 출발 신호(문 열림 2초)
for j, m in enumerate([76, 76, 84]):
    hit(1.4 + j * 0.3 if j < 2 else 2.0, note(m), 0.25 if j < 2 else 0.6, 0.12, "sine", 0.5)

out *= np.clip(t / 0.3, 0, 1)[:, None] * np.clip((DUR - t) / 1.5, 0, 1)[:, None]
out = out / np.max(np.abs(out)) * 0.85
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print("ok", sys.argv[2], DUR, "s")
