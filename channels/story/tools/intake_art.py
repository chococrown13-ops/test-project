"""대표님이 Gemini 앱에서 만든 그림을 영상용으로 정리해 art 폴더에 넣어요.
쓰기: python3 intake_art.py <받은 그림> <이름> <art 폴더>
  이름 예: tongju_close · tongju_mouth_a · bg_tongju_yard · cut_wall
- 모든 그림: 가로 16:9로 맞춤(1376×768, 1화 그림과 같은 크기). 세로 그림이면 멈추고 알려 줌.
- 오른쪽 아래 구석의 작은 워터마크: 인물 그림(초록 배경)은 구석을 초록으로 칠하고,
  배경·장면 그림은 6% 확대해 왼쪽 위 기준으로 잘라 구석을 화면 밖으로 보냄.
- 표정 그림({인물}_{표정}): 기본 그림({인물}_close)에 맞춰 위치·크기를 자동 정렬(초록이 아닌 부분이 가장 잘 겹치는 곳).
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC, NAME, ART = sys.argv[1], sys.argv[2], Path(sys.argv[3])
W, H = 1376, 768

def fit169(im):
    w, h = im.size
    if h > w: sys.exit(f'세로 그림이에요({w}×{h}). Gemini에 "16:9 가로로 다시"라고 요청해 주세요.')
    t = W / H
    if w / h > t: nw = int(h * t); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    elif w / h < t: nh = int(w / t); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return im.resize((W, H), Image.LANCZOS)

def fg_mask(a):   # 초록 배경이 아닌 곳
    a = a.astype(int); return (a[..., 1] - np.maximum(a[..., 0], a[..., 2])) < 40

im = fit169(Image.open(SRC).convert('RGB'))
a = np.asarray(im).copy()
is_char = not NAME.startswith(('bg_', 'cut_'))
if is_char:
    green = ~fg_mask(a); bh, bw = int(H * 0.09), int(W * 0.07)
    corner = green[H - bh:, W - bw:]
    if corner.mean() > 0.5: a[H - bh:, W - bw:] = (0, 255, 0)   # 구석이 거의 배경이면 워터마크째 초록으로
    else: print('⚠️ 오른쪽 아래 구석에 인물이 걸쳐 있어 워터마크를 칠하지 않았어요. 눈으로 확인 필요.')
    im = Image.fromarray(a)
    char, _, var = NAME.partition('_')
    base_p = ART / f'{char}_close.png'
    if var != 'close' and base_p.exists():   # 표정 그림을 기본 그림에 정렬
        b = np.asarray(Image.open(base_p).convert('RGB'))
        mb = fg_mask(b)[::4, ::4]; best = (-1, 1.0, 0, 0)
        for s in np.linspace(0.92, 1.08, 17):
            sw, sh = int(W * s), int(H * s); t = im.resize((sw, sh), Image.BILINEAR)
            mt_full = fg_mask(np.asarray(t))
            for dx in range(-60, 61, 8):
                for dy in range(-60, 61, 8):
                    cv = np.zeros((H, W), bool); x0, y0 = (W - sw) // 2 + dx, (H - sh) // 2 + dy
                    xs, ys = max(0, x0), max(0, y0); xe, ye = min(W, x0 + sw), min(H, y0 + sh)
                    cv[ys:ye, xs:xe] = mt_full[ys - y0:ye - y0, xs - x0:xe - x0]
                    m = cv[::4, ::4]; iou = (m & mb).sum() / max(1, (m | mb).sum())
                    if iou > best[0]: best = (iou, s, dx, dy)
        iou, s, dx, dy = best; sw, sh = int(W * s), int(H * s)
        canvas = Image.new('RGB', (W, H), (0, 255, 0)); canvas.paste(im.resize((sw, sh), Image.LANCZOS), ((W - sw) // 2 + dx, (H - sh) // 2 + dy))
        im = canvas
        print(f'정렬: 겹침 {iou:.2f} · 크기 {s:.2f} · 이동 {dx},{dy}' + ('  ⚠️ 겹침이 낮아요. 얼굴이 달라졌는지 확인' if iou < 0.85 else ''))
else:
    k = 1.06; im = im.resize((int(W * k), int(H * k)), Image.LANCZOS).crop((0, 0, W, H))
out = ART / f'{NAME}.png'; im.save(out); print('저장:', out)
