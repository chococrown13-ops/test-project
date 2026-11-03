"""그때 그 가격 #1 배경음: 느긋한 복고 리듬 + 문제마다 '뾱' + 고민 타이머 째깍 + 끝 화음. 48kHz 스테레오 wav."""
import sys
import wave

import numpy as np

SR, DUR, BPM = 48000, 30.0, 96
t = np.arange(int(SR * DUR)) / SR
out = np.zeros((len(t), 2))
beat = 60 / BPM


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


# 리듬: 쿵(낮은 음) · 짝(잡음 대신 높은 짧은 음) · 통통 베이스
PROG = [55, 60, 57, 50]  # G C A D (옛날 가요 느낌)
n = int(DUR / beat)
for i in range(n):
    b0 = i * beat
    root = PROG[(i // 4) % 4]
    hit(b0, 60, 0.18, 0.5)                        # 쿵
    if i % 2 == 1:
        hit(b0, 1900, 0.05, 0.08, "tri", 0.6)     # 짝
    hit(b0 + beat / 2, note(root - 12), 0.22, 0.18, "tri", 0.4)  # 베이스
    if i % 4 in (0, 2):
        for k, iv in enumerate([0, 4, 7]):        # 통통 화음
            hit(b0 + beat * 0.25, note(root + 12 + iv), 0.3, 0.05, "tri", 0.3 + 0.2 * k)

# 질문 등장 '뾱' + 고민 타이머 째깍(3번) + "댓글로!" 반짝
for q in range(3):
    a = 3 + q * 8
    hit(a + 0.15, note(84), 0.25, 0.16, "sine", 0.3)
    hit(a + 0.33, note(88), 0.25, 0.16, "sine", 0.7)
    for k in range(3):
        hit(a + 1.2 + k, 1400, 0.06, 0.2, "tri")
    for k, m in enumerate([84, 88, 91]):
        hit(a + 4.3 + k * 0.12, note(m), 0.5, 0.12, "sine", 0.5)

# 시작 훅 · 끝 화음
for k, m in enumerate([72, 76, 79, 84]):
    hit(0.1 + k * 0.08, note(m), 0.5, 0.1, "sine", 0.5)
for k, m in enumerate([69, 73, 76, 81]):
    hit(27.0 + k * 0.05, note(m), 2.4, 0.08, "sine", 0.3 + 0.13 * k)

out *= np.clip(t / 0.3, 0, 1)[:, None] * np.clip((DUR - t) / 1.2, 0, 1)[:, None]
out = out / np.max(np.abs(out)) * 0.8
pcm = (out * 32767).astype("<i2")
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", sys.argv[1])
