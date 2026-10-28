#!/usr/bin/env node
// 인스타 카드뉴스(캐러셀) 만들기 — card.json 한 개로 1080×1350 PNG 여러 장을 그린다. 돈이 안 든다.
//
// 글자는 코드로 얹고(AI 그림에 글자를 넣으면 깨짐), 해달은 brand/ 의 3D 이미지(scenes·profile)를 다시 쓴다.
// 카드마다 따로 만든 그림이 있으면 slide.image 에 경로를 적는다(카드 폴더 기준).
//
// 사용법:
//   node gunggeum/tools/make_cards.mjs gunggeum/cards/k01/card.json        # → gunggeum/cards/k01/out/01.png …
//
// card.json:
//   { "title": "퇴직금, 언제까지 받아야 할까?", "corner": "💰 궁금해달 돈 수첩", "date": "2026-10-28",
//     "slides": [
//       { "type": "cover", "hook": "퇴직금,\n**14일 안에** 안 주면?", "sub": "받을 사람·기한·시효 한 번에", "image": "../../brand/scenes/intro.jpg" },
//       { "type": "point", "no": 1, "heading": "언제까지?", "text": "퇴직한 날부터 **14일 안**에 줘야 해요.", "note": "서로 합의하면 늦출 수 있어요" },
//       { "type": "list", "heading": "받을 수 있는 사람", "items": ["1년 이상 일했어요", "일주일에 15시간 이상 일했어요"], "check": true },
//       { "type": "table", "heading": "한눈에", "rows": [["지급 기한", "퇴직 후 14일"], ["청구 시효", "3년"]] },
//       { "type": "end", "summary": "…", "sources": ["고용노동부 …"], "ask": "주변에 퇴사 앞둔 친구가 있다면 공유해 주세요" } ] }
//   글자 안의 **굵게** 는 노란 형광펜, 줄바꿈은 \n.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// 프로젝트에 설치돼 있으면 그것을, 아니면 전역 설치본(클라우드 환경)을 쓴다
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs"));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "studio.config.json"), "utf8"));
const W = 1080, H = 1350;

const C = { paper: "#FFF8EA", ink: "#2B1B12", soft: "#6E5A4C", yellow: "#FFD54A", sky: "#8FD3F4", fur: "#4A2E1F", line: "#EADFC8" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// **굵게** → 형광펜, \n → 줄바꿈
const rich = (s) => esc(s ?? "").replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>").replace(/\n/g, "<br>");

function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function css() {
  const font = (w, f) => `@font-face{font-family:P;font-weight:${w};src:url(${pathToFileURL(path.join(HERE, "fonts", f)).href})}`;
  return `
  ${font(400, "Pretendard-Regular.otf")}${font(600, "Pretendard-SemiBold.otf")}${font(700, "Pretendard-Bold.otf")}${font(800, "Pretendard-ExtraBold.otf")}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;font-family:P,sans-serif;color:${C.ink};background:${C.paper};overflow:hidden;word-break:keep-all}
  .slide{position:relative;width:${W}px;height:${H}px;padding:96px 88px}
  .body{position:absolute;left:88px;right:88px;top:96px;bottom:300px;display:flex;flex-direction:column;justify-content:center}
  .cover .foot{color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.45)}
  mark{background:linear-gradient(transparent 55%, ${C.yellow} 55%);color:inherit;padding:0 4px}
  .corner{display:inline-block;font-weight:700;font-size:32px;padding:12px 26px;border-radius:999px;background:${C.sky};color:${C.ink}}
  .foot{position:absolute;left:88px;right:88px;bottom:56px;display:flex;justify-content:space-between;font-size:26px;font-weight:600;color:${C.soft}}
  .hook{font-weight:800;font-size:92px;line-height:1.22;margin-top:48px;letter-spacing:-2px}
  .sub{font-weight:600;font-size:40px;color:${C.soft};margin-top:28px}
  .hero{position:absolute;left:0;right:0;bottom:0;height:560px;background-size:cover;background-position:center 30%;
        -webkit-mask-image:linear-gradient(to bottom, transparent 0, #000 22%)}
  .no{font-weight:800;font-size:120px;color:${C.yellow};-webkit-text-stroke:3px ${C.fur};line-height:1}
  .heading{font-weight:800;font-size:78px;line-height:1.25;margin-top:24px;letter-spacing:-1.5px}
  .text{font-weight:600;font-size:60px;line-height:1.5;margin-top:48px}
  .note{font-weight:600;font-size:38px;line-height:1.45;color:${C.soft};margin-top:44px;padding-left:26px;border-left:8px solid ${C.sky}}
  .avatar{position:absolute;right:72px;bottom:120px;width:190px;height:190px;border-radius:50%;background-size:cover;background-position:center 20%;border:8px solid #fff;box-shadow:0 6px 20px rgba(0,0,0,.12)}
  ul{list-style:none;margin-top:48px}
  li{font-weight:600;font-size:52px;line-height:1.45;padding:28px 0 28px 92px;position:relative;border-bottom:3px dashed ${C.line}}
  li::before{content:"";position:absolute;left:0;top:38px;width:58px;height:58px;border-radius:14px;background:${C.yellow}}
  li.check::before{content:"✓";text-align:center;font-weight:800;font-size:42px;line-height:58px;color:${C.fur}}
  li.num::before{content:attr(data-n);text-align:center;font-weight:800;font-size:36px;line-height:58px;color:${C.fur};border-radius:50%}
  table{width:100%;border-collapse:collapse;margin-top:48px;font-size:48px}
  td{padding:34px 20px;border-bottom:3px solid ${C.line};font-weight:600;vertical-align:top}
  td:first-child{color:${C.soft};width:42%}
  td:last-child{font-weight:800}
  .end-sum{font-weight:800;font-size:58px;line-height:1.35;margin-top:40px}
  .ask{display:inline-block;margin-top:40px;font-weight:700;font-size:36px;background:${C.yellow};padding:16px 28px;border-radius:20px}
  .src{position:absolute;left:88px;right:88px;bottom:120px;font-size:25px;line-height:1.5;color:${C.soft};font-weight:400}
  .src b{font-weight:700}
  .end-img{position:absolute;right:56px;top:420px;width:330px;height:430px;border-radius:40px;background-size:cover;background-position:center}
  `;
}

function slideHtml(card, s, i, n, dir) {
  const img = (p) => dataUri(path.resolve(dir, p));
  const brand = (p) => dataUri(path.join(ROOT, "brand", p));
  const foot = `<div class="foot"><span>${esc(CONFIG.handle || "@otter.curious")}</span><span>${i}/${n}</span></div>`;
  const corner = `<div class="corner">${esc(card.corner || "궁금해달")}</div>`;
  const avatar = s.avatar === false ? "" : `<div class="avatar" style="background-image:url(${s.avatar ? img(s.avatar) : brand("profile/a_turquoise.jpg")})"></div>`;
  switch (s.type) {
    case "cover":
      return `<div class="slide cover">${corner}<div class="hook">${rich(s.hook)}</div>${s.sub ? `<div class="sub">${rich(s.sub)}</div>` : ""}
        <div class="hero" style="background-image:url(${s.image ? img(s.image) : brand("scenes/intro.jpg")})"></div>${foot}</div>`;
    case "point":
      return `<div class="slide"><div class="body"><div class="no">${String(s.no ?? i - 1).padStart(2, "0")}</div><div class="heading">${rich(s.heading)}</div>
        <div class="text">${rich(s.text)}</div>${s.note ? `<div class="note">${rich(s.note)}</div>` : ""}</div>${avatar}${foot}</div>`;
    case "list":
      return `<div class="slide"><div class="body"><div class="heading">${rich(s.heading)}</div><ul>${(s.items || [])
        .map((t, k) => `<li class="${s.check ? "check" : "num"}" data-n="${k + 1}">${rich(t)}</li>`).join("")}</ul>
        ${s.note ? `<div class="note">${rich(s.note)}</div>` : ""}</div>${avatar}${foot}</div>`;
    case "table":
      return `<div class="slide"><div class="body"><div class="heading">${rich(s.heading)}</div><table>${(s.rows || [])
        .map((r) => `<tr><td>${rich(r[0])}</td><td>${rich(r[1])}</td></tr>`).join("")}</table>
        ${s.note ? `<div class="note">${rich(s.note)}</div>` : ""}</div>${avatar}${foot}</div>`;
    case "end":
      return `<div class="slide">${corner}<div class="end-sum" style="max-width:560px">${rich(s.summary)}</div>
        ${s.ask ? `<div class="ask">${rich(s.ask)}</div>` : ""}
        <div class="end-img" style="background-image:url(${s.image ? img(s.image) : brand("scenes/outro.jpg")})"></div>
        <div class="src"><b>출처</b> ${(s.sources || []).map(esc).join(" · ")}<br><b>기준일</b> ${esc(card.date || "")} · 사람마다 다를 수 있어요, 공식 사이트에서 확인하세요.<br>해달 그림은 AI로 만들었어요.</div>${foot}</div>`;
    default:
      throw new Error(`모르는 카드 종류: ${s.type}`);
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("사용법: node gunggeum/tools/make_cards.mjs <card.json>");
    process.exit(1);
  }
  const dir = path.dirname(path.resolve(file));
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = path.join(dir, "out");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const n = card.slides.length;
  for (let k = 0; k < n; k++) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>${slideHtml(card, card.slides[k], k + 1, n, dir)}</body></html>`;
    const tmp = path.join(out, "_slide.html");
    fs.writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(() => document.fonts.ready);
    const png = path.join(out, `${String(k + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: png });
    console.log(`  ${png}`);
  }
  fs.rmSync(path.join(out, "_slide.html"), { force: true });
  await browser.close();
  console.log(`카드 ${n}장 완성 → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
