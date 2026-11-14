# 1화 웹툰판 배경·컷 그림 만들기 (Gemini 이미지). 이미 있는 그림은 건너뜀.
import sys, os
sys.path.insert(0, '/home/user/test-project/channels/story/tools'); from gimg import gen
from concurrent.futures import ThreadPoolExecutor
os.chdir(os.path.dirname(os.path.abspath(__file__)))
REF = 'art/bg_street_night.png'
STY = "Original Korean webtoon (manhwa) illustration, bold action-webtoon style: thick confident black ink lines, high-contrast two-tone cel shading, dramatic rim light, muted palette with warm accent lights. Wide 16:9 cinematic panel. No text, no logo, no watermark, no speech bubbles."
BG = "Background art only, NO people."
J = {
 'bg_2026_rain': f"{STY} {BG} Modern Seoul Jongno street at night in heavy rain, 2026: wet asphalt reflecting neon signs, crosswalk, office buildings, the traditional Bosingak bell pavilion with red pillars on the right side, street lamps.",
 'bg_2026_frozen': f"{STY} {BG} The same modern Seoul Jongno street at night, but time is frozen: raindrops hanging motionless in the air, a lightning bolt frozen over the Bosingak bell pavilion, everything tinted cold blue and desaturated, eerie silence.",
 'bg_inn_inside': f"{STY} {BG} Inside a Joseon-dynasty roadside inn (jumak) at night: warm lamplight, ondol floor with yellow oiled paper, low wooden tables (soban), hanji paper sliding doors, an iron cauldron steaming near a raised wooden maru where the innkeeper sits, cozy and busy atmosphere.",
 'bg_inn_night': f"{STY} {BG} The same Joseon inn room late at night: lamps almost out, dark blue moonlight through hanji paper doors, folded blankets on the floor, quiet sleeping atmosphere.",
 'bg_dawn_street': f"{STY} {BG} A Joseon-dynasty Hanyang street at dawn: pale orange and pink sky, mist, giwa tile roofs and a thatched inn, the first light hitting the road, peaceful morning.",
 'bg_gate': f"{STY} {BG} A grand Joseon-dynasty city gate (like Sungnyemun) at night with heavy wooden doors closing, torches on the stone walls, dark sky, dramatic low angle.",
 'cut_ride': f"{STY} Wide action panel: a young Korean delivery rider in a green delivery vest and dark long sleeves rides an electric kickboard fast through rainy neon Seoul at night, splashes, motion lines, worried face checking a phone on the handlebar.",
 'cut_truck': f"{STY} Dramatic action panel: a delivery truck's blinding headlights rushing straight at the viewer on a rainy night street, a young rider in a green vest raising his arm in shock in the foreground silhouette, speed lines.",
 'cut_lightning': f"{STY} Dramatic panel: a huge lightning bolt striking the traditional Bosingak bell pavilion in modern rainy Seoul at night, blinding white-blue flash, the big bronze bell glowing.",
 'cut_torch': f"{STY} Panel: far down a dark Joseon-dynasty street at night, several patrol soldiers in black jeollip hats carrying torches approach, orange torchlight against blue darkness, tense mood, seen from behind a corner.",
 'cut_run': f"{STY} Action panel: a young man in a green delivery vest and dark long sleeves runs desperately through a narrow dark Joseon-dynasty alley at night, looking around for a place to stay, motion lines, tiled walls.",
 'cut_gukbap': f"{STY} Close-up food panel: a steaming bowl of Joseon-style beef broth rice soup (jangguk-bap) on a small wooden soban table, white porcelain bowl, brass spoon, warm lamplight, delicious.",
 'cut_crowd': f"{STY} Wide panel: a crowded Joseon inn room at night full of scholars in white dopo robes and black gat hats sitting, chatting and drinking, warm lamplight, busy and noisy.",
 'cut_hotpack': f"{STY} Close-up panel: a modern disposable hand warmer pack being held up in a boy's hands in a Joseon inn, warm glow and little steam lines around it, the boy's amazed face partially visible.",
 'cut_card': f"{STY} Close-up panel: a Joseon innkeeper woman's hand holding up a modern plastic credit card in lamplight, puzzled.",
}
def run(kv):
    k, p = kv; out = f'art/{k}.png'
    if os.path.exists(out): return k, 'skip'
    return k, gen(p, out, [REF] if k.startswith('bg_') else [], model='gemini-3-pro-image', aspect='16:9')
with ThreadPoolExecutor(5) as ex:
    for k, r in ex.map(run, J.items()): print(k, r, flush=True)
