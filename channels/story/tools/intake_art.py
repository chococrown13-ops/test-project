"""대표님이 Gemini 앱에서 만든 그림을 영상용으로 정리해 art 폴더에 넣어요.
쓰기: python3 intake_art.py <받은 그림> <이름> <art 폴더>
  이름 예: tongju_close · tongju_mouth_a · bg_tongju_yard · cut_wall
- 모든 그림: 가로 16:9로 맞춤(1376×768, 1화 그림과 같은 크기). 세로 그림이면 멈추고 알려 줌.
- Gemini 앱 무료 그림의 반짝이 표시(오른쪽 아래)를 주변 색으로 메움.
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

def unmark(im):   # Gemini 앱 무료 그림의 반짝이 표시(오른쪽 아래, 가로 91%·세로 85% 근처)를 가까운 비슷한 무늬로 덮음
    a = np.asarray(im).astype(np.float32); cx, cy, r = int(W * 0.912), int(H * 0.846), int(W * 0.03)
    R = r + 8; yy, xx = np.mgrid[-R:R + 1, -R:R + 1]; d = np.sqrt(xx ** 2 + yy ** 2)
    hole = d < r; ring = (d >= r) & (d < R)
    alpha = np.clip((R - d) / (R - r), 0, 1)[..., None]   # 가장자리는 부드럽게 섞음
    tgt = a[cy - R:cy + R + 1, cx - R:cx + R + 1]; best = (1e18, 0, 0)
    for dy in range(-90, 91, 6):
        for dx in range(-160, 41, 6):
            if abs(dx) < 2 * R and abs(dy) < 2 * R: continue
            y0, x0 = cy - R + dy, cx - R + dx
            if y0 < 0 or x0 < 0 or y0 + 2 * R + 1 > H or x0 + 2 * R + 1 > W: continue
            src = a[y0:y0 + 2 * R + 1, x0:x0 + 2 * R + 1]
            e = ((src - tgt)[ring] ** 2).sum()
            if e < best[0]: best = (e, dy, dx)
    _, dy, dx = best; src = a[cy - R + dy:cy + R + 1 + dy, cx - R + dx:cx + R + 1 + dx]
    a[cy - R:cy + R + 1, cx - R:cx + R + 1] = src * alpha + tgt * (1 - alpha)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

im = unmark(fit169(Image.open(SRC).convert('RGB')))
a = np.asarray(im).copy()
is_char = not NAME.startswith(('bg_', 'cut_'))
if is_char:
    green = ~fg_mask(a)
    if not green[0].all(): print('⚠️ 그림 위쪽 끝에 인물이 닿아 있어요(머리·모자). 영상에서는 크게 키워 잘린 선을 화면 밖으로 보내요.')
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
out = ART / f'{NAME}.png'; im.save(out); print('저장:', out)
