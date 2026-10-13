// 사무실 페이지(한 파일 HTML)를 가짜 claude 런타임으로 띄워 화면이 깨지지 않는지 본다. 0원, 실제 db·루틴은 건드리지 않음.
//   node ttaeng/tools/office_smoke.mjs <사무실.html>
// 결과: 한 줄씩 "✅|❌ 항목 — 설명", 마지막 줄 JSON {ok, fails}
import fs from "node:fs";
import path from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs"));
}

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error("사용법: node ttaeng/tools/office_smoke.mjs <사무실.html>");
  process.exit(2);
}
const html = fs.readFileSync(src, "utf8");
const page = html.trimStart().startsWith("<!doctype")
  ? html
  : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const tmp = path.join(path.dirname(path.resolve(src)), "_office_smoke.html");
fs.writeFileSync(tmp, page);

const results = [];
const check = (ok, name, detail = "") => results.push({ ok, name, detail });

const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
try {
  for (const vp of [{ width: 390, height: 844, label: "휴대폰" }, { width: 1280, height: 900, label: "PC" }]) {
    const p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.addInitScript(() => {
      const store = {
        strategy: { s1: { title: "점검용 회의", at: "2026-01-01T00:00:00Z", status: "결재 대기", agenda: [{ id: "A1", question: "점검 안건", recommend: "a", options: [{ key: "a", name: "선택 A" }, { key: "b", name: "선택 B" }] }] } },
        log: { l1: { at: "2026-01-01T00:00:00Z", who: "Claude", text: "점검용 기록" } },
        checks: {},
        files: {},
        episodes: {},
        reviews: {},
      };
      const coll = (name) => {
        const q = {
          orderBy: () => q, limit: () => q, where: () => q,
          onSnapshot: (f) => { setTimeout(() => f({ docs: Object.entries(store[name] || {}).map(([id, d]) => ({ id, data: () => d })) }), 0); return () => {}; },
          add: async () => {}, doc: (id) => doc(`${name}/${id}`),
        };
        return q;
      };
      const doc = (p) => {
        const [c, id] = p.split("/");
        return {
          set: async (d) => { (store[c] ||= {})[id] = d; },
          update: async (d) => { Object.assign((store[c] ||= {})[id] ||= {}, d); },
          delete: async () => { delete (store[c] || {})[id]; },
          onSnapshot: (f) => { setTimeout(() => f({ exists: !!(store[c] || {})[id], data: () => (store[c] || {})[id] }), 0); return () => {}; },
        };
      };
      window.__calls = [];
      const caps = {
        db: { collection: coll, doc },
        mcp: { callTool: async (_s, _t, i) => { window.__calls.push(i?.text); return {}; } },
        assets: { list: async () => ({ items: [], usage: { bytes: 0, maxBytes: 1 } }), upload: async () => ({}), delete: async () => {} },
        downloads: { save: async () => {} },
      };
      window.claude = { use: async (n) => caps[n] ?? null };
    });
    await p.goto("file://" + tmp);
    await p.waitForTimeout(1200);
    check(errors.length === 0, `${vp.label} 첫 화면 오류 없음`, errors.join(" / "));

    const nav = p.getByRole("button", { name: /대시보드/ }).first();
    if (await nav.count()) {
      await nav.click();
      await p.waitForTimeout(700);
    }
    for (const id of ["panel-strategy", "panel-auto", "panel-files"]) {
      check((await p.locator(`#${id}`).count()) > 0, `${vp.label} #${id} 보임`);
    }
    const text = await p.evaluate(() => document.body.innerText);
    check(!/궁금해달|해달|쇼츠/.test(text), `${vp.label} 이전 채널 글자 없음`);
    check(/땡그랑/.test(text), `${vp.label} 땡그랑 이름 보임`);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(wide <= 1, `${vp.label} 가로 스크롤 없음`, wide > 1 ? `${wide}px 넘침` : "");
    check(errors.length === 0, `${vp.label} 대시보드 오류 없음`, errors.join(" / "));
    await p.close();
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}

for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? " — " + r.detail : ""}`);
const fails = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ ok: fails === 0, fails }));
process.exit(fails ? 1 : 0);
