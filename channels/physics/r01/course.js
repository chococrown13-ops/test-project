// 물리 시뮬레이션 #1 「구슬 레이스 · 골드버그 코스」 — 코스와 물리 계산 (브라우저·node 둘 다에서 씀)
// 같은 코스·같은 순서로 계산하면 결과가 늘 같다(무작위 없음) → 미리보기와 완성본이 똑같음.
// build(Matter) → { engine, marbles, parts, finishY, H }
// simulate(Matter, seconds, fps) → { frames:[[{x,y,a}…marbles, {…parts}]], finish:[{id, t}], hits:[{t, id, v, kind}] }
(function (root) {
  const W = 1080;
  const MARBLES = [
    { id: "red", name: "빨강", color: "#ff4d4d" },
    { id: "blue", name: "파랑", color: "#3d8bff" },
    { id: "green", name: "초록", color: "#2fcf6f" },
    { id: "yellow", name: "노랑", color: "#ffc93d" },
  ];
  const R = 24;
  // 시뮬레이션 결과로 정한 결승 순서는 화면에서 계산 (미리 정하지 않음)

  function build(M) {
    const { Engine, Bodies, Body, Composite, Constraint } = M;
    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.0012 }, positionIterations: 10, velocityIterations: 8 });
    const world = engine.world;
    const parts = []; // 그릴 것 {kind, body, w, h, r, color}
    const wall = (x, y, w, h, angle = 0, kind = "ramp") => {
      const b = Bodies.rectangle(x, y, w, h, { isStatic: true, angle, friction: 0.02, frictionStatic: 0, restitution: 0.2, label: kind });
      Composite.add(world, b); parts.push({ kind, body: b, w, h }); return b;
    };
    const peg = (x, y, r = 11) => {
      const b = Bodies.circle(x, y, r, { isStatic: true, restitution: 0.55, label: "peg" });
      Composite.add(world, b); parts.push({ kind: "peg", body: b, r }); return b;
    };

    // 양옆 벽
    wall(-10, 2700, 20, 6000, 0, "side"); wall(W + 10, 2700, 20, 6000, 0, "side");

    // 1) 출발 상자 + 문 (2초에 열림)
    wall(330, 300, 16, 220, 0, "box"); wall(750, 300, 16, 220, 0, "box");
    const gate = wall(540, 418, 440, 16, 0, "gate");

    // 2) 지그재그 미끄럼틀
    const zig = [[420, 640, 0.22, 760], [660, 900, -0.22, 760], [420, 1160, 0.22, 760], [660, 1420, -0.22, 760]];
    zig.forEach(([x, y, a, w]) => wall(x, y, w, 18, a));

    // 3) 핀볼 판 (못이 엇갈려 박힌 판 — 구슬 순위가 섞임)
    for (let row = 0; row < 8; row++) for (let col = 0; col < 9; col++) {
      const x = 90 + col * 112 + (row % 2 ? 56 : 0), y = 1640 + row * 92;
      if (x < 1040) peg(x, y);
    }

    // 4) 깔때기 → 물레방아(돌아가는 날개)
    wall(250, 2480, 520, 18, 0.5); wall(830, 2480, 520, 18, -0.5);
    const hub = { x: 540, y: 2760 };
    const blades = [];
    for (let k = 0; k < 4; k++) {
      const b = Bodies.rectangle(hub.x, hub.y, 300, 16, { isStatic: true, angle: (k * Math.PI) / 4, label: "wheel", friction: 0.05 });
      Composite.add(world, b); parts.push({ kind: "wheel", body: b, w: 300, h: 16 }); blades.push(b);
    }

    // 5) 시소 두 개 (가운데 못에 걸린 판, 아래 받침 못이 너무 기울지 않게 막음)
    const seesaws = [];
    for (const [x, y] of [[320, 3150], [760, 3450]]) {
      const plank = Bodies.rectangle(x, y, 380, 16, { density: 0.004, friction: 0.05, frictionStatic: 0, label: "seesaw" });
      const pin = Constraint.create({ pointA: { x, y }, bodyB: plank, pointB: { x: 0, y: 0 }, length: 0, stiffness: 1 });
      Composite.add(world, [plank, pin]); parts.push({ kind: "seesaw", body: plank, w: 380, h: 16, pivot: { x, y } }); seesaws.push(plank);
      peg(x - 150, y + 66, 10); peg(x + 150, y + 66, 10);
    }

    // 6) 범퍼(통통 튀는 동그라미) — 순위가 한 번 더 뒤집히는 곳
    for (const [x, y] of [[300, 3720], [540, 3800], [780, 3720], [420, 3940], [660, 3940]]) {
      const b = Bodies.circle(x, y, 34, { isStatic: true, restitution: 1.05, label: "bumper" });
      Composite.add(world, b); parts.push({ kind: "bumper", body: b, r: 34 });
    }

    // 7) 마지막 지그재그 → 결승선 → 바닥의 도미노(1등이 밀어서 차례로 넘어지면 끝에 종)
    wall(720, 4160, 700, 18, -0.24); wall(360, 4420, 700, 18, 0.24); wall(722, 4680, 700, 18, -0.24);
    const finishY = 4860;
    wall(540, 5080, 1080, 30, 0, "floor");
    const dominoes = [];
    for (let k = 0; k < 7; k++) {
      const x = 330 - k * 46;
      const d = Bodies.rectangle(x, 5065 - 15 - 50, 14, 100, { density: 0.0012, friction: 0.5, frictionStatic: 0.5, label: "domino" });
      Composite.add(world, d); parts.push({ kind: "domino", body: d, w: 14, h: 100 }); dominoes.push(d);
    }
    const bell = Bodies.circle(28, 4990, 22, { isStatic: true, isSensor: false, label: "bell" });
    Composite.add(world, bell); parts.push({ kind: "bell", body: bell, r: 22 });

    // 구슬
    const marbles = MARBLES.map((m, i) => {
      const b = Bodies.circle(410 + i * 86, 330, R, { restitution: 0.45, friction: 0.005, frictionAir: 0.0006, density: 0.003, label: "marble:" + m.id });
      Composite.add(world, b);
      return { ...m, body: b, r: R };
    });

    return { engine, marbles, parts, finishY, H: 5100, W, gate, blades, hub, Body, Composite };
  }

  function simulate(M, seconds = 40, fps = 24) {
    const C = build(M);
    const { engine, marbles, finishY, gate, blades, hub } = C;
    const sub = 5, dt = 1000 / (fps * sub); // 120Hz 로 계산, 24fps 로 기록
    const frames = [], finish = [], hits = [];
    let t = 0, gateOpen = false;
    M.Events.on(engine, "collisionStart", (ev) => {
      for (const p of ev.pairs) {
        const a = p.bodyA.label, b = p.bodyB.label;
        const mk = a.startsWith("marble:") ? p.bodyA : b.startsWith("marble:") ? p.bodyB : null;
        if (!mk) continue;
        const other = mk === p.bodyA ? p.bodyB : p.bodyA;
        const v = Math.hypot(mk.velocity.x - other.velocity.x, mk.velocity.y - other.velocity.y);
        if (v > 1.2) hits.push({ t: +t.toFixed(3), id: mk.label.slice(7), v: +v.toFixed(2), kind: other.label.split(":")[0] });
      }
    });
    const total = seconds * fps;
    for (let f = 0; f < total; f++) {
      for (let s = 0; s < sub; s++) {
        t += dt / 1000;
        if (!gateOpen && t >= 2.0) { M.Composite.remove(engine.world, gate); gateOpen = true; }
        // 물레방아: 일정한 속도로 돌기
        blades.forEach((b, k) => { M.Body.setAngle(b, (k * Math.PI) / 4 + t * 1.6); M.Body.setPosition(b, hub); M.Body.setAngularVelocity(b, 1.6 * dt / 1000); });
        M.Engine.update(engine, dt);
        for (const m of marbles) if (!finish.find((q) => q.id === m.id) && m.body.position.y > finishY) finish.push({ id: m.id, t: +t.toFixed(2) });
      }
      frames.push({
        m: marbles.map((m) => [Math.round(m.body.position.x * 10) / 10, Math.round(m.body.position.y * 10) / 10, +m.body.angle.toFixed(3)]),
        p: C.parts.filter((p) => !p.body.isStatic || p.kind === "wheel").map((p) => [Math.round(p.body.position.x * 10) / 10, Math.round(p.body.position.y * 10) / 10, +p.body.angle.toFixed(3)]),
        gate: gateOpen ? 0 : 1,
      });
      if (finish.length === marbles.length && f > (finish[finish.length - 1].t + 3.5) * fps) break;
    }
    return { frames, finish, hits, fps };
  }

  const api = { build, simulate, MARBLES, R, W };
  if (typeof module !== "undefined") module.exports = api; else root.Course = api;
})(typeof window !== "undefined" ? window : globalThis);
