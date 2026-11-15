# 「조선으로 회귀하다」 프로필 시안 3개 (1080×1080, 원으로 잘려도 가운데가 보이게). 그림은 1화 그림판(ep01w/art)을 다시 씀.
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
R = Path(__file__).resolve().parents[3]; ART = R / 'channels/story/joseon/ep01w/art'; OUT = Path(__file__).parent
F = lambda w, s: ImageFont.truetype(str(R / f'gunggeum/tools/fonts/Pretendard-{w}.otf'), s)
S = 1080
def key(p):   # 초록 배경 빼기
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = np.clip(1 - (g - np.maximum(r, b) - 40) / 60, 0, 1); a[..., 1] = np.minimum(g, np.maximum(r, b) + 10)
    return Image.fromarray(np.dstack([a, al * 255]).astype(np.uint8), 'RGBA')
def crop_fg(im):
    bb = im.getchannel('A').point(lambda v: 255 if v > 30 else 0).getbbox(); return im.crop(bb)
def cover(p, size):
    im = Image.open(p).convert('RGB'); s = max(size / im.width, size / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS); x, y = (im.width - size) // 2, (im.height - size) // 2
    return im.crop((x, y, x + size, y + size))
def glow_text(im, xy, text, font, fill, glow=(0, 0, 0), r=10, anchor='mm', stroke=0):
    g = Image.new('RGBA', im.size); ImageDraw.Draw(g).text(xy, text, font=font, fill=glow + (230,), anchor=anchor, stroke_width=stroke + 6, stroke_fill=glow + (230,))
    im.alpha_composite(g.filter(ImageFilter.GaussianBlur(r))); ImageDraw.Draw(im).text(xy, text, font=font, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=glow)

# A. 댕이 — 밤하늘 한양 위 빛나는 종
a = cover(ART / 'bg_street_night.png', S).filter(ImageFilter.GaussianBlur(6)).convert('RGBA')
a.alpha_composite(Image.new('RGBA', (S, S), (10, 14, 40, 110)))
d = crop_fg(key(ART / 'daengi_happy.png')); s = 660 / d.height; d = d.resize((int(d.width * s), int(d.height * s)), Image.LANCZOS)
halo = Image.new('RGBA', (S, S)); ImageDraw.Draw(halo).ellipse((S/2-360, S/2-400, S/2+360, S/2+320), fill=(150, 235, 255, 120)); a.alpha_composite(halo.filter(ImageFilter.GaussianBlur(90)))
a.alpha_composite(d, ((S - d.width) // 2, 120))
glow_text(a, (S / 2, 860), '조선으로 회귀하다', F('ExtraBold', 92), (255, 255, 255))
a.convert('RGB').save(OUT / 'profile_A_daengi.png')

# B. 민재 — 1795 한양에 떨어진 라이더
b = cover(ART / 'bg_street_night.png', S).convert('RGBA')
m = crop_fg(key(ART / 'minjae_surprised.png')); s = 1180 / m.height; m = m.resize((int(m.width * s), int(m.height * s)), Image.LANCZOS)
b.alpha_composite(m, ((S - m.width) // 2 - 150, S - m.height + 60))
grad = Image.new('L', (1, S)); [grad.putpixel((0, y), int(max(0, (y - 620) / 460) * 235)) for y in range(S)]
b.alpha_composite(Image.merge('RGBA', [Image.new('L', (S, S), 8)] * 3 + [grad.resize((S, S))]))
glow_text(b, (S / 2, 840), '조선으로', F('ExtraBold', 110), (255, 255, 255))
glow_text(b, (S / 2, 960), '회귀하다', F('ExtraBold', 110), (255, 205, 70))
b.convert('RGB').save(OUT / 'profile_B_minjae.png')

# C. 낙관(도장) — 한지 바탕에 붉은 도장 「朝鮮回歸」 대신 한글 4자
c = Image.new('RGBA', (S, S), (240, 228, 204, 255)); noise = (np.random.default_rng(3).normal(0, 9, (S, S))).astype(np.int16)
arr = np.asarray(c).astype(np.int16); arr[..., :3] = np.clip(arr[..., :3] + noise[..., None], 0, 255); c = Image.fromarray(arr.astype(np.uint8), 'RGBA')
seal = Image.new('RGBA', (S, S)); sd = ImageDraw.Draw(seal); x0, y0, w = 230, 210, 620
sd.rounded_rectangle((x0, y0, x0 + w, y0 + w), 40, fill=(178, 34, 38, 255))
sd.rounded_rectangle((x0 + 34, y0 + 34, x0 + w - 34, y0 + w - 34), 22, outline=(240, 228, 204, 255), width=12)
for i, ch in enumerate('조선회귀'):
    cx = x0 + w * (0.30 if i % 2 == 0 else 0.70); cy = y0 + w * (0.30 if i < 2 else 0.70)   # 요즘 읽는 순서: 윗줄 조선, 아랫줄 회귀
    sd.text((cx, cy), ch, font=F('ExtraBold', 230), fill=(240, 228, 204, 255), anchor='mm')
tex = (np.random.default_rng(7).random((S, S)) > 0.06).astype(np.uint8) * 255   # 도장 찍힌 듯 군데군데 빠짐
seal.putalpha(Image.fromarray(np.minimum(np.asarray(seal.getchannel('A')), tex)).filter(ImageFilter.GaussianBlur(0.8)))
c.alpha_composite(seal.rotate(-4, resample=Image.BICUBIC, center=(S / 2, S / 2)))
ImageDraw.Draw(c).text((S / 2, 935), '1795 · 한양', font=F('Bold', 64), fill=(60, 40, 30), anchor='mm')
c.convert('RGB').save(OUT / 'profile_C_seal.png')

# 비교판: 원으로 잘렸을 때 모습까지
sheet = Image.new('RGB', (1800, 640), (245, 245, 245)); sd = ImageDraw.Draw(sheet)
for k, n in enumerate(['profile_A_daengi', 'profile_B_minjae', 'profile_C_seal']):
    im = Image.open(OUT / f'{n}.png').resize((520, 520), Image.LANCZOS); msk = Image.new('L', (520, 520)); ImageDraw.Draw(msk).ellipse((0, 0, 519, 519), fill=255)
    sheet.paste(im, (40 + k * 590, 30), msk); sd.text((300 + k * 590, 600), 'ABC'[k], font=F('ExtraBold', 44), fill=(30, 30, 30), anchor='mm')
sheet.save(OUT / 'profile_compare.jpg', quality=90)
print('ok')
