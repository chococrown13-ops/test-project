"""가로 웹툰 영상(자막 없이 뽑은 구간) → 세로 쇼츠 1080×1920.
쓰기: python3 shorts_vertical.py <timeline.json> <plan.json> <가로 구간.mp4> <전체 목소리.wav> <T0> <T1> <위 제목('\\n'로 두 줄)> <출력.mp4>
배치: 위 = 시리즈 이름 + 후킹 제목 / 가운데 = 영상(말하는 사람 쪽 가운데를 잘라 크게) / 아래 = 큰 자막 / 맨 아래 = 풀버전 안내.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

TL, PLAN, SRC, WAV, T0, T1, TITLE, OUT = sys.argv[1:9]
T0, T1 = float(T0), float(T1)
L = json.load(open(TL))['lines']; P = json.load(open(PLAN)); NAMES = P.get('names', {})
W, H, FPS, SW, SH = 1080, 1920, 24, 1920, 1080
FD = Path(__file__).resolve().parents[3] / 'gunggeum/tools/fonts'
F = lambda s, w='ExtraBold': ImageFont.truetype(str(FD / f'Pretendard-{w}.otf'), s)
SERIES = P['title']; CTA = '풀버전은 유튜브 @조선으로회귀하다'
CW = 960; CX0 = (SW - CW) // 2; VS = W / CW; VH = int(SH * VS); VY = 330   # 가운데 960 폭을 잘라 1080 폭으로

def wrap(d, text, font, maxw):
    out, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=font) <= maxw or not cur: cur = t
        else: out.append(cur); cur = w
    return out + ([cur] if cur else [])

def top_layer():   # 매 프레임 같은 부분은 한 번만 그림
    im = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(im)
    d.text((W / 2, 95), SERIES, font=F(40, 'Bold'), fill=(255, 205, 70), anchor='mm')
    for k, line in enumerate(TITLE.split('\\n')):
        d.text((W / 2, 175 + k * 82), line, font=F(68), fill='white', anchor='mm', stroke_width=4, stroke_fill=(10, 10, 20))
    d.text((W / 2, 1862), CTA, font=F(36, 'Bold'), fill=(235, 235, 240), anchor='mm')
    return im
TOP = top_layer()

def sub(im, l):
    d = ImageDraw.Draw(im); f = F(54); lines = wrap(d, l['text'], f, 920)[:3]
    y0 = VY + VH + 40; h = 40 + 70 * len(lines)
    d.rounded_rectangle((50, y0, W - 50, y0 + h), 30, fill=(18, 14, 30, 225))
    who = NAMES.get(l['who'], l['who']); d.rounded_rectangle((80, y0 - 30, 80 + 40 + d.textlength(who, font=F(34)), y0 + 20), 24, fill=(232, 226, 210))
    d.text((100, y0 - 5), who, font=F(34), fill=(26, 20, 48), anchor='lm')
    for k, s in enumerate(lines): d.text((W / 2, y0 + 55 + 70 * k), s, font=f, fill='white', anchor='mm')

ff = imageio_ffmpeg.get_ffmpeg_exe(); n = int(round((T1 - T0) * FPS))
src = subprocess.Popen([ff, '-loglevel', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
tmp = str(Path(OUT).with_suffix('.v.mp4'))
dst = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-tune', 'animation', tmp], stdin=subprocess.PIPE)
for i in range(n):
    raw = src.stdout.read(SW * SH * 3)
    if len(raw) < SW * SH * 3: break
    fr = Image.frombytes('RGB', (SW, SH), raw); t = T0 + i / FPS
    bg = fr.resize((96, 54)).filter(ImageFilter.GaussianBlur(3)).resize((int(H * 16 / 9), H), Image.BILINEAR)
    x = (bg.width - W) // 2; im = bg.crop((x, 0, x + W, H)).convert('RGBA')
    im.alpha_composite(Image.new('RGBA', (W, H), (8, 8, 20, 150)))
    im.paste(fr.crop((CX0, 0, CX0 + CW, SH)).resize((W, VH), Image.BICUBIC), (0, VY))
    im.alpha_composite(TOP)
    cur = [l for l in L if l['start'] - 0.25 <= t <= l['start'] + l['dur'] + 0.45 and l.get('who') in NAMES]
    if cur: sub(im, cur[-1])
    dst.stdin.write(im.convert('RGB').tobytes())
dst.stdin.close(); dst.wait(); src.wait()
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', tmp, '-ss', str(T0), '-t', str(T1 - T0), '-i', WAV, '-map', '0:v', '-map', '1:a',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], check=True)
Path(tmp).unlink(); print('done', OUT)
