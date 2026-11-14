import json,base64,urllib.request,urllib.error,sys,time
def gen(prompt, out, images=(), model="gemini-2.5-flash-image", aspect=None):
    parts=[{"inlineData":{"mimeType":"image/png","data":base64.b64encode(open(p,'rb').read()).decode()}} for p in images]+[{"text":prompt}]
    cfg={"responseModalities":["IMAGE","TEXT"]}
    if aspect: cfg["imageConfig"]={"aspectRatio":aspect}
    body={"contents":[{"parts":parts}],"generationConfig":cfg}
    req=urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",data=json.dumps(body).encode(),headers={"Content-Type":"application/json"})
    for i in range(4):
        try:
            r=json.load(urllib.request.urlopen(req,timeout=240))
            for p in r["candidates"][0]["content"]["parts"]:
                if "inlineData" in p: open(out,"wb").write(base64.b64decode(p["inlineData"]["data"])); return out
            return "NOIMG "+str(r)[:300]
        except urllib.error.HTTPError as e:
            m=e.read()[:300]
            if e.code in (429,500,503) and i<3: time.sleep(15*(i+1)); continue
            return f"HTTP {e.code} {m}"
if __name__=="__main__":
    print(gen(sys.argv[1], sys.argv[2], sys.argv[3:], aspect="9:16"))
