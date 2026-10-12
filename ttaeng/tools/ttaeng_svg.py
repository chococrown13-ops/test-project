"""땡그랑(애칭 땡이) — 생활 속 돈·숫자를 계산해 주는 동전 캐릭터를 코드로 그린다 (0원, 매번 같은 모습).

    python ttaeng/tools/ttaeng_svg.py --face ding -o out.svg
    python ttaeng/tools/ttaeng_svg.py --sheet -o sheet.svg

face: normal(기본) · wow(놀람) · ding(정답 "땡!") · think(계산 중) · sad(아쉬움) · hi(인사)
"""

import argparse

GOLD_LIGHT = "#ffe9a3"
GOLD = "#ffc83d"
GOLD_DEEP = "#e8a412"
RIM = "#d08e0a"
INK = "#1b2340"
BLUSH = "#ff8a8a"
MOUTH = "#e5566b"

FACES = ["normal", "wow", "ding", "think", "sad", "hi"]
LABELS = {
    "normal": "기본 · \"계산해 볼게요\"",
    "wow": "놀람 · \"이렇게 차이 나요?\"",
    "ding": "정답 · \"땡그랑! 이게 이득\"",
    "think": "계산 중 · 계산기 톡톡",
    "sad": "아쉬움 · \"이건 손해예요\"",
    "hi": "인사 · \"안녕, 땡이예요\"",
}


def _arm(path: str) -> str:
    return f'<path d="{path}" stroke="{INK}" stroke-width="20" fill="none" stroke-linecap="round"/>'


def _calculator(x: float, y: float) -> str:
    keys = "".join(
        f'<rect x="{10 + c * 17}" y="{36 + r * 15}" width="12" height="10" rx="2" fill="{"#ff8a5b" if (c == 2 and r == 2) else "#cfd6e6"}"/>'
        for r in range(3) for c in range(3)
    )
    return (
        f'<g transform="translate({x} {y}) rotate(-8)">'
        f'<rect width="68" height="88" rx="10" fill="#3a4466" stroke="{INK}" stroke-width="4"/>'
        f'<rect x="9" y="9" width="50" height="20" rx="4" fill="#bfe8cf"/>{keys}</g>'
    )


def _face(face: str) -> str:
    eye_l, eye_r, ey = 155, 245, 200
    if face == "wow":
        eyes = "".join(
            f'<circle cx="{x}" cy="{ey - 2}" r="24" fill="#fff"/><circle cx="{x}" cy="{ey}" r="13" fill="{INK}"/><circle cx="{x + 4}" cy="{ey - 5}" r="4" fill="#fff"/>'
            for x in (eye_l, eye_r)
        )
        mouth = f'<ellipse cx="200" cy="262" rx="18" ry="22" fill="{INK}"/><ellipse cx="200" cy="270" rx="10" ry="9" fill="{MOUTH}"/>'
    elif face in ("ding", "hi"):
        eyes = "".join(
            f'<path d="M{x - 20} {ey + 5} Q{x} {ey - 18} {x + 20} {ey + 5}" stroke="{INK}" stroke-width="10" fill="none" stroke-linecap="round"/>'
            for x in (eye_l, eye_r)
        )
        mouth = f'<path d="M172 244 Q200 284 228 244 Z" fill="{INK}"/><path d="M186 258 Q200 272 214 258" fill="{MOUTH}"/>'
    elif face == "think":
        eyes = "".join(
            f'<ellipse cx="{x + 6}" cy="{ey - 4}" rx="15" ry="20" fill="{INK}"/><circle cx="{x + 12}" cy="{ey - 13}" r="5" fill="#fff"/>'
            for x in (eye_l, eye_r)
        )
        mouth = f'<path d="M184 256 L218 250" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>'
    elif face == "sad":
        eyes = "".join(
            f'<ellipse cx="{x}" cy="{ey + 4}" rx="15" ry="18" fill="{INK}"/><circle cx="{x + 5}" cy="{ey - 3}" r="5" fill="#fff"/>'
            for x in (eye_l, eye_r)
        ) + f'<path d="M{eye_l - 22} {ey - 30} L{eye_l + 14} {ey - 40}" stroke="{INK}" stroke-width="7" stroke-linecap="round"/><path d="M{eye_r - 14} {ey - 40} L{eye_r + 22} {ey - 30}" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
        mouth = f'<path d="M180 266 Q200 248 220 266" stroke="{INK}" stroke-width="8" fill="none" stroke-linecap="round"/>'
        mouth += '<path d="M300 150 q-12 22 0 30 q12 -8 0 -30z" fill="#8fd0ff" stroke="#4aa3e0" stroke-width="3"/>'
    else:
        eyes = "".join(
            f'<ellipse cx="{x}" cy="{ey}" rx="17" ry="22" fill="{INK}"/><circle cx="{x + 6}" cy="{ey - 9}" r="6" fill="#fff"/>'
            for x in (eye_l, eye_r)
        )
        mouth = f'<path d="M178 248 Q200 268 222 248" stroke="{INK}" stroke-width="9" fill="none" stroke-linecap="round"/>'
    blush = f'<ellipse cx="122" cy="238" rx="20" ry="11" fill="{BLUSH}" opacity=".55"/><ellipse cx="278" cy="238" rx="20" ry="11" fill="{BLUSH}" opacity=".55"/>'
    return eyes + blush + mouth


def _arms(face: str) -> tuple[str, str]:
    """(동전 뒤, 동전 앞)"""
    if face == "wow":
        return _arm("M70 200 Q30 150 50 110") + _arm("M330 200 Q370 150 350 110"), ""
    if face == "ding":
        star = "".join(
            f'<path d="M{x} {y} l7 -20 l7 20 l20 7 l-20 7 l-7 20 l-7 -20 l-20 -7z" fill="#ffd34d" stroke="{RIM}" stroke-width="2"/>'
            for x, y in ((340, 70), (52, 96), (368, 150))
        )
        bubble = (
            f'<g transform="translate(300 40)"><rect x="-6" y="-4" width="96" height="54" rx="27" fill="#fff" stroke="{INK}" stroke-width="5"/>'
            f'<text x="42" y="33" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="800" font-size="28" fill="{INK}">땡!</text></g>'
        )
        return _arm("M72 230 Q40 260 58 300") + _arm("M328 210 Q372 180 362 128") + star, bubble
    if face == "think":
        return _arm("M72 230 Q40 260 58 300"), _arm("M328 240 Q330 300 280 318") + _calculator(250, 286)
    if face == "hi":
        waves = '<path d="M300 80 q-10 10 0 22 M288 70 q-16 18 0 40" stroke="#9aa6b8" stroke-width="5" fill="none" stroke-linecap="round"/>'
        return _arm("M72 230 Q40 260 58 300") + _arm("M328 200 Q372 160 360 110") + waves, ""
    if face == "sad":
        return _arm("M72 236 Q52 280 70 320") + _arm("M328 236 Q348 280 330 320"), ""
    return _arm("M72 230 Q40 260 58 300") + _arm("M328 230 Q370 210 372 170"), ""


def ttaeng_svg(face: str = "normal", size: int = 400, label: str | None = None) -> str:
    back, front = _arms(face)
    body = f"""
  <defs><radialGradient id="g-{face}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="{GOLD_LIGHT}"/><stop offset=".55" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_DEEP}"/></radialGradient></defs>
  <ellipse cx="200" cy="395" rx="110" ry="14" fill="{INK}" opacity=".12"/>
  <rect x="150" y="330" width="26" height="52" rx="13" fill="{INK}"/><rect x="224" y="330" width="26" height="52" rx="13" fill="{INK}"/>
  {back}
  <circle cx="200" cy="205" r="150" fill="{RIM}"/><circle cx="200" cy="200" r="150" fill="url(#g-{face})"/>
  <circle cx="200" cy="200" r="124" fill="none" stroke="#f3b62a" stroke-width="10" stroke-dasharray="2 14" stroke-linecap="round"/>
  <text x="200" y="118" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="800" font-size="46" fill="#c98a07">₩</text>
  <path d="M110 95 l8 -22 l8 22 l22 8 l-22 8 l-8 22 l-8 -22 l-22 -8z" fill="#fff" opacity=".9"/>
  {_face(face)}
  {front}
"""
    text = ""
    h = 420
    if label:
        h = 470
        text = f'<text x="200" y="455" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="800" font-size="24" fill="{INK}">{label}</text>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 {h}" width="{size}" height="{size * h // 400}">{body}{text}</svg>'


def sheet_svg() -> str:
    cells = []
    for i, face in enumerate(FACES):
        x, y = (i % 3) * 420 + 20, (i // 3) * 500 + 120
        cells.append(ttaeng_svg(face, 400, LABELS[face]).replace("<svg ", f'<svg x="{x}" y="{y}" ', 1))
    head = (
        f'<text x="30" y="62" font-family="Pretendard, sans-serif" font-weight="800" font-size="44" fill="{INK}">땡그랑 (애칭 땡이) · 캐릭터 시트</text>'
        f'<text x="30" y="100" font-family="Pretendard, sans-serif" font-weight="800" font-size="24" fill="#5b6687">생활 속 돈·숫자를 대신 계산해 주는 동전 요정 · 입버릇 "땡그랑~ 이만큼 아꼈어요!"</text>'
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 1120" width="1280" height="1120"><rect width="1280" height="1120" fill="#f4f7ff"/>{head}{"".join(cells)}</svg>'


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--face", default="normal", choices=FACES)
    ap.add_argument("--size", type=int, default=400)
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(sheet_svg() if a.sheet else ttaeng_svg(a.face, a.size))
    print(a.out)
