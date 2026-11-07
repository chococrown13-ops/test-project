"""실제 지도 바탕 만들기 — 시청자가 "아, 거기!" 하고 바로 알아보게 (2026-11-07 대표 요청).

OpenStreetMap 지도 조각(타일)을 이어 붙여 한 장의 바탕 지도 PNG 를 만들고,
아는 장소(역·다리·공원 등)의 위치를 찾아 그 그림 위 좌표로 적어 둔다.
편 폴더의 index.html 이 이 바탕 위에 옛 모습(바다·염전·섬 등)을 겹쳐 그린다 → gunggeum/tools/mapkit.js

쓰기:
  python3 gunggeum/tools/basemap.py <편 폴더>/map --center 37.401,126.716 --zoom 16 --size 2600x3600 \
      --place "호구포역" --place "인천논현역" --place "소래포구=37.4006,126.7378" --area "남동국가산업단지"
  --place  이름만 주면 위치를 찾아 줌(Nominatim). "이름=위도,경도" 로 직접 줄 수도 있음
  --area   이름의 경계선(다각형)을 받아 둠 — 예: 지금 공단 자리 = 옛 바다 자리를 겹쳐 그릴 때
결과: map/basemap.png(바탕) · map/inset.png(전국 위치 작은 지도) · map/map.json(좌표·출처)

규칙: 지도 그림은 © OpenStreetMap 기여자(ODbL) — 화면 아래에 꼭 "지도 © OpenStreetMap" 표시.
      타일 서버 예절: 한 번에 하나씩, 이름표(User-Agent) 붙여서, 받은 조각은 저장해 두고 다시 받지 않음.
"""
import argparse
import base64
import io
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

UA = "city-rings-shorts-map/1.0 (code-drawn neighborhood history shorts; low volume)"
TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
CACHE = Path(os.environ.get("CITY_TILE_CACHE", Path.home() / ".cache" / "city-rings-tiles"))
ATTRIBUTION = "지도 © OpenStreetMap 기여자"


def world_px(lat, lon, z):
    """위도·경도 → 그 확대 단계의 전 세계 픽셀 좌표 (웹 메르카토르)."""
    n = 256 * 2 ** z
    x = (lon + 180) / 360 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # 잠깐 끊김은 다시
            if i == tries - 1:
                raise
            print(f"  다시 시도 ({e})", file=sys.stderr)
            time.sleep(2 * (i + 1))


def tile(z, x, y):
    p = CACHE / str(z) / str(x) / f"{y}.png"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(get(TILE.format(z=z, x=x, y=y)))
        time.sleep(0.15)  # 타일 서버에 부담 안 주게
    return Image.open(p).convert("RGB")


def stitch(center, z, w, h):
    """center 를 가운데 둔 w×h 픽셀 지도 한 장."""
    cx, cy = world_px(center[0], center[1], z)
    x0, y0 = cx - w / 2, cy - h / 2
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int((x0 + w) // 256), int((y0 + h) // 256)
    count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    if count > 400:
        sys.exit(f"지도 조각이 {count}개나 돼요 — 크기나 확대 단계를 줄여 주세요 (400개까지)")
    img = Image.new("RGB", (w, h), (240, 240, 236))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            img.paste(tile(z, tx, ty), (int(tx * 256 - x0), int(ty * 256 - y0)))
    return img, (x0, y0), count


def find(name, polygon=False):
    q = {"q": name, "format": "jsonv2", "limit": 1, "countrycodes": "kr", "accept-language": "ko"}
    if polygon:
        q["polygon_geojson"] = 1
        q["polygon_threshold"] = 0.0002
    data = json.loads(get(NOMINATIM + "?" + urllib.parse.urlencode(q)))
    time.sleep(1.1)  # Nominatim: 1초에 한 번
    if not data:
        return None
    return data[0]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out")
    ap.add_argument("--center", required=True, help="위도,경도")
    ap.add_argument("--zoom", type=int, default=16)
    ap.add_argument("--size", default="2600x3600", help="바탕 지도 픽셀 크기 (화면보다 넉넉히: 카메라가 움직일 자리)")
    ap.add_argument("--place", action="append", default=[], help='"이름" 또는 "이름=위도,경도"')
    ap.add_argument("--area", action="append", default=[], help="경계선을 받아 둘 장소 이름")
    ap.add_argument("--no-inset", action="store_true")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    center = tuple(float(v) for v in a.center.split(","))
    w, h = (int(v) for v in a.size.lower().split("x"))
    z = a.zoom

    img, (x0, y0), n = stitch(center, z, w, h)
    img.save(out / "basemap.png", optimize=True)
    print(f"바탕 지도 {w}×{h} (확대 {z}, 조각 {n}개) → {out / 'basemap.png'}")

    to_px = lambda lat, lon: [round(world_px(lat, lon, z)[0] - x0, 1), round(world_px(lat, lon, z)[1] - y0, 1)]
    meters_per_px = 156543.03392 * math.cos(math.radians(center[0])) / 2 ** z

    places = []
    for p in a.place:
        if "=" in p:
            name, ll = p.split("=", 1)
            lat, lon = (float(v) for v in ll.split(","))
            src = "직접 입력"
        else:
            name = p
            r = find(p)
            if not r:
                print(f"  ⚠️ '{p}' 위치를 못 찾았어요 — \"{p}=위도,경도\" 로 직접 넣어 주세요", file=sys.stderr)
                continue
            lat, lon, src = float(r["lat"]), float(r["lon"]), r["display_name"]
        x, y = to_px(lat, lon)
        inside = 0 <= x <= w and 0 <= y <= h
        places.append({"name": name, "lat": lat, "lon": lon, "x": x, "y": y, "inside": inside, "found": src})
        print(f"  📍 {name}: ({x:.0f}, {y:.0f}){'' if inside else '  ⚠️ 바탕 지도 밖'} — {src[:60]}")

    areas = []
    for name in a.area:
        r = find(name, polygon=True)
        gj = r and r.get("geojson")
        if not gj or gj["type"] not in ("Polygon", "MultiPolygon"):
            print(f"  ⚠️ '{name}' 경계선을 못 받았어요", file=sys.stderr)
            continue
        polys = gj["coordinates"] if gj["type"] == "MultiPolygon" else [gj["coordinates"]]
        rings = [[to_px(lat, lon) for lon, lat in poly[0]] for poly in polys]  # 바깥 테두리만
        areas.append({"name": name, "rings": rings, "found": r["display_name"]})
        print(f"  ▭ {name}: 테두리 {len(rings)}개, 점 {sum(len(r) for r in rings)}개")

    inset = None
    if not a.no_inset:  # 전국 지도(확대 6)에 이 동네 위치
        ic = (36.3, 127.8)
        iimg, (ix0, iy0), _ = stitch(ic, 6, 300, 380)
        iimg.save(out / "inset.png", optimize=True)
        px, py = world_px(center[0], center[1], 6)
        inset = {"file": "inset.png", "w": 300, "h": 380, "x": round(px - ix0, 1), "y": round(py - iy0, 1)}
        print(f"  🗺 전국 위치 지도 → {out / 'inset.png'}")

    meta = {
        "center": center, "zoom": z, "w": w, "h": h, "origin": [x0, y0], "metersPerPx": meters_per_px,
        "places": places, "areas": areas, "inset": inset, "attribution": ATTRIBUTION,
        "made": time.strftime("%Y-%m-%d"),
    }
    (out / "map.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    # index.html 이 file:// 로 열려도 읽히게(그림을 파일로 읽으면 캔버스를 영상으로 못 뽑음) 그림까지 글자로 넣은 스크립트
    def data_url(path):
        buf = io.BytesIO()
        Image.open(path).convert("RGB").save(buf, "JPEG", quality=88)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    meta_js = dict(meta, baseData=data_url(out / "basemap.png"), insetData=data_url(out / "inset.png") if inset else None)
    (out / "map.js").write_text("window.MAP_META = " + json.dumps(meta_js, ensure_ascii=False) + ";\n")
    print(f"좌표 → {out / 'map.json'} (+ map.js)  · 1px ≈ {meters_per_px:.2f}m")


if __name__ == "__main__":
    main()
