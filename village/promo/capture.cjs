// 겨울 소원마을 홍보 쇼츠 촬영: 로컬 서버(wrangler dev)의 실제 화면을 가상 시계로 한 프레임씩 찍는다.
// 사용법: node capture.cjs <프레임 폴더>   (먼저 village 폴더에서 npx wrangler dev --port 8787)
// 화면 속 눈사람은 "나" 하나와 마을 장식 인형뿐 — 방문자를 꾸며 넣지 않는다.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path");
const OUT = process.argv[2], FPS = 24, N = 30 * FPS, URL = "http://127.0.0.1:8787/?capture";
// 11월 3일 밤 9시 반(한국 시간) — 트리 점등 중
const BASE = Date.UTC(2026, 10, 3, 12, 30);
const rnd = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const hashStr = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function giftPos(v, day) { const r = rnd(hashStr(v + day)), out = []; for (let i = 0; i < 3; i++) { let x, z; do { const a = r() * Math.PI * 2, d = 5 + r() * 9; x = Math.cos(a) * d; z = Math.sin(a) * d - 3; } while (Math.hypot(x, z + 7) < 3.5); out.push({ x, z }); } return out; }
const CAPS = [
  [0, 3.2, "AI한테<br>산타마을 만들어 달라고 했더니"],
  [3.2, 7, "눈사람이 되어<br>마을을 걸어 다녀요"],
  [7, 11.5, "트리에 소원을 달면<br>반짝이 장식이 돼요"],
  [11.5, 16, "선물을 열면<br>꾸미기 아이템이 랜덤으로"],
  [16, 21, "미니게임 「눈덩이 피하기」<br>주간 1등은 한정 왕관"],
  [21, 28.5, "해맞이마을에선<br>새해 첫 해돋이"],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("pageerror", e.message));
  await p.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ body: "", contentType: "text/css" }));
  await p.addInitScript((BASE) => {
    window.__vt = 0; const realNow = Date.now.bind(Date);
    performance.now = () => window.__vt; Date.now = () => BASE + window.__vt;
    const RD = Date; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(BASE + window.__vt); } static now() { return BASE + window.__vt; } };
    window.__rafs = []; window.requestAnimationFrame = (cb) => { window.__rafs.push(cb); return window.__rafs.length; };
    const st = window.setTimeout.bind(window), q = [];
    window.setTimeout = (fn, ms = 0, ...a) => { if (ms >= 300) { q.push({ at: window.__vt + ms, fn: () => fn(...a) }); return 1e6 + q.length; } return st(fn, ms, ...a); };
    window.__step = (ms) => { window.__vt += ms; for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= window.__vt) { const f = q.splice(i, 1)[0]; try { f.fn(); } catch {} } const fs = window.__rafs; window.__rafs = []; fs.forEach((f) => f(window.__vt)); };
  }, BASE);
  await p.goto(URL); await p.waitForTimeout(1500);
  for (let i = 0; i < 20; i++) await p.evaluate(() => window.__step(16));
  await p.fill("#nick-input", "눈사람" + Math.floor(10 + Math.random() * 89)).catch(() => {});
  await p.click("text=마을로 들어가기").catch(() => {});
  await p.waitForTimeout(1500);
  await p.addStyleTag({ content: `#cap{position:fixed;left:0;right:0;top:118px;text-align:center;font:800 38px/1.25 "Pretendard","Noto Sans KR",sans-serif;color:#fff;text-shadow:0 0 1px #000,0 3px 0 #1a1030,0 0 14px rgba(0,0,0,.6);pointer-events:none;z-index:20;padding:0 18px}
    #endcard{position:fixed;inset:0;display:grid;place-content:center;gap:14px;text-align:center;background:rgba(10,16,40,.78);color:#fff;z-index:30;font:800 46px/1.2 "Pretendard",sans-serif}
    #endcard small{font:600 26px/1.4 "Pretendard",sans-serif;color:#ffe08a} .hint{display:none!important}` });
  const font = fs.readFileSync("/home/user/test-project/gunggeum/tools/fonts/Pretendard-ExtraBold.otf").toString("base64");
  await p.addStyleTag({ content: `@font-face{font-family:Pretendard;font-weight:800;src:url(data:font/otf;base64,${font})}@font-face{font-family:Pretendard;font-weight:600;src:url(data:font/otf;base64,${font})}` });
  await p.evaluate(() => { const d = document.createElement("div"); d.id = "cap"; document.body.append(d); });
  for (let i = 0; i < 30; i++) await p.evaluate(() => window.__step(1000 / 24));
  const day = "2026-11-03", gifts = giftPos("santa", day);
  // 화면 좌표로 바꾸기
  const toScreen = (x, z) => p.evaluate(([x, z]) => window.__toScreen ? window.__toScreen(x, z) : null, [x, z]);
  const walkTo = (x, z) => p.evaluate(([x, z]) => { window.__me.tx = x; window.__me.tz = z; }, [x, z]);
  const tapWorld = async (x, z) => { const s = await toScreen(x, z); if (s) { await p.mouse.move(s[0], s[1]); await p.mouse.down(); await p.mouse.up(); } };
  const g0 = gifts.filter((g) => g.z > -9).sort((a, b2) => Math.hypot(a.x, a.z + 3.4) - Math.hypot(b2.x, b2.z + 3.4))[0] || gifts[0];
  const T = { timeout: 3000 };
  const events = [
    [3.4, () => tapWorld(0, -3.4)],
    [7.2, () => p.click("#m-wish", T)],
    [8.4, () => p.click("text=행복한 크리스마스", T)],
    [9.4, () => p.click("#sheet .btn:not(.ghost)", T)],
    [11.6, () => walkTo(g0.x, g0.z)],
    [14.8, () => p.click("text=바로 써 보기", T).catch(() => p.click("#sheet .btn", T))],
    [15.8, () => p.click("text=눈덩이 피하기 · 이번 주", T)],
    [16.6, () => p.click('#gpanel button:text-is("시작")', T)],
    ...[17.0, 17.5, 18.0, 18.5, 19.0, 19.5, 20.0, 20.5].map((tt, i) => [tt, () => p.mouse.move(540 * (i % 2 ? 0.22 : 0.78) / 2 + 135, 860, { steps: 3 })]),
    [21.0, async () => { await p.evaluate(() => window.__closeGame()); await p.click(".chip.hot", T); await p.waitForTimeout(200); await p.click("text=해맞이마을", T); }],
    [21.6, () => tapWorld(0, -8.4)],
    [25.8, () => p.click("text=해돋이 보기", T)],
  ];
  let ei = 0;
  for (let f = 0; f < N; f++) {
    const t = f / FPS;
    while (ei < events.length && events[ei][0] <= t) { await events[ei][1]().catch((e) => console.error("event", events[ei][0], e.message)); ei++; await p.waitForTimeout(250); }
    const cap = CAPS.find(([a, b2]) => t >= a && t < b2);
    await p.evaluate(([html, end]) => {
      document.getElementById("cap").innerHTML = html || "";
      let ec = document.getElementById("endcard");
      if (end && !ec) { ec = document.createElement("div"); ec.id = "endcard"; ec.innerHTML = "겨울 소원마을<small>지금 미리 열렸어요 · 매일 밤 8시 트리 점등식<br>눈덩이 피하기 1등은 한정 왕관 · 링크는 프로필에</small>"; document.body.append(ec); }
    }, [cap ? cap[2] : "", t >= 28.5]);
    await p.evaluate(() => window.__step(1000 / 24));
    await p.screenshot({ path: path.join(OUT, String(f).padStart(4, "0") + ".jpg"), type: "jpeg", quality: 86 });
    if (f % 120 === 0) console.log("frame", f);
  }
  await b.close(); console.log("done");
})();
