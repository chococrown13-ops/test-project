import sys, json, wave, os, re, difflib
sys.path.insert(0, 'vt'); sys.path.insert(0, '/home/user/test-project/channels/story/tools')
from gem import tts
from asr import asr
from tts import speakable
s = json.load(open('vt/new/script.json'))
PROFILE = {
 "민재": ("Puck", "Minjae: 27-year-old Korean male delivery rider. Playful, flustered, talks casually like to a friend, Seoul accent."),
 "목소리": ("Leda", "A hidden system voice: crisp like a game announcement, slightly mysterious."),
 "댕이": ("Leda", "Daengi: a tiny, cute guide spirit born from a bell sound. Bright, playful, cheeky, like a friendly game tutorial guide."),
 "돌쇠": ("Zephyr", "Dolsoe: a 10-year-old boy errand runner at an inn. Smart, sassy, talks fast."),
 "순라군": ("Alnilam", "A Joseon-era night patrol soldier. Deep, intimidating, old-fashioned historical-drama speech."),
 "윤진사": ("Iapetus", "Scholar Yoon: a calm, dignified scholar in his 30s from the Joseon era. Historical-drama speech, quietly kind."),
 "주모": ("Gacrux", "Jumo: the innkeeper woman in her 40s. Hearty, quick-witted, brisk merchant tone."),
}
NOTE = ["Hurrying on a kickboard in the rain, muttering to himself urgently.", "The world suddenly freezes; a mysterious system voice speaks.", "Shouting at a strange man blocking the road while running past.",
 "First appearance, cheerful 'ta-da' greeting.", "Baffled, asking back in disbelief.", "Playing innocent, cheeky, ending with a giggle.", "Kindly explaining like a tutorial guide.",
 "Shouting from a distance.", "Suspicious, interrogating sternly.", "Stepping out of a door, firm but calm.", "Welcoming a customer briskly.", "Puzzled, turning a strange card over in her hands.",
 "Laughing at the absurdity, talking to himself.", "Reminiscing, quiet and warm.", "Dawn; quiet, moved, announcing that the gates open."]
def P(prof, note): return f"# AUDIO PROFILE\n{prof} Native Korean speaker.\n## THE SCENE\nKorean web animation. A delivery rider from 2026 is stuck in 1795 Hanyang.\n### DIRECTOR'S NOTES\n{note} Natural Korean voice-acting. Speak ONLY the transcript below, in Korean.\n#### TRANSCRIPT\n"
def clean(x): return re.sub(r'[^가-힣]', '', x)
os.makedirs('vt/gem2', exist_ok=True); rep = []
for i, l in enumerate(s['lines']):
    voice, prof = PROFILE[l['who']]; text = speakable(l['text']); best = None
    for k in range(5):
        out = f'vt/gem2/try.wav'; r = tts(text, voice, P(prof, NOTE[i]), out=out)
        if not isinstance(r, tuple): print('ERR', i, r); continue
        heard = asr(out, 'gemini-3.8-flash'); sim = difflib.SequenceMatcher(None, clean(text), clean(heard)).ratio()
        okdur = r[0] < 1.5 + 0.28 * len(clean(text))
        score = sim - (0 if okdur else 1)
        if best is None or score > best[0]: best = (score, heard, r[0]); os.replace(out, f'vt/gem2/{i:02d}.wav')
        if sim > 0.85 and okdur: break
    rep.append((i, l['who'], round(best[0], 2), best[2], text, best[1])); print(rep[-1], flush=True)
json.dump(rep, open('vt/gem2/report.json', 'w'), ensure_ascii=False, indent=1)
