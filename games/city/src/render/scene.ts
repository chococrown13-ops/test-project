import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { N8AOPass } from 'n8ao';
import { CELL, N, type BuildingKind } from '../sim/defs';
import { NN } from '../sim/graph';
import { calendarMonth, DAY_SECONDS, type Sim } from '../sim/sim';
import { busRoute } from '../sim/transit';
import type { BusType, LineKind } from '../sim/transit';
import { Atmosphere } from './atmosphere';
import { StylizePass, type ArtStyle } from './stylize';
import { BuildingLayer } from './buildings';
import { CityCamera } from './camera';
import { GroundLayer, type Overlay } from './ground';
import { shared } from './materials';
import { PreviewLayer } from './preview';
import { RoadLayer } from './roads';
import { TransitLayer } from './transit';
import { VehicleLayer } from './vehicles';
import { Fireworks } from './fireworks';
import { PeopleLayer } from './people';
import { SignalLayer } from './signals';
import { HighwayLayer } from './highway';
import { HazardLayer } from './hazards';

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
  readonly fireworks = new Fireworks();
  readonly people = new PeopleLayer();
  readonly signals = new SignalLayer();
  readonly highway = new HighwayLayer();
  readonly hazards = new HazardLayer();
  /** Game time per real second right now (0 when paused): people walk at this pace. */
  pace = 0;
  /** Always day: no night, the light stays at early afternoon. */
  dayLock = false;
  private stallTimer = 0;
  readonly preview = new PreviewLayer();
  transit = new TransitLayer();
  /** The line being drawn, if any. */
  draft: { kind: LineKind; stops: number[]; bus?: BusType } | null = null;
  private sun = new THREE.DirectionalLight('#fff4e0', 2.4);
  private hemi = new THREE.HemisphereLight('#dbe8f2', '#8a7a58', 1.0);
  private atmo = new Atmosphere();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private ao: N8AOPass;
  private renderPass: RenderPass;
  private stylize: StylizePass;
  quality: Quality = 'high';
  style: ArtStyle = 'lowpoly';
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private paintVer = '';
  private paintTimer = 0;
  private iconTimer = 0;
  private busKey = '';
  private busCells = new Set<number>();
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
    this.scene.add(this.ground.group, this.roads.group, this.buildings.group, this.vehicles.group, this.transit.group, this.preview.group, this.fireworks.group, this.people.group, this.signals.group, this.highway.group, this.hazards.group);
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
    // The composer's buffers carry depth, which the outline pass reads.
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.view.cam);
    this.composer.addPass(this.renderPass);
    // Ambient occlusion (N8AO, read from depth, so it works with the instanced, shader-built buildings):
    // soft dark where walls meet the ground, between blocks and under eaves. It draws the scene itself,
    // so it stands in for the render pass when on.
    this.ao = new N8AOPass(this.scene, this.view.cam, 1, 1);
    this.ao.configuration.aoRadius = 9;
    this.ao.configuration.distanceFalloff = 2.5;
    this.ao.configuration.intensity = 2.2;
    this.ao.configuration.color = new THREE.Color('#2a1f1a');
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.composer.addPass(this.ao);
    this.stylize = new StylizePass(this.scene, this.view.cam);
    this.stylize.skip = this.atmo.outlineSkip;
    this.composer.addPass(this.stylize);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // A gentle grade after tone mapping: a little more colour and contrast, the corners a touch darker.
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uSat: { value: 1.05 }, uContrast: { value: 1.08 }, uVignette: { value: 0.22 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform float uContrast; uniform float uVignette; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 col = mix(vec3(l), c.rgb, uSat);
          col = (col - 0.5) * uContrast + 0.5;
          // A touch warmer, like late-afternoon light on a model city.
          col *= vec3(1.025, 1.0, 0.965);
          vec2 d = vUv - 0.5;
          col *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
        }`,
    });
    this.composer.addPass(this.grade);
    this.renderPass.enabled = false;
    this.stylize.depthFrom = this.ao.beautyRenderTarget;
  }

  /** High: full pixel ratio, sharp shadows, clouds and night bloom. Normal: lighter for phones. */
  /** Low-poly, toon or pixel art. Pixel art renders at a third of the screen and scales up unsmoothed. */
  setStyle(s: ArtStyle) {
    this.style = s;
    this.stylize.style = s;
    this.renderer.domElement.style.imageRendering = s === 'pixel' ? 'pixelated' : '';
    this.setQuality(this.quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.setPixelRatio(this.style === 'pixel' ? 1 / 3 : Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.25));
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.atmo.cloudsOn = q === 'high';
    // Phones: lighter ambient occlusion at half resolution.
    this.ao.configuration.halfRes = q !== 'high';
    this.ao.setQualityMode(q === 'high' ? 'Medium' : 'Performance');
    const ao = this.style !== 'pixel';
    this.ao.enabled = ao; this.renderPass.enabled = !ao;
    this.stylize.depthFrom = ao ? this.ao.beautyRenderTarget : null;
    // Phones: no multisampling and a half-size normal buffer for the outlines.
    const samples = q === 'high' && this.style !== 'pixel' ? 4 : 0;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) if (t.samples !== samples) { t.samples = samples; t.dispose(); }
    this.stylize.normalScale = q === 'high' ? 1 : 0.5;
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

  /** Tint where a site-bound facility can go (or nothing). */
  setSites(kind: BuildingKind | null) {
    if (this.ground.showSites === kind) return;
    this.ground.showSites = kind;
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

  /**
   * Daylight from the real sun over Seoul (37.5°N) on the game's date: high and early in June, low and late in
   * December, so shadows swing round from the east in the morning to the west in the evening and stretch in winter.
   */
  private light(clock: number, gameDay = 0) {
    const doy = (((gameDay + 59) % 360) * 365) / 360; // the game starts on 1 March; 30-day months
    const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365);
    const lat = (37.5 * Math.PI) / 180, H = ((clock - 12.5) * 15 * Math.PI) / 180; // Korean clocks run half an hour ahead of the sun
    const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
    const elDeg = (Math.asin(sinEl) * 180) / Math.PI;
    const azm = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI; // from north, clockwise
    const day = smooth(-3, 8, elDeg);
    shared.uNight.value = 1 - smooth(-5, 5, elDeg);
    const dusk = Math.max(0, 1 - Math.abs(elDeg - 3) / 9) * (day > 0.02 ? 1 : 0.4);
    const t = this.view.target;
    // The sun's direction (north is -z on the map); at night a moonlike light from high up.
    const el = day > 0.01 ? Math.max(0.12, sinEl) : 0.8;
    const ce = Math.sqrt(1 - el * el);
    const dx = day > 0.01 ? Math.sin(azm) * ce : 0.3, dz = day > 0.01 ? -Math.cos(azm) * ce : 0.4;
    this.sun.position.set(t.x + dx * 520, el * 520, t.z + dz * 520);
    this.sun.target.position.copy(t);
    this.sun.intensity = 0.22 + day * 2.4;
    // Warm daylight, warmer still towards evening.
    this.sun.color.setRGB(1, 0.9 - dusk * 0.18, 0.77 - dusk * 0.32);
    if (day < 0.1) this.sun.color.setRGB(0.6, 0.7, 1);
    this.hemi.intensity = 0.22 + day * 0.6;
    this.scene.environmentIntensity = 0.12 + day * 0.4;
    const night = shared.uNight.value;
    this.atmo.update(this.view.cam.position, shared.uTime.value, day, Math.min(1, dusk), night, this.sun.position.clone().sub(t).normalize());
    (this.scene.fog as THREE.Fog).color.copy(this.atmo.horizon);
    this.bloom.strength = this.quality === 'high' ? night * 0.45 : 0;
    this.bloom.enabled = this.bloom.strength > 0.02;
    this.stylize.configure(this.view.dist, night);
    const s = Math.min(560, Math.max(140, this.view.dist * 1.2));
    const cam = this.sun.shadow.camera;
    if (cam.right !== s) { cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 10; cam.far = 1600; cam.updateProjectionMatrix(); }
    const f = this.scene.fog as THREE.Fog;
    // A light haze: far blocks fade a little towards the sky's colour, so the city has depth.
    f.near = this.view.dist * 1.25;
    f.far = this.view.dist * 4.2 + 650;
  }

  frame(dt: number, now: number) {
    const w = this.sim.w;
    this.view.update(dt);
    shared.uTime.value = now;
    // 낮 고정: the sun stays at early afternoon (the clock and the calendar still run).
    this.light(this.dayLock ? 14 : this.sim.clock, this.sim.w.day);
    // Ground cells under bus routes, for the median bus lanes.
    const bk = `${w.ver.transit}:${w.ver.roads}:${w.lines.length}`;
    if (bk !== this.busKey) {
      this.busKey = bk;
      this.busCells = new Set();
      for (const l of w.lines) if (l.kind === 'bus') for (const n of busRoute(w, l.stops, l.id) ?? []) if (n < NN) this.busCells.add(n);
    }
    // Seasons: foliage colour and snow follow the calendar.
    const month = calendarMonth(w.day);
    this.roads.update(w, { key: bk, cells: this.busCells }, month);
    this.fireworks.update(w, dt, shared.uNight.value);
    this.ground.shape(w);
    this.ground.month = month;
    const snow = ({ 12: 0.45, 1: 0.9, 2: 0.6 } as Record<number, number>)[month] ?? 0;
    shared.uSnow.value += (snow - shared.uSnow.value) * Math.min(1, dt * 0.8);
    this.buildings.heightAt = (x, z) => this.ground.heightAt(x, z);
    this.buildings.update(w, now);
    // Laying out a bus or subway line (or looking at the transit map): the buildings sink flat so the
    // streets, stops and routes underneath can be seen.
    const flat = !!this.draft || this.overlay === 'transit';
    const sy = this.buildings.group.scale.y, want = flat ? 0.04 : 1;
    if (Math.abs(sy - want) > 0.001) this.buildings.group.scale.y = sy + (want - sy) * Math.min(1, dt * 8);
    // Their badges would squash with them: hide those meanwhile.
    if (flat) for (const o of this.buildings.group.children) if ((o as THREE.Sprite).isSprite) o.visible = false;
    this.vehicles.update(w, this.sim.tr);
    this.signals.update(w, this.sim.tr.clock, this.view.dist);
    this.highway.update(w);
    this.hazards.heightAt = (x, z) => this.ground.heightAt(x, z);
    this.hazards.update(w, dt, this.view.target);
    this.people.crossings = this.sim.tr.crossings;
    this.people.update(w, dt, this.pace, shared.uNight.value, this.view.dist, this.sim.tr.clock, this.vehicles);
    this.transit.busPoses = this.vehicles.buses;
    this.transit.update(w, w.day * DAY_SECONDS + this.sim.acc, this.draft);
    // Ground repaint: on edits right away, and for live overlays a few times a second.
    const ver = `${w.ver.roads}:${w.ver.zones}:${w.ver.buildings}:${month}`;
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
      this.buildings.updateIcons(w, this.overlay === 'power' || this.overlay === 'water', this.overlay === 'parking');
      this.buildings.updateJams(w);
      if ((this.stallTimer -= 0.5) <= 0) { this.stallTimer = 3; this.buildings.updateStalls(w); }
      this.buildings.refreshInfo(w);
    }
    // Bloom only earns its cost at night, when windows and street lights glow.
    this.composer.render(dt);
  }
}
