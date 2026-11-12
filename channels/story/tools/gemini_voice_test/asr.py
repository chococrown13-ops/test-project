import json,base64,urllib.request,sys
def asr(path, model="gemini-2.5-flash"):
    data=base64.b64encode(open(path,'rb').read()).decode()
    body={"contents":[{"parts":[{"inlineData":{"mimeType":"audio/wav","data":data}},{"text":"이 오디오에서 들리는 말을 한국어로 그대로 받아 적어 주세요. 받아쓴 글만 출력."}]}]}
    req=urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    import time
    for i in range(5):
        try:
            r=json.load(urllib.request.urlopen(req,timeout=180)); return r["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            if i==4: raise
            time.sleep(5*(i+1))
if __name__=="__main__":
    for p in sys.argv[1:]: print(p, '→', asr(p))
