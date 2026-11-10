import { N } from './defs';

/**
 * The land a city starts on. Every map has some water (a 정수장 needs it), a
 * flat corridor along the west edge for the expressway link, and hills whose
 * heights come from the seed alone, so the renderer can rebuild them.
 */
export type MapKind = 'river' | 'coast' | 'lake' | 'valley' | 'plain' | 'island';

export const MAPS: { id: MapKind; name: string; desc: string }[] = [
  { id: 'river', name: '강변 도시', desc: '도시를 가로지르는 큰 강, 뒤로는 산' },
  { id: 'coast', name: '바닷가 도시', desc: '남쪽으로 탁 트인 바다와 모래사장' },
  { id: 'lake', name: '호숫가 도시', desc: '가운데 넓은 호수와 흘러나가는 개울' },
  { id: 'valley', name: '산골 분지', desc: '산으로 둘러싸인 아늑한 분지, 시냇물 하나' },
  { id: 'plain', name: '너른 평야', desc: '땅은 넓고 물은 작은 못과 실개천뿐' },
  { id: 'island', name: '섬 도시', desc: '바다에 떠 있는 섬, 다리 하나로 육지와 이어져요' },
];

export const isMapKind = (s: unknown): s is MapKind => MAPS.some((m) => m.id === s);

/** A map kind picked from the seed: for 무작위. */
export const randomMap = (seed: number): MapKind => MAPS[Math.abs(Math.floor(seed / 7)) % MAPS.length].id;

/** River centre line: a gentle S-curve across the map, like a city on the 한강. */
export function riverY(x: number, seed: number): number {
  const p = seed % 1000 / 1000;
  return N * 0.58 + Math.sin((x / N) * Math.PI * 1.6 + p * 6) * 9 + Math.sin((x / N) * Math.PI * 4.2 + p * 3) * 2.5;
}

const fh = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = fh(xi, yi), b = fh(xi + 1, yi), c = fh(xi, yi + 1), d = fh(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const phase = (seed: number) => (seed % 1000) / 1000;
const coastY = (x: number, seed: number) => { const p = phase(seed); return N * 0.7 + Math.sin((x / N) * Math.PI * 1.3 + p * 6) * 7 + Math.sin(x * 0.21 + p * 9) * 2; };
const streamY = (x: number, seed: number) => { const p = phase(seed); return N * 0.62 + Math.sin((x / N) * Math.PI * 2 + p * 6) * 6 + Math.sin(x * 0.17 + p) * 1.5; };
const lakeC = (seed: number) => ({ x: N * (0.58 + phase(seed) * 0.1), y: N * 0.64 });
const pondC = (seed: number) => ({ x: N * (0.62 + phase(seed) * 0.15), y: N * 0.28 });

/** Row of the expressway link from the west edge. */
export function startRow(seed: number, kind: MapKind): number {
  switch (kind) {
    case 'river': return Math.round(riverY(0, seed) - 22);
    case 'coast': return Math.round(coastY(0, seed) - 24);
    case 'lake': return Math.round(N * 0.38);
    case 'valley': return Math.round(streamY(0, seed) - 14);
    case 'plain': return Math.round(N * 0.55);
    case 'island': return Math.round(N * 0.5);
  }
}

/** 1 where the map starts under water. */
export function waterMask(seed: number, kind: MapKind): Uint8Array {
  const m = new Uint8Array(N * N);
  const o = (seed % 997) * 0.37;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let wet = false;
    switch (kind) {
      case 'river': {
        const half = 3.6 + Math.sin(x * 0.07 + seed) * 0.9;
        wet = Math.abs(y + 0.5 - riverY(x, seed)) < half;
        break;
      }
      case 'coast': wet = y + 0.5 > coastY(x, seed); break;
      case 'lake': {
        const c = lakeC(seed), a = Math.atan2(y - c.y, x - c.x);
        const r = 1 + (vnoise(Math.cos(a) * 2 + o, Math.sin(a) * 2) - 0.5) * 0.5;
        wet = Math.hypot((x - c.x) / 20, (y - c.y) / 13) < r;
        // A creek runs out of the lake to the east edge.
        if (!wet && x > c.x) wet = Math.abs(y + 0.5 - (c.y + Math.sin(x * 0.11 + o) * 3)) < 1.3;
        break;
      }
      case 'valley': wet = Math.abs(y + 0.5 - streamY(x, seed)) < 1.6; break;
      case 'plain': {
        const c = pondC(seed);
        wet = Math.hypot(x - c.x, y - c.y) < 6 + (vnoise(x / 3 + o, y / 3) - 0.5) * 2;
        // 실개천 from the pond down to the south edge.
        if (!wet && y > c.y) wet = Math.abs(x + 0.5 - (c.x + Math.sin(y * 0.12 + o) * 4)) < 1.2;
        break;
      }
      case 'island': {
        const a = Math.atan2(y - N / 2, x - N / 2);
        const r = N * 0.4 + (vnoise(Math.cos(a) * 2.5 + o, Math.sin(a) * 2.5) - 0.5) * 14;
        wet = Math.hypot(x - N / 2, y - N / 2) > r;
        break;
      }
    }
    if (wet) m[y * N + x] = 1;
  }
  return m;
}

/** Chebyshev distance from water, capped at 12. */
function waterDistance(m: Uint8Array): Uint8Array {
  const d = new Uint8Array(N * N).fill(12);
  let q: number[] = [];
  for (let i = 0; i < N * N; i++) if (m[i]) { d[i] = 0; q.push(i); }
  for (let k = 1; k < 12 && q.length; k++) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % N, y = (i / N) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (d[j] > k) { d[j] = k; next.push(j); }
      }
    }
    q = next;
  }
  return d;
}

/**
 * Mountain heights in metres per cell (0 on flat land). Water, its banks and
 * the start road stay flat.
 */
export function hillField(seed: number, kind: MapKind): Float32Array {
  const h = new Float32Array(N * N);
  const o = (seed % 997) * 0.37;
  const row = startRow(seed, kind);
  if (kind === 'river') {
    // A ridge along the north edge and one hill south of the river: 배산임수.
    const hx = Math.round(N * (0.55 + (seed % 7) * 0.03)), hy = Math.round(Math.min(N - 14, riverY(hx, seed) + 22));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const depth = 6 + vnoise(x / 13 + o, 3.1) * 13;
      let v = 0;
      if (y < depth) v = ((depth - y) / depth) ** 0.8 * (45 + vnoise(x / 8 + o, 7.7) * 50);
      const d = Math.hypot(x - hx, y - hy), r = 7.5 + vnoise(o, 1.3) * 3;
      if (d < r) v = Math.max(v, (1 - d / r) ** 1.2 * (55 + vnoise(o, 9.1) * 25));
      v *= 0.85 + vnoise(x / 4 + o, y / 4) * 0.3;
      const river = Math.abs(y + 0.5 - riverY(x, seed));
      if (river < 9 || (x < 40 && Math.abs(y - row) < 12) || v < 4) v = 0;
      h[y * N + x] = v;
    }
    return h;
  }
  const wd = waterDistance(waterMask(seed, kind));
  // A ridge rising toward one edge of the map; `t` is the distance in from that edge.
  const ridge = (t: number, along: number, salt: number, scale = 1) => {
    const depth = 6 + vnoise(along / 13 + o + salt, 3.1) * 13;
    return t < depth ? ((depth - t) / depth) ** 0.8 * (45 + vnoise(along / 8 + o + salt, 7.7) * 50) * scale : 0;
  };
  const hill = (x: number, y: number, cx: number, cy: number, r: number, top: number) => {
    // A ragged outline rather than a disc: the radius wanders with the direction.
    const a = Math.atan2(y - cy, x - cx);
    r *= 0.75 + vnoise(Math.cos(a) * 1.8 + cx * 0.1 + o, Math.sin(a) * 1.8 + cy * 0.1) * 0.55;
    const d = Math.hypot(x - cx, y - cy);
    return d < r ? (1 - d / r) ** 1.2 * top : 0;
  };
  const margin = kind === 'valley' || kind === 'plain' ? 5 : 8;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    switch (kind) {
      case 'coast':
        v = Math.max(ridge(y, x, 0), hill(x, y, N * 0.82, coastY(N * 0.82, seed) - 12, 9, 60));
        break;
      case 'lake':
        v = Math.max(ridge(y, x, 0) * (x > N * 0.35 ? 1 : 0.4), hill(x, y, N * 0.22, N * 0.84, 10, 55));
        break;
      case 'valley':
        // Hills on three sides; the west stays open for the road in.
        v = Math.max(ridge(y, x, 0, 1.1), ridge(N - 1 - y, x, 5.5, 0.9), ridge(N - 1 - x, y, 2.7, 1.2));
        v = Math.max(v, hill(x, y, N * 0.5, N * 0.3, 7, 40 * (0.8 + phase(seed) * 0.4)));
        break;
      case 'plain':
        v = Math.max(hill(x, y, N * 0.3, N * 0.18, 9, 35), hill(x, y, N * 0.45, N * 0.86, 8, 30));
        break;
      case 'island':
        v = hill(x, y, N * 0.56, N * 0.34, 13, 75);
        break;
    }
    v *= 0.85 + vnoise(x / 4 + o, y / 4) * 0.3;
    if (wd[y * N + x] < margin || (x < 40 && Math.abs(y - row) < 12) || v < 4) v = 0;
    h[y * N + x] = v;
  }
  return h;
}
