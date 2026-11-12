"""Gemini 목소리 (Gemini API · generativelanguage.googleapis.com). 키는 환경의 Network secret 으로 붙음 — 키 값 출력·저장 금지.
tts.py 가 편 폴더에 voices.json 이 있으면 이걸 씀:
  {"engine": "gemini", "model": "gemini-3.8-flash-tts", "scene": "...",
   "cast": {이름: {"voice": "Leda", "profile": "영어 인물 설명"}}, "notes": {"줄번호": "영어 연기 지시"}}
연기 지시를 소리로 읽어 버리는 일이 가끔 있어서, 만든 소리를 받아써 대본과 비교하고 틀리면 다시 만든다(최대 5번).
"""
import base64
import difflib
import io
import json
import re
import struct
import time
import urllib.error
import urllib.request
import wave

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
ASR_MODEL = "gemini-3.8-flash"


def _post(model, body, timeout=180):
    req = urllib.request.Request(f"{BASE}/{model}:generateContent", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    for i in range(6):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < 5:
                time.sleep(10 * (i + 1)); continue
            raise SystemExit(f"Gemini 오류 {e.code}")  # 키가 섞이지 않게 코드만
        except (urllib.error.URLError, TimeoutError):
            if i < 5:
                time.sleep(10 * (i + 1)); continue
            raise


def prompt(profile, scene, note, prev):
    ctx = f"\nThe previous line in the scene was: \"{prev}\"" if prev else ""
    return (f"# AUDIO PROFILE\n{profile} Native Korean speaker.\n## THE SCENE\n{scene}{ctx}\n"
            f"### DIRECTOR'S NOTES\n{note} Natural Korean voice-acting. Speak ONLY the transcript below, in Korean.\n#### TRANSCRIPT\n")


def synth_once(text, voice, direction, model):
    body = {"contents": [{"parts": [{"text": direction + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    part = _post(model, body)["candidates"][0]["content"]["parts"][0]["inlineData"]
    raw, mt = base64.b64decode(part["data"]), part.get("mimeType", "")
    if raw[:4] == b"RIFF":
        return raw
    rate = int(mt.split("rate=")[-1].split(";")[0]) if "rate=" in mt else 24000
    buf = io.BytesIO(); w = wave.open(buf, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(raw); w.close()
    return buf.getvalue()


def transcribe(wav_bytes):
    body = {"contents": [{"parts": [{"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(wav_bytes).decode()}},
                                    {"text": "이 오디오에서 들리는 말을 한국어로 그대로 받아 적어 주세요. 받아쓴 글만 출력."}]}]}
    return _post(ASR_MODEL, body)["candidates"][0]["content"]["parts"][0]["text"].strip()


def trim(wav_bytes, thr=0.02, margin=0.06):
    """앞뒤 조용한 부분 잘라냄(입 모양·시간표가 실제 말과 맞게)."""
    w = wave.open(io.BytesIO(wav_bytes)); sr, n = w.getframerate(), w.getnframes(); pcm = w.readframes(n)
    s = struct.unpack(f"<{n}h", pcm[: n * 2]); hop = sr // 100
    loud = [k for k in range(0, n, hop) if max((abs(x) for x in s[k:k + hop]), default=0) / 32768 > thr]
    if not loud:
        return wav_bytes
    a, b = max(0, loud[0] - int(margin * sr)), min(n, loud[-1] + hop + int(margin * sr))
    buf = io.BytesIO(); o = wave.open(buf, "wb"); o.setnchannels(1); o.setsampwidth(2); o.setframerate(sr); o.writeframes(pcm[a * 2:b * 2]); o.close()
    return buf.getvalue()


def _hangul(x):
    return re.sub(r"[^가-힣]", "", x)


def synth(text, voice, direction, model="gemini-3.8-flash-tts", tries=5, log=None):
    """연기 지시를 읽지 않았는지·대사를 빠뜨리지 않았는지 받아쓰기로 확인. 가장 잘 맞는 것을 돌려줌."""
    best = None
    for k in range(tries):
        wav = trim(synth_once(text, voice, direction, model))
        w = wave.open(io.BytesIO(wav)); dur = w.getnframes() / w.getframerate()
        heard = transcribe(wav)
        sim = difflib.SequenceMatcher(None, _hangul(text), _hangul(heard)).ratio()
        ok_len = dur < 1.6 + 0.3 * len(_hangul(text))
        score = sim - (0 if ok_len else 1)
        if best is None or score > best[0]:
            best = (score, wav, heard, k + 1)
        if sim >= 0.85 and ok_len:
            break
    if log is not None:
        log.append({"text": text, "heard": best[2], "score": round(best[0], 2), "tries": best[3]})
    return best[1]
