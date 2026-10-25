"""궁금해달 해달 캐릭터를 코드로 그린다 (AI 이미지 생성 없이 0원, 매번 같은 모습).

    python gunggeum/tools/otter_svg.py --face happy --arm wave -o out.svg
    python gunggeum/tools/otter_svg.py --sheet -o sheet.svg      # 표정·동작 모음

face: normal · happy · wow · think · wink · sad
arm : notebook(수첩 들기) · wave(손 흔들기) · point(가리키기) · pencil(연필로 턱 괴기) · cheer(두 손 번쩍)

PNG 가 필요하면 gunggeum/tools/office_smoke.mjs 처럼 Playwright 로 찍거나 rsvg 로 변환한다.
"""

import argparse

FUR = "#5f3b29"
FUR_DARK = "#4a2c1e"
CREAM = "#f3e3c8"
CREAM_SHADE = "#e6d0ad"
NOSE = "#2b1a14"
INK = "#2b1a14"
BLUSH = "#f2a0a0"
SCARF = "#9cc8ea"
SCARF_DARK = "#7fb2db"
NOTE = "#f4cf55"
NOTE_DARK = "#d9ad2c"
PENCIL = "#f29b4b"


def _eyes(face: str) -> str:
    l, r, y = 160, 240, 182
    if face in ("happy",):
        return "".join(
            f'<path d="M{x-15} {y+4} Q{x} {y-14} {x+15} {y+4}" stroke="{INK}" stroke-width="7" fill="none" stroke-linecap="round"/>'
            for x in (l, r)
        )
    if face == "wink":
        return (
            f'<ellipse cx="{l}" cy="{y}" rx="11" ry="13" fill="{INK}"/><circle cx="{l+4}" cy="{y-5}" r="4" fill="#fff"/>'
            f'<path d="M{r-15} {y+2} Q{r} {y-12} {r+15} {y+2}" stroke="{INK}" stroke-width="7" fill="none" stroke-linecap="round"/>'
        )
    if face == "wow":
        return "".join(
            f'<circle cx="{x}" cy="{y}" r="17" fill="#fff" stroke="{INK}" stroke-width="3"/><circle cx="{x}" cy="{y+1}" r="9" fill="{INK}"/><circle cx="{x+3}" cy="{y-3}" r="3" fill="#fff"/>'
            for x in (l, r)
        ) + "".join(
            f'<path d="M{x-14} {y-30} Q{x} {y-40} {x+14} {y-32}" stroke="{FUR_DARK}" stroke-width="6" fill="none" stroke-linecap="round"/>'
            for x in (l, r)
        )
    if face == "think":
        return "".join(
            f'<ellipse cx="{x}" cy="{y}" rx="11" ry="13" fill="{INK}"/><circle cx="{x+4}" cy="{y-7}" r="4" fill="#fff"/>'
            for x in (l + 4, r + 4)
        ) + f'<path d="M{l-14} {y-28} L{l+12} {y-24}" stroke="{FUR_DARK}" stroke-width="6" stroke-linecap="round"/><path d="M{r-10} {y-26} Q{r+2} {y-34} {r+16} {y-28}" stroke="{FUR_DARK}" stroke-width="6" fill="none" stroke-linecap="round"/>'
    if face == "sad":
        return "".join(
            f'<ellipse cx="{x}" cy="{y+2}" rx="11" ry="12" fill="{INK}"/><circle cx="{x+3}" cy="{y-3}" r="3.5" fill="#fff"/>'
            for x in (l, r)
        ) + f'<path d="M{l-16} {y-20} L{l+10} {y-28}" stroke="{FUR_DARK}" stroke-width="6" stroke-linecap="round"/><path d="M{r-10} {y-28} L{r+16} {y-20}" stroke="{FUR_DARK}" stroke-width="6" stroke-linecap="round"/>'
    return "".join(
        f'<ellipse cx="{x}" cy="{y}" rx="11" ry="13" fill="{INK}"/><circle cx="{x+4}" cy="{y-5}" r="4" fill="#fff"/>'
        for x in (l, r)
    )


def _mouth(face: str) -> str:
    if face == "wow":
        return f'<ellipse cx="200" cy="240" rx="10" ry="12" fill="{INK}"/><ellipse cx="200" cy="245" rx="6" ry="5" fill="#e07a7a"/>'
    if face in ("happy", "wink"):
        return f'<path d="M182 230 Q200 256 218 230 Z" fill="{INK}"/><path d="M190 240 Q200 250 210 240 Z" fill="#e07a7a"/>'
    if face == "sad":
        return f'<path d="M186 242 Q200 230 214 242" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>'
    if face == "think":
        return f'<path d="M190 236 L212 232" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
    return f'<path d="M184 230 Q192 240 200 232 Q208 240 216 230" stroke="{INK}" stroke-width="5" fill="none" stroke-linecap="round"/>'


def _notebook(x: float, y: float, angle: float = -8) -> str:
    rings = "".join(f'<circle cx="{8+i*11}" cy="2" r="3.2" fill="none" stroke="#8a8a8a" stroke-width="2.5"/>' for i in range(5))
    return (
        f'<g transform="translate({x} {y}) rotate({angle})">'
        f'<rect x="0" y="0" width="62" height="80" rx="6" fill="{NOTE}" stroke="{NOTE_DARK}" stroke-width="3"/>'
        f'<rect x="8" y="14" width="46" height="5" rx="2" fill="{NOTE_DARK}" opacity=".5"/>'
        f'<rect x="8" y="26" width="38" height="5" rx="2" fill="{NOTE_DARK}" opacity=".5"/>'
        f"{rings}</g>"
    )


def _pencil(x: float, y: float, angle: float) -> str:
    return (
        f'<g transform="translate({x} {y}) rotate({angle})">'
        f'<rect x="0" y="-5" width="54" height="10" rx="2" fill="{PENCIL}"/>'
        f'<path d="M54 -5 L68 0 L54 5 Z" fill="#f1d7b0"/><path d="M63 -2 L68 0 L63 2 Z" fill="{INK}"/>'
        f'<rect x="-8" y="-5" width="9" height="10" rx="2" fill="#e88"/></g>'
    )


def _paw(x: float, y: float, r: float = 17) -> str:
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{FUR}"/><circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{FUR_DARK}" stroke-width="2" opacity=".5"/>'


def _arm(x1, y1, x2, y2, w=30) -> str:
    return f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{FUR}" stroke-width="{w}" stroke-linecap="round"/>'


def _arms(arm: str) -> tuple[str, str]:
    """(몸 뒤에 그릴 것, 몸 앞에 그릴 것)"""
    left_down = _arm(108, 300, 96, 360) + _paw(96, 364)
    right_down = _arm(292, 300, 304, 360) + _paw(304, 364)
    if arm == "wave":
        back = _arm(292, 292, 338, 228) + _paw(342, 220, 19)
        front = left_down + _notebook(108, 318, 6)
        motion = '<path d="M368 196 q10 10 0 22 M380 186 q16 18 0 40" stroke="#9aa6b8" stroke-width="5" fill="none" stroke-linecap="round"/>'
        return back + motion, front
    if arm == "point":
        back = left_down
        front = _arm(292, 300, 350, 284) + _paw(356, 282) + f'<path d="M370 282 l14 0" stroke="{FUR}" stroke-width="10" stroke-linecap="round"/>'
        return back, front + _notebook(126, 320, 4)
    if arm == "pencil":
        front = _arm(292, 300, 318, 250) + _pencil(318, 246, -70) + _paw(320, 246, 16) + left_down + _notebook(104, 318, 6)
        return "", front
    if arm == "cheer":
        back = _arm(108, 292, 64, 222) + _paw(60, 214, 19) + _arm(292, 292, 336, 222) + _paw(340, 214, 19)
        sparkles = "".join(
            f'<path d="M{x} {y} l5 -14 l5 14 l14 5 l-14 5 l-5 14 l-5 -14 l-14 -5z" fill="#ffd34d"/>' for x, y in ((40, 160), (352, 150), (330, 100))
        )
        return back + sparkles, ""
    # notebook (기본): 오른손으로 수첩을 가슴 앞에 든다
    front = left_down + _notebook(238, 288, -10) + _paw(292, 330, 17)
    return "", front


def otter_svg(face: str = "normal", arm: str = "notebook", size: int = 400, label: str | None = None) -> str:
    back, front = _arms(arm)
    whiskers = "".join(
        f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#a08a76" stroke-width="2.4" stroke-linecap="round"/>'
        for x1, y1, x2, y2 in (
            (168, 216, 112, 206), (168, 222, 114, 226), (232, 216, 288, 206), (232, 222, 286, 226)
        )
    )
    scarf_wave = "".join(f'<path d="M{x} 266 q6 -7 12 0 t12 0" stroke="#fff" stroke-width="3" fill="none" opacity=".9"/>' for x in (120, 182, 244))
    body = f"""
  <ellipse cx="200" cy="462" rx="120" ry="12" fill="#000" opacity=".08"/>
  <path d="M286 410 Q352 424 372 382 Q380 360 360 360 Q352 396 294 392 Z" fill="{FUR_DARK}"/>
  {back}
  <ellipse cx="158" cy="446" rx="34" ry="17" fill="{FUR_DARK}"/><ellipse cx="242" cy="446" rx="34" ry="17" fill="{FUR_DARK}"/>
  <ellipse cx="200" cy="352" rx="112" ry="104" fill="{FUR}"/>
  <ellipse cx="200" cy="366" rx="62" ry="68" fill="{CREAM}"/>
  <circle cx="78" cy="128" r="21" fill="{FUR}"/><circle cx="79" cy="130" r="10" fill="{FUR_DARK}"/>
  <circle cx="322" cy="128" r="21" fill="{FUR}"/><circle cx="321" cy="130" r="10" fill="{FUR_DARK}"/>
  <ellipse cx="200" cy="178" rx="136" ry="100" fill="{FUR}"/>
  <path d="M72 186 Q76 134 136 136 Q170 140 200 154 Q230 140 264 136 Q324 134 328 186 Q330 264 200 268 Q70 264 72 186 Z" fill="{CREAM}"/>
  <path d="M92 212 Q100 258 200 264 Q300 258 308 212 Q290 250 200 254 Q110 250 92 212 Z" fill="{CREAM_SHADE}" opacity=".6"/>
  {_eyes(face)}
  <ellipse cx="128" cy="214" rx="18" ry="10" fill="{BLUSH}" opacity=".55"/><ellipse cx="272" cy="214" rx="18" ry="10" fill="{BLUSH}" opacity=".55"/>
  <ellipse cx="184" cy="226" rx="22" ry="17" fill="#fbf1df"/><ellipse cx="216" cy="226" rx="22" ry="17" fill="#fbf1df"/>
  {whiskers}
  <ellipse cx="200" cy="210" rx="23" ry="16" fill="{NOSE}"/><ellipse cx="193" cy="204" rx="7" ry="4" fill="#fff" opacity=".35"/>
  {_mouth(face)}
  <path d="M96 258 Q200 286 304 258 L306 286 Q200 312 94 286 Z" fill="{SCARF}"/>
  <path d="M96 258 Q200 286 304 258" stroke="{SCARF_DARK}" stroke-width="3" fill="none"/>
  {scarf_wave}
  <g transform="rotate(8 150 290)"><rect x="128" y="282" width="44" height="92" rx="8" fill="{SCARF}"/><path d="M134 344 q5 -6 10 0 t10 0 t10 0" stroke="#fff" stroke-width="3" fill="none"/><path d="M130 368 l0 14 M140 370 l0 14 M150 370 l0 14 M160 370 l0 14 M170 368 l0 14" stroke="{SCARF_DARK}" stroke-width="4" stroke-linecap="round"/></g>
  {front}
"""
    text = ""
    if label:
        text = f'<text x="200" y="500" text-anchor="middle" font-family="Pretendard, sans-serif" font-weight="800" font-size="26" fill="{INK}">{label}</text>'
    h = 520 if label else 480
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 {h}" width="{size}" height="{size * h // 400}">{body}{text}</svg>'


SHEET = [
    ("normal", "notebook", "기본 · 수첩"),
    ("happy", "wave", "인사 · 손 흔들기"),
    ("wow", "cheer", "놀람 · 두 손 번쩍"),
    ("think", "pencil", "생각 · 연필"),
    ("wink", "point", "정답 · 가리키기"),
    ("sad", "notebook", "아쉬움"),
]


def sheet_svg() -> str:
    cells = []
    for i, (face, arm, label) in enumerate(SHEET):
        x, y = (i % 3) * 420 + 20, (i // 3) * 540 + 90
        inner = otter_svg(face, arm, 400, label).replace("<svg ", f'<svg x="{x}" y="{y}" ', 1)
        cells.append(inner)
    title = (
        '<text x="30" y="56" font-family="Pretendard, sans-serif" font-weight="800" font-size="40" fill="#2b1a14">궁금해달 · 캐릭터 시트 (코드로 그림)</text>'
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 1180" width="1280" height="1180"><rect width="1280" height="1180" fill="#f7f1e6"/>{title}{"".join(cells)}</svg>'


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--face", default="normal")
    ap.add_argument("--arm", default="notebook")
    ap.add_argument("--size", type=int, default=400)
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    svg = sheet_svg() if a.sheet else otter_svg(a.face, a.arm, a.size)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(svg)
    print(a.out)
