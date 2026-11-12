// 상황극 엔진 2 (2026-11-11) — 가로·세로 화면, 소리별 입 모양(Rhubarb), 팔 몸짓, 말할 때 출렁임.
// engine.js(샘플용)는 그대로 두고 시리즈 본편은 이걸 씀.
// 편 페이지: three.js → timeline.js(window.TL) → engine2.js
//   const S = Story.init({ w: 1920, h: 1080, title, sub, end: [...], bg });
//   const 김치 = Story.char({ type: 'jar', arms: true, ... });
//   window.render = (t) => S.render(t, { cast: {이름: char}, shot: (t, line) => ({ pos, look, fov, cut }), update })
// 대사 줄(timeline): { who, text, mood, gesture: wave|point|shrug|cheer|panic|hold|think, jump: true, cues: [[초, 'A'~'H'|'X']] }
(function () {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };
  const grad = (() => { const d = new Uint8Array([95, 175, 255]); const tx = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.needsUpdate = true; return tx; })();
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });
  const INK = new THREE.MeshBasicMaterial({ color: '#2a1f1a', side: THREE.BackSide });
  function outline(m, k = 1.06) { const o = new THREE.Mesh(m.geometry, INK); o.scale.setScalar(k); m.add(o); return m; }
  function mesh(geo, color, pos = [0, 0, 0], parent, { line = 1.05, shadow = true, mat } = {}) {
    const m = new THREE.Mesh(geo, mat || toon(color)); m.position.set(...pos); m.castShadow = shadow; m.receiveShadow = true;
    if (line) outline(m, line); if (parent) parent.add(m); return m;
  }

  // ---- 얼굴: 눈·눈썹·볼 + 소리별 입 모양 ----
  // Rhubarb 모양: A 다문 입(ㅁㅂㅍ) · B 살짝 · C 중간(ㅔ) · D 크게(ㅏ) · E 둥글게(ㅗ) · F 오므림(ㅜ) · G 윗니(ㅍ/f) · H 혀(ㄹ) · X 쉼
  const SHAPE = { A: [18, 2, 0], B: [20, 7, 0], C: [24, 14, 0], D: [26, 24, 0], E: [17, 17, 1], F: [11, 10, 1], G: [22, 8, 2], H: [22, 14, 3], X: [0, 0, 0] };
  function face(size = 1) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.scale(2, 2); // 2배 해상도(좌표는 256 기준)
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    tex.anisotropy = 4;
    let last = '';
    function draw({ shape = 'X', blink = false, mood = 'normal', look = 0 } = {}) {
      const key = `${shape}|${blink}|${mood}|${look.toFixed(2)}|${api.bg}`; if (key === last) return; last = key;
      g.clearRect(0, 0, 256, 256); if (api.bg) { g.fillStyle = api.bg; g.beginPath(); g.roundRect ? g.roundRect(0, 0, 256, 256, 40) : g.rect(0, 0, 256, 256); g.fill(); }
      g.fillStyle = 'rgba(255,110,110,.35)'; g.beginPath(); g.ellipse(62, 150, 22, 13, 0, 0, 7); g.ellipse(194, 150, 22, 13, 0, 0, 7); g.fill();
      const ey = 112, big = mood === 'surprised' || mood === 'scared' ? 1.35 : 1, lx = look * 8;
      for (const x of [86, 170]) {
        g.fillStyle = '#1b1410'; g.strokeStyle = '#1b1410';
        if (blink || mood === 'happy' || mood === 'proud') { g.lineWidth = 7; g.beginPath(); g.arc(x, ey + 6, 13, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
        else if (mood === 'tired') g.fillRect(x - 15, ey, 30, 7);
        else { g.beginPath(); g.ellipse(x + lx, ey, 11 * big, 15 * big, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + lx + 4, ey - 6, 4.5, 0, 7); g.fill(); }
      }
      if (mood === 'scared' || mood === 'cry') { g.fillStyle = '#8fd3ff'; g.beginPath(); g.ellipse(196, 140, 6, 12, 0, 0, 7); g.fill(); }
      g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = '#2b2018';
      const B = { normal: [0, 0], surprised: [-14, -14], scared: [10, -14], worried: [8, -10], smug: [-6, 6], proud: [-8, -2], happy: [-4, -4], tired: [4, 4], angry: [-10, 10], cry: [10, -12] }[mood] || [0, 0];
      g.beginPath(); g.moveTo(66, 80 + B[0]); g.lineTo(104, 76 + B[1]); g.moveTo(152, 76 + B[1]); g.lineTo(190, 80 + B[0]); g.stroke();
      // 입
      const [w, h, kind] = SHAPE[shape] || SHAPE.X;
      if (shape === 'X' || shape === 'A') {
        g.strokeStyle = '#6e2525'; g.lineWidth = 6; g.beginPath();
        if (mood === 'happy' || mood === 'smug' || mood === 'proud') g.arc(128, 164, 22, 0.2 * Math.PI, 0.8 * Math.PI);
        else if (mood === 'worried' || mood === 'tired' || mood === 'cry' || mood === 'scared') g.arc(128, 196, 18, 1.2 * Math.PI, 1.8 * Math.PI);
        else if (mood === 'surprised') g.ellipse(128, 180, 10, 13, 0, 0, 7);
        else { g.moveTo(110, 178); g.lineTo(146, 178); }
        g.stroke();
      } else {
        g.fillStyle = '#6e2525'; g.beginPath(); g.ellipse(128, 178, w, h, 0, 0, 7); g.fill();
        if (kind === 2) { g.fillStyle = '#fff'; g.fillRect(128 - w * 0.7, 178 - h, w * 1.4, h * 0.8); }
        else if (kind === 3) { g.fillStyle = '#ff8c8c'; g.beginPath(); g.ellipse(128, 178 - h * 0.2, w * 0.55, h * 0.45, 0, 0, 7); g.fill(); }
        else if (h > 10) { g.fillStyle = '#ff8c8c'; g.beginPath(); g.ellipse(128, 178 + h * 0.45, w * 0.55, h * 0.35, 0, 0, Math.PI); g.fill(); }
      }
      tex.needsUpdate = true;
    }
    const api = { plane, draw, bg: null }; draw(); return api;
  }

  // ---- 캐릭터: 몸통 종류 + (선택) 팔 ----
  const BODY = {
    jar: { y: 0.75, half: 0.64, faceZ: 0.63, faceY: 0.15, shoulder: 0.1 },
    carton: { y: 0.95, half: 0.5, faceZ: 0.485, faceY: 0.18, shoulder: 0.0 },
    egg: { y: 0.72, half: 0.5, faceZ: 0.5, faceY: 0.05, shoulder: -0.05 },
    tofu: { y: 0.42, half: 0.62, faceZ: 0.42, faceY: 0.0, shoulder: -0.05 },
    bottle: { y: 0.82, half: 0.45, faceZ: 0.43, faceY: 0.05, shoulder: 0.0 },
    human: { y: 1.95, half: 0.45, faceZ: 0.47, faceY: -0.04, shoulder: 0 },   // 팔은 몸통(g)에 붙음
    bell: { y: 0, half: 0.3, faceZ: 0.33, faceY: -0.02, shoulder: 0 },          // 떠다니는 종 정령(댕이)
  };
  function char(opt) {
    const g = new THREE.Group(); g.position.set(...(opt.pos || [0, 0, 0]));
    const head = new THREE.Group(); g.add(head);
    const type = opt.type, B = BODY[type];
    head.position.y = B.y;
    if (type === 'jar') {
      mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 32), opt.color, [0, 0, 0], head, { mat: toon(opt.color, { transparent: true, opacity: 0.45 }) });
      mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.22, 32), opt.lid, [0, 0.74, 0], head);
      mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.75, 32), opt.inner, [0, -0.25, 0], head, { line: 0 });
      for (let i = 0; i < 6; i++) { const l = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.18), '#e86a45', [Math.cos(i) * 0.3, 0.12 + (i % 3) * 0.02, Math.sin(i) * 0.3], head, { line: 0 }); l.rotation.y = i; }
    } else if (type === 'carton') {
      mesh(new THREE.BoxGeometry(0.95, 1.5, 0.95), opt.color, [0, 0, 0], head);
      const roof = mesh(new THREE.CylinderGeometry(0.02, 0.69, 0.42, 4, 1), opt.roof, [0, 0.96, 0], head); roof.rotation.y = Math.PI / 4;
      mesh(new THREE.BoxGeometry(0.97, 0.36, 0.97), opt.label, [0, -0.36, 0], head, { line: 0 });
    } else if (type === 'egg') {
      const e = mesh(new THREE.SphereGeometry(0.55, 32, 24), opt.color, [0, 0, 0], head); e.scale.set(0.9, 1.22, 0.9);
      if (opt.stamp) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#c0392b'; x.font = '800 38px P, sans-serif'; x.textAlign = 'center'; x.fillText(opt.stamp, 128, 46);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); p.position.set(0, 0.44, 0.4); p.rotation.x = -0.45; head.add(p); }
    } else if (type === 'tofu') {
      mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), opt.color, [0, 0, 0], head);
    } else if (type === 'human') {
      const skin = opt.skin || '#f3cfb0';
      mesh(new THREE.CapsuleGeometry(0.4, 0.55, 6, 16), opt.cloth || '#3a3f55', [0, 1.0, 0], g);                  // 몸통
      if (opt.vest) { const v = mesh(new THREE.CapsuleGeometry(0.43, 0.42, 6, 16), opt.vest, [0, 1.06, 0.02], g, { line: 0 }); v.scale.set(1, 1, 0.98); }
      for (const sx of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.14, 0.42, 4, 10), opt.pants || '#2f3446', [sx * 0.19, 0.36, 0], g);  // 다리
      for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.24, 0.12, 0.36), opt.shoes || '#f2f2f2', [sx * 0.19, 0.06, 0.06], g);
      mesh(new THREE.SphereGeometry(0.5, 32, 24), skin, [0, 0, 0], head);
      if (opt.hair) { const h = mesh(new THREE.SphereGeometry(0.53, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), opt.hair, [0, 0.05, -0.03], head); h.rotation.x = opt.bangs ? -0.55 : -0.28; }
      if (opt.hair && opt.bangs) for (const [x, y, z, r, rz] of [[-0.24, 0.34, 0.33, 0.2, 0.5], [0.0, 0.38, 0.36, 0.21, 0.0], [0.23, 0.35, 0.33, 0.19, -0.6], [0.36, 0.22, 0.2, 0.15, -0.9]]) {
        const b = mesh(new THREE.SphereGeometry(r, 20, 14), opt.hair, [x, y, z], head, { line: 1.04 }); b.scale.set(1.25, 0.62, 0.7); b.rotation.z = rz; }
      if (opt.ears) for (const sx of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.11, 14, 10), opt.skin || '#f3cfb0', [sx * 0.49, -0.02, 0], head); e.scale.set(0.6, 1, 0.8); }
      if (opt.stripes) for (const y of [0.92, 1.2]) mesh(new THREE.CylinderGeometry(0.455, 0.455, 0.06, 28), '#f4f7fb', [0, y, 0.02], g, { line: 0 });  // 조끼 반사띠
      if (opt.gat) { mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.03, 32), '#1b1b1b', [0, 0.38, 0], head); mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.38, 24), '#1b1b1b', [0, 0.56, 0], head); }
      if (opt.bag) mesh(new THREE.BoxGeometry(0.72, 0.62, 0.42), opt.bag, [0, 1.15, -0.5], g);                    // 배달 가방
    } else if (type === 'bell') {
      const glow = new THREE.MeshToonMaterial({ color: opt.color || '#ffffff', gradientMap: grad, emissive: opt.glow || '#cfefff', emissiveIntensity: 0.55 });
      mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.5, 36), null, [0, -0.04, 0], head, { mat: glow, line: 1.05 });          // 종 몸통
      mesh(new THREE.SphereGeometry(0.24, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2), null, [0, 0.2, 0], head, { mat: glow, line: 1.05 }); // 종 머리
      const lip = mesh(new THREE.TorusGeometry(0.36, 0.035, 10, 36), null, [0, -0.29, 0], head, { mat: glow, line: 1.08 }); lip.rotation.x = Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.11, 0.035, 10, 24), '#ffffff', [0, 0.4, 0], head, { mat: glow, line: 1.1 });  // 꼭지 고리
      const tail = new THREE.Group(); tail.position.set(0, -0.3, -0.05); head.add(tail);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), '#9fdcff', [0, -0.16, 0], tail, { line: 0 });
      mesh(new THREE.SphereGeometry(0.07, 14, 10), null, [0, -0.34, 0], tail, { mat: glow, line: 1.12 });            // 술 끝 방울
      head.userData.tail = tail;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const r = x.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(220,245,255,0.9)'); r.addColorStop(1, 'rgba(220,245,255,0)'); x.fillStyle = r; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })(), depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(1.5, 1.5, 1); head.add(halo); head.userData.halo = halo;
    } else if (type === 'bottle') {
      mesh(new THREE.CylinderGeometry(0.38, 0.45, 1.25, 28), opt.color, [0, 0, 0], head);
      mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.35, 24), opt.color, [0, 0.8, 0], head); mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 24), opt.cap, [0, 1.05, 0], head);
      if (opt.label) mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.5, 28), opt.label, [0, -0.15, 0], head, { line: 0 });
    }
    const f = face(opt.faceSize || 0.72); f.plane.position.set(0, B.faceY, B.faceZ); head.add(f.plane);
    if (type === 'human') {  // 얼굴을 머리 둥근 면에 입힘 (구의 앞쪽 조각)
      const R = 0.506, ang = (opt.faceSize || 0.72) / 0.5, dn = 0.1;
      f.plane.geometry.dispose(); f.plane.geometry = new THREE.SphereGeometry(R, 48, 32, Math.PI / 2 - ang / 2, ang, Math.PI / 2 - ang / 2 + dn, ang);
      f.plane.position.set(0, 0, 0);
    }
    const arms = [];
    if (opt.arms) for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      if (type === 'human') { sh.position.set(s * 0.44, 1.36, 0); g.add(sh); mesh(new THREE.CapsuleGeometry(0.1, 0.52, 4, 10), opt.vest || opt.cloth || '#3a3f55', [0, -0.34, 0], sh); mesh(new THREE.SphereGeometry(0.12, 14, 10), opt.skin || '#f3cfb0', [0, -0.68, 0], sh, { line: 1.1 }); sh.rotation.z = s * 0.25; arms.push({ sh, s }); continue; }
      sh.position.set(s * B.half, B.shoulder, 0.05); head.add(sh);
      const arm = mesh(new THREE.CapsuleGeometry(0.05, 0.38, 4, 8), opt.armColor || '#3a2a22', [0, -0.22, 0], sh, { line: 0 });
      mesh(new THREE.SphereGeometry(0.1, 14, 10), opt.handColor || '#ffffff', [0, -0.47, 0], sh, { line: 1.12 });
      sh.rotation.z = s * 0.5; arms.push({ sh, s });
    }
    if (opt.props) opt.props(head, g, { mesh, toon });
    return { g, head, face: f, arms, opt, baseY: B.y, frozen: false };
  }

  // 몸짓 → 팔 각도 (z: 옆으로 벌림, x: 앞으로)
  function pose(ch, gesture, k, t, env) {
    for (const { sh, s } of ch.arms) {
      let z = s * 0.5, x = 0;
      const right = s > 0;
      if (gesture === 'wave' && right) { z = s * 2.6; x = 0; z += Math.sin(t * 12) * 0.35; }
      else if (gesture === 'point' && right) { z = s * 1.5; x = -1.0; }
      else if (gesture === 'shrug') { z = s * 1.6; x = -0.3; }
      else if (gesture === 'cheer') { z = s * (2.7 + Math.sin(t * 9) * 0.2); }
      else if (gesture === 'panic') { z = s * (1.8 + Math.sin(t * 22 + s) * 0.6); x = Math.sin(t * 19) * 0.4; }
      else if (gesture === 'hold') { z = s * 0.9; x = -1.2; }
      else if (gesture === 'think' && right) { z = s * 2.0; x = -1.3; }
      else if (gesture === 'think') { z = s * 0.6; x = -0.6; }
      else { z = s * ((ch.opt.restArm ?? 0.5) + env * 0.5 + Math.sin(t * 3 + s) * 0.05); }
      sh.rotation.z += (z - sh.rotation.z) * Math.min(1, k);
      sh.rotation.x += (x - sh.rotation.x) * Math.min(1, k);
    }
  }

  function init({ w = 1920, h = 1080, title = '', sub = '', end = [], bg = '#dff1ff', exposure = 1.0, titleAt = [0, 3], endAt = null, smallTitle = null, post = null, ss = 1 }) {
    // ss: 크게 그려서 줄이기(1.5면 1.5배로 그림) → 비스듬한 선이 계단처럼 깨지는 것 줄임
    // post(후처리, 0원): { bloom: 0~1 빛 번짐, vignette: 0~1 가장자리 어둡게, grade: 'saturate(1.1) contrast(1.05)' 같은 색 보정, grain: 0~1 필름 입자 }
    const W = w, H = h, U = Math.min(W, H) / 1080; // 글자 크기 단위
    const out = document.getElementById('c'); out.width = W; out.height = H; const og = out.getContext('2d');
    const gl = document.createElement('canvas'); gl.width = Math.round(W * ss); gl.height = Math.round(H * ss);
    const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
    renderer.setSize(gl.width, gl.height, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMappingExposure = exposure;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(bg);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.3, 200);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9a8a7a', 0.65));
    const sun = new THREE.DirectionalLight('#fff4e0', 0.9); sun.position.set(4, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 }); sun.shadow.bias = -0.0005; scene.add(sun);
    const TL = window.TL;
    const lineAt = (t) => TL.lines.find((l) => t >= l.start && t <= l.start + l.dur) || null;
    const lastLine = (t) => { let r = null; for (const l of TL.lines) if (l.start <= t) r = l; return r; };
    function shapeAt(l, t) {
      const lt = t - l.start;
      if (l.cues) { let v = 'X'; for (const [s, m] of l.cues) { if (s <= lt) v = m; else break; } return v; }
      const e = l.env[Math.floor(lt * 24)] || 0; return e > 0.5 ? 'D' : e > 0.3 ? 'C' : e > 0.12 ? 'B' : 'X';
    }
    // ---- 후처리: 빛 번짐(블룸) · 색 보정 · 비네트 · 필름 입자 (2D 캔버스 필터라 추가 프로그램 없이 됨) ----
    const glowGL = document.createElement('canvas'); glowGL.width = Math.round(W / 4); glowGL.height = Math.round(H / 4);
    let glowR = null; const BLACK = new THREE.MeshBasicMaterial({ color: '#000000' }), HIDE_S = new THREE.SpriteMaterial({ opacity: 0, transparent: true });
    function renderGlow() {   // 층 1(Story.glow 로 표시한 등불·달·번개 등)만 검은 바탕에 작게 그림
      if (!post || !post.bloom) return;
      if (!glowR) { glowR = new THREE.WebGLRenderer({ canvas: glowGL, antialias: false, preserveDrawingBuffer: true }); glowR.setSize(glowGL.width, glowGL.height, false); glowR.outputEncoding = THREE.sRGBEncoding; }
      // 빛나지 않는 물체는 검게 그려 앞을 가리게 함(창문 빛이 사람 얼굴 위로 번지지 않게)
      const bg = scene.background, fog = scene.fog, saved = []; scene.background = new THREE.Color('#000000'); scene.fog = null;
      scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isSprite) && !o.layers.isEnabled(1) && o.visible) { saved.push([o, o.material]); o.material = o.isSprite ? HIDE_S : BLACK; } });
      glowR.toneMappingExposure = renderer.toneMappingExposure; glowR.render(scene, cam);
      for (const [o, m] of saved) o.material = m; scene.background = bg; scene.fog = fog;
    }
    const small = document.createElement('canvas'); small.width = Math.round(W / 4); small.height = Math.round(H / 4); const sg = small.getContext('2d');
    const grainC = document.createElement('canvas'); grainC.width = grainC.height = 256; const gg = grainC.getContext('2d');
    function postDraw(t) {
      const P = post || {};
      og.save(); og.imageSmoothingQuality = 'high'; if (P.grade) og.filter = P.grade; og.drawImage(gl, 0, 0, W, H); og.restore();
      if (P.bloom) {   // 빛나는 물체(층 1)만 따로 그린 그림을 흐리게 키워서 더하기
        sg.clearRect(0, 0, small.width, small.height); sg.drawImage(glowGL, 0, 0, small.width, small.height);
        og.save(); og.globalCompositeOperation = 'lighter'; og.globalAlpha = P.bloom; og.filter = `blur(${Math.round(10 * U)}px)`; og.drawImage(small, 0, 0, W, H);
        og.globalAlpha = P.bloom * 0.6; og.filter = `blur(${Math.round(28 * U)}px)`; og.drawImage(small, 0, 0, W, H); og.restore();
      }
      if (P.vignette) { const r = og.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${P.vignette})`); og.fillStyle = r; og.fillRect(0, 0, W, H); }
      if (P.grain) { const im = gg.createImageData(256, 256); let seed = Math.floor(t * 24) * 9301 + 49297;
        for (let i = 0; i < im.data.length; i += 4) { seed = (seed * 9301 + 49297) % 233280; const v = seed / 233280 * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 * P.grain * 0.18; }
        gg.putImageData(im, 0, 0); og.save(); og.globalCompositeOperation = 'overlay'; og.fillStyle = og.createPattern(grainC, 'repeat'); og.fillRect(0, 0, W, H); og.restore(); }
    }
    function rr(x, y, w, h, r) { og.beginPath(); og.moveTo(x + r, y); og.arcTo(x + w, y, x + w, y + h, r); og.arcTo(x + w, y + h, x, y + h, r); og.arcTo(x, y + h, x, y, r); og.arcTo(x, y, x + w, y, r); og.closePath(); }
    function wrap(s, max) { const out = []; let cur = ''; for (const wd of s.split(' ')) { const tt = cur ? cur + ' ' + wd : wd; if (og.measureText(tt).width > max && cur) { out.push(cur); cur = wd; } else cur = tt; } if (cur) out.push(cur); return out; }
    function overlay(t) {
      postDraw(t); og.textAlign = 'center'; og.textBaseline = 'middle';
      const big = (titleAt[0] > 0 ? smooth(titleAt[0], titleAt[0] + 0.3, t) : 1) * (1 - smooth(titleAt[1], titleAt[1] + 0.5, t));
      if (big > 0) { og.globalAlpha = big; og.fillStyle = 'rgba(20,16,30,.55)'; og.fillRect(0, H * 0.36, W, H * 0.28); og.fillStyle = '#fff'; og.font = `800 ${96 * U}px P`; og.fillText(title, W / 2, H * 0.46); og.fillStyle = '#ffd54a'; og.font = `800 ${56 * U}px P`; og.fillText(sub, W / 2, H * 0.55); og.globalAlpha = 1; }
      const st = smallTitle || title; og.font = `800 ${38 * U}px P`; const tw = og.measureText(st).width + 60 * U; og.globalAlpha = t < titleAt[0] ? 0 : 1 - big; rr((W - tw) / 2, 36 * U, tw, 66 * U, 33 * U); og.fillStyle = 'rgba(20,16,30,.7)'; og.fill(); og.fillStyle = '#fff'; og.fillText(st, W / 2, 70 * U); og.globalAlpha = 1;
      const l = lineAt(t) || (() => { const p = lastLine(t); return p && t - (p.start + p.dur) < 0.3 ? p : null; })();
      if (l && !l.noSub) {
        const c = window.CAST_STYLE?.[l.who] || { color: '#ffd54a', name: l.who };
        og.font = `800 ${54 * U}px P`; const maxW = Math.min(W * 0.82, 1500); const lines = wrap(l.text, maxW - 80 * U); const bh = 44 * U + lines.length * 66 * U;
        const y0 = H - bh - 70 * U, x0 = (W - maxW) / 2; rr(x0, y0, maxW, bh, 28 * U); og.fillStyle = 'rgba(15,12,24,.8)'; og.fill();
        og.font = `800 ${34 * U}px P`; const nw = og.measureText(c.name).width + 44 * U; rr(x0 + 30 * U, y0 - 28 * U, nw, 56 * U, 28 * U); og.fillStyle = c.color; og.fill(); og.fillStyle = '#1b1430'; og.fillText(c.name, x0 + 30 * U + nw / 2, y0);
        og.font = `800 ${54 * U}px P`; og.fillStyle = '#fff'; lines.forEach((s, i) => og.fillText(s, W / 2, y0 + 56 * U + i * 66 * U));
      }
      if (window.CAPTION) window.CAPTION(og, t, { W, H, U, rr });
      const E = endAt ?? TL.dur - 3.2, ea = smooth(E, E + 0.8, t);
      if (ea > 0 && end.length) { og.globalAlpha = ea; og.fillStyle = 'rgba(15,12,24,.78)'; og.fillRect(0, 0, W, H); end.forEach((s, i) => { og.font = `800 ${(i ? 56 : 88) * U}px P`; og.fillStyle = i ? '#ffd54a' : '#fff'; og.fillText(s, W / 2, H * 0.42 + i * 110 * U); }); og.globalAlpha = 1; }
    }
    let camPos = null, camLook = null, lastT = -1;
    function stepCam(s, k) { const P = new THREE.Vector3(...s.pos), L = new THREE.Vector3(...s.look); if (!camPos || s.cut) { camPos = P; camLook = L; } else { camPos.lerp(P, k); camLook.lerp(L, k); } }
    function frame(t, args, dt) {
      const l = lineAt(t);
      for (const [name, ch] of Object.entries(args.cast)) {
        if (ch.frozen) continue;
        const speaking = l && l.who === name;
        const shape = speaking ? shapeAt(l, t) : 'X';
        const env = speaking ? (l.env[Math.floor((t - l.start) * 24)] || 0) : 0;
        const prev = lastLine(t), recent = prev && prev.who === name && t - prev.start - prev.dur < 1.2;
        const mood = (speaking ? l.mood : recent ? prev.mood : null) || ch.mood || ch.opt.mood || 'normal';
        const blink = ((t + (ch.opt.blinkOff || 0)) % 3.1) < 0.11;
        const look = l && !speaking && args.cast[l.who] ? Math.sign(args.cast[l.who].g.position.x - ch.g.position.x) * 0.8 : 0;
        ch.face.draw({ shape, blink, mood, look });
        const gesture = (speaking ? l.gesture : recent ? prev.gesture : null) || ch.gesture || null;
        pose(ch, gesture, dt * 10, t, env);
        let y = ch.baseY + Math.sin(t * 2.2 + (ch.opt.blinkOff || 0)) * 0.015;
        if (speaking && l.jump) y += Math.max(0, Math.sin(clamp01((t - l.start) / 0.5) * Math.PI)) * 0.35;
        ch.head.position.y = y;
        const sq = speaking ? env * 0.07 : 0; ch.head.scale.set(1 - sq * 0.4, 1 + sq, 1 - sq * 0.4);
        ch.head.rotation.z = speaking ? Math.sin(t * 3.1) * 0.05 : ch.head.rotation.z * 0.9;
      }
      if (args.update) args.update(t, l);
      stepCam(args.shot(t, l), args.camK || 0.1);
    }
    function render(t, args) {
      if (t < lastT || lastT < 0) { camPos = null; lastT = -1 / 24; }
      for (let u = lastT + 1 / 24; u < t - 1e-6; u += 1 / 24) frame(u, args, 1 / 24);
      frame(t, args, 1 / 24); lastT = t;
      cam.position.copy(camPos); cam.lookAt(camLook); const s = args.shot(t, lineAt(t)); cam.fov = s.fov || 30; cam.updateProjectionMatrix();
      renderer.render(scene, cam); renderGlow(); overlay(t);
    }
    return { scene, cam, renderer, render, lineAt, TL, W, H };
  }
  const glow = (o) => { o.traverse((c) => c.layers.enable(1)); return o; };   // 빛 번짐 대상 표시

  // ---- 무료 3D 모델(glTF/GLB) 쓰기: three-gltf 번들(vendor/three-gltf-0.149.0.min.js) + models.js(pack_assets.py) 필요 ----
  const glbCache = {};
  function loadGLB(name) {   // window.GLB[name] → Promise(gltf)
    if (glbCache[name]) return glbCache[name];
    const e = window.GLB[name]; const bin = Uint8Array.from(atob(e.glb), (c) => c.charCodeAt(0)).buffer;
    const mgr = new THREE.LoadingManager(); mgr.setURLModifier((u) => (/colormap\.png$/.test(u) ? window.GLB_TEX[e.pack] : u));
    return (glbCache[name] = new Promise((ok, no) => new THREE.GLTFLoader(mgr).parse(bin, '', ok, no)));
  }
  const brightGrad = (() => { const d = new Uint8Array([165, 220, 255]); const tx = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.needsUpdate = true; return tx; })();
  // 모델 얼굴의 원래 눈·입(어두운 색 조각)을 피부색으로 덮기 → 우리 얼굴 그림(입 모양 맞추기)을 올릴 자리
  function clearFace(geo, img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data, at = (u, v) => (Math.min(c.height - 1, Math.floor(v * c.height)) * c.width + Math.min(c.width - 1, Math.floor(u * c.width))) * 4, lum = (u, v) => { const i = at(u, v); return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; };
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, cnt = {};
    let ymin = 1e9, ymax = -1e9; for (let i = 0; i < P.count; i++) if (N.getZ(i) > 0.7) { ymin = Math.min(ymin, P.getY(i)); ymax = Math.max(ymax, P.getY(i)); }
    let xmax = 0; for (let i = 0; i < P.count; i++) if (N.getZ(i) > 0.7) xmax = Math.max(xmax, Math.abs(P.getX(i)));
    const isFace = (i) => N.getZ(i) > 0.5 && Math.abs(P.getX(i)) < xmax * 0.72 && P.getY(i) > ymin + (ymax - ymin) * 0.05 && P.getY(i) < ymin + (ymax - ymin) * 0.58;   // 가운데 얼굴만 (옆머리는 그대로)   // 눈·입만 (위쪽 앞머리는 그대로)
    for (let i = 0; i < P.count; i++) if (isFace(i) && lum(UV.getX(i), UV.getY(i)) > 90) { const k = UV.getX(i).toFixed(3) + ',' + UV.getY(i).toFixed(3); cnt[k] = (cnt[k] || 0) + 1; }
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (!best) return;
    const [su, sv] = best[0].split(',').map(Number);
    const s0 = at(su, sv), dist = (u, v) => { const i = at(u, v); return Math.abs(px[i] - px[s0]) + Math.abs(px[i + 1] - px[s0 + 1]) + Math.abs(px[i + 2] - px[s0 + 2]); };
    for (let i = 0; i < P.count; i++) if (isFace(i) && (lum(UV.getX(i), UV.getY(i)) <= 90 || dist(UV.getX(i), UV.getY(i)) > 120)) UV.setXY(i, su, sv);   // 눈동자·흰자·하이라이트까지 피부색으로
    UV.needsUpdate = true;
  }
  function inkFor(mesh, w) {   // 뼈대로 움직이는 몸에도 맞는 외곽선 (법선 방향으로 부풀린 뒷면)
    // 각진 모델은 모서리마다 법선이 갈라져 외곽선이 끊김 → 같은 자리 꼭짓점의 법선을 평균 낸 '외곽선용 법선'으로 부풀림
    const geo = mesh.geometry, P = geo.attributes.position, N = geo.attributes.normal, acc = new Map(), key = (i) => `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    for (let i = 0; i < P.count; i++) { const k = key(i), v = acc.get(k) || [0, 0, 0]; v[0] += N.getX(i); v[1] += N.getY(i); v[2] += N.getZ(i); acc.set(k, v); }
    const on = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const v = acc.get(key(i)), l = Math.hypot(...v) || 1; on.set([v[0] / l, v[1] / l, v[2] / l], i * 3); }
    const g2 = geo.clone(); g2.setAttribute('outlineNormal', new THREE.BufferAttribute(on, 3));
    const m = new THREE.MeshBasicMaterial({ color: '#2a1f1a', side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 });   // 외곽선을 살짝 뒤로 → 귀·머리 사이로 삐져나와 줄무늬처럼 보이던 것 막기
    m.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute vec3 outlineNormal;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(outlineNormal) * ${w.toFixed(4)};`); };
    const o = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(g2, m) : new THREE.Mesh(g2, m);
    if (mesh.isSkinnedMesh) o.bind(mesh.skeleton, mesh.bindMatrix);
    o.position.copy(mesh.position); o.quaternion.copy(mesh.quaternion); o.scale.copy(mesh.scale); o.frustumCulled = false; return o;
  }
  // 모델 → 우리 그림체(툰 + 외곽선). opt: { scale, line(외곽선 굵기, 모델 단위), toon(true) }
  function model(gltf, opt = {}) {
    const root = opt.rigged ? THREE.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
    const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const gmap = opt.bright ? brightGrad : grad;
    for (const m of meshes) {
      const src = m.material; m.castShadow = m.receiveShadow = true;
      if (opt.clearFace && m.name.includes(opt.clearFace) && src.map) clearFace(m.geometry, src.map.image);
      if (opt.toon !== false) m.material = new THREE.MeshToonMaterial({ color: '#ffffff', map: src.map || null, gradientMap: gmap, side: opt.rigged ? THREE.DoubleSide : THREE.FrontSide });   // 캐릭터는 양면(머리카락과 귀 사이 틈으로 뒤가 비쳐 보이던 것 막기)
      if (m.material.map) m.material.map.encoding = THREE.sRGBEncoding;
      if (opt.line) m.parent.add(inkFor(m, opt.line));
    }
    const g = new THREE.Group(); g.add(root); root.scale.setScalar(opt.scale || 1); return { g, root };
  }
  // 움직이는 캐릭터(엔진 캐릭터와 같은 모양으로): 얼굴 판은 머리 뼈에 붙여 입 모양·표정을 그대로 씀
  function rigChar(gltf, opt = {}) {
    const { g, root } = model(gltf, { ...opt, rigged: true });
    g.position.set(...(opt.pos || [0, 0, 0]));
    const head = new THREE.Group();           // 엔진이 흔드는 '머리'(보이지 않는 자리표시) — 실제 흔들림은 뼈에 옮김
    let headBone = null; root.traverse((o) => { if (o.name === (opt.headBone || 'head')) headBone = o; });
    const f = face(opt.faceSize || 0.3);
    if (opt.faceBg) f.bg = opt.faceBg;
    if (headBone) { f.plane.position.set(...(opt.faceAt || [0, 0.16, 0.172])); headBone.add(f.plane); }
    const mixer = new THREE.AnimationMixer(root), actions = {};
    for (const c of gltf.animations) { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); actions[c.name] = a; }
    return { g, head, face: f, arms: [], opt, baseY: 0, rig: { root, mixer, actions, headBone } };
  }
  // 정해진 순서대로 동작 재생(되감아도 늘 같은 그림): plan = [[시작초, '동작이름', {loop:true, speed:1}], …]
  function anim(ch, t, plan, fade = 0.25) {
    const R = ch.rig; let cur = -1; for (let i = 0; i < plan.length; i++) if (plan[i][0] <= t) cur = i;
    for (const a of Object.values(R.actions)) a.setEffectiveWeight(0);
    const put = (i, w) => { if (i < 0 || w <= 0) return; const [t0, name, o = {}] = plan[i]; const a = R.actions[name]; if (!a) return;
      const d = a.getClip().duration, u = Math.max(0, (t - t0) * (o.speed || 1)); a.time = o.loop === false ? Math.min(u, d - 1e-3) : u % d; a.setEffectiveWeight(w); };
    if (cur >= 0) { const k = Math.min(1, (t - plan[cur][0]) / fade); put(cur, k); put(cur - 1, 1 - k); }
    R.mixer.update(0);
  }
  window.Story = { init, char, mesh, toon, outline, face, smooth, clamp01, glow, loadGLB, model, rigChar, anim };
})();
