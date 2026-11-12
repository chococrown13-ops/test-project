import json,base64,urllib.request,urllib.error,wave,sys,time
def tts(text, voice, direction, model="gemini-3.8-flash-tts", out="x.wav"):
    prompt = f"{direction}\n\n{text}" if direction else text
    body={"contents":[{"parts":[{"text":prompt}]}],
          "generationConfig":{"responseModalities":["AUDIO"],"speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":voice}}}}}
    url=f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    for i in range(4):
        try:
            with urllib.request.urlopen(req,timeout=180) as r: res=json.load(r)
            part=res["candidates"][0]["content"]["parts"][0]["inlineData"]
            raw=base64.b64decode(part["data"]); mt=part.get("mimeType","")
            if raw[:4]==b"RIFF": open(out,"wb").write(raw)
            else:
                rate=int(mt.split("rate=")[-1].split(";")[0]) if "rate=" in mt else 24000
                w=wave.open(out,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(raw); w.close()
            w=wave.open(out); return round(w.getnframes()/w.getframerate(),2), mt
        except urllib.error.HTTPError as e:
            msg=e.read()[:400].decode('utf8','replace')
            if e.code==429 and i<3: time.sleep(20*(i+1)); continue
            return f"HTTP {e.code} {msg}"
if __name__=="__main__":
    print(tts("2분 남았다… 이번에도 늦으면 평점 깎인다!","Puck","다음 대사를 한국어로 연기하세요. 비 오는 밤, 시간에 쫓기는 20대 배달 기사가 킥보드를 타며 다급하게 혼잣말합니다. 자연스러운 서울 말투로.", out="vt/g1.wav"))
