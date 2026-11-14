"""2D 웹툰 그림 인형: 인물마다 한 장의 그림(초록 배경) + 눈/입 변형 그림을 겹쳐 말하게 함. 말하는 사람을 화면에 크게(장면 전환).
쓰기: python3 puppet2d.py <그림폴더> <출력.mp4> <대사 json> [배경.png]
  그림폴더: {인물}_close.png, {인물}_eyes_closed.png, {인물}_surprised.png, {인물}_mouth_a/_o/_e.png  (없는 변형은 건너뜀)
  대사 json: [{"char": 그림 이름, "file": 목소리 wav, "cues": [[초, 'A'~'H'|'X'], …], "env": [...24fps], "text": 자막, "who": 표시 이름, "mood": "surprised"|null}]
변형 그림이 바뀐 곳만 자동으로 찾아(차이 영역) 부드럽게 덮음 → 손으로 위치를 적을 필요 없음.
"""
import json, math, subprocess, sys, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

D, OUT, SPEC = Path(sys.argv[1]), sys.argv[2], json.loads(Path(sys.argv[3]).read_text())
BG = Path(sys.argv[4]) if len(sys.argv) > 4 else D / 'bg.png'
W, H, FPS = 1920, 1080, 24
FD = Path(__file__).resolve().parents[3] / 'gunggeum/tools/fonts/Pretendard-ExtraBold.otf'
FONT, FONT_S = ImageFont.truetype(str(FD), 46), ImageFont.truetype(str(FD), 30)

def rgba(path):   # 초록 배경 → 투명, 가장자리 초록 번짐 제거
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = np.clip(1 - (g - np.maximum(r, b) - 40) / 60, 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b) + 10)
    return Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA')

class Puppet:
    KINDS = ['eyes_closed', 'surprised', 'mouth_a', 'mouth_o', 'mouth_e']
    def __init__(self, name):
        self.base = rgba(D / f'{name}_close.png'); b = np.asarray(self.base).astype(int)[..., :3]
        self.var, diffs = {}, {}
        for k in self.KINDS:
            p = D / f'{name}_{k}.png'
            if not p.exists(): continue
            v = rgba(p)
            if v.size != self.base.size: v = v.resize(self.base.size)
            self.var[k] = v; diffs[k] = np.abs(np.asarray(v).astype(int)[..., :3] - b).sum(2) > 45
        mouth = [diffs[k] for k in diffs if k.startswith('mouth')]
        ys = np.where(np.any(mouth, axis=0))[0] if mouth else np.array([b.shape[0]])
        self.mtop = int(np.percentile(ys, 4)) if len(ys) > 50 else b.shape[0]
        yy = np.arange(b.shape[0])[:, None]
        self.mask = {}
        for k, d in diffs.items():
            d = d & ((yy >= self.mtop - 12) if k.startswith('mouth') else (yy < self.mtop - 4))
            m = Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(7))
            self.mask[k] = m
        allm = np.any(list(diffs.values()), axis=0) if diffs else np.ones(b.shape[:2], bool)
        ys, xs = np.where(allm)
        self.face = (int(np.percentile(xs, 3)), int(np.percentile(ys, 3)), int(np.percentile(xs, 97)), int(np.percentile(ys, 97)))
        self.cache = {}
    def frame(self, eyes, mouth):
        k = (eyes, mouth)
        if k not in self.cache:
            im = self.base.copy()
            for v in (eyes, mouth):
                if v in self.var: im.paste(self.var[v], (0, 0), self.mask[v])
            self.cache[k] = im
        return self.cache[k]

VIS = {'X': None, 'A': None, 'B': 'mouth_e', 'C': 'mouth_e', 'D': 'mouth_a', 'E': 'mouth_o', 'F': 'mouth_o', 'G': 'mouth_e', 'H': 'mouth_a'}
P = {s['char']: Puppet(s['char']) for s in SPEC}

t, lines = 0.8, []
for s in SPEC:
    with wave.open(s['file']) as w: dur = w.getnframes() / w.getframerate()
    lines.append({**s, 'start': t, 'dur': dur}); t += dur + 0.55
DUR = t + 0.6
bg = Image.open(BG).convert('RGB').resize((int(W * 1.12), int(H * 1.12)), Image.BICUBIC)

def blink(t, seed):
    T = 0.9 + seed
    while T < t + 1:
        if 0 <= t - T < 0.12: return True
        T += 2.4 + (math.sin(T * 7.1 + seed) * 0.5 + 0.5) * 3.0
    return False
def mouth_at(t, l):
    if not (l['start'] <= t <= l['start'] + l['dur']): return None
    u, cur = t - l['start'] + 0.03, 'X'
    for ct, v in l['cues']:
        if ct <= u: cur = v
        else: break
    return VIS[cur]
def sub(im, l):
    d = ImageDraw.Draw(im, 'RGBA'); x0, x1, y = 260, W - 260, H - 150
    d.rounded_rectangle((x0, y, x1, y + 88), 26, fill=(20, 16, 30, 215))
    d.rounded_rectangle((x0 + 24, y - 26, x0 + 24 + 130, y + 18), 22, fill=(232, 226, 210, 255)); d.text((x0 + 89, y - 4), l['who'], font=FONT_S, fill=(26, 20, 48), anchor='mm')
    d.text((W / 2, y + 44), l['text'], font=FONT, fill='white', anchor='mm')

ff = imageio_ffmpeg.get_ffmpeg_exe(); tmp = str(Path(OUT).with_suffix('.v.mp4'))
p = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-tune', 'animation', tmp], stdin=subprocess.PIPE)
for i in range(int(DUR * FPS)):
    t = i / FPS
    k = max((j for j, x in enumerate(lines) if x['start'] - 0.25 <= t), default=0); l = lines[k]   # 지금(또는 직전) 대사의 말하는 사람을 화면에
    pp = P[l['char']]
    ox = int((bg.width - W) / 2 + math.sin(t * 0.15) * 30 + (k % 2) * 40); fr = bg.crop((ox, (bg.height - H) // 2, ox + W, (bg.height - H) // 2 + H)).filter(ImageFilter.GaussianBlur(2.4))
    speaking = l['start'] <= t <= l['start'] + l['dur']
    ei = int((t - l['start']) * 24); env = l['env'][ei] if speaking and 0 <= ei < len(l['env']) else 0
    eyes = 'eyes_closed' if blink(t, hash(l['char']) % 7 * 0.3) else ('surprised' if l.get('mood') == 'surprised' and t - l['start'] < 1.8 else None)
    c = pp.frame(eyes, mouth_at(t, l))
    fx0, fy0, fx1, fy1 = pp.face; s = (0.5 * H) / max(1, fy1 - fy0)   # 얼굴(바뀌는 부분)이 화면 높이의 절반쯤
    s *= 1 + 0.006 * math.sin(t * 1.7) + (t - l['start']) * 0.004   # 숨쉬기 + 아주 느린 밀어 들어가기
    cw, ch = int(c.width * s), int(c.height * s)
    ci = c.resize((cw, ch), Image.BICUBIC)
    ang = math.sin(t * 0.9) * 0.3 + (math.sin(t * 5.3) * 0.6 * env if speaking else 0)
    ci = ci.rotate(ang, resample=Image.BICUBIC, center=(int((fx0 + fx1) / 2 * s), int(fy1 * s)))
    tx, ty = W * (0.40 if k % 2 == 0 else 0.58), H * 0.40 + math.sin(t * 2.2) * (10 if l['char'] == 'daengi' else 0)
    fr.paste(ci, (int(tx - (fx0 + fx1) / 2 * s), int(ty - (fy0 + fy1) / 2 * s + env * 5)), ci)
    if l['start'] - 0.25 <= t <= l['start'] + l['dur'] + 0.45: sub(fr, l)
    if t - l['start'] < -0.25 + 0.08 and k > 0: fr = Image.blend(fr, Image.new('RGB', (W, H), 'white'), 0.25)   # 장면 바뀔 때 살짝 번쩍
    p.stdin.write(fr.tobytes())
p.stdin.close(); p.wait()
ins, flt = [], []
for k, l in enumerate(lines):
    ins += ['-i', l['file']]; d = int(l['start'] * 1000); flt.append(f'[{k + 1}:a]aresample=48000,adelay={d}|{d}[a{k}]')
flt.append(''.join(f'[a{k}]' for k in range(len(lines))) + f'amix=inputs={len(lines)}:normalize=0,apad=whole_dur={DUR}[out]')
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', tmp, *ins, '-filter_complex', ';'.join(flt), '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], check=True)
Path(tmp).unlink()
print(OUT, round(DUR, 2), 's')
