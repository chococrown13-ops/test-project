"""겨울 소원마을 홍보 쇼츠 배경음: 썰매 방울 + 글로켄 멜로디(새로 지은 것) + 따뜻한 화음. 48kHz 스테레오 wav."""
import sys
import wave

import numpy as np

SR, DUR, BPM = 48000, 30.0, 118
t = np.arange(int(SR * DUR)) / SR
out = np.zeros((len(t), 2))
beat = 60 / BPM
rng = np.random.default_rng(1201)


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def hit(t0, f, dur, vol, pan=0.5, bright=0.0):
    d = t - t0
    m = (d >= 0) & (d < dur)
    if not m.any():
        return
    ph = 2 * np.pi * f * d[m]
    s = (np.sin(ph) + bright * np.sin(2.76 * ph) * np.exp(-d[m] * 8)) * np.exp(-d[m] * (5 / dur))
    out[m, 0] += s * vol * (1 - pan)
    out[m, 1] += s * vol * pan


def pad(a, b, notes, vol=0.035):
    e = np.clip((t - a) / 0.6, 0, 1) * np.clip((b - t) / 0.6, 0, 1)
    for k, n in enumerate(notes):
        f = note(n)
        s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
        out[:, 0] += s * e * vol * (0.6 if k % 2 else 0.4)
        out[:, 1] += s * e * vol * (0.4 if k % 2 else 0.6)


# 화음: D · Bm · G · A 를 되풀이 (끝은 D)
PROG = [[50, 62, 66, 69], [47, 62, 66, 71], [43, 62, 67, 71], [45, 61, 64, 69]]
bar = beat * 4
nbar = int(28.4 / bar)
for i in range(nbar):
    pad(i * bar, (i + 1) * bar + 0.3, PROG[i % 4])
    root = PROG[i % 4][0]
    for k in range(4):
        hit(i * bar + k * beat, note(root - 12 + (7 if k % 2 else 0)), 0.4, 0.12, 0.45)
pad(nbar * bar, 30, [50, 62, 66, 69, 74], 0.04)

# 썰매 방울: 8분음표마다 짧은 고음 잡음
noise = rng.standard_normal(len(t))
for i in range(int(28.4 / (beat / 2))):
    t0 = i * beat / 2
    m = (t >= t0) & (t < t0 + 0.09)
    jing = noise[m] * np.exp(-(t[m] - t0) * 45) * (0.05 if i % 2 else 0.08)
    out[m, 0] += jing * 0.6
    out[m, 1] += jing
    if i % 4 == 0:
        for f in (2637, 3136):
            hit(t0, f, 0.18, 0.02, 0.7)

# 글로켄 멜로디 (D 장조, 두 마디 문장 4번)
MEL = [(0, 74, 1), (1, 78, 1), (2, 81, 1.5), (3.5, 79, .5), (4, 78, 1), (5, 76, 1), (6, 74, 2),
       (8, 71, 1), (9, 74, 1), (10, 79, 1.5), (11.5, 78, .5), (12, 76, 1), (13, 74, 1), (14, 73, 2)]
for rep in range(4):
    off = 3.2 + rep * 16 * beat
    for b0, n, ln in MEL:
        if off + b0 * beat < 28.3:
            hit(off + b0 * beat, note(n), 0.9, 0.09, 0.55, 0.5)
# 장면 바뀔 때 반짝 소리
for s0 in (3.2, 7, 11.5, 16, 19.2, 28.5):
    for k, n in enumerate((86, 90, 93)):
        hit(s0 + k * 0.06, note(n), 0.5, 0.05, 0.3 + 0.2 * k, 0.6)

for dly, gv in [(0.13, 0.3), (0.27, 0.18)]:
    n = int(dly * SR)
    out[n:, 0] += out[:-n, 1] * gv
    out[n:, 1] += out[:-n, 0] * gv
out *= np.clip(t / 0.4, 0, 1)[:, None] * np.clip((DUR - t) / 1.2, 0, 1)[:, None]
out = out / np.max(np.abs(out)) * 0.8
pcm = (out * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", sys.argv[1])
