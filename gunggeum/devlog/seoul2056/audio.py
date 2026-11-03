"""「2056년 서울」 배경음: 코드로 만든 잔잔한 화음 + 장면 바뀔 때 종소리·바람 소리. 48kHz 스테레오 wav."""
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


# 화음 (MIDI 번호): 밤(단조) → 미래(밝게) → 새벽(장조)
CHORDS = [
    (0.0, 7.6, [45, 57, 60, 64]),      # Am
    (7.0, 15.8, [41, 53, 57, 60, 64]),  # Fmaj7
    (15.2, 24.8, [43, 55, 59, 62, 67]),  # G
    (24.2, 30.0, [36, 48, 55, 60, 64, 67]),  # C (새벽)
]
rng = np.random.default_rng(2056)
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

# 장면 바뀔 때: 종소리(벨) + 바람(걸러진 잡음)
STOPS = [3.2, 7.4, 11.6, 15.8, 20.4, 24.8]
BELL = [76, 79, 81, 83, 84, 88]
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

# 부드러운 반향
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
