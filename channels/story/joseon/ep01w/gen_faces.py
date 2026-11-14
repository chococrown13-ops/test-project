import sys, os
sys.path.insert(0, '/home/user/test-project/channels/story/tools'); from gimg import gen
from concurrent.futures import ThreadPoolExecutor
os.chdir(os.path.dirname(os.path.abspath(__file__)))
keep = "Keep EVERYTHING else exactly identical: same framing, same pose, same position, same lines, same colors, same art style, same green background. Only edit the "
V = {'eyes_closed': "eyes: both eyes gently closed (a blink).",
     'mouth_a': "mouth: open wide as if saying 'ah', teeth slightly visible.",
     'mouth_o': "mouth: small rounded open mouth as if saying 'oh'.",
     'mouth_e': "mouth: slightly open and wide as if saying 'eh', teeth visible.",
     'surprised': "eyes and eyebrows: eyebrows raised high, eyes wide open in shock. Mouth stays closed.",
     'happy': "eyes and eyebrows: a happy smiling look, eyes curved into smiling arcs, relaxed brows. Mouth stays as it is.",
     'worried': "eyes and eyebrows: worried, eyebrows pulled up in the middle and drooping, anxious eyes. Mouth stays as it is.",
     'angry': "eyes and eyebrows: annoyed, eyebrows pulled down sharply, glaring eyes. Mouth stays as it is."}
NEED = {'yunjinsa': ['eyes_closed', 'mouth_a', 'mouth_o', 'mouth_e', 'surprised', 'happy'],
        'jumo': ['eyes_closed', 'mouth_a', 'mouth_o', 'mouth_e', 'surprised', 'happy'],
        'sunra': ['eyes_closed', 'mouth_a', 'mouth_o', 'mouth_e', 'angry'],
        'dolsoe': ['eyes_closed', 'mouth_a', 'mouth_o', 'mouth_e', 'surprised', 'happy', 'angry'],
        'minjae': ['happy', 'worried'], 'daengi': ['happy']}
J = []
for c, vs in NEED.items():
    for v in vs:
        out = f'art/{c}_{v}.png'
        if not os.path.exists(out): J.append((out, f'art/{c}_close.png', keep + (V[v] if c != 'daengi' else "face on the bell: eyes become happy closed upward arcs (^ ^). Mouth stays.")))
J.append(('art/bg_2026_frozen.png', 'art/bg_2026_rain.png', "Redraw this exact same street scene, same composition and style, but time is frozen: raindrops hanging motionless in mid-air as small streaks and dots, a big lightning bolt frozen above the red bell pavilion, everything tinted cold blue and desaturated. No people, no text."))
def run(j):
    out, src, p = j; return out, gen(p, out, [src], model='gemini-3-pro-image', aspect='16:9')
with ThreadPoolExecutor(5) as ex:
    for k, r in ex.map(run, J): print(k, r, flush=True)
