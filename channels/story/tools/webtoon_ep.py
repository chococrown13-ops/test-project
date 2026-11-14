"""웹툰 그림판 한 편 렌더러: 시간표(timeline.json) + 그림(art/) + 장면표(plan.json) → mp4.
쓰기: python3 webtoon_ep.py <편 폴더(timeline.json)> <그림판 폴더(art/, plan.json)> <소리 wav> <출력.mp4> [시작초 끝초]
- 말하는 사람을 화면에 크게(민재는 왼쪽, 상대는 오른쪽에서 좌우 뒤집어 서로 마주 봄), 입은 Rhubarb 입 모양, 눈 깜빡임·대사 감정
- 장면표: 줄 번호마다 배경, 그림 컷(인물 대신 한 장 그림), 지도, 효과(비·번쩍·시간 이동)
- 그림은 Gemini 이미지 모델로 만든 오리지널 그림(초록 배경 인물 + 배경)
"""
import json, math, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

EP, ART, WAV, OUT = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
T0, T1 = (float(sys.argv[5]), float(sys.argv[6])) if len(sys.argv) > 6 else (0, None)
TL = json.loads((EP / 'timeline.json').read_text()); L = TL['lines']; CARDS = TL.get('cards', {})
PLAN = json.loads((ART / 'plan.json').read_text())
W, H, FPS = 1920, 1080, 24
FD = Path(__file__).resolve().parents[3] / 'gunggeum/tools/fonts/Pretendard-ExtraBold.otf'
F = lambda n: ImageFont.truetype(str(FD), n)
FONT, FONT_S, FONT_T, FONT_C, FONT_CT = F(46), F(30), F(110), F(38), F(52)
A = ART / 'art'

# ---------- 인물 그림 ----------
def rgba(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = np.clip(1 - (g - np.maximum(r, b) - 40) / 60, 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b) + 10)
    return Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA')

class Puppet:
    KINDS = ['eyes_closed', 'surprised', 'happy', 'worried', 'angry', 'mouth_a', 'mouth_o', 'mouth_e']
    def __init__(self, name, flip, floating):
        self.base = rgba(A / f'{name}_close.png'); b = np.asarray(self.base).astype(int)[..., :3]
        self.var, diffs = {}, {}
        for k in self.KINDS:
            p = A / f'{name}_{k}.png'
            if not p.exists(): continue
            v = rgba(p)
            if v.size != self.base.size: v = v.resize(self.base.size)
            self.var[k] = v; diffs[k] = np.abs(np.asarray(v).astype(int)[..., :3] - b).sum(2) > 45
        mouth = [diffs[k] for k in diffs if k.startswith('mouth')]
        ys = np.where(np.any(mouth, axis=0))[0] if mouth else np.array([b.shape[0]])
        self.mtop = int(np.percentile(ys, 4)) if len(ys) > 50 else b.shape[0]
        yy = np.arange(b.shape[0])[:, None]; self.mask = {}
        for k, d in diffs.items():
            d = d & ((yy >= self.mtop - 12) if k.startswith('mouth') else (yy < self.mtop - 4))
            self.mask[k] = Image.fromarray((d * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(7))
        allm = np.any(list(diffs.values()), axis=0); ys, xs = np.where(allm)
        self.face = (np.percentile(xs, 3), np.percentile(ys, 3), np.percentile(xs, 97), np.percentile(ys, 97))
        al = np.asarray(self.base)[..., 3] > 20; rows = np.where(al.any(1))[0]; self.bottom = int(rows.max())
        self.s = (0.5 * H) / max(1, self.face[3] - self.face[1]); self.flip, self.floating = flip, floating
        if not floating and (al[0].mean() > 0.02): self.s = max(self.s, (H + 24) / self.bottom)   # 그림 위쪽이 잘려 있으면 그 잘린 선이 화면 밖으로 나가게 키움
        cl, cr = al[:, :3].mean() > 0.01, al[:, -3:].mean() > 0.01   # 그림 왼쪽·오른쪽 끝이 잘려 있는지(뒤집으면 바뀜)
        self.cutL, self.cutR = (cr, cl) if flip else (cl, cr)
        if self.cutL and self.cutR: self.s = max(self.s, (W + 4) / self.base.width)
        self.cache = {}
    def img(self, eyes, mouth):
        k = (eyes, mouth)
        if k not in self.cache:
            im = self.base.copy()
            for v in (eyes, mouth):
                if v in self.var: im.paste(self.var[v], (0, 0), self.mask[v])
            im = im.resize((int(im.width * self.s), int(im.height * self.s)), Image.LANCZOS)
            if self.flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
            self.cache[k] = im
        return self.cache[k]
    def place(self, cx):   # 얼굴 가운데가 cx 에 오게 하는 그림 왼쪽 위치
        fc = (self.face[0] + self.face[2]) / 2 * self.s
        if self.flip: fc = self.base.width * self.s - fc
        return int(cx - fc)

CHAR = PLAN['chars']   # {대사 이름: 그림 이름}
P = {}
def puppet(who):
    n = CHAR.get(who)
    if not n: return None
    if n not in P: P[n] = Puppet(n, flip=(n != 'minjae'), floating=(n == 'daengi'))
    return P[n]

# ---------- 배경·컷 ----------
IMG = {}
def bgimg(name, blur=2.2, tint=None):
    k = (name, blur, tint)
    if k not in IMG:
        im = Image.open(A / f'{name}.png').convert('RGB').resize((int(W * 1.12), int(H * 1.12)), Image.LANCZOS)
        if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
        if tint: im = Image.blend(im, Image.new('RGB', im.size, tint[0]), tint[1])
        IMG[k] = im
    return IMG[k]
def pan(im, t, seed=0):
    ox = int((im.width - W) / 2 + math.sin(t * 0.13 + seed) * 50); oy = int((im.height - H) / 2 + math.cos(t * 0.11 + seed) * 18)
    return im.crop((ox, oy, ox + W, oy + H))
def kenburns(name, u):   # 컷 그림: 천천히 다가감(u 0→1)
    im = Image.open(A / f'{name}.png').convert('RGB') if name not in IMG else IMG[name]
    IMG[name] = im
    z = 1.04 + 0.10 * u; w, h = im.width / z, im.height / z; x0 = (im.width - w) / 2 + (u - 0.5) * 30; y0 = (im.height - h) / 2
    return im.crop((int(x0), int(y0), int(x0 + w), int(y0 + h))).resize((W, H), Image.BILINEAR)

# ---------- 장면표 해석 ----------
def rng(spec):   # "3-5" → [3,4,5]
    a, b = (spec.split('-') + [spec])[:2]; return range(int(a), int(b) + 1)
BG = {}
for k, v in PLAN['bg'].items():
    for i in rng(k): BG[i] = v
CUT = {}
for k, v in PLAN['cut'].items():
    for i in rng(k): CUT[i] = v
MAP = {}
for k, v in PLAN.get('map', {}).items():
    for i in rng(k): MAP[i] = v
MOODV = {'surprised': 'surprised', 'happy': 'happy', 'worried': 'worried', 'cry': 'worried', 'tired': 'worried', 'angry': 'angry'}
VIS = {'X': None, 'A': None, 'B': 'mouth_e', 'C': 'mouth_e', 'D': 'mouth_a', 'E': 'mouth_o', 'F': 'mouth_o', 'G': 'mouth_e', 'H': 'mouth_a'}
ACT = {}
for i, l in enumerate(L):
    for a in l.get('acts') or []: ACT[a['act']] = l['start'] + a.get('at', 0)

def line_idx(t):   # 지금 화면이 따라갈 줄: 시작 0.25초 전부터 다음 줄로
    k = 0
    for j, l in enumerate(L):
        if l['start'] - 0.25 <= t: k = j
    return k
def blink(t, seed):
    T = 0.9 + seed
    while T < t + 1:
        if 0 <= t - T < 0.12: return True
        T += 2.4 + (math.sin(T * 7.1 + seed) * 0.5 + 0.5) * 3.0
    return False
def mouth_at(t, l):
    if not (l['start'] <= t <= l['start'] + l['dur']): return None
    u, cur = t - l['start'] + 0.03, 'X'
    for ct, v in l['cues'] or []:
        if ct <= u: cur = v
        else: break
    return VIS[cur]

# ---------- 덧그림: 자막·카드·제목·지도·휴대폰 ----------
NAMES = PLAN.get('names', {})
def subtitle(d, l):
    x0, x1, y = 260, W - 260, H - 150
    d.rounded_rectangle((x0, y, x1, y + 88), 26, fill=(20, 16, 30, 215))
    nm = NAMES.get(l['who'], l['who']); tw = d.textlength(nm, font=FONT_S) + 40
    d.rounded_rectangle((x0 + 24, y - 26, x0 + 24 + tw, y + 18), 22, fill=(232, 226, 210, 255)); d.text((x0 + 24 + tw / 2, y - 4), nm, font=FONT_S, fill=(26, 20, 48), anchor='mm')
    txt = l['text']; f = FONT if d.textlength(txt, font=FONT) < x1 - x0 - 60 else F(38)
    d.text((W / 2, y + 44), txt, font=f, fill='white', anchor='mm')
def card(d, c, a):
    import re
    m = re.match(r'^\[(.*?)\]\s*(.*)$', c['t']); tag, title = (m.group(1), m.group(2)) if m else ('정보', c['t'])
    rows = [re.sub(r'^[①②③④⑤⑥⑦⑧⑨]\s*', '', r) for r in c['rows']]; w = max([d.textlength(r.split(' — ')[-1], font=FONT_C) + (250 if ' — ' in r else 90) for r in rows] + [d.textlength(title, font=FONT_CT) * 1.1 + 100, 560]) + 70
    h = 170 + len(rows) * 62; x, y = 80, 120 + int((1 - a) * 40); al = int(220 * a)
    warn = '경고' in tag
    d.rounded_rectangle((x, y, x + w, y + h), 22, fill=(8, 16, 38, al), outline=((255, 107, 107, int(255 * a)) if warn else (127, 216, 255, int(255 * a))), width=5)
    tw = d.textlength(tag, font=FONT_S) + 60
    d.rounded_rectangle((x + 22, y - 26, x + 22 + tw, y + 30), 28, fill=((255, 107, 107, int(255 * a)) if warn else (255, 213, 74, int(255 * a))))
    d.text((x + 22 + tw / 2, y + 2), tag, font=FONT_S, fill=(26, 20, 48, int(255 * a)), anchor='mm')
    d.text((x + 50, y + 92), title, font=FONT_CT, fill=(255, 255, 255, int(255 * a)), anchor='lm')
    for i, r in enumerate(rows):
        kk, _, v = r.partition(' — ')
        d.text((x + 50, y + 160 + i * 62), kk if v else '·', font=FONT_C, fill=(127, 216, 255, int(255 * a)), anchor='lm')
        d.text((x + (250 if v else 90), y + 160 + i * 62), v or r, font=FONT_C, fill=(255, 255, 255, int(255 * a)), anchor='lm')
GEO = {'종루': (126.9834, 37.5700), '흥인지문': (127.0095, 37.5711), '돈의문': (126.9686, 37.5683), '숭례문': (126.9752, 37.5600), '숙정문': (126.9831, 37.5958), '마포': (126.9457, 37.5395)}
WALL = [(126.9831, 37.5958), (127.0024, 37.5875), (127.0075, 37.5800), (127.0095, 37.5711), (127.0105, 37.5643), (126.9882, 37.5512), (126.9752, 37.5600), (126.9686, 37.5683), (126.9578, 37.5853), (126.9667, 37.5928), (126.9787, 37.5930), (126.9831, 37.5958)]
RIVER = [(126.90, 37.535), (126.93, 37.531), (126.95, 37.533), (126.97, 37.527), (126.99, 37.521), (127.02, 37.519), (127.04, 37.524)]
def drawmap(im, mode, t, a, t0):
    x0, y0, w, h, cx, cy, k = 70, 120, 900, 760, 126.982, 37.560, 8600
    P = lambda p: (x0 + w / 2 + (p[0] - cx) * k * 0.79, y0 + h / 2 - (p[1] - cy) * k)
    paper = Image.new('RGBA', (W, H), (244, 236, 214, 250)); d = ImageDraw.Draw(paper)
    d.line([P(p) for p in RIVER], fill=(143, 185, 224, 255), width=26, joint='curve')
    d.polygon([P(p) for p in WALL], fill=(228, 210, 168, 255)); d.line([P(p) for p in WALL], fill=(107, 74, 42, 255), width=7, joint='curve')
    box = Image.new('L', (W, H), 0); ImageDraw.Draw(box).rounded_rectangle((x0, y0, x0 + w, y0 + h), 26, fill=255)
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); lay.paste(paper, (0, 0), box); d = ImageDraw.Draw(lay)
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), 26, outline=(127, 216, 255, 255), width=5)
    def dot(n, col, r, label=None, dy=-30):
        x, y = P(GEO[n]); d.ellipse((x - r, y - r, x + r, y + r), fill=col, outline=(42, 31, 26), width=3); d.text((x, y + dy), label or n, font=FONT_S, fill=(42, 31, 26), anchor='mm')
    if mode == 'wall':
        for n in ['흥인지문', '돈의문', '숭례문', '숙정문']: dot(n, (177, 52, 43), 11, dy=(40 if n == '숙정문' else -30))
        u = max(0, min(1, (t - t0 - 0.6) / 1.8)); jx, jy = P(GEO['종루']); mx, my = P(GEO['마포'])
        n = 14
        for i in range(n):
            s0, s1 = i / n, (i + 0.55) / n
            if s0 > u: break
            s1 = min(s1, u); d.line([(jx + (mx - jx) * s0, jy + (my - jy) * s0), (jx + (mx - jx) * s1, jy + (my - jy) * s1)], fill=(226, 53, 43), width=6)
        dot('마포', (226, 53, 43), 15, '마포 (민재 집)', 40)
        if u > 0.95: d.text((mx + 10, my - 46), '성 밖!', font=F(44), fill=(226, 53, 43), anchor='mm')
    r = 14 * (1 + math.sin(t * 6) * 0.25); dot('종루', (255, 213, 74), r, '여기! 종루 (오늘의 보신각)' if mode == 'open' else '종루', -34)
    d.text((x0 + 30, y0 + 50), '댕이 지도 · 1795 한양 위에 2026 서울', font=F(38), fill=(26, 20, 48), anchor='lm')
    d.text((x0 + 30, y0 + h - 30), '성곽은 대략 그린 선 · 강은 한강', font=F(24), fill=(107, 90, 72), anchor='lm')
    if a < 1: lay.putalpha(lay.getchannel('A').point(lambda v: int(v * a)))
    im.paste(lay, (0, 0), lay)

def rain(im, t, frozen=False):
    d = ImageDraw.Draw(im, 'RGBA'); rs = np.random.default_rng(7)
    xs, ys, sp = rs.random(260) * W, rs.random(260) * H, 0.6 + rs.random(260)
    for x, y, s in zip(xs, ys, sp):
        yy = (y + (0 if frozen else t * 1400 * s)) % H; xx = x - (0 if frozen else (yy - y) * 0.06)
        d.line((xx, yy, xx - 6, yy + (8 if frozen else 34)), fill=(190, 215, 255, 120 if not frozen else 170), width=2)

def warp(im, t, t0, t1):
    u = max(0, min(1, (t - t0) / max(0.1, t1 - t0))); lay = Image.new('RGBA', (W, H), (10, 15, 42, int(230 * min(1, u * 4)))); d = ImageDraw.Draw(lay)
    for k in range(28):
        r = (k * 46 + t * 900) % 1300; a0 = (k * 37 + t * 140) % 360
        d.arc((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), a0, a0 + 70 + (k % 5) * 25, fill=(120 + k * 4, 200, 255, 90 + (k % 4) * 40), width=6 + (k % 3) * 4)
    s = u * u * (3 - 2 * u); yr = round(2026 - 231 * s)
    d.text((W / 2, H / 2 + 40), str(yr), font=F(190), fill='white', anchor='mm'); d.text((W / 2, H / 2 + 170), '시간 이동 중…', font=F(40), fill=(127, 216, 255), anchor='mm')
    im.paste(lay, (0, 0), lay)

def phone(d, a):
    x, y = W - 420, 160; al = int(255 * a)
    d.rounded_rectangle((x, y, x + 300, y + 520), 40, fill=(22, 24, 31, al)); d.rounded_rectangle((x + 18, y + 50, x + 282, y + 470), 18, fill=(233, 238, 246, al))
    d.text((x + 270, y + 84), '배터리 12%', font=F(22), fill=(42, 47, 58, al), anchor='rm')
    d.text((x + 150, y + 260), '서비스 지역이', font=F(30), fill=(226, 53, 43, al), anchor='mm'); d.text((x + 150, y + 302), '아닙니다', font=F(30), fill=(226, 53, 43, al), anchor='mm')

# ---------- 한 장 그리기 ----------
spans = []
for i, l in enumerate(L):
    c = l.get('card')
    if not c or c == PLAN.get('title_card'): continue
    if spans and spans[-1][0] == c: spans[-1][2] = l['start'] + l['dur'] + 0.6
    else: spans.append([c, l['start'], l['start'] + l['dur'] + 0.6])
TITLE = next((l['start'] for l in L if l.get('card') == PLAN.get('title_card')), None)
WARP0 = next((l['start'] + 0.9 for l in L if '시간 이동' in l['text']), None); LAND = ACT.get('land', 0)
mapwin = {}
for i, m in MAP.items(): mapwin.setdefault(m, [L[i]['start'] - 0.2, 0]); mapwin[m][1] = max(mapwin[m][1], L[i]['start'] + L[i]['dur'] + 0.4)

def frame(t):
    k = line_idx(t); l = L[k]
    bgname = BG.get(k, 'bg_street_night'); tint = PLAN.get('tint', {}).get(bgname)
    fr = pan(bgimg(bgname, tint=tuple(tint) if tint else None), t, seed=hash(bgname) % 5).copy()
    cut = CUT.get(k)
    if cut:   # 그림 한 장(인물 대신)
        u = (t - (l['start'] - 0.25)) / max(1, l['dur'] + 0.8); fr = kenburns(cut, max(0, min(1, u)))
    elif l['who'] in CHAR:
        pp = puppet(l['who']); speaking = l['start'] <= t <= l['start'] + l['dur']
        ei = int((t - l['start']) * 24); env = l['env'][ei] if speaking and 0 <= ei < len(l['env']) else 0
        mood = MOODV.get(l.get('mood')); mood = mood if mood in pp.var else None
        eyes = 'eyes_closed' if (blink(t, hash(l['who']) % 7 * 0.3) and mood != 'happy') else mood
        im = pp.img(eyes, mouth_at(t, l))
        cx = W * (0.38 if l['who'] == '민재' else 0.62)
        if k in MAP: cx = W * 0.74
        x = pp.place(cx)
        if pp.cutR: x = max(x, W - im.width)   # 잘린 옆 끝은 화면 밖으로
        if pp.cutL: x = min(x, 0)
        y = int(H * 0.52 - (pp.face[1] + pp.face[3]) / 2 * pp.s + math.sin(t * 2.2) * 10) if pp.floating else int(H + 12 - pp.bottom * pp.s + math.sin(t * 1.7) * 3 + env * 6)
        fr.paste(im, (x, y), im)
    # 효과
    if k <= PLAN.get('rain_until', -1): rain(fr, t, frozen=BG.get(k) == 'bg_2026_frozen')
    flash = 0
    for key in ('thunder', 'strike'):
        if key in ACT and 0 <= t - ACT[key] < 0.5: flash = max(flash, 1 - (t - ACT[key]) / 0.5)
    if WARP0 and WARP0 <= t < LAND + 0.25: warp(fr, t, WARP0, LAND - 0.3)
    if LAND and abs(t - LAND) < 0.3: flash = max(flash, 1 - abs(t - LAND) / 0.3)
    if 'gate_close' in ACT and 0 <= t - ACT['gate_close'] < 0.25: flash = max(flash, 0.3)
    if flash: fr = Image.blend(fr, Image.new('RGB', (W, H), 'white'), flash * 0.85)
    if k > 0 and 0 <= t - (l['start'] - 0.25) < 0.08 and not cut: fr = Image.blend(fr, Image.new('RGB', (W, H), 'white'), 0.18)
    d = ImageDraw.Draw(fr, 'RGBA')
    for m, (a0, a1) in mapwin.items():
        if a0 <= t <= a1: drawmap(fr, m, t, min(1, (t - a0) / 0.3, (a1 - t) / 0.4), a0 + 0.2); d = ImageDraw.Draw(fr, 'RGBA')
    if 'phone' in ACT and ACT['phone'] <= t < ACT['phone'] + 4.2: phone(d, min(1, (t - ACT['phone']) / 0.3, (ACT['phone'] + 4.2 - t) / 0.4))
    if not any(a0 <= t <= a1 for a0, a1 in mapwin.values()):
        for c, a0, a1 in spans:
            if a0 - 0.2 <= t <= a1 + 0.3 and c in CARDS: card(d, CARDS[c], max(0, min(1, (t - a0 + 0.15) / 0.4, (a1 + 0.3 - t) / 0.3)))
    if TITLE and TITLE - 0.2 <= t <= TITLE + 3.2:
        a = max(0, min(1, (t - TITLE + 0.2) / 0.4, (TITLE + 3.2 - t) / 0.5)); d.rectangle((0, H * 0.3, W, H * 0.62), fill=(10, 8, 20, int(170 * a)))
        d.text((W / 2, H * 0.42), PLAN['title'], font=FONT_T, fill=(255, 255, 255, int(255 * a)), anchor='mm'); d.text((W / 2, H * 0.53), PLAN['subtitle'], font=F(48), fill=(255, 213, 74, int(255 * a)), anchor='mm')
    if l['start'] - 0.25 <= t <= l['start'] + l['dur'] + 0.45 and l['who'] in NAMES: subtitle(d, l)
    E = TL['dur'] - 3.4
    if t > E:
        a = min(1, (t - E) / 0.8); d.rectangle((0, 0, W, H), fill=(15, 12, 24, int(200 * a)))
        for i, s in enumerate(PLAN['end']): d.text((W / 2, H * 0.42 + i * 110), s, font=F(88 if i == 0 else 56), fill=((255, 255, 255) if i == 0 else (255, 213, 74)) + (int(255 * a),), anchor='mm')
    return fr

if __name__ == '__main__':
    if '--still' in OUT:   # 미리보기: OUT='--still:초,초,…:폴더'
        _, ts, folder = OUT.split(':'); Path(folder).mkdir(parents=True, exist_ok=True)
        for s in ts.split(','): frame(float(s)).save(f'{folder}/t{s}.jpg', quality=88)
        sys.exit()
    ff = imageio_ffmpeg.get_ffmpeg_exe(); end = T1 or TL['dur']
    cmd = [ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    if T0 == 0 and T1 is None: cmd += ['-ss', '0', '-i', WAV, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-shortest']
    cmd += ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-tune', 'animation', '-movflags', '+faststart', OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n0, n1 = int(T0 * FPS), int(end * FPS)
    for i in range(n0, n1):
        p.stdin.write(frame(i / FPS).tobytes())
        if i % 480 == 0: print(i, '/', n1, flush=True)
    p.stdin.close(); p.wait(); print('done', OUT)
