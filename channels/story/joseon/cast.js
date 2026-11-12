// 조선으로 회귀하면 — 고정 인물 (Kenney Mini Characters, CC0) · 옷 색 바꾸기 + 갓·전립 (2026-11-12)
// 쓰기: const cast = await JoseonCast.load(['민재', '윤진사', …]);  각 인물은 엔진 캐릭터(입 모양 얼굴 포함)
window.JoseonCast = (() => {
  const SKIN = '#efc39f';
  const DEF = {
    민재: { model: 'character-male-f', faceCell: '1,2', recolor: { 'head': { '1,2': SKIN }, 'body': { '1,2': SKIN } }, bag: true },
    윤진사: { model: 'character-male-d', recolor: { 'body': { '7,3': '#ece7da', '15,2': '#ece7da', '15,3': '#f7f3ea', '5,2': SKIN }, 'head': { '1,2': '#26262c', '5,2': SKIN } }, hat: 'gat' },
    주모: { model: 'character-female-e', recolor: { 'body': { '15,3': '#f2e2b3', '5,3': '#b8473c', '1,1': SKIN, '1,2': SKIN }, 'head': { '5,2': SKIN } } },
    순라군: { model: 'character-male-c', recolor: { 'body': { '1,1': '#2b3a5c', '3,3': '#6e2b2b', '5,2': SKIN }, 'head': { '1,1': '#1c1c22', '1,3': '#c0392b', '1,2': '#3a2e28', '5,2': SKIN } }, hat: 'jeollip', torch: true },
    돌쇠: { model: 'character-raider', recolor: { 'body': { '9,2': '#c7ad7c', '1,1': '#8d7a5c', '3,2': SKIN, '5,2': SKIN }, 'head': { '5,2': SKIN } }, scale: 0.82 },
    선비1: { model: 'character-male-e', recolor: { 'body': { '7,3': '#e6e1d4', '1,3': '#e6e1d4', '3,3': '#bfb7a5', '5,2': SKIN }, 'head': { '3,2': '#26262c', '5,2': SKIN } }, hat: 'gat' },
    선비2: { model: 'character-male-d', recolor: { 'body': { '7,3': '#cfdde6', '15,2': '#cfdde6', '15,3': '#eef3f6', '5,2': SKIN }, 'head': { '1,2': '#2e2a28', '5,2': SKIN } }, hat: 'gat' },
  };
  const FACE = { faceSize: 0.3, faceAt: [0, 0.135, 0.172], clearFace: 'head', bright: true, line: 0.006 };
  async function make(name, extra = {}) {
    const d = DEF[name], g = await Story.loadGLB(d.model);
    const ch = Story.rigChar(g, { ...FACE, faceCell: d.faceCell || '5,2', scale: 3.6 * (d.scale || 1), recolor: d.recolor, blinkOff: (name.length * 0.37) % 3, ...extra });
    const head = Story.bone(ch, 'head');
    if (d.hat && head) { const h = Story.hats[d.hat](); h.position.set(0, 0.33, -0.005); head.add(h); ch.hat = h; }
    if (d.bag) { const torso = Story.bone(ch, 'torso'); if (torso) Story.mesh(new THREE.BoxGeometry(0.24, 0.2, 0.14), '#2f8f5a', [0, 0.11, -0.14], torso, { line: 1.06 }); }
    if (d.torch) { const arm = Story.bone(ch, 'arm-right'); if (arm) { const t = new THREE.Group(); t.position.set(-0.02, -0.11, 0.06); arm.add(t);
      Story.mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.26, 8), '#5a3a22', [0, 0.06, 0.02], t, { line: 1.15 });
      const f = Story.mesh(new THREE.SphereGeometry(0.045, 12, 8), null, [0, 0.2, 0.02], t, { line: 0, mat: new THREE.MeshBasicMaterial({ color: '#ffb347' }) }); Story.glow(f); ch.flame = f;
      const pl = new THREE.PointLight('#ffa040', 0.9, 6); pl.position.set(0, 0.22, 0.02); t.add(pl); } }
    return ch;
  }
  return { DEF, async load(names) { const out = {}; for (const n of names) out[n] = await make(n); return out; }, make };
})();
