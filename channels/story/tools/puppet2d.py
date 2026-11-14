"""2D 웹툰 그림 인형 시험: 한 장의 캐릭터 그림 + 눈/입 변형 그림을 겹쳐 말하게 함 (초록 배경을 지움).
쓰기: python3 puppet2d.py <그림폴더> <출력.mp4> <대사 json>
  그림폴더: close2.png(기본) eyes_closed.png surprised.png mouth_a.png mouth_o.png mouth_e.png bg.png
  대사 json: [{"file": 목소리 wav 경로, "cues": [[초, 'A'~'H'|'X'], …], "env": [...24fps], "text": 자막, "who": 이름, "mood": "surprised"|null}]
"""
import json, math, subprocess, sys, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

D, OUT, SPEC = Path(sys.argv[1]), sys.argv[2], json.loads(Path(sys.argv[3]).read_text())
W, H, FPS = 1920, 1080, 24
FONT = ImageFont.truetype(str(Path(__file__).resolve().parents[3] / 'gunggeum/tools/fonts/Pretendard-ExtraBold.otf'), 46)
FONT_S = ImageFont.truetype(str(Path(__file__).resolve().parents[3] / 'gunggeum/tools/fonts/Pretendard-ExtraBold.otf'), 30)

def key(path):   # 초록 배경 → 투명, 가장자리 초록 번짐 제거
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gs = g - np.maximum(r, b)
    alpha = np.clip(1 - (gs - 40) / 60, 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b) + 10)   # despill
    img = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA')
    return img.filter(ImageFilter.SMOOTH_MORE) if False else img

base = key(D / 'close2.png'); V = {k: key(D / f'{k}.png') for k in ['eyes_closed', 'surprised', 'mouth_a', 'mouth_o', 'mouth_e']}
def mask(box, feather=18):   # 부드러운 테두리의 네모 영역
    m = Image.new('L', base.size, 0); ImageDraw.Draw(m).rectangle(box, fill=255); return m.filter(ImageFilter.GaussianBlur(feather))
EYE, MOUTH = mask((600, 225, 1000, 352)), mask((700, 425, 945, 560), 14)
def compose(eyes, mouth):
    im = base.copy()
    if eyes != 'open': im.paste(V[eyes], (0, 0), Image.composite(V[eyes].getchannel('A'), Image.new('L', base.size, 0), EYE))
    if mouth != 'X': im.paste(V[mouth], (0, 0), Image.composite(V[mouth].getchannel('A'), Image.new('L', base.size, 0), MOUTH))
    return im
CACHE = {}
def char(eyes, mouth):
    k = (eyes, mouth)
    if k not in CACHE: CACHE[k] = compose(eyes, mouth)
    return CACHE[k]
VIS = {'X': 'X', 'A': 'X', 'B': 'mouth_e', 'C': 'mouth_e', 'D': 'mouth_a', 'E': 'mouth_o', 'F': 'mouth_o', 'G': 'mouth_e', 'H': 'mouth_a'}

# 시간표
t, lines = 0.8, []
for s in SPEC:
    with wave.open(s['file']) as w: dur = w.getnframes() / w.getframerate()
    lines.append({**s, 'start': t, 'dur': dur}); t += dur + 0.7
DUR = t + 0.6
bg = Image.open(D / 'bg.png').convert('RGB')
blinks = []; T = 1.3
while T < DUR: blinks.append(T); T += 2.4 + (math.sin(T * 7.1) * 0.5 + 0.5) * 3.2
def eyes_at(t, l):
    if any(0 <= t - b < 0.12 for b in blinks): return 'eyes_closed'
    if l and l.get('mood') == 'surprised' and t - l['start'] < 1.6: return 'surprised'
    return 'open'
def mouth_at(t, l):
    if not l or not (l['start'] <= t <= l['start'] + l['dur']): return 'X'
    u = t - l['start'] + 0.03; cur = 'X'
    for ct, v in l['cues']:
        if ct <= u: cur = v
        else: break
    return VIS[cur]
def sub(im, l):
    d = ImageDraw.Draw(im, 'RGBA'); x0, x1, y = 260, W - 260, H - 150
    d.rounded_rectangle((x0, y, x1, y + 88), 26, fill=(20, 16, 30, 215))
    d.rounded_rectangle((x0 + 24, y - 26, x0 + 24 + 130, y + 18), 22, fill=(232, 226, 210, 255)); d.text((x0 + 89, y - 4), l['who'], font=FONT_S, fill=(26, 20, 48), anchor='mm')
    d.text((W / 2, y + 44), l['text'], font=FONT, fill='white', anchor='mm')

ff = imageio_ffmpeg.get_ffmpeg_exe()
p = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-tune', 'animation', '/tmp/_puppet_v.mp4'], stdin=subprocess.PIPE)
N = int(DUR * FPS)
for i in range(N):
    t = i / FPS
    l = next((x for x in lines if x['start'] - 0.2 <= t <= x['start'] + x['dur'] + 0.4), None)
    z = 1.06 + t * 0.002; bw, bh = int(W * z), int(H * z)   # 배경: 아주 천천히 다가감
    fr = bg.resize((bw, bh), Image.BICUBIC).crop(((bw - W) // 2 + int(t * 3), (bh - H) // 2, (bw - W) // 2 + int(t * 3) + W, (bh - H) // 2 + H))
    fr = fr.filter(ImageFilter.GaussianBlur(2.2))   # 인물에 눈이 가도록 배경 살짝 흐림
    c = char(eyes_at(t, l), mouth_at(t, l))
    s = 1.42 * (1 + 0.004 * math.sin(t * 1.7)); cw, ch = int(c.width * s), int(c.height * s * (1 + 0.003 * math.sin(t * 1.7)))
    speaking = l and l['start'] <= t <= l['start'] + l['dur']
    env = (l['env'][int((t - l['start']) * 24)] if speaking and int((t - l['start']) * 24) < len(l['env']) else 0) if l else 0
    ang = math.sin(t * 0.9) * 0.35 + (math.sin(t * 5.3) * 0.5 * env if speaking else 0)
    ci = c.resize((cw, ch), Image.BICUBIC).rotate(ang, resample=Image.BICUBIC, center=(int(820 * s), int(600 * s)))
    ox, oy = -260, H - ch + int(110 + env * 6)
    fr.paste(ci, (ox, oy), ci)
    if l and l['start'] - 0.2 <= t <= l['start'] + l['dur'] + 0.4: sub(fr, l)
    p.stdin.write(fr.tobytes())
p.stdin.close(); p.wait()
# 소리
ins, flt = [], []
for k, l in enumerate(lines):
    ins += ['-i', l['file']]; d = int(l['start'] * 1000); flt.append(f'[{k + 1}:a]aresample=48000,adelay={d}|{d}[a{k}]')
flt.append(''.join(f'[a{k}]' for k in range(len(lines))) + f'amix=inputs={len(lines)}:normalize=0,apad=whole_dur={DUR}[out]')
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', '/tmp/_puppet_v.mp4', *ins, '-filter_complex', ';'.join(flt), '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], check=True)
print(OUT, round(DUR, 2), 's')
