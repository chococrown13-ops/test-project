"""대본 도우미 — 글로 쓴 대본(.md)을 점검하고, 영상용 script.json 으로 바꿔요. (2026-11-11)

쓰기
  python3 channels/story/tools/script_helper.py check <대본.md>            # 점검표만
  python3 channels/story/tools/script_helper.py build <대본.md> <편 폴더>   # 점검 + <편>/script.json 만들기
  다음은 평소처럼: tts.py <편> → 장면(index.html) → capture → mix → 인코딩

대본 쓰는 법 (.md)
  맨 위 머리말(--- 와 --- 사이)
    title: 냉장고 속 회의 1화 · 우유는 버려져야 하는가
    start: 1.2 / gap: 0.35 / tail: 4.5            (생략 가능)
    cast: 김치 = ko-KR-Chirp3-HD-Algenib 1.0       (이름 = 목소리 빠르기[ 음높이]) — 여러 줄
    chorus: 계란                                   ("모두" 대사를 읽을 사람)
    catch: 익을수록 맛있는 법이지                    (반복 개그 — 몇 번 나오는지 셈) — 여러 줄
    hook: 15                                       (첫 사건이 이 초 안에 나와야 함)
  ### 0:35 장면 이름        → 장면 (0:35 는 목표 시각)
  **이름**: 대사            → 대사. 앞에 (울며) 같은 지문을 붙이면 표정·몸짓을 알아서 정함
  대사 끝 {mood:worried gesture:panic jump pause:0.8 card:2}  → 직접 정하기(선택)
  (지문)                     → 화면 움직임. 몸개그로 셈. {act:faint who:우유 at:-0.5} 를 넣으면 장면 코드가 그대로 받음
  [효과음]                   → 문 열리는 소리·쿵·땅·뽀글·데구르르·두둥·반짝·딩동·찍 (아래 표)
  > 카드 제목: 줄1 · 줄2       → 정보 카드. 다음 대사부터 {card:n}줄(기본 2줄) 동안 화면에
"""
import json
import re
import sys
from pathlib import Path

# 효과음 낱말 → mix.py 효과음 종류
SFX = {"문 열리는": "door", "문 닫힘": "thud", "문": "door", "쿵": "thud", "땅": "thud", "탁": "thud", "뽀글": "pop", "쏙": "pop", "찍": "pop",
       "데구르르": "whoosh", "휙": "whoosh", "두둥": "sting", "반짝": "magic", "띠링": "ding", "딩동": "ding", "땡": "ding", "배송": "ding", "삑": "pop", "지직": "whoosh", "댕": "bell", "찰칵": "pop", "천둥": "thunder", "빵": "horn", "끼익": "screech", "빗소리": "rain", "슝": "whoosh"}
# 지문 낱말 → 표정 / 몸짓
MOOD = [("울", "cry"), ("훌쩍", "cry"), ("덜덜", "scared"), ("떨", "scared"), ("기절", "scared"), ("비명", "scared"), ("놀라", "surprised"), ("헉", "surprised"),
        ("뿌듯", "proud"), ("의기양양", "proud"), ("웃", "happy"), ("신나", "happy"), ("한숨", "tired"), ("시무룩", "tired"), ("화", "angry"), ("버럭", "angry"),
        ("걱정", "worried"), ("작게", "worried"), ("능청", "smug"), ("흥", "smug")]
GEST = [("가리키", "point"), ("손가락", "point"), ("손 흔", "wave"), ("인사", "wave"), ("으쓱", "shrug"), ("만세", "cheer"), ("환호", "cheer"),
        ("허둥", "panic"), ("부들", "panic"), ("덜덜", "panic"), ("생각", "think"), ("턱", "think"), ("들고", "hold"), ("껴안", "hold")]
JUMP = ("폴짝", "벌떡", "펄쩍", "뛰")


def dur_est(text, rate=1.0):
    """대사 길이 어림(초) — 1화 실제 목소리 77줄로 맞춘 식."""
    n = len(re.sub(r"[\s.,!?…~\"'·]", "", text))
    p = len(re.findall(r"[.,!?…]", text))
    return max(0.5, -0.07 + 0.165 * n / rate + 0.43 * p)


def tags(s):
    out = {}
    for m in re.finditer(r"\{([^}]*)\}", s):
        for kv in m.group(1).split():
            k, _, v = kv.partition(":")
            out[k] = v if v else True
    return re.sub(r"\s*\{[^}]*\}", "", s).strip(), out


def parse(md):
    lines = md.splitlines()
    head, body = {"cast": {}, "catch": []}, lines
    if lines and lines[0].strip() == "---":
        end = lines.index("---", 1)
        for h in lines[1:end]:
            k, _, v = h.partition(":")
            k, v = k.strip(), v.strip()
            if k == "cast":
                name, _, rest = v.partition("=")
                parts = rest.split()
                head["cast"][name.strip()] = {"voice": parts[0], "rate": float(parts[1]) if len(parts) > 1 else 1.0, **({"pitch": float(parts[2])} if len(parts) > 2 and float(parts[2]) else {}), **({"muffle": True} if "muffle" in parts[3:] else {})}
            elif k == "sfx":  # 머리말 sfx: 종류 시작초 [길이] — 빗소리처럼 길게 깔리는 소리
                q = v.split(); head.setdefault("sfxAbs", []).append({"kind": q[0], "t": float(q[1]), **({"dur": float(q[2])} if len(q) > 2 else {})})
            elif k == "catch":
                head["catch"].append(v)
            elif k:
                head[k] = v
        body = lines[end + 1:]
    items, scene = [], None
    for raw in body:
        s = raw.strip()
        if not s or s.startswith("---") or s.startswith("<!--"):
            continue
        if s.startswith("###"):
            m = re.match(r"###\s*(\d+):(\d+)\s*(.*)", s)
            scene = {"kind": "scene", "target": int(m.group(1)) * 60 + int(m.group(2)) if m else None, "name": (m.group(3) if m else s[3:]).strip()}
            items.append(scene)
        elif s.startswith(">"):
            t, tg = tags(s.lstrip("> ").strip())
            title, _, rows = t.partition(":")
            items.append({"kind": "card", "title": title.strip(), "rows": [r.strip() for r in rows.split("·") if r.strip()] if rows else [], **tg})
        elif s.startswith("**"):
            m = re.match(r"\*\*(.+?)\*\*\s*[:：]\s*(.*)", s)
            if not m:
                continue
            who, text = m.group(1), m.group(2)
            note = re.search(r"\((.*?)\)", who)
            who = re.sub(r"\(.*?\)", "", who).strip()
            text, tg = tags(text)
            if "act" in tg:  # 대사 줄의 {act:… who:…} 는 움직임으로 따로 (말하는 사람과 섞이지 않게)
                tg = {"actd": {k: tg.pop(k) for k in list(tg) if k in ("act", "who", "to", "mode", "over", "at")}, **tg}
            dirs = re.findall(r"\(([^)]*)\)", text)
            sfx = re.findall(r"\[([^\]]*)\]", text)
            clean = re.sub(r"\([^)]*\)|\[[^\]]*\]", "", text).strip()
            items.append({"kind": "line", "who": who, "role": note.group(1) if note else None, "text": clean, "dirs": dirs, "sfx": sfx, **tg})
        elif s.startswith("(") or s.startswith("["):
            t, tg = tags(s)
            dirs = re.findall(r"\(([^)]*)\)", t)
            sfx = re.findall(r"\[([^\]]*)\]", t)
            # 지문 줄 안에 대사가 섞인 경우 (예: [문 열리는 소리] **계란**: …) 는 위에서 처리 안 되니 여기서 나눔
            m = re.search(r"\*\*(.+?)\*\*\s*[:：]\s*(.*)", t)
            items.append({"kind": "action", "dirs": dirs, "sfx": sfx, **tg})
            if m:
                text, tg2 = tags(m.group(2))
                d2 = re.findall(r"\(([^)]*)\)", text)
                items.append({"kind": "line", "who": re.sub(r"\(.*?\)", "", m.group(1)).strip(), "role": None, "text": re.sub(r"\([^)]*\)|\[[^\]]*\]", "", text).strip(), "dirs": d2, "sfx": [], **tg2})
    return head, items


def sfx_kind(word):
    for k, v in SFX.items():
        if k in word:
            return v
    return None


def infer(dirs, text):
    j = " ".join(dirs)
    mood = next((v for k, v in MOOD if k in j), None)
    if not mood:
        mood = "surprised" if "?!" in text or "!?" in text else "happy" if text.endswith("!") and "ㅋ" in text else "normal"
    gest = next((v for k, v in GEST if k in j), None)
    jump = any(k in j for k in JUMP)
    return mood, gest, jump


def build(head, items):
    """대본 → script.json 꼴 + 어림 시간표."""
    cast = head["cast"]
    chorus = head.get("chorus")
    out, warn, cards = [], [], []
    t = float(head.get("start", 1.2)); gap = float(head.get("gap", 0.35))
    pend_dirs, pend_sfx, pend_acts, pend_card = [], [], [], None
    timeline = []  # (t, kind, info)
    for it in items:
        if it["kind"] == "scene":
            timeline.append((t, "scene", it))
        elif it["kind"] == "card":
            pend_card = it
        elif it["kind"] == "action":
            pend_dirs += it["dirs"]; pend_sfx += [(w, float(it.get("at", -0.5))) for w in it["sfx"]]  # 지문의 at 이 효과음 시각도 정함
            if "act" in it:
                a = {k: v for k, v in it.items() if k not in ("kind", "dirs", "sfx")}
                a["at"] = float(a.get("at", -0.5)); pend_acts.append(a)
            timeline.append((t, "action", it))
        else:
            who = it["who"]
            speaker = who
            if who in ("모두", "다같이", "다 같이"):
                speaker = chorus or next(iter(cast), who)
                warn.append(f"'모두' 대사 → {speaker} 목소리로 읽어요: {it['text'][:20]}")
            if cast and speaker not in cast:
                warn.append(f"출연진 목록에 없는 사람: {who}")
                continue
            mood, gest, jump = infer(it["dirs"], it["text"])
            pmood, pgest, pjump = infer(pend_dirs, "") if pend_dirs else (None, None, False)
            ln = {"who": speaker, "text": it["text"], "mood": it.get("mood") or (mood if mood != "normal" else (pmood or "normal"))}
            g = it.get("gesture") or gest or pgest
            if g: ln["gesture"] = g
            if it.get("jump") or jump or pjump: ln["jump"] = True
            if who != speaker: ln["chorus"] = True
            if it.get("role"): ln["role"] = it["role"]
            pause = float(it.get("pause", 0)) + (0.6 if pend_sfx or pend_dirs else 0)
            if pause: ln["pause"] = round(pause, 2)
            sf = []
            for w, wat in pend_sfx:
                k = sfx_kind(w)
                if k: sf.append({"kind": k, "at": wat})
                else: warn.append(f"모르는 효과음: [{w}]")
            for w in it["sfx"]:
                k = sfx_kind(w)
                if k: sf.append({"kind": k, "at": 0})
                else: warn.append(f"모르는 효과음: [{w}]")
            if sf: ln["sfx"] = sf
            if pend_acts: ln["acts"] = pend_acts
            if it.get("actd"): ln.setdefault("acts", []).append({**it["actd"], "at": float(it["actd"].get("at", 0))})
            if pend_card:
                cid = f"c{len(cards) + 1}"
                cards.append({"id": cid, "title": pend_card["title"], "rows": pend_card["rows"], "lines": int(pend_card.get("card", 2))})
                ln["card"] = cid; ln["cardLines"] = int(pend_card.get("card", 2))
            rate = cast.get(speaker, {}).get("rate", 1.0)
            t += pause
            d = dur_est(it["text"], rate)
            timeline.append((t, "line", {**ln, "dur": d, "len": len(it["text"])}))
            out.append(ln)
            t += d + gap
            pend_dirs, pend_sfx, pend_acts, pend_card = [], [], [], None
    # 카드가 여러 줄에 걸치게 이어 붙임
    for i, ln in enumerate(out):
        if "cardLines" in ln:
            for k in range(1, ln.pop("cardLines")):
                if i + k < len(out) and "card" not in out[i + k]:
                    out[i + k]["card"] = ln["card"]
    total = t - gap + float(head.get("tail", 4.5))
    sc = {"start": float(head.get("start", 1.2)), "gap": gap, "tail": float(head.get("tail", 4.5)), "cast": cast, "cards": {c["id"]: {"t": c["title"], "rows": c["rows"]} for c in cards}, "lines": out, **({"sfxAbs": head["sfxAbs"]} if head.get("sfxAbs") else {})}
    return sc, timeline, total, warn


def fmt(s):
    return f"{int(s // 60)}:{int(s % 60):02d}"


def report(head, items, timeline, total, warn):
    R = []
    lines = [x for x in timeline if x[1] == "line"]
    chars = sum(len(re.sub(r"\s", "", x[2]["text"])) for x in lines)
    R.append(f"# 대본 점검표 — {head.get('title', '')}")
    R.append(f"- 예상 길이 **{fmt(total)}** · 대사 {len(lines)}줄 · 목소리 글자 {chars}자(무료 한도 100만 자 중)")
    # 첫 사건
    hook = float(head.get("hook", 15))
    first = next((x[0] for x in timeline if x[1] == "action" and (x[2]["sfx"] or x[2]["dirs"])), None)
    firstq = next((x[0] for x in lines if "?" in x[2]["text"]), None)
    ok = first is not None and first <= hook
    R.append(f"- 첫 사건(움직임·효과음): {fmt(first) if first is not None else '없음'} → {'✅' if ok else '⚠️ ' + str(int(hook)) + '초 안에 사건을 넣어 주세요'} · 첫 궁금증(물음표 대사): {fmt(firstq) if firstq is not None else '없음'}")
    # 장면별 시간
    R.append("\n## 장면별 시간 (목표 → 예상)")
    scenes = [x for x in timeline if x[1] == "scene"]
    for i, (st, _, sc) in enumerate(scenes):
        en = scenes[i + 1][0] if i + 1 < len(scenes) else total
        tgt = sc["target"]
        diff = "" if tgt is None else f" (목표 {fmt(tgt)}, {'+' if st - tgt >= 0 else ''}{int(st - tgt)}초)"
        R.append(f"- {fmt(st)}~{fmt(en)} {sc['name']} · {int(en - st)}초{diff}")
    # 정적 구간: 움직임·효과음·카드·점프·몸짓 없이 대사만 이어지는 시간
    R.append("\n## 화면이 심심한 구간 (25초 넘게 움직임·효과음·카드가 없음)")
    last, flag = 0.0, 0
    for tt, k, info in timeline:
        lively = k == "action" or (k == "line" and (info.get("sfx") or info.get("card") or info.get("jump") or info.get("gesture") in ("panic", "cheer", "wave")))
        if lively:
            if tt - last > 25:
                R.append(f"- ⚠️ {fmt(last)}~{fmt(tt)} ({int(tt - last)}초)"); flag += 1
            last = tt
    if total - last > 25:
        R.append(f"- ⚠️ {fmt(last)}~{fmt(total)} ({int(total - last)}초)"); flag += 1
    if not flag:
        R.append("- ✅ 없음")
    # 긴 대사
    long_ = [x[2] for x in lines if x[2]["len"] > 38]
    R.append(f"\n## 긴 대사 (38자 넘음 — 자막 두 줄, 나눠 주세요): {len(long_)}개")
    for l in long_:
        R.append(f"- {l['who']}: {l['text']} ({l['len']}자)")
    # 수 세기
    acts = [x for x in timeline if x[1] == "action"]
    cards = [i for i in items if i["kind"] == "card"]
    mins = max(total / 60, 0.1)
    R.append("\n## 재미 재료")
    R.append(f"- 움직임·몸개그 지문 {len(acts)}개 (분당 {len(acts) / mins:.1f} — 3 이상 권장) · 정보 카드 {len(cards)}개 · 물음표 대사 {sum('?' in x[2]['text'] for x in lines)}개")
    for c in head.get("catch", []):
        n = sum(c in x[2]["text"] for x in lines)
        R.append(f"- 반복 개그 「{c}」 {n}번 {'✅' if n >= 2 else '⚠️ 2번 이상 권장'}")
    # 캐릭터 비중
    R.append("\n## 캐릭터 비중 (대사 시간)")
    from collections import Counter
    c = Counter()
    for x in lines:
        c[x[2]["who"]] += x[2]["dur"]
    tot = sum(c.values()) or 1
    for k, v in c.most_common():
        R.append(f"- {k}: {v / tot * 100:.0f}% {'█' * int(v / tot * 40)}")
    if warn:
        R.append("\n## 확인할 것")
        R += [f"- {w}" for w in dict.fromkeys(warn)]
    return "\n".join(R)


def main():
    cmd, src = sys.argv[1], Path(sys.argv[2])
    head, items = parse(src.read_text())
    sc, timeline, total, warn = build(head, items)
    rep = report(head, items, timeline, total, warn)
    print(rep)
    if cmd == "build":
        ep = Path(sys.argv[3]); ep.mkdir(parents=True, exist_ok=True)
        (ep / "script.json").write_text(json.dumps(sc, ensure_ascii=False, indent=1))
        (ep / "check.md").write_text(rep + "\n")
        print(f"\n→ {ep / 'script.json'} 만들었어요. 다음: python3 channels/story/tools/tts.py {ep}")


if __name__ == "__main__":
    main()
