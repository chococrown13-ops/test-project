// 썸네일(커버) 만들기 — 편 폴더의 index.html 장면 한 컷 위에 큰 제목을 얹어 1080×1920 JPG 로 저장.
// 사용법: node tools/make_thumb.cjs <편 폴더> <초> "<제목 1줄>|<제목 2줄>" "<작은 머리말>" <출력.jpg>
// 예:     node tools/make_thumb.cjs devlog/jamsil 11.7 "잠실은 원래|섬이었다" "원래 ○○이었다 #1" jamsil_thumb.jpg
// 글자는 가운데 1080×1440(인스타 격자 3:4)·1080×1080(정사각) 안에 들어가게 둔다 — 어느 플랫폼에서 잘려도 제목이 보임.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"), path = require("path");

(async () => {
  const [dir, t, title, kicker, out] = process.argv.slice(2);
  if (!out) {
    console.error('사용법: node make_thumb.cjs <편 폴더> <초> "<1줄>|<2줄>" "<머리말>" <출력.jpg>');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", (e) => { console.error("pageerror", e.message); process.exit(1); });
  await page.goto("file://" + path.resolve(dir, "index.html"));
  await page.evaluate(() => window.ready);
  const url = await page.evaluate(({ t, lines, kicker }) => {
    window.render(t);
    const c = document.getElementById("c"), g = c.getContext("2d");
    const W = c.width, H = c.height;
    // 위아래를 어둡게 해서 글자가 지도 위에서도 읽히게
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(8,14,24,0.88)");
    gr.addColorStop(0.42, "rgba(8,14,24,0.55)");
    gr.addColorStop(0.62, "rgba(8,14,24,0.05)");
    gr.addColorStop(0.86, "rgba(8,14,24,0.35)");
    gr.addColorStop(1, "rgba(8,14,24,0.8)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    // 머리말 알약
    g.font = "600 46px P";
    const kw = g.measureText(kicker).width + 64;
    g.fillStyle = "#f2c14e";
    g.beginPath();
    g.roundRect(W / 2 - kw / 2, 330, kw, 78, 39);
    g.fill();
    g.fillStyle = "#14202c";
    g.fillText(kicker, W / 2, 384);
    // 큰 제목 (두 줄까지, 너비에 맞춰 크기 조절)
    let size = 150;
    g.font = `800 ${size}px P`;
    while (size > 80 && Math.max(...lines.map((l) => g.measureText(l).width)) > W - 120) {
      size -= 6;
      g.font = `800 ${size}px P`;
    }
    lines.forEach((l, i) => {
      const y = 560 + i * size * 1.12;
      g.lineWidth = 14;
      g.strokeStyle = "rgba(8,14,24,0.9)";
      g.lineJoin = "round";
      g.strokeText(l, W / 2, y);
      g.fillStyle = i === lines.length - 1 ? "#f2c14e" : "#ffffff";
      g.fillText(l, W / 2, y);
    });
    // 채널 이름
    g.font = "600 44px P";
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.fillText("도시의 나이테", W / 2, 1600);
    return c.toDataURL("image/jpeg", 0.92);
  }, { t: Number(t), lines: title.split("|"), kicker });
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  await browser.close();
  console.log("saved", out);
})();
