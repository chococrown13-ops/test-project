"""3D 모델(.glb)과 색 그림(colormap.png)을 페이지에서 바로 쓰게 한 파일(JS)로 묶기.
file:// 로 여는 페이지는 .glb 를 직접 못 읽어서(브라우저 보안), 글자(base64)로 바꿔 넣어요.
쓰기: python3 channels/story/tools/pack_assets.py <출력.js> <팩폴더>:<모델이름>,<모델이름> ...
  예) pack_assets.py joseon/sample/models.js assets/kenney/mini-characters:character-male-f assets/kenney/car-kit:delivery
만들어지는 것: window.GLB = {이름: {glb: base64, pack: 팩이름}}; window.GLB_TEX = {팩이름: 'data:image/png;base64,…'}
"""
import base64
import json
import sys
from pathlib import Path

out = Path(sys.argv[1])
glb, tex = {}, {}
for arg in sys.argv[2:]:
    folder, names = arg.split(":")
    folder = Path(folder)
    pack = folder.name
    tex[pack] = "data:image/png;base64," + base64.b64encode((folder / "colormap.png").read_bytes()).decode()
    for n in names.split(","):
        glb[n] = {"glb": base64.b64encode((folder / f"{n}.glb").read_bytes()).decode(), "pack": pack}
out.write_text("// 자동 생성: tools/pack_assets.py (CC0 모델, 출처는 각 팩 폴더의 License.txt)\nwindow.GLB = Object.assign(window.GLB || {}, " + json.dumps(glb) + ");\nwindow.GLB_TEX = Object.assign(window.GLB_TEX || {}, " + json.dumps(tex) + ");\n")
print(out, f"{out.stat().st_size // 1024}KB", list(glb))
