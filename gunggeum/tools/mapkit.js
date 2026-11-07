// 도시의 나이테 · 실제 지도 바탕 그리기 도구 (2026-11-07 대표: "지도를 사람들이 알아보기 쉽게")
// basemap.py 가 만든 map/ 폴더(basemap.png · inset.png · map.js)를 편 페이지에서 불러 쓴다.
//   <script src="map/map.js"></script>
//   <script src="../../tools/mapkit.js"></script>
//   const M = await MapKit.load("map/");           // { base, inset, meta }
//   MapKit.drawBase(g, M, { tone: "paper" })       // 월드 좌표(바탕 지도 픽셀) 안에서 그리기
//   const P = MapKit.place(M, "호구포역")            // {x, y} (월드 좌표)
//   MapKit.area(M, "남동국가산업단지")                // [[x, y], …] 테두리
//   화면 좌표로 바꾸는 함수(toScreen)는 편 페이지의 카메라가 정함 → pin/label 에 넘김
//
// 알아보기 쉬운 지도 규칙 (city-line 스킬 「지도 규칙」과 같음)
//  1. 실제 지도 위에서 시작: 첫 장면은 "지금" 지도 + 아는 이름표 2~3개(역·다리·공원) + 전국 위치 작은 지도
//  2. 옛 모습은 같은 지도 위에 겹쳐서(반투명) — 같은 자리라는 게 보이게. 지어낸 강·해안선 모양 금지
//  3. 늘 보이는 것: 북쪽 화살표 · 축척 막대 · 이름표 · "지도 © OpenStreetMap"
//  4. 색 뜻 고정: 물=파랑 · 옛 바다/개펄=청록 빗금 · 염전=흰 칸 · 공장=회색 · 아파트=주황 · 주인공 동네=노랑 테두리
(function () {
  const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("지도 그림을 못 읽었어요: " + src)); i.src = src; });

  const TONES = {
    plain: "none",
    paper: "grayscale(1) sepia(.35) brightness(1.08) contrast(.82)",   // 옛날 느낌 (누런 종이)
    light: "grayscale(.85) brightness(1.1) contrast(.85)",            // 지금 (차분한 바탕, 우리 색이 돋보이게)
    night: "grayscale(1) invert(.88) brightness(.9) contrast(1.05)",   // 밤
  };

  const MapKit = {
    COLORS: { water: "#3d8fd6", oldSea: "#2aa7a0", salt: "#ffffff", factory: "#8a8f98", apt: "#f29b38", hero: "#ffd54a", ink: "#14202e" },

    async load(dir) {
      const meta = window.MAP_META;
      if (!meta) throw new Error("map/map.js 를 먼저 불러 주세요 (basemap.py 로 만듦)");
      // map.js 에 그림이 글자(data URL)로 들어 있으면 그걸 씀 — file:// 에서도 캔버스를 영상으로 뽑을 수 있게
      const base = await loadImg(meta.baseData || dir + "basemap.png");
      const inset = meta.inset ? await loadImg(meta.insetData || dir + meta.inset.file) : null;
      return { base, inset, meta };
    },

    place(M, name) {
      const p = M.meta.places.find((q) => q.name === name);
      if (!p) throw new Error("map.json 에 없는 장소: " + name);
      return { x: p.x, y: p.y };
    },
    area(M, name) {
      const a = M.meta.areas.find((q) => q.name === name);
      if (!a) throw new Error("map.json 에 없는 경계: " + name);
      return a.rings[0];
    },
    // 위도·경도 → 바탕 지도 픽셀 (map.json 의 원점 기준)
    ll(M, lat, lon) {
      const n = 256 * Math.pow(2, M.meta.zoom), s = Math.sin(lat * Math.PI / 180);
      return { x: (lon + 180) / 360 * n - M.meta.origin[0], y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - M.meta.origin[1] };
    },

    // 바탕 지도 (월드 좌표계에서 호출). tone: plain|paper|light|night, 또는 두 톤을 섞을 때 {from, to, u}
    drawBase(g, M, opt = {}) {
      const draw = (tone, alpha) => { if (alpha <= 0) return; g.save(); g.globalAlpha = alpha; g.filter = TONES[tone] || tone || "none"; g.drawImage(M.base, 0, 0); g.restore(); };
      if (opt.mix) { draw(opt.mix.from, 1); draw(opt.mix.to, opt.mix.u); } else draw(opt.tone || "light", 1);
      if (opt.veil) { g.save(); g.fillStyle = opt.veil; g.fillRect(0, 0, M.meta.w, M.meta.h); g.restore(); }
    },

    // 테두리 채우기/선 (월드 좌표). hatch: 빗금(옛 바다·개펄처럼 "대략"인 곳)
    poly(g, ring, { fill, stroke, width = 6, alpha = 1, hatch, dash } = {}) {
      if (!ring || ring.length < 3 || alpha <= 0) return;
      g.save(); g.globalAlpha = alpha; g.beginPath(); ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (hatch) {
        g.save(); g.clip(); const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        g.strokeStyle = hatch; g.lineWidth = 3;
        for (let k = x0 - (y1 - y0); k < x1; k += 22) { g.beginPath(); g.moveTo(k, y0); g.lineTo(k + (y1 - y0), y1); g.stroke(); }
        g.restore();
      }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; if (dash) g.setLineDash(dash); g.stroke(); }
      g.restore();
    },

    // ---- 화면 좌표(카메라 밖)에서 그리는 것들 ----
    // 이름표: 점 + 말풍선. kind: "place"(검정) | "hero"(노랑, 주인공) | "old"(청록, 옛 이름)
    pin(g, x, y, text, { alpha = 1, kind = "place", size = 36, dy = -64 } = {}) {
      if (alpha <= 0) return;
      const C = { place: ["rgba(20,32,46,.9)", "#fff"], hero: ["#ffd54a", "#1b1430"], old: ["#1f8f8a", "#fff"] }[kind];
      g.save(); g.globalAlpha = alpha; g.font = `800 ${size}px P`; g.textAlign = "center"; g.textBaseline = "middle";
      const w = g.measureText(text).width + size * 0.9, h = size * 1.5, bx = x - w / 2, by = y + dy - h / 2;
      g.strokeStyle = C[0]; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, by + h); g.stroke();
      g.fillStyle = C[0]; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 3; g.stroke();
      MapKit._round(g, bx, by, w, h, h / 2); g.fillStyle = C[0]; g.fill();
      g.fillStyle = C[1]; g.fillText(text, x, by + h / 2 + 1); g.restore();
    },
    // 넓은 곳 이름 (바다·강·동네) — 테두리 있는 큰 글씨
    label(g, x, y, text, { alpha = 1, size = 52, color = "#fff", outline = "rgba(10,20,35,.85)" } = {}) {
      if (alpha <= 0) return;
      g.save(); g.globalAlpha = alpha; g.font = `800 ${size}px P`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.strokeStyle = outline; g.lineWidth = size * 0.22; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y); g.restore();
    },
    // 북쪽 화살표
    north(g, x, y, { alpha = 1, r = 34 } = {}) {
      g.save(); g.globalAlpha = alpha; g.translate(x, y);
      g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      g.fillStyle = "#e0453a"; g.beginPath(); g.moveTo(0, -r * .78); g.lineTo(r * .36, r * .1); g.lineTo(-r * .36, r * .1); g.closePath(); g.fill();
      g.fillStyle = "#14202e"; g.beginPath(); g.moveTo(0, r * .78); g.lineTo(r * .36, r * .1); g.lineTo(-r * .36, r * .1); g.closePath(); g.fill();
      g.font = `800 ${r * .6}px P`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#14202e"; g.fillText("N", 0, -r - 18); g.restore();
    },
    // 축척 막대: zoom = 지금 카메라 배율(바탕 지도 1px → 화면 몇 px)
    scale(g, M, x, y, zoom, { alpha = 1 } = {}) {
      const mpp = M.meta.metersPerPx / zoom, nice = [100, 200, 500, 1000, 2000, 5000];
      const m = nice.find((v) => v / mpp >= 140) || 5000, w = m / mpp;
      g.save(); g.globalAlpha = alpha; g.fillStyle = "rgba(255,255,255,.92)"; MapKit._round(g, x - 14, y - 40, w + 28, 64, 14); g.fill();
      g.fillStyle = "#14202e"; g.fillRect(x, y, w, 8); g.fillRect(x, y - 8, 4, 16); g.fillRect(x + w - 4, y - 8, 4, 16);
      g.font = "800 26px P"; g.textAlign = "center"; g.fillText(m >= 1000 ? m / 1000 + "km" : m + "m", x + w / 2, y - 14); g.restore();
    },
    // 전국 위치 작은 지도
    inset(g, M, x, y, w, { alpha = 1, t = 0, label = "" } = {}) {
      if (!M.inset || alpha <= 0) return;
      const I = M.meta.inset, h = w * I.h / I.w, k = w / I.w;
      g.save(); g.globalAlpha = alpha; MapKit._round(g, x - 6, y - 6, w + 12, h + 12, 16); g.fillStyle = "#fff"; g.fill();
      g.save(); MapKit._round(g, x, y, w, h, 12); g.clip(); g.filter = TONES.light; g.drawImage(M.inset, x, y, w, h); g.restore();
      const px = x + I.x * k, py = y + I.y * k, pulse = 1 + 0.25 * Math.sin(t * 5);
      g.fillStyle = "rgba(224,69,58,.25)"; g.beginPath(); g.arc(px, py, 22 * pulse, 0, 7); g.fill();
      g.fillStyle = "#e0453a"; g.beginPath(); g.arc(px, py, 9, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 3; g.stroke();
      if (label) { g.font = "800 24px P"; g.textAlign = "center"; g.fillStyle = "#14202e"; g.fillText(label, x + w / 2, y + h + 34); }
      g.restore();
    },
    // 범례 한 줄: [[색, "뜻", "hatch"?], …]
    legend(g, x, y, items, { alpha = 1 } = {}) {
      if (alpha <= 0) return;
      g.save(); g.globalAlpha = alpha; g.font = "700 26px P"; g.textBaseline = "middle";
      let cx = x; const ws = items.map(([, t]) => g.measureText(t).width + 64), total = ws.reduce((a, b) => a + b, 0) + 12;
      g.fillStyle = "rgba(255,255,255,.92)"; MapKit._round(g, x - 14, y - 26, total + 4, 52, 14); g.fill();
      items.forEach(([c, t, hatch], i) => {
        g.fillStyle = c; g.fillRect(cx, y - 12, 32, 24);
        if (hatch) { g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 2; for (let k = -24; k < 32; k += 8) { g.beginPath(); g.moveTo(cx + Math.max(0, k), y - 12 + Math.max(0, -k)); g.lineTo(cx + Math.min(32, k + 24), y + 12 - Math.max(0, k + 24 - 32)); g.stroke(); } }
        g.fillStyle = "#14202e"; g.fillText(t, cx + 40, y + 1); cx += ws[i];
      });
      g.restore();
    },
    credit(g, M, W, H, { alpha = 1, extra = "" } = {}) {
      g.save(); g.globalAlpha = alpha; g.font = "600 24px P"; g.textAlign = "right"; g.textBaseline = "alphabetic";
      const t = M.meta.attribution + (extra ? " · " + extra : "");
      g.lineWidth = 5; g.strokeStyle = "rgba(0,0,0,.55)"; g.strokeText(t, W - 28, H - 28); g.fillStyle = "rgba(255,255,255,.9)"; g.fillText(t, W - 28, H - 28); g.restore();
    },
    _round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); },
  };
  window.MapKit = MapKit;
})();
