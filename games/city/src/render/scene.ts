import * as THREE from 'three';
import { CELL, N } from '../sim/defs';
import type { Sim } from '../sim/sim';
import { BuildingLayer } from './buildings';
import { CityCamera } from './camera';
import { GroundLayer, type Overlay } from './ground';
import { shared } from './materials';
import { PreviewLayer } from './preview';
import { RoadLayer } from './roads';
import { VehicleLayer } from './vehicles';

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SKY = { day: new THREE.Color('#a9d0ea'), dusk: new THREE.Color('#e8a878'), night: new THREE.Color('#0d1524') };

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view: CityCamera;
  ground: GroundLayer;
  roads: RoadLayer;
  buildings = new BuildingLayer();
  readonly vehicles = new VehicleLayer();
  readonly preview = new PreviewLayer();
  private sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  private hemi = new THREE.HemisphereLight('#cfe6ff', '#6b7a55', 1.0);
  private sky = new THREE.Color();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private paintVer = '';
  private paintTimer = 0;
  private iconTimer = 0;
  private sim: Sim;
  overlay: Overlay = 'none';

  constructor(canvas: HTMLCanvasElement, sim: Sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.view = new CityCamera(1);
    this.ground = new GroundLayer(sim.w);
    this.roads = new RoadLayer(this.ground.tex);
    this.scene.add(this.ground.group, this.roads.group, this.buildings.group, this.vehicles.group, this.preview.group);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = new THREE.Fog('#a9d0ea', 600, 2600);
    this.scene.background = this.sky;
  }

  /** Swap in a different simulation (new game or load). */
  setSim(sim: Sim) {
    this.sim = sim;
    this.scene.remove(this.ground.group);
    this.ground = new GroundLayer(sim.w);
    this.scene.add(this.ground.group);
    this.scene.remove(this.roads.group);
    this.roads = new RoadLayer(this.ground.tex);
    this.scene.add(this.roads.group);
    this.scene.remove(this.buildings.group);
    this.buildings = new BuildingLayer();
    this.scene.add(this.buildings.group);
    this.paintVer = '';
  }

  resize(wd: number, ht: number) {
    this.renderer.setSize(wd, ht, false);
    this.view.cam.aspect = wd / ht;
    this.view.cam.updateProjectionMatrix();
  }

  setOverlay(o: Overlay) {
    this.overlay = o;
    this.ground.overlay = o;
    this.roads.setTrafficOverlay(o === 'traffic');
    this.paintVer = '';
  }

  setZoneable(on: boolean) {
    if (this.ground.showZoneable === on) return;
    this.ground.showZoneable = on;
    this.paintVer = '';
  }

  /** Ground cell under a screen point, or null. */
  pick(px: number, py: number, rect: DOMRect): { x: number; y: number; wx: number; wz: number } | null {
    const v = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.view.cam);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    const x = Math.floor(hit.x / CELL), y = Math.floor(hit.z / CELL);
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    return { x, y, wx: hit.x, wz: hit.z };
  }

  private light(clock: number) {
    const day = smooth(5, 7, clock) * (1 - smooth(18, 20, clock));
    shared.uNight.value = 1 - smooth(5.5, 7, clock) * (1 - smooth(17.5, 19.5, clock));
    const dusk = Math.max(0, 1 - Math.abs(clock - 18.7) / 1.6) + Math.max(0, 1 - Math.abs(clock - 6) / 1.3);
    const ang = ((clock - 6) / 12) * Math.PI;
    const t = this.view.target;
    const el = day > 0.01 ? Math.max(0.12, Math.sin(ang)) : 0.8;
    const az = day > 0.01 ? Math.cos(ang) : 0.3;
    this.sun.position.set(t.x + az * 400, el * 520, t.z + 220);
    this.sun.target.position.copy(t);
    this.sun.intensity = 0.25 + day * 2.3;
    this.sun.color.setRGB(1, 0.93 - dusk * 0.2, 0.84 - dusk * 0.35);
    if (day < 0.1) this.sun.color.setRGB(0.6, 0.7, 1);
    this.hemi.intensity = 0.3 + day * 0.75;
    this.sky.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, Math.min(0.7, dusk * 0.8));
    (this.scene.fog as THREE.Fog).color.copy(this.sky);
    const s = Math.min(560, Math.max(140, this.view.dist * 1.2));
    const cam = this.sun.shadow.camera;
    if (cam.right !== s) { cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 10; cam.far = 1600; cam.updateProjectionMatrix(); }
    const f = this.scene.fog as THREE.Fog;
    f.near = this.view.dist * 1.6;
    f.far = this.view.dist * 5 + 800;
  }

  frame(dt: number, now: number) {
    const w = this.sim.w;
    this.view.update(dt);
    this.light(this.sim.clock);
    shared.uTime.value = now;
    this.roads.update(w);
    this.buildings.update(w, now);
    this.vehicles.update(w, this.sim.tr);
    // Ground repaint: on edits right away, and for live overlays a few times a second.
    const ver = `${w.ver.roads}:${w.ver.zones}:${w.ver.buildings}`;
    this.paintTimer -= dt;
    if (ver !== this.paintVer || (this.overlay !== 'none' && this.paintTimer <= 0)) {
      this.paintVer = ver;
      this.paintTimer = 0.5;
      this.ground.paint(w);
      this.ground.plantTrees(w);
    }
    this.iconTimer -= dt;
    if (this.iconTimer <= 0) {
      this.iconTimer = 0.5;
      this.buildings.updateIcons(w, this.overlay === 'power' || this.overlay === 'water');
      this.buildings.refreshInfo(w);
    }
    this.renderer.render(this.scene, this.view.cam);
  }
}
