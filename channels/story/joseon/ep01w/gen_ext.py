# 머리 위가 잘린 인물 그림을 위로 늘림(모자·머리카락 이어 그리기). 이미 있으면 건너뜀.
import sys; sys.path.insert(0, '../../tools')
from pathlib import Path
from PIL import Image
from gimg import gen
A = Path('art'); E = A / 'ext'
for n in sys.argv[1:]:
    out = E / f'{n}_ext_raw.png'
    if out.exists(): continue
    im = Image.open(A / f'{n}_close.png').convert('RGB'); w, h = im.size
    cv = Image.new('RGB', (w, w), (255, 255, 255)); cv.paste(im, (0, w - h)); src = E / f'{n}_canvas.png'; cv.save(src)
    r = gen("This is a character illustration on a flat chroma-key green background, but the top part of the canvas is blank WHITE because the original picture was cropped there. "
            "Outpaint ONLY the white area: continue the character's head, hair and hat naturally upward so the full head and the complete hat are visible, in exactly the same bold-line webtoon style, colors and lighting. "
            "Everywhere around the character in the new area must be the same flat pure green background (#00FF00). "
            "Keep EVERYTHING in the existing lower part pixel-identical: same position, same size, same face. Do not move, zoom, or redraw the character.",
            str(out), [str(src)], model=__import__("os").environ.get("IMG_MODEL","gemini-3-pro-image"), aspect="1:1")
    print(n, r)
