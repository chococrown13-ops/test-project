// 사용법: node capture.cjs <출력 폴더> [미리보기 초들, 쉼표 | all] [편 폴더] [?주소 뒤 옵션] [시작:끝 프레임]  — 초를 주면 그 장면만, 없으면 전체(window.DUR초, 24fps)
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const out = process.argv[2], only = process.argv[3] && process.argv[3] !== "all" ? process.argv[3] : null;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", (e) => { console.error("pageerror", e.message); process.exit(1); });
  await page.goto("file://" + path.resolve(process.argv[4] || ".", "index.html") + (process.argv[5] || ""));
  await page.evaluate(() => window.ready);
  const dur = await page.evaluate(() => window.DUR || 30);
  const times = only ? only.split(",").map(Number) : Array.from({ length: Math.round(dur * 24) }, (_, i) => i / 24);
  // [7번째 인자] "시작:끝" 프레임 구간만 (카메라가 이전 프레임을 따라오므로 앞 72프레임은 그리기만 하고 저장 안 함)
  const [f0, f1] = !only && process.argv[6] ? process.argv[6].split(":").map(Number) : [0, times.length];
  for (let i = Math.max(0, f0 - 72); i < f0; i++) await page.evaluate((t) => window.render(t), times[i]);
  const t0 = Date.now();
  for (let i = only ? 0 : f0; i < (only ? times.length : Math.min(f1, times.length)); i++) {
    const url = await page.evaluate((t) => { window.render(t); return document.getElementById("c").toDataURL("image/jpeg", 0.96); }, times[i]);
    const name = only ? `t${times[i]}.jpg` : `${String(i).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(out, name), Buffer.from(url.split(",")[1], "base64"));
    if (i % 60 === 0) console.log(i, ((Date.now() - t0) / 1000).toFixed(1) + "s");
  }
  await browser.close();
  console.log("done", ((Date.now() - t0) / 1000).toFixed(1) + "s");
})();
