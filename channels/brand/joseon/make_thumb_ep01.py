# 1화 썸네일 1280×720: 왼쪽 큰 글씨 + 오른쪽 놀란 민재 + 밤 한양
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
spec = importlib.util.spec_from_file_location('mp', Path(__file__).parent / 'make_profile.py')
W, H = 1280, 720
src = (Path(__file__).parent / 'make_profile.py').read_text().split("# A. 댕이")[0]   # 도구 함수만 가져옴
ns = {'__file__': str(Path(__file__).parent / 'make_profile.py')}; exec(src, ns)
key, crop_fg, glow_text, F, ART = ns['key'], ns['crop_fg'], ns['glow_text'], ns['F'], ns['ART']
bg = Image.open(ART / 'bg_street_night.png').convert('RGB'); s = max(W / bg.width, H / bg.height)
bg = bg.resize((int(bg.width * s), int(bg.height * s))).crop((0, 0, W, H)).convert('RGBA')
im = bg.copy(); shade = Image.new('L', (W, 1)); [shade.putpixel((x, 0), int(max(0, 1 - x / 760) * 200)) for x in range(W)]
im.alpha_composite(Image.merge('RGBA', [Image.new('L', (W, H), 5)] * 3 + [shade.resize((W, H))]))
m = crop_fg(key(ART / 'minjae_surprised.png')); k = 860 / m.height; m = m.resize((int(m.width * k), int(m.height * k)), Image.LANCZOS)
im.alpha_composite(m, (W - m.width + 120, H - m.height + 170))
d = crop_fg(key(ART / 'daengi_happy.png')); k = 170 / d.height; d = d.resize((int(d.width * k), int(d.height * k)), Image.LANCZOS)
im.alpha_composite(d, (560, 40))
glow_text(im, (60, 150), '배달 라이더가', F('ExtraBold', 84), (255, 255, 255), anchor='lm')
glow_text(im, (60, 260), '1795년 한양에', F('ExtraBold', 96), (255, 205, 70), anchor='lm')
glow_text(im, (60, 375), '떨어졌다', F('ExtraBold', 96), (255, 255, 255), anchor='lm')
dr = ImageDraw.Draw(im); dr.rounded_rectangle((60, 590, 470, 660), 18, fill=(178, 34, 38))
dr.text((265, 625), '조선으로 회귀하다 1화', font=F('ExtraBold', 38), fill='white', anchor='mm')
im.convert('RGB').save(Path(__file__).parent / 'thumb_ep01.jpg', quality=92)
print('ok')
