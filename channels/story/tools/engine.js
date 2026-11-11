// 상황극 엔진 — three.js 로 만화풍(툰 셰이딩 + 외곽선) 캐릭터 장면을 그리고, 위에 자막·제목을 얹는다.
// 편 페이지: <script src=".../three-0.149.0.min.js"> <script src="timeline.js"> <script src="../tools/engine.js">
//   const S = Story.init({ title, sub, end, bg, fog });  S.scene 에 무대를 꾸미고 Story.char() 로 캐릭터를 만든 뒤
//   window.render = (t) => S.render(t, { cast: {이름: char}, shot: (t, line) => ({pos:[x,y,z], look:[x,y,z]}), update: (t) => {...} })
// 입 모양은 timeline 의 목소리 크기(env, 24fps), 표정은 대사의 mood(normal·surprised·happy·worried·smug·tired).
(function () {
  const W = 1080, H = 1920;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u); };

  // 툰 셰이딩: 빛을 3단계로 끊음
  const grad = (() => { const d = new Uint8Array([90, 170, 255]); const tx = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.needsUpdate = true; return tx; })();
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });
  const INK = new THREE.MeshBasicMaterial({ color: '#2a1f1a', side: THREE.BackSide });
  // 외곽선: 뒷면만 보이는 조금 큰 복제(인버티드 헐)
  function outline(mesh, k = 1.06) {
    const o = new THREE.Mesh(mesh.geometry, INK); o.scale.setScalar(k); o.castShadow = false; mesh.add(o); return mesh;
  }
  function mesh(geo, color, pos = [0, 0, 0], parent, { line = 1.05, shadow = true, mat } = {}) {
    const m = new THREE.Mesh(geo, mat || toon(color)); m.position.set(...pos); m.castShadow = shadow; m.receiveShadow = true;
    if (line) outline(m, line); if (parent) parent.add(m); return m;
  }

  // 얼굴(투명 판에 눈·눈썹·입·볼)
  function face(size = 1, { skin = null, brow = '#2b2018', eye = '#1b1410' } = {}) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    let last = '';
    function draw({ mouth = 0, blink = false, mood = 'normal' } = {}) {
      const key = `${mouth.toFixed(2)}|${blink}|${mood}`; if (key === last) return; last = key;
      g.clearRect(0, 0, 256, 256);
      if (skin) { g.fillStyle = skin; g.fillRect(0, 0, 256, 256); }
      g.fillStyle = 'rgba(255,110,110,.35)'; g.beginPath(); g.ellipse(62, 150, 22, 13, 0, 0, 7); g.ellipse(194, 150, 22, 13, 0, 0, 7); g.fill();
      const ey = 112, big = mood === 'surprised' ? 1.35 : 1;
      g.fillStyle = eye;
      for (const x of [86, 170]) {
        if (blink || mood === 'happy') { g.lineWidth = 7; g.strokeStyle = eye; g.beginPath(); g.arc(x, ey + 6, 13, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
        else if (mood === 'tired') { g.fillRect(x - 15, ey, 30, 7); }
        else { g.beginPath(); g.ellipse(x, ey, 11 * big, 15 * big, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, ey - 6, 4.5, 0, 7); g.fill(); g.fillStyle = eye; }
      }
      g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = brow;
      const B = { normal: [0, 0], surprised: [-14, -14], worried: [8, -10], smug: [-6, 6], happy: [-4, -4], tired: [4, 4] }[mood] || [0, 0];
      g.beginPath(); g.moveTo(66, 80 + B[0]); g.lineTo(104, 76 + B[1]); g.moveTo(152, 76 + B[1]); g.lineTo(190, 80 + B[0]); g.stroke();
      // 입: 말할 때 열림(목소리 크기), 쉴 땐 표정대로
      g.fillStyle = '#6e2525';
      if (mouth > 0.06) { g.beginPath(); g.ellipse(128, 178, 16 + mouth * 6, 3 + mouth * 22, 0, 0, 7); g.fill(); g.fillStyle = '#ff8c8c'; g.beginPath(); g.ellipse(128, 184 + mouth * 10, 9, 3 + mouth * 6, 0, 0, Math.PI); g.fill(); }
      else {
        g.strokeStyle = '#6e2525'; g.lineWidth = 6; g.beginPath();
        if (mood === 'happy' || mood === 'smug') g.arc(128, 166, 22, 0.2 * Math.PI, 0.8 * Math.PI);
        else if (mood === 'worried' || mood === 'tired') g.arc(128, 196, 18, 1.2 * Math.PI, 1.8 * Math.PI);
        else if (mood === 'surprised') { g.ellipse(128, 180, 10, 13, 0, 0, 7); }
        else { g.moveTo(112, 178); g.lineTo(144, 178); }
        g.stroke();
      }
      tex.needsUpdate = true;
    }
    draw(); return { plane, draw };
  }

  // 캐릭터 몸통 종류: human(사람형) · carton(우유갑) · egg · jar(김치통) · bottle(병) · cloud(작은 기계) · box(택배 상자)
  function char(opt) {
    const g = new THREE.Group(); g.position.set(...(opt.pos || [0, 0, 0]));
    const head = new THREE.Group(); g.add(head);
    const f = face(opt.faceSize || 0.8, { skin: null });
    let faceZ = 0.5, faceY = 0;
    const type = opt.type || 'human';
    if (type === 'human') {
      mesh(new THREE.CapsuleGeometry(0.42, 0.55, 6, 16), opt.cloth, [0, 0.72, 0], g);
      for (const s of [-1, 1]) { const a = mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 10), opt.cloth, [s * 0.5, 0.85, 0], g); a.rotation.z = s * 0.35; }
      for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(0.13, 0.2, 4, 10), opt.pants || '#3b3b52', [s * 0.18, 0.18, 0], g);
      head.position.y = 1.72; mesh(new THREE.SphereGeometry(0.55, 32, 24), opt.skin || '#f5cfae', [0, 0, 0], head);
      if (opt.hair) { const h = mesh(new THREE.SphereGeometry(0.57, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), opt.hair, [0, 0.04, -0.02], head); h.rotation.x = -0.25; }
      faceZ = 0.56; faceY = -0.04;
    } else if (type === 'carton') {
      head.position.y = 0.95; mesh(new THREE.BoxGeometry(0.95, 1.5, 0.95), opt.color, [0, 0, 0], head);
      const roof = mesh(new THREE.CylinderGeometry(0.02, 0.69, 0.42, 4, 1), opt.roof || opt.color, [0, 0.96, 0], head); roof.rotation.y = Math.PI / 4;
      if (opt.label) mesh(new THREE.BoxGeometry(0.97, 0.36, 0.97), opt.label, [0, -0.36, 0], head, { line: 0 });
      faceZ = 0.485; faceY = 0.18;
    } else if (type === 'egg') {
      head.position.y = 0.72; const e = mesh(new THREE.SphereGeometry(0.55, 32, 24), opt.color, [0, 0, 0], head); e.scale.set(0.9, 1.22, 0.9); faceZ = 0.5; faceY = 0.05;
    } else if (type === 'jar') {
      head.position.y = 0.75; mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 32), opt.color, [0, 0, 0], head, { mat: toon(opt.color, { transparent: true, opacity: 0.45 }) });
      mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.22, 32), opt.lid, [0, 0.74, 0], head);
      if (opt.inner) mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.6, 32), opt.inner, [0, -0.3, 0], head, { line: 0 });
      faceZ = 0.63; faceY = 0.15;
    } else if (type === 'bottle') {
      head.position.y = 0.82; mesh(new THREE.CylinderGeometry(0.38, 0.45, 1.25, 28), opt.color, [0, 0, 0], head);
      mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.35, 24), opt.color, [0, 0.8, 0], head); mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.18, 24), opt.cap, [0, 1.05, 0], head);
      faceZ = 0.43; faceY = 0.05;
    } else if (type === 'cloud') {
      head.position.y = 1.2; for (const [x, y, r] of [[0, 0, 0.42], [-0.38, -0.08, 0.3], [0.38, -0.08, 0.3], [0.18, 0.22, 0.28], [-0.2, 0.2, 0.26]]) mesh(new THREE.SphereGeometry(r, 24, 16), opt.color, [x, y, 0], head);
      faceZ = 0.43; faceY = -0.02;
    } else if (type === 'box') {
      head.position.y = 0.5; mesh(new THREE.BoxGeometry(1.2, 0.9, 0.9), opt.color || '#c8955a', [0, 0, 0], head);
      mesh(new THREE.BoxGeometry(1.22, 0.12, 0.92), opt.tape || '#e8d6a8', [0, 0.1, 0], head, { line: 0 });
      faceZ = 0.46; faceY = -0.05;
    }
    f.plane.position.set(0, faceY, faceZ); head.add(f.plane);
    if (opt.props) opt.props(head, g, { mesh, toon });
    return { g, head, face: f, opt, baseY: head.position.y };
  }

  function init({ title = '', sub = '', end = [], bg = '#cfe8ff', fog = null, exposure = 1.0 }) {
    const out = document.getElementById('c'), og = out.getContext('2d');
    const gl = document.createElement('canvas'); gl.width = W; gl.height = H;
    const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMappingExposure = exposure;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(bg); if (fog) scene.fog = new THREE.Fog(bg, fog[0], fog[1]);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9a8a7a', 0.65));
    const sun = new THREE.DirectionalLight('#fff4e0', 0.9); sun.position.set(4, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sun.shadow.bias = -0.0005; scene.add(sun);
    const TL = window.TL;
    let camPos = null, camLook = null;

    function lineAt(t) { return TL.lines.find((l) => t >= l.start && t <= l.start + l.dur) || null; }
    function lastLine(t) { let r = null; for (const l of TL.lines) if (l.start <= t) r = l; return r; }

    function overlay(t) {
      og.drawImage(gl, 0, 0);
      // 제목 (처음 크게 → 위 작은 띠)
      const big = 1 - smooth(1.0, 1.5, t);
      og.textAlign = 'center'; og.textBaseline = 'middle';
      if (big > 0) { og.globalAlpha = big; og.fillStyle = 'rgba(20,16,30,.55)'; og.fillRect(0, 700, W, 380); og.fillStyle = '#fff'; og.font = '800 92px P'; og.fillText(title, W / 2, 850); og.fillStyle = '#ffd54a'; og.font = '800 54px P'; og.fillText(sub, W / 2, 960); og.globalAlpha = 1; }
      og.font = '800 40px P'; const tw = og.measureText(title).width + 60; og.globalAlpha = 1 - big; rr(og, (W - tw) / 2, 60, tw, 70, 35); og.fillStyle = 'rgba(20,16,30,.7)'; og.fill(); og.fillStyle = '#fff'; og.fillText(title, W / 2, 97); og.globalAlpha = 1;
      // 자막
      const l = lineAt(t) || (() => { const p = lastLine(t); return p && t - (p.start + p.dur) < 0.25 ? p : null; })();
      if (l && !l.noSub) {
        const c = window.CAST_STYLE?.[l.who] || { color: '#ffd54a', name: l.who };
        og.font = '800 56px P'; const lines = wrap(og, l.text, 900); const bh = 50 + lines.length * 70;
        const y0 = 1450; rr(og, 60, y0, 960, bh, 30); og.fillStyle = 'rgba(15,12,24,.78)'; og.fill();
        og.font = '800 36px P'; const nw = og.measureText(c.name).width + 44; rr(og, 90, y0 - 30, nw, 60, 30); og.fillStyle = c.color; og.fill(); og.fillStyle = '#1b1430'; og.fillText(c.name, 90 + nw / 2, y0 + 1);
        og.font = '800 56px P'; og.fillStyle = '#fff'; lines.forEach((s, i) => og.fillText(s, W / 2, y0 + 62 + i * 70));
      }
      // 끝 화면
      const ea = smooth(TL.dur - 2.2, TL.dur - 1.6, t);
      if (ea > 0 && end.length) { og.globalAlpha = ea; og.fillStyle = 'rgba(15,12,24,.72)'; og.fillRect(0, 0, W, H); end.forEach((s, i) => { og.font = `800 ${i ? 54 : 84}px P`; og.fillStyle = i ? '#ffd54a' : '#fff'; og.fillText(s, W / 2, 820 + i * 110); }); og.globalAlpha = 1; }
    }
    function render(t, { cast, shot, update }) {
      const l = lineAt(t);
      for (const [name, ch] of Object.entries(cast)) {
        const speaking = l && l.who === name;
        const env = speaking ? (l.env[Math.floor((t - l.start) * 24)] || 0) : 0;
        const prev = lastLine(t), mood = (speaking ? l.mood : (prev && prev.who === name && t - prev.start - prev.dur < 1.2 ? prev.mood : null)) || ch.opt.mood || 'normal';
        const blink = ((t + (ch.opt.blinkOff || 0)) % 3.1) < 0.11;
        ch.face.draw({ mouth: Math.min(1, env * 1.4), blink, mood });
        const bob = Math.sin(t * 2.2 + (ch.opt.blinkOff || 0)) * 0.015 + (speaking ? env * 0.05 : 0);
        ch.head.position.y = ch.baseY + bob; ch.head.rotation.z = speaking ? Math.sin(t * 3.1) * 0.06 : 0;
        if (ch.opt.lookAt) ch.g.lookAt(ch.opt.lookAt[0], ch.g.position.y, ch.opt.lookAt[2]);
      }
      if (update) update(t, l);
      const s = shot(t, l);
      const P = new THREE.Vector3(...s.pos), L = new THREE.Vector3(...s.look);
      if (!camPos || s.cut) { camPos = P.clone(); camLook = L.clone(); } else { camPos.lerp(P, 0.12); camLook.lerp(L, 0.12); }
      cam.position.copy(camPos); cam.lookAt(camLook); cam.fov = s.fov || 30; cam.updateProjectionMatrix();
      renderer.render(scene, cam); overlay(t);
    }
    // 프레임을 건너뛰어도(미리보기) 카메라가 같은 곳에 오도록: t 까지 1/24초씩 따라가며 계산
    let lastT = -1;
    function renderSeq(t, args) { if (t < lastT || lastT < 0) { camPos = null; lastT = -1 / 24; } for (let u = lastT + 1 / 24; u < t - 1e-6; u += 1 / 24) { const s = args.shot(u, lineAt(u)); const P = new THREE.Vector3(...s.pos), L = new THREE.Vector3(...s.look); if (!camPos || s.cut) { camPos = P; camLook = L; } else { camPos.lerp(P, 0.12); camLook.lerp(L, 0.12); } } lastT = t; render(t, args); }
    return { scene, cam, renderer, render: renderSeq, lineAt, TL };
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, s, max) { const words = s.split(' '); const out = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); return out; }

  window.Story = { init, char, mesh, toon, outline, face, smooth, clamp01 };
})();
