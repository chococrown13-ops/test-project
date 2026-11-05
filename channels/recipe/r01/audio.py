"""한판 집밥 #1 배경음: 느긋한 부엌 리듬 + 단계마다 '딩' + 볶을 때 지글지글 + 끓을 때 보글보글 + 끝 화음. 57초, 48kHz 스테레오 wav."""
import sys
import wave

import numpy as np

SR, DUR, BPM = 48000, 57.0, 90
t = np.arange(int(SR * DUR)) / SR
out = np.zeros((len(t), 2))
beat = 60 / BPM
rng = np.random.default_rng(7)
T_S, SEG = 11.0, 7.2


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def hit(t0, f, dur, vol, shape="sine", pan=0.5):
    d = t - t0
    m = (d >= 0) & (d < dur)
    if not m.any():
        return
    ph = 2 * np.pi * f * d[m]
    w = np.sin(ph) if shape == "sine" else (2 / np.pi) * np.arcsin(np.sin(ph))
    s = w * np.exp(-d[m] * (6 / dur))
    out[m, 0] += s * vol * (1 - pan)
    out[m, 1] += s * vol * pan


# 리듬: F - Dm - Bb - C (따뜻한 느낌)
PROG = [53, 50, 46, 48]
n = int(DUR / beat)
for i in range(n):
    b0 = i * beat
    root = PROG[(i // 4) % 4]
    hit(b0, 58, 0.2, 0.42)                                        # 쿵
    if i % 2 == 1:
        hit(b0, 2100, 0.04, 0.06, "tri", 0.6)                     # 짝
    hit(b0 + beat / 2, note(root - 12), 0.25, 0.16, "tri", 0.4)    # 베이스
    if i % 2 == 0:
        for k, iv in enumerate([0, 4, 7, 11]):                    # 부드러운 화음
            hit(b0 + beat * 0.25, note(root + 12 + iv), 0.6, 0.035, "sine", 0.25 + 0.17 * k)
    if i % 8 in (3, 7):                                           # 작은 멜로디
        m = [77, 74, 72, 74][(i // 8) % 4]
        hit(b0 + beat * 0.5, note(m), 0.4, 0.05, "tri", 0.6)

# 지글지글: 고기·김치 볶는 동안 (잡음을 높은 쪽만 남기고 출렁이게)
noise = rng.standard_normal(len(t))
hp = noise - np.convolve(noise, np.ones(8) / 8, mode="same")
env = np.zeros(len(t))
a, b = T_S + 0.6, T_S + 2 * SEG + 0.8
m = (t >= a) & (t < b)
env[m] = np.clip((t[m] - a) / 0.4, 0, 1) * np.clip((b - t[m]) / 0.6, 0, 1) * (0.6 + 0.4 * np.abs(np.sin(t[m] * 23)) * (rng.random(m.sum()) > 0.3))
out[:, 0] += hp * env * 0.05
out[:, 1] += hp * env * 0.05

# 보글보글: 끓기 시작한 뒤 완성 장면까지
boil_a, boil_b = T_S + 2 * SEG + 2.5, 51.5
for k in range(int((boil_b - boil_a) * 5)):
    t0 = boil_a + rng.random() * (boil_b - boil_a)
    f = 180 + rng.random() * 220
    hit(t0, f, 0.09, 0.07, "sine", rng.random())

# 재료 하나씩 나올 때 '톡'
for i in range(9):
    hit(3.8 + i * 0.32, note(79 + (i % 3) * 2), 0.18, 0.06, "sine", 0.3 + 0.05 * i)
# 단계마다 '딩'
for s in range(5):
    a0 = T_S + s * SEG
    hit(a0 + 0.05, note(84), 0.6, 0.12, "sine", 0.4)
    hit(a0 + 0.17, note(88), 0.6, 0.1, "sine", 0.6)
# 시작 훅 · 완성 반짝 · 끝 화음
for k, m_ in enumerate([72, 76, 79, 84]):
    hit(0.1 + k * 0.08, note(m_), 0.5, 0.09, "sine", 0.5)
for k, m_ in enumerate([77, 81, 84, 89]):
    hit(47.0 + k * 0.1, note(m_), 0.8, 0.09, "sine", 0.3 + 0.13 * k)
for k, m_ in enumerate([65, 69, 72, 77]):
    hit(54.0 + k * 0.06, note(m_), 3.0, 0.07, "sine", 0.3 + 0.13 * k)

out *= np.clip(t / 0.3, 0, 1)[:, None] * np.clip((DUR - t) / 1.5, 0, 1)[:, None]
out = out / np.max(np.abs(out)) * 0.8
pcm = (out * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", sys.argv[1])
