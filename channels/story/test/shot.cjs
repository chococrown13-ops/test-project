const { chromium } = require("/opt/node22/lib/node_modules/playwright"); const fs = require("fs"), path = require("path");
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => { console.error("ERR", e.message); process.exit(1); });
  await p.goto("file://" + path.resolve("index.html")); await p.evaluate(() => window.ready);
  for (const t of process.argv.slice(3).map(Number)) {
    const url = await p.evaluate((t) => { window.render(t); const c = document.getElementById("c");
      // 3D 그림 위에 자막을 얹어 한 장으로
      const o = document.createElement("canvas"); o.width = 1080; o.height = 1920; const g = o.getContext("2d"); g.drawImage(c, 0, 0);
      const l = window.LINES.find((q) => t >= q.a && t <= q.b);
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 0, 1080, 260); g.fillStyle = "#FFD54A"; g.font = "800 64px P"; g.textAlign = "center"; g.fillText("조선에 햄버거가 떨어진 날", 540, 150);
      if (l) { g.font = "800 58px P"; const w = g.measureText(l.text).width + 80; g.fillStyle = "rgba(0,0,0,.72)"; g.fillRect(540 - w / 2, 1470, w, 110); g.fillStyle = "#fff"; g.fillText(l.text, 540, 1545); }
      return o.toDataURL("image/jpeg", .9); }, t);
    fs.writeFileSync(path.join(process.argv[2], `s${t}.jpg`), Buffer.from(url.split(",")[1], "base64")); }
  await b.close(); })();
