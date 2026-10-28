import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, N } from '../sim/defs';

const SIZE = N * CELL;

/**
 * A gradient sky with a sun glow and, at night, stars; plus a few low-poly
 * clouds that drift over the city and drag their shadows across it.
 */
export class Atmosphere {
  readonly group = new THREE.Group();
  readonly horizon = new THREE.Color();
  private sky: THREE.Mesh;
  private uni = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uNight: { value: 0 },
  };
  private clouds: THREE.InstancedMesh;
  private cloudSeeds: { x: number; z: number; y: number; s: number; r: number }[] = [];

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight;
        varying vec3 vDir;
        float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
          if (h < 0.0) c = uHorizon * 0.92;
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          c += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.28) * (1.0 - uNight);
          // Stars: a sparse hash on a direction grid, fading in after dusk.
          vec3 g = floor(d * 420.0);
          float st = step(0.9975, h31(g)) * smoothstep(0.05, 0.3, h) * uNight;
          c += vec3(st) * (0.6 + 0.4 * h31(g + 3.1));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // Clouds: a puff is a few squashed icosahedra; one instanced mesh holds them all.
    const puffs: THREE.BufferGeometry[] = [];
    for (const [x, y, z, r] of [[0, 0, 0, 22], [20, -3, 4, 16], [-18, -4, -3, 15], [6, 6, -8, 13], [-6, 3, 10, 12]]) {
      puffs.push(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.55, 1).translate(x, y, z));
    }
    const cloud = mergeGeometries(puffs)!;
    // Only the clouds' shadows show: seen from above a city they read as boulders, not weather.
    this.clouds = new THREE.InstancedMesh(cloud, new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false }), 14);
    this.clouds.castShadow = true;
    this.clouds.frustumCulled = false;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 14; i++) this.cloudSeeds.push({ x: rnd() * SIZE * 1.6 - SIZE * 0.3, z: rnd() * SIZE, y: 210 + rnd() * 70, s: 0.8 + rnd() * 1.1, r: rnd() * 6.28 });
    this.group.add(this.clouds);
  }

  set cloudsOn(on: boolean) { this.clouds.visible = on; }

  /** Colours for the time of day; `day` and `dusk` are 0..1, `sunDir` points at the sun. */
  update(camPos: THREE.Vector3, time: number, day: number, dusk: number, night: number, sunDir: THREE.Vector3) {
    this.sky.position.copy(camPos);
    const top = new THREE.Color('#071022').lerp(new THREE.Color('#3f84cc'), day).lerp(new THREE.Color('#5d5f9c'), Math.min(0.6, dusk * 0.7));
    this.horizon.set('#16223a').lerp(new THREE.Color('#cde3ef'), day).lerp(new THREE.Color('#f2a874'), Math.min(0.75, dusk * 0.85));
    this.uni.uTop.value.copy(top);
    this.uni.uHorizon.value.copy(this.horizon);
    this.uni.uSunDir.value.copy(sunDir);
    this.uni.uSunColor.value.set('#fff1d6').lerp(new THREE.Color('#ffb070'), Math.min(1, dusk));
    this.uni.uNight.value = night;
    if (!this.clouds.visible) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const span = SIZE * 1.8;
    this.cloudSeeds.forEach((c, i) => {
      const x = ((c.x + time * 6) % span + span) % span - SIZE * 0.4;
      q.setFromAxisAngle(up, c.r);
      p.set(x, c.y, c.z);
      s.setScalar(c.s);
      this.clouds.setMatrixAt(i, m.compose(p, q, s));
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
