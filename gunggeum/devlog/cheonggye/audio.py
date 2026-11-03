"""「청계천 위에는 원래 고가도로가 있었다」 배경음: 코드로 만든 잔잔한 화음(단조→장조) + 장면 바뀔 때 종소리·바람. 48kHz 스테레오 wav."""
import sys
import wave

import numpy as np

SR, DUR = 48000, 30.0
t = np.arange(int(SR * DUR)) / SR
out = np.zeros((len(t), 2))


def note(f):
    return 440.0 * 2 ** ((f - 69) / 12)


def env(a, b, fade=1.2):
    e = np.clip((t - a) / fade, 0, 1) * np.clip((b - t) / fade, 0, 1)
    return e * e * (3 - 2 * e)


CHORDS = [
    (0.0, 3.4, [48, 55, 60, 64, 67]),       # C (훅: 지금의 공원)
    (3.0, 9.6, [45, 52, 57, 60, 64]),       # Am
    (9.0, 16.8, [38, 50, 57, 62, 65]),      # Dm
    (16.2, 25.8, [40, 52, 55, 59, 64]),     # Em
    (25.2, 30.0, [48, 55, 60, 64, 67, 72]),  # C (장조로 밝게)
]
rng = np.random.default_rng(2005)
for a, b, ns in CHORDS:
    e = env(a, b)
    for k, n in enumerate(ns):
        f = note(n)
        ph = rng.random() * 6.28
        trem = 1 + 0.08 * np.sin(2 * np.pi * (0.15 + 0.05 * k) * t + ph)
        s = (np.sin(2 * np.pi * f * t + ph) + 0.3 * np.sin(2 * np.pi * 2 * f * t + ph) + 0.1 * np.sin(2 * np.pi * 3 * f * t)) * trem
        pan = 0.5 + 0.35 * np.sin(k * 1.7)
        amp = 0.05 if n < 50 else 0.032
        out[:, 0] += s * e * amp * (1 - pan)
        out[:, 1] += s * e * amp * pan

STOPS = [3.2, 9.2, 16.2, 21.2, 26.2]
BELL = [74, 77, 72, 79, 86]
noise = rng.standard_normal(len(t))
smoothn = np.convolve(noise, np.ones(40) / 40, mode="same")
for s0, n in zip(STOPS, BELL):
    d = t - s0
    m = d >= 0
    f = note(n)
    bell = np.zeros_like(t)
    bell[m] = (np.sin(2 * np.pi * f * d[m]) + 0.4 * np.sin(2 * np.pi * 2.76 * f * d[m]) * np.exp(-d[m] * 3)) * np.exp(-d[m] * 1.6)
    out[:, 0] += bell * 0.10
    out[:, 1] += bell * 0.10
    w = np.exp(-((t - (s0 - 0.25)) / 0.35) ** 2)
    out[:, 0] += smoothn * w * 0.25
    out[:, 1] += np.roll(smoothn, 300) * w * 0.25

for dly, g in [(0.11, 0.35), (0.23, 0.22), (0.41, 0.12)]:
    n = int(dly * SR)
    out[n:, 0] += out[:-n, 1] * g
    out[n:, 1] += out[:-n, 0] * g

out *= np.clip(t / 0.8, 0, 1)[:, None] * np.clip((DUR - t) / 1.5, 0, 1)[:, None]
out = out / np.max(np.abs(out)) * 0.8
pcm = (out * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", sys.argv[1])
