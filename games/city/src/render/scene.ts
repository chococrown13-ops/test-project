import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CELL, N } from '../sim/defs';
import { DAY_SECONDS, type Sim } from '../sim/sim';
import type { LineKind } from '../sim/transit';
import { Atmosphere } from './atmosphere';
import { BuildingLayer } from './buildings';
import { CityCamera } from './camera';
import { GroundLayer, type Overlay } from './ground';
import { shared } from './materials';
import { PreviewLayer } from './preview';
import { RoadLayer } from './roads';
import { TransitLayer } from './transit';
import { VehicleLayer } from './vehicles';

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export type Quality = 'high' | 'normal';

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view: CityCamera;
  ground: GroundLayer;
  roads: RoadLayer;
  buildings = new BuildingLayer();
  readonly vehicles = new VehicleLayer();
  readonly preview = new PreviewLayer();
  transit = new TransitLayer();
  /** The line being drawn, if any. */
  draft: { kind: LineKind; stops: number[] } | null = null;
  private sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  private hemi = new THREE.HemisphereLight('#cfe6ff', '#6b7a55', 1.0);
  private atmo = new Atmosphere();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  quality: Quality = 'high';
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
    this.renderer.toneMappingExposure = 1.0;
    this.view = new CityCamera(1);
    this.ground = new GroundLayer(sim.w);
    this.roads = new RoadLayer(this.ground.tex);
    this.scene.add(this.ground.group, this.roads.group, this.buildings.group, this.vehicles.group, this.transit.group, this.preview.group);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.scene.fog = new THREE.Fog('#cde3ef', 600, 2600);
    this.scene.add(this.atmo.group);
    // Soft studio reflections give glass towers and car paint something to show.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.view.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** High: full pixel ratio, sharp shadows, clouds and night bloom. Normal: lighter for phones. */
  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.25));
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.atmo.cloudsOn = q === 'high';
    const s = new THREE.Vector2();
    this.renderer.getSize(s);
    this.resize(s.x, s.y);
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
    this.scene.remove(this.transit.group);
    this.transit = new TransitLayer();
    this.scene.add(this.transit.group);
    this.paintVer = '';
  }

  resize(wd: number, ht: number) {
    this.renderer.setSize(wd, ht, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(wd, ht);
    this.view.cam.aspect = wd / ht;
    this.view.cam.updateProjectionMatrix();
  }

  setOverlay(o: Overlay) {
    this.overlay = o;
    this.ground.overlay = o;
    this.roads.setTrafficOverlay(o === 'traffic');
    this.transit.showRoutes = o === 'transit';
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
    this.sun.intensity = 0.22 + day * 2.4;
    this.sun.color.setRGB(1, 0.93 - dusk * 0.2, 0.84 - dusk * 0.35);
    if (day < 0.1) this.sun.color.setRGB(0.6, 0.7, 1);
    this.hemi.intensity = 0.22 + day * 0.6;
    this.scene.environmentIntensity = 0.12 + day * 0.4;
    const night = shared.uNight.value;
    this.atmo.update(this.view.cam.position, shared.uTime.value, day, Math.min(1, dusk), night, this.sun.position.clone().sub(t).normalize());
    (this.scene.fog as THREE.Fog).color.copy(this.atmo.horizon);
    this.bloom.strength = this.quality === 'high' ? night * 0.85 : 0;
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
    shared.uTime.value = now;
    this.light(this.sim.clock);
    this.roads.update(w);
    this.buildings.update(w, now);
    this.vehicles.update(w, this.sim.tr);
    this.transit.update(w, w.day * DAY_SECONDS + this.sim.acc, this.draft);
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
    // Bloom only earns its cost at night, when windows and street lights glow.
    if (this.bloom.strength > 0.02) this.composer.render(dt);
    else this.renderer.render(this.scene, this.view.cam);
  }
}
