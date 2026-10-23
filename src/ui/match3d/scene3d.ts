import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { appearance } from '../../game/appearance';
import {
  GOAL_HALF,
  MARGIN,
  PITCH_H,
  PITCH_W,
  drawPitch,
  readableOn,
  type SceneView,
  type SideKey,
} from '../match2d/director';

/**
 * 3D renderer for the match. It owns no match logic: every frame it reads the
 * director's scene snapshot and poses a stadium full of players to match.
 *
 * Two quality tiers. "high" adds real-time shadows, full pixel density and a
 * bloom pass (floodlights, LED boards); "low" falls back to blob shadows at
 * 1x with no post-processing so older phones keep their frame rate. The
 * caller measures frame time and steps down when needed.
 *
 * Axes: pitch x (0-105) -> world x centred on 0, pitch y (0-68) -> world z
 * centred on 0, y is up. The main camera sits on the +z touchline.
 */

export type CameraMode = 'broadcast' | 'tactical';
export type Quality = 'high' | 'low';

/** Players are drawn larger than life so they read on a small screen. */
const PLAYER_SCALE = 1.6;
const BALL_R = 0.3;
const KICK_TIME = 0.34;
const TRAIL = 16;

const wx = (x: number) => x - PITCH_W / 2;
const wz = (y: number) => y - PITCH_H / 2;


interface Limb {
  hip: THREE.Group;
  knee: THREE.Group;
}

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
}

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  legL: Limb;
  legR: Limb;
  armL: Arm;
  armR: Arm;
  blob: THREE.Mesh;
  badge: THREE.Sprite;
  badgeKey: string;
  numberDecal: THREE.Mesh;
  chestDecal: THREE.Mesh;
  numberKey: string;
  kitKey: string;
  parts: {
    shirt: THREE.Mesh[];
    shorts: THREE.Mesh[];
    socks: THREE.Mesh[];
    trim: THREE.Mesh[];
    hands: THREE.Mesh[];
  };
  prev: { x: number; y: number };
  phase: number;
  yaw: number;
  kickT: number;
  seed: number;
  speed: number;
  /** Dribble: 0-1 through the current touch, and a small kick when it wraps. */
  touch: number;
  touchKickT: number;
}

export class Match3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.5, 700);
  private sun: THREE.DirectionalLight;
  private rigs = new Map<string, Rig>();
  private ball: THREE.Mesh;
  private ballBlob: THREE.Mesh;
  private ownerLabel: THREE.Sprite;
  private ownerLabelKey = '';
  private prevOwner: string | null = null;
  private cardSprites: THREE.Sprite[] = [];
  private cardTextures: Record<'yellow' | 'red' | 'injury', THREE.Texture>;
  private ledTextures: THREE.Texture[] = [];
  private crowd: THREE.InstancedMesh | null = null;
  private crowdEnds: number[] = [];
  private crowdKey = '';
  private crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
  private nets: { end: number; geo: THREE.PlaneGeometry; base: Float32Array; amp: number; at: { x: number; y: number } }[] = [];
  private trail: THREE.Sprite[] = [];
  private trailPts: THREE.Vector3[] = [];
  private composer: EffectComposer | null = null;
  private size = { w: 1, h: 1 };
  private replayAngle = 0;
  private fascia: THREE.MeshStandardMaterial;
  private fasciaColor = '';

  private geo = buildGeometries();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private blobMat: THREE.MeshBasicMaterial;

  private quality: Quality = 'high';
  private mode: CameraMode = 'broadcast';
  private focus = new THREE.Vector3(0, 0, 0);
  private camPos = new THREE.Vector3(0, 30, 60);
  private zoom = 0;
  private aspect = 1;
  private time = 0;
  private ballSpin = 0;
  private lastBall = { x: PITCH_W / 2, y: PITCH_H / 2 };
  private ballShown = new THREE.Vector3();
  private wasReplay = false;
  private replayCam = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog('#16233c', 190, 360);

    // Image-based light for soft reflections on kits, posts and the roof.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#27501f', 0.85));
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.3);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    // A cool fill from the opposite side stops the shadowed side going flat.
    const fill = new THREE.DirectionalLight('#9fb8ff', 0.55);
    fill.position.set(40, 30, -50);
    this.scene.add(fill);

    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    this.fascia = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.5, metalness: 0.1 });

    this.buildPitch();
    this.buildStadium();

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 18),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballBlob = new THREE.Mesh(this.geo.blob, this.blobMat);
    this.scene.add(this.ballBlob);

    // Shots leave a short glowing trail.
    const trailMat = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < TRAIL; i++) {
      const sprite = new THREE.Sprite(trailMat.clone());
      sprite.visible = false;
      this.trail.push(sprite);
      this.scene.add(sprite);
    }

    this.ownerLabel = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.ownerLabel.renderOrder = 10;
    this.scene.add(this.ownerLabel);

    this.cardTextures = {
      yellow: cardTexture('#facc15'),
      red: cardTexture('#ef4444'),
      injury: injuryTexture(),
    };

    this.setQuality('high');
  }

  setSize(width: number, height: number): void {
    this.size = { w: width, h: height };
    this.renderer.setSize(width, height, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(width, height);
    }
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  setCameraMode(mode: CameraMode): void {
    this.mode = mode;
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    const high = quality === 'high';
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.ballBlob.visible = !high;
    this.rigs.forEach((rig) => (rig.blob.visible = !high));
    if (high && !this.composer) {
      // Multisampled HDR target so bloom keeps antialiased edges.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 1.05));
      this.composer.addPass(new OutputPass());
    } else if (!high && this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.setSize(this.size.w, this.size.h);
    if (this.crowd) this.crowd.count = high ? this.crowdEnds.length : Math.floor(this.crowdEnds.length * 0.55);
    // Shaders are compiled with or without shadow support; force a rebuild.
    this.scene.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => (m.needsUpdate = true));
      else if (material) material.needsUpdate = true;
    });
  }

  /**
   * Draw one frame. `replay` switches to the low replay camera; switching in
   * or out is treated as a cut, so nothing sprints or swings across the gap.
   */
  render(view: SceneView, dt: number, replay = false): void {
    this.time += dt;
    const cut = replay !== this.wasReplay;
    this.wasReplay = replay;
    this.replayCam = replay;
    if (cut && replay) this.replayAngle = (this.replayAngle + 1) % 3;
    if (cut) {
      view.actors.forEach((a) => {
        const rig = this.rigs.get(a.id);
        if (rig) rig.prev = { x: a.pos.x, y: a.pos.y };
      });
      this.prevOwner = view.ownerId;
    }
    if (view.kits.home.fill !== this.fasciaColor) {
      this.fasciaColor = view.kits.home.fill;
      this.fascia.color.set(this.fasciaColor);
    }
    // The crowd jumps when a goal goes in; LED boards scroll.
    this.colourCrowd(view);
    const excite = this.crowdUniforms.uExcite;
    excite.value += ((view.celebrating ? 1 : view.highlight ? 0.25 : 0) - excite.value) * Math.min(1, dt * 3);
    this.crowdUniforms.uTime.value = this.time;
    this.ledTextures.forEach((tex) => (tex.offset.x = (this.time * 0.05) % 1));

    this.syncPlayers(view, dt);
    this.poseBall(view, dt);
    this.poseNets(dt);
    this.poseTrail(dt);
    this.poseCards(view);
    this.moveCamera(view, dt, cut);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.composer?.dispose();
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      const release = (m: THREE.Material) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      };
      if (Array.isArray(material)) material.forEach(release);
      else if (material) release(material);
    });
  }

  /* ------------------------------------------------------------------ pitch */

  private buildPitch(): void {
    const fullW = PITCH_W + MARGIN * 2;
    const fullH = PITCH_H + MARGIN * 2;
    const texW = 2048;
    const s = texW / fullW;
    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = Math.round(fullH * s);
    const ctx = canvas.getContext('2d')!;
    const X = (x: number) => (x + MARGIN) * s;
    const Y = (y: number) => (y + MARGIN) * s;
    drawPitch(ctx, canvas.width, canvas.height, s, X, Y);

    // Stronger mowing stripes than the flat 2D view needs.
    const stripes = 18;
    const stripeW = canvas.width / stripes;
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    for (let i = 1; i < stripes; i += 2) ctx.fillRect(i * stripeW, 0, stripeW, canvas.height);

    // Wear where the boots go: goalmouths and the centre circle.
    const wear = (x: number, y: number, rx: number, ry: number, alpha: number) => {
      ctx.save();
      ctx.translate(X(x), Y(y));
      ctx.scale(rx * s, ry * s);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(120,110,60,${alpha})`);
      g.addColorStop(1, 'rgba(120,110,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    wear(3, PITCH_H / 2, 5, 8, 0.35);
    wear(PITCH_W - 3, PITCH_H / 2, 5, 8, 0.35);
    wear(PITCH_W / 2, PITCH_H / 2, 10, 7, 0.12);

    // Blade-level speckle so the grass doesn't look like flat paint up close.
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      data[i] = clampByte(data[i] + n * 0.6);
      data[i + 1] = clampByte(data[i + 1] + n);
      data[i + 2] = clampByte(data[i + 2] + n * 0.4);
    }
    ctx.putImageData(img, 0, 0);

    const grassTex = new THREE.CanvasTexture(canvas);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(fullW, fullH).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: grassTex, color: '#cfdcc6', roughness: 0.9, metalness: 0, bumpMap: grassBump(), bumpScale: 0.9 }),
    );
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    // Surround: grass, then a running-track coloured apron.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(fullW + 14, fullH + 14).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1f5c2a', roughness: 1 }),
    );
    apron.position.y = -0.02;
    apron.receiveShadow = true;
    this.scene.add(apron);
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(fullW + 60, fullH + 60).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#2a3342', roughness: 1 }),
    );
    track.position.y = -0.04;
    this.scene.add(track);
  }

  /* ---------------------------------------------------------------- stadium */

  private buildStadium(): void {
    // LED advertising boards round the pitch. Their textures scroll and glow.
    const edge = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.6 });
    const board = (length: number, x: number, z: number, rotY: number) => {
      const tex = boardTexture();
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(length / 16, 1);
      this.ledTextures.push(tex);
      const face = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: '#ffffff',
        emissiveMap: tex,
        emissiveIntensity: 1.25,
        roughness: 0.5,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, 0.95, 0.15), [edge, edge, edge, edge, face, edge]);
      mesh.position.set(x, 0.48, z);
      mesh.rotation.y = rotY;
      mesh.castShadow = true;
      this.scene.add(mesh);
    };
    board(PITCH_W + 6, 0, -(PITCH_H / 2 + MARGIN + 0.5), 0);
    board(PITCH_W + 6, 0, PITCH_H / 2 + MARGIN + 0.5, Math.PI);
    board(PITCH_H + 6, -(PITCH_W / 2 + MARGIN + 0.5), 0, Math.PI / 2);
    board(PITCH_H + 6, PITCH_W / 2 + MARGIN + 0.5, 0, -Math.PI / 2);

    // Two-tier stands with a cantilever roof on three sides, a low one behind
    // the dugouts. Fans are one instanced mesh filled in afterwards.
    const concrete = new THREE.MeshStandardMaterial({ color: '#3a4558', roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1a2130', roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: '#9aa6b8', roughness: 0.35, metalness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#e5eaf2', roughness: 0.45, metalness: 0.35 });
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6dc').multiplyScalar(5) });
    const seatTex = seatTexture();
    seatTex.wrapS = THREE.RepeatWrapping;
    const seats = new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.8 });
    const fans: { pos: THREE.Vector3; yaw: number; end: number }[] = [];

    const stand = (length: number, cx: number, cz: number, rotY: number, kind: 'main' | 'low', end = 0) => {
      const group = new THREE.Group();
      const spots: THREE.Vector3[] = [];
      const tier = (rows: number, z0: number, y0: number, rowD: number, rise: number) => {
        for (let i = 0; i < rows; i++) {
          const top = y0 + (i + 1) * rise;
          const step = new THREE.Mesh(new THREE.BoxGeometry(length, rise + 0.02, rowD), [dark, dark, concrete, dark, seats, dark]);
          step.position.set(0, top - rise / 2, z0 - (i + 0.5) * rowD);
          group.add(step);
          for (let x = -length / 2 + 0.6; x < length / 2 - 0.6; x += 0.82) {
            if (Math.random() < 0.88) spots.push(new THREE.Vector3(x + (Math.random() - 0.5) * 0.2, top, z0 - (i + 0.62) * rowD));
          }
        }
        return { back: z0 - rows * rowD, top: y0 + rows * rise };
      };
      // Front wall in club colours, with the lower tier rising behind it.
      const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 1.3, 0.3), this.fascia);
      wall.position.set(0, 0.65, 0.15);
      group.add(wall);
      const lower = tier(kind === 'main' ? 12 : 7, 0, 1.3, 0.9, 0.5);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(length, lower.top, 0.6), dark);
      fill.position.set(0, lower.top / 2, lower.back - 0.3);
      group.add(fill);

      if (kind === 'main') {
        // Concourse box, then the upper tier hanging slightly over the lower.
        const concourse = new THREE.Mesh(new THREE.BoxGeometry(length, 3, 1.4), concrete);
        concourse.position.set(0, lower.top + 1.5, lower.back + 0.1);
        group.add(concourse);
        const y0 = lower.top + 3;
        const z0 = lower.back + 0.9;
        const upper = tier(11, z0, y0, 0.95, 0.62);
        // Underside of the upper tier, seen from low cameras.
        const slope = Math.hypot(upper.top - y0, z0 - upper.back);
        const soffit = new THREE.Mesh(new THREE.PlaneGeometry(length, slope), dark);
        soffit.material = dark;
        soffit.position.set(0, (y0 + upper.top) / 2 - 0.3, (z0 + upper.back) / 2);
        soffit.rotation.x = Math.PI / 2 + Math.atan2(upper.top - y0, z0 - upper.back);
        group.add(soffit);
        // Fascia and a ribbon LED board along the upper tier front.
        const band = new THREE.Mesh(new THREE.BoxGeometry(length, 1.1, 0.3), this.fascia);
        band.position.set(0, y0 - 0.25, z0 + 0.2);
        group.add(band);
        const ribbonTex = boardTexture();
        ribbonTex.wrapS = THREE.RepeatWrapping;
        ribbonTex.repeat.set(length / 20, 1);
        this.ledTextures.push(ribbonTex);
        const ribbon = new THREE.Mesh(
          new THREE.PlaneGeometry(length, 0.7),
          new THREE.MeshStandardMaterial({ map: ribbonTex, emissive: '#ffffff', emissiveMap: ribbonTex, emissiveIntensity: 1.1 }),
        );
        ribbon.position.set(0, y0 - 0.25, z0 + 0.36);
        group.add(ribbon);

        // Back wall, roof, front truss with a light strip under it, columns.
        const roofY = upper.top + 4.5;
        const back = new THREE.Mesh(new THREE.BoxGeometry(length, roofY, 0.6), concrete);
        back.position.set(0, roofY / 2, upper.back - 0.3);
        group.add(back);
        const roofDepth = -upper.back + 2;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.35, roofDepth), roofMat);
        roof.position.set(0, roofY, upper.back + roofDepth / 2 - 0.5);
        roof.rotation.x = -0.05;
        group.add(roof);
        const frontZ = upper.back + roofDepth - 0.5;
        const truss = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.9, 0.7), steel);
        truss.position.set(0, roofY - 0.1 - Math.sin(0.05) * roofDepth * 0.5, frontZ);
        group.add(truss);
        const lights = new THREE.Mesh(new THREE.BoxGeometry(length * 0.96, 0.14, 0.3), strip);
        lights.position.set(0, truss.position.y - 0.55, frontZ - 0.2);
        group.add(lights);
        const ribs = Math.round(length / 9);
        for (let i = 0; i <= ribs; i++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, roofDepth), steel);
          rib.position.set(-length / 2 + (i * length) / ribs, roofY + 0.45, roof.position.z);
          rib.rotation.x = -0.05;
          group.add(rib);
        }
        const columns = Math.max(2, Math.round(length / 22));
        for (let i = 0; i <= columns; i++) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, roofY, 8), steel);
          col.position.set(-length / 2 + (i * length) / columns, roofY / 2, upper.back + 0.2);
          group.add(col);
        }
      }

      group.position.set(cx, 0, cz);
      group.rotation.y = rotY;
      this.scene.add(group);
      group.updateMatrixWorld(true);
      spots.forEach((p) => fans.push({ pos: p.applyMatrix4(group.matrixWorld), yaw: rotY, end }));
    };
    const back = PITCH_H / 2 + MARGIN + 3;
    const side = PITCH_W / 2 + MARGIN + 3;
    stand(PITCH_W + 20, 0, -back, 0, 'main');
    stand(PITCH_H + 16, -side, 0, Math.PI / 2, 'main', -1);
    stand(PITCH_H + 16, side, 0, -Math.PI / 2, 'main', 1);
    // Near side: low terraces either side of the dugouts.
    stand(40, -40, back + 2, Math.PI, 'low');
    stand(40, 40, back + 2, Math.PI, 'low');
    this.buildCrowd(fans);

    // Dugouts on the near touchline.
    const dugoutShell = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4, metalness: 0.2 });
    const dugoutGlass = new THREE.MeshStandardMaterial({
      color: '#93c5fd',
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
    });
    const seatMat = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.6 });
    [-12, 12].forEach((x) => {
      const group = new THREE.Group();
      const backPanel = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 0.15), dugoutShell);
      backPanel.position.set(0, 1.1, 1.2);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 2.4), dugoutGlass);
      roof.position.set(0, 2.2, 0);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.5, 0.6), seatMat);
      bench.position.set(0, 0.25, 0.8);
      group.add(backPanel, roof, bench);
      group.position.set(x, 0, PITCH_H / 2 + MARGIN + 2.5);
      this.scene.add(group);
    });

    // Floodlight pylons: a bank of lamps that bloom on high quality.
    const poleMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.5, metalness: 0.5 });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fffbe8').multiplyScalar(6) });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6 });
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 44, 10), poleMat);
      pole.position.set(sx * (PITCH_W / 2 + 26), 22, sz * (PITCH_H / 2 + 24));
      this.scene.add(pole);
      const head = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.6, 0.6), frameMat);
      head.add(frame);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.2), lampMat);
          lamp.position.set(-3.2 + c * 1.6, -1.4 + r * 1.4, 0.35);
          head.add(lamp);
        }
      }
      head.position.set(pole.position.x, 44, pole.position.z);
      head.lookAt(0, 0, 0);
      this.scene.add(head);
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(head.position);
      glow.scale.set(30, 30, 1);
      this.scene.add(glow);
    });

    // Goals: posts, bar, back stays and a net that bulges when it's hit.
    const postMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const netMat = new THREE.MeshBasicMaterial({
      map: netTexture(),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const goalH = 2.44;
    const goalD = 2.2;
    [-1, 1].forEach((end) => {
      const group = new THREE.Group();
      const postGeo = new THREE.CylinderGeometry(0.07, 0.07, goalH, 10);
      [-GOAL_HALF, GOAL_HALF].forEach((z) => {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(0, goalH / 2, z);
        post.castShadow = true;
        group.add(post);
        const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.3, 6), postMat);
        stay.position.set((end * goalD) / 2, goalH / 2, z);
        stay.rotation.z = end * -0.74;
        group.add(stay);
      });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_HALF * 2 + 0.14, 10), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, goalH, 0);
      bar.castShadow = true;
      group.add(bar);

      const backGeo = new THREE.PlaneGeometry(GOAL_HALF * 2, goalH, 16, 6);
      const back = new THREE.Mesh(backGeo, netMat);
      back.rotation.y = Math.PI / 2;
      back.position.set(end * goalD, goalH / 2, 0);
      group.add(back);
      this.nets.push({ end, geo: backGeo, base: Float32Array.from(backGeo.attributes.position.array), amp: 0, at: { x: 0, y: 0 } });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(goalD, GOAL_HALF * 2), netMat);
      top.rotation.x = -Math.PI / 2;
      top.position.set((end * goalD) / 2, goalH, 0);
      group.add(top);
      [-GOAL_HALF, GOAL_HALF].forEach((z) => {
        const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(goalD, goalH), netMat);
        sideNet.position.set((end * goalD) / 2, goalH / 2, z);
        group.add(sideNet);
      });
      group.position.x = end * (PITCH_W / 2);
      this.scene.add(group);
    });

    // Corner flags.
    const flagMat = new THREE.MeshStandardMaterial({ color: '#facc15', side: THREE.DoubleSide });
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), postMat);
      pole.position.set((sx * PITCH_W) / 2, 0.8, (sz * PITCH_H) / 2);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32), flagMat);
      flag.position.set((sx * PITCH_W) / 2 + 0.23, 1.44, (sz * PITCH_H) / 2);
      this.scene.add(pole, flag);
    });
  }

  /**
   * Every fan in the ground as one instanced mesh. A small vertex-shader
   * patch gives each a skin tone and makes them jump when a goal goes in,
   * so the whole crowd costs one draw call and no per-frame CPU work.
   */
  private buildCrowd(spots: { pos: THREE.Vector3; yaw: number; end: number }[]): void {
    const body = new THREE.BoxGeometry(0.46, 0.62, 0.3).toNonIndexed();
    body.translate(0, 0.31, 0);
    const head = new THREE.OctahedronGeometry(0.15, 1);
    head.translate(0, 0.78, 0);
    const skinFlag = (geo: THREE.BufferGeometry, v: number) =>
      geo.setAttribute('aSkin', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill(v), 1));
    skinFlag(body, 0);
    skinFlag(head, 1);
    body.deleteAttribute('uv');
    head.deleteAttribute('uv');
    const geo = mergeGeometries([body, head])!;

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.crowdUniforms.uTime;
      shader.uniforms.uExcite = this.crowdUniforms.uExcite;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nuniform float uExcite;\nattribute float aSkin;\nfloat fanHash;',
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
          fanHash = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 skinTone = mix(vec3(0.86, 0.55, 0.38), vec3(0.12, 0.06, 0.035), fract(fanHash * 7.31));
          vColor.xyz = mix(vColor.xyz, skinTone, aSkin);`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float jump = abs(sin(uTime * 8.5 + fanHash * 6.2831)) * 0.45 * uExcite * step(0.25, fanHash);
          transformed.y += jump + sin(uTime * 1.7 + fanHash * 40.0) * 0.03;`,
        );
    };

    // Shuffle so dropping the instance count thins the crowd evenly.
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const crowd = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach((spot, i) => {
      q.setFromAxisAngle(up, spot.yaw + (Math.random() - 0.5) * 0.5);
      const k = 0.92 + Math.random() * 0.18;
      s.set(k, k, k);
      m.compose(spot.pos, q, s);
      crowd.setMatrixAt(i, m);
      crowd.setColorAt(i, new THREE.Color('#888888'));
    });
    crowd.frustumCulled = false;
    this.crowd = crowd;
    this.crowdEnds = spots.map((sp) => sp.end);
    this.scene.add(crowd);
  }

  /** Dress the crowd in the two clubs' colours; the away fans fill one end. */
  private colourCrowd(view: SceneView): void {
    const key = `${view.kits.home.fill}|${view.kits.away.fill}`;
    if (!this.crowd || key === this.crowdKey) return;
    this.crowdKey = key;
    const neutral = ['#e2e8f0', '#1e293b', '#475569', '#94a3b8', '#f8fafc'];
    const c = new THREE.Color();
    this.crowdEnds.forEach((end, i) => {
      const r = Math.random();
      const kit = end === 1 && r < 0.75 ? view.kits.away : view.kits.home;
      const hex = r < 0.55 ? kit.fill : r < 0.75 ? kit.trim : neutral[Math.floor(Math.random() * neutral.length)];
      this.crowd!.setColorAt(i, c.set(hex));
    });
    this.crowd.instanceColor!.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- players */

  private material(color: string, roughness = 0.75): THREE.MeshStandardMaterial {
    const key = `${color}|${roughness}`;
    let mat = this.mats.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
      this.mats.set(key, mat);
    }
    return mat;
  }

  /** Shirt fabric: a sheen layer gives the soft highlight of a real kit under lights. */
  private cloth(color: string): THREE.MeshStandardMaterial {
    const key = `cloth|${color}`;
    let mat = this.mats.get(key);
    if (!mat) {
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, metalness: 0, sheen: 0.6, sheenRoughness: 0.5, sheenColor: '#ffffff' });
      this.mats.set(key, mat);
    }
    return mat;
  }

  private buildRig(id: string, x: number, y: number): Rig {
    const look = appearance(id);
    const hash = look.hash;
    const skin = this.material(look.skin, 0.6);
    const hair = this.material(look.hair, 0.9);
    const boots = this.material(look.boots, 0.35);
    const placeholder = this.material('#888888');
    const g = this.geo;
    const parts: Rig['parts'] = { shirt: [], shorts: [], socks: [], trim: [], hands: [] };
    const add = (
      parent: THREE.Object3D,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      pos: [number, number, number],
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    root.scale.setScalar(PLAYER_SCALE);

    const leg = (side: number): Limb => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0.98, 0);
      parts.shorts.push(add(hip, g.shortsLeg, placeholder, [0, -0.12, 0]));
      add(hip, g.thigh, skin, [0, -0.34, 0]);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      parts.socks.push(add(knee, g.shin, placeholder, [0, -0.21, 0]));
      add(knee, g.boot, boots, [0, -0.45, 0.05]);
      body.add(hip);
      return { hip, knee };
    };
    const arm = (side: number): Arm => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.25, 1.6, 0);
      shoulder.rotation.z = side * 0.16;
      parts.shirt.push(add(shoulder, g.sleeve, placeholder, [0, -0.1, 0]));
      add(shoulder, g.upperArm, skin, [0, -0.25, 0]);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      add(elbow, g.forearm, skin, [0, -0.13, 0]);
      parts.hands.push(add(elbow, g.hand, skin, [0, -0.28, 0]));
      body.add(shoulder);
      return { shoulder, elbow };
    };

    const legL = leg(-1);
    const legR = leg(1);
    parts.shorts.push(add(body, g.pelvis, placeholder, [0, 0.98, 0]));
    parts.shirt.push(add(body, g.torso, placeholder, [0, TORSO_Y, 0]));
    const collar = add(body, g.collar, placeholder, [0, 1.69, 0.01]);
    collar.rotation.x = Math.PI / 2;
    parts.trim.push(collar);
    const armL = arm(-1);
    const armR = arm(1);
    // Head, neck, ears and nose are one mesh; eyes, brows and mouth another.
    add(body, g.headSkin, skin, [0, 0, 0]);
    add(body, g.face, this.material('#1b1411', 0.5), [0, 0, 0]);
    add(body, g.brows, hair, [0, 0, 0]);
    if (look.beard) add(body, g.beard, hair, [0, 0, 0]);

    switch (look.style) {
      case 'short':
        add(body, g.hairShort, hair, [0, 1.885, -0.005]);
        break;
      case 'crop':
        add(body, g.hairShort, hair, [0, 1.87, -0.01]).scale.set(0.98, 0.8, 0.98);
        break;
      case 'afro':
        add(body, g.hairAfro, hair, [0, 1.93, -0.02]);
        break;
      case 'shaved':
        break;
      default:
        add(body, g.hairShort, hair, [0, 1.885, -0.005]);
        add(body, g.bun, hair, [0, 1.96, -0.1]);
    }

    // Full name and number on the back, crest and number on the chest. The
    // decals are bent to the shirt so they sit on it from any angle.
    const decalMat = () => new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.7, depthWrite: false });
    const numberDecal = new THREE.Mesh(g.backDecal, decalMat());
    numberDecal.position.set(0, TORSO_Y, 0);
    numberDecal.rotation.y = Math.PI;
    body.add(numberDecal);
    const chestDecal = new THREE.Mesh(g.chestDecal, decalMat());
    chestDecal.position.set(0, TORSO_Y, 0);
    body.add(chestDecal);

    this.scene.add(root);

    const blob = new THREE.Mesh(this.geo.blob, this.blobMat);
    blob.position.y = 0.02;
    blob.visible = this.quality === 'low';
    this.scene.add(blob);

    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    badge.renderOrder = 5;
    this.scene.add(badge);

    return {
      root,
      body,
      legL,
      legR,
      armL,
      armR,
      blob,
      badge,
      badgeKey: '',
      numberDecal,
      chestDecal,
      numberKey: '',
      kitKey: '',
      parts,
      prev: { x, y },
      phase: Math.random() * 6,
      yaw: 0,
      kickT: 0,
      seed: (hash % 1000) / 100,
      speed: 0,
      touch: 0,
      touchKickT: 0,
    };
  }

  private removeRig(rig: Rig): void {
    this.scene.remove(rig.root, rig.blob, rig.badge);
    [rig.numberDecal, rig.chestDecal].forEach((mesh) => {
      const decal = mesh.material as THREE.MeshStandardMaterial;
      decal.map?.dispose();
      decal.dispose();
    });
    rig.badge.material.map?.dispose();
    rig.badge.material.dispose();
  }

  private dressRig(
    rig: Rig,
    shirt: string,
    shorts: string,
    socks: string,
    trim: string,
    gloves: string | null,
  ): void {
    const key = `${shirt}|${shorts}|${socks}|${trim}|${gloves}`;
    if (rig.kitKey === key) return;
    rig.kitKey = key;
    const set = (list: THREE.Mesh[], mat: THREE.Material) => list.forEach((m) => (m.material = mat));
    set(rig.parts.shirt, this.cloth(shirt));
    set(rig.parts.shorts, this.material(shorts, 0.7));
    set(rig.parts.socks, this.material(socks, 0.8));
    set(rig.parts.trim, this.material(trim, 0.6));
    if (gloves) set(rig.parts.hands, this.material(gloves, 0.5));
  }

  private syncPlayers(view: SceneView, dt: number): void {
    const seen = new Set<string>();
    const ball = view.ball;

    // Whoever just let go of the ball kicked it.
    if (this.prevOwner && view.ownerId === null) {
      const kicker = this.rigs.get(this.prevOwner);
      if (kicker) kicker.kickT = KICK_TIME;
    }
    this.prevOwner = view.ownerId;

    view.actors.forEach((actor) => {
      seen.add(actor.id);
      let rig = this.rigs.get(actor.id);
      if (!rig) {
        rig = this.buildRig(actor.id, actor.pos.x, actor.pos.y);
        this.rigs.set(actor.id, rig);
      }

      const kit = view.kits[actor.side];
      const shirtColor = actor.isKeeper ? kit.keeper : kit.fill;
      this.dressRig(
        rig,
        shirtColor,
        actor.isKeeper ? '#1f2937' : kit.trim,
        shirtColor,
        actor.isKeeper ? '#111827' : kit.trim,
        actor.isKeeper ? '#f8fafc' : null,
      );

      const numberKey = `${actor.number}|${shirtColor}`;
      const shirtKey = `${numberKey}|${actor.label}|${kit.trim}`;
      if (rig.numberKey !== shirtKey) {
        rig.numberKey = shirtKey;
        const ink = readableOn(shirtColor);
        const setMap = (mesh: THREE.Mesh, tex: THREE.Texture) => {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.map = tex;
          mat.needsUpdate = true;
        };
        setMap(rig.numberDecal, backTexture(actor.label, String(actor.number), ink));
        setMap(rig.chestDecal, chestTexture(String(actor.number), ink, actor.isKeeper ? ink : kit.trim));
      }
      if (rig.badgeKey !== numberKey) {
        rig.badgeKey = numberKey;
        rig.badge.material.map?.dispose();
        rig.badge.material.map = badgeTexture(String(actor.number), shirtColor);
        rig.badge.material.needsUpdate = true;
      }

      this.animate(rig, actor, view, dt, ball);

      const x = wx(actor.pos.x);
      const z = wz(actor.pos.y);
      rig.root.position.x = x;
      rig.root.position.z = z;
      rig.blob.position.set(x + 0.25, 0.02, z + 0.3);
      rig.blob.scale.setScalar(PLAYER_SCALE * 0.75);

      rig.badge.position.set(x, 2.25 * PLAYER_SCALE + 0.5, z);
      const badgeSize = this.mode === 'tactical' ? 4.2 : 1.15;
      rig.badge.scale.set(badgeSize, badgeSize, 1);
      rig.badge.visible = !actor.leaving && !this.replayCam;
    });

    this.rigs.forEach((rig, id) => {
      if (!seen.has(id)) {
        this.removeRig(rig);
        this.rigs.delete(id);
      }
    });

    // Name tag over whoever has the ball.
    const owner = view.ownerId ? view.actors.find((a) => a.id === view.ownerId) : undefined;
    if (owner && this.mode === 'broadcast' && !this.replayCam) {
      const key = `${owner.number} ${owner.label}`;
      if (key !== this.ownerLabelKey) {
        this.ownerLabelKey = key;
        this.ownerLabel.material.map?.dispose();
        const { texture, aspect } = labelTexture(key);
        this.ownerLabel.material.map = texture;
        this.ownerLabel.material.needsUpdate = true;
        this.ownerLabel.userData.aspect = aspect;
      }
      const h = 1.05;
      this.ownerLabel.scale.set(h * (this.ownerLabel.userData.aspect ?? 3), h, 1);
      this.ownerLabel.position.set(wx(owner.pos.x), 2.25 * PLAYER_SCALE + 1.7, wz(owner.pos.y));
      this.ownerLabel.visible = true;
    } else {
      this.ownerLabel.visible = false;
    }
  }

  /** Run cycle, kicks and goal celebrations, all procedural. */
  private animate(
    rig: Rig,
    actor: SceneView['actors'][number],
    view: SceneView,
    dt: number,
    ball: SceneView['ball'],
  ): void {
    const vx = dt > 0 ? (actor.pos.x - rig.prev.x) / dt : 0;
    const vy = dt > 0 ? (actor.pos.y - rig.prev.y) / dt : 0;
    rig.prev = { x: actor.pos.x, y: actor.pos.y };
    const speed = Math.hypot(vx, vy);
    rig.speed = speed;

    rig.phase += dt * (2 + speed * 1.3);
    const stride = Math.min(0.9, speed * 0.12);
    const p = rig.phase;

    // Legs: hip swing plus a knee that folds as the foot comes through.
    rig.legL.hip.rotation.x = Math.sin(p) * stride;
    rig.legR.hip.rotation.x = -Math.sin(p) * stride;
    rig.legL.knee.rotation.x = ((1 + Math.sin(p - 1.4)) / 2) * stride * 1.4;
    rig.legR.knee.rotation.x = ((1 + Math.sin(p + Math.PI - 1.4)) / 2) * stride * 1.4;

    // Arms counter-swing with bent elbows.
    rig.armL.shoulder.rotation.x = -Math.sin(p) * stride * 0.9;
    rig.armR.shoulder.rotation.x = Math.sin(p) * stride * 0.9;
    rig.armL.shoulder.rotation.z = -0.16;
    rig.armR.shoulder.rotation.z = 0.16;
    const elbowBend = -(0.25 + stride * 0.9);
    rig.armL.elbow.rotation.x = elbowBend;
    rig.armR.elbow.rotation.x = elbowBend;

    rig.body.rotation.x = Math.min(0.2, speed * 0.022);
    rig.body.position.y = Math.abs(Math.cos(p)) * stride * 0.07;

    if (rig.kickT > 0) {
      rig.kickT = Math.max(0, rig.kickT - dt);
      const k = 1 - rig.kickT / KICK_TIME;
      const arc = Math.sin(k * Math.PI);
      // Wind the leg back, then strike through the ball.
      rig.legR.hip.rotation.x = k < 0.35 ? (k / 0.35) * 0.7 : 0.7 - ((k - 0.35) / 0.65) * 2.1;
      rig.legR.knee.rotation.x = k < 0.35 ? 1.1 * (k / 0.35) : 1.1 * (1 - (k - 0.35) / 0.65);
      rig.legL.hip.rotation.x = 0.1;
      rig.legL.knee.rotation.x = 0.2;
      rig.armL.shoulder.rotation.z = -0.16 - arc * 0.9;
      rig.armR.shoulder.rotation.z = 0.16 + arc * 0.5;
      rig.body.rotation.x = -0.1 * arc;
    }

    // Dribbling: a light tap with the right foot on each touch.
    if (rig.touchKickT > 0) {
      rig.touchKickT = Math.max(0, rig.touchKickT - dt);
      const tap = Math.sin((1 - rig.touchKickT / 0.18) * Math.PI);
      rig.legR.hip.rotation.x = -0.75 * tap;
      rig.legR.knee.rotation.x = 0.35 * tap;
    }

    const dive = view.dives.find((d) => d.actorId === actor.id);
    if (dive) {
      this.poseDive(rig, actor, dive);
      return;
    }
    rig.body.rotation.z = 0;
    rig.body.position.x = 0;

    if (view.celebrating === actor.side && !actor.isKeeper) {
      const t = this.time * 7 + rig.seed;
      rig.armL.shoulder.rotation.x = -2.7;
      rig.armR.shoulder.rotation.x = -2.7;
      rig.armL.shoulder.rotation.z = -0.5 - Math.sin(t) * 0.2;
      rig.armR.shoulder.rotation.z = 0.5 + Math.sin(t) * 0.2;
      rig.armL.elbow.rotation.x = -0.2;
      rig.armR.elbow.rotation.x = -0.2;
      if (speed < 1) rig.body.position.y = Math.max(0, Math.sin(t)) * 0.14;
    }

    const wantYaw =
      speed > 0.6
        ? Math.atan2(vx, vy)
        : Math.atan2(ball.x - actor.pos.x, ball.y - actor.pos.y);
    rig.yaw = approachAngle(rig.yaw, wantYaw, Math.min(1, dt * 8));
    rig.root.rotation.y = rig.yaw;
  }

  /** Keeper launches sideways off his feet, arms stretched, then lands. */
  private poseDive(
    rig: Rig,
    actor: SceneView['actors'][number],
    dive: SceneView['dives'][number],
  ): void {
    // Which way is the ball, in the keeper's own left/right?
    const dx = dive.toward.x - actor.pos.x;
    const dz = dive.toward.y - actor.pos.y;
    const localX = dx * Math.cos(rig.yaw) - dz * Math.sin(rig.yaw);
    const side = localX >= 0 ? 1 : -1;
    const t = dive.t;

    let roll: number;
    let lift: number;
    if (t < 0.12) {
      // Set: a quick crouch.
      roll = 0;
      lift = -0.12 * (t / 0.12);
    } else if (t < 0.5) {
      const k = (t - 0.12) / 0.38;
      roll = 1.35 * Math.sin((k * Math.PI) / 2);
      lift = 0.45 * Math.sin(k * Math.PI);
    } else {
      roll = 1.5;
      lift = 0.12;
    }
    rig.body.rotation.x = 0;
    rig.body.rotation.z = -side * roll;
    rig.body.position.set(side * Math.min(1, t / 0.5) * 0.5, lift, 0);
    rig.armL.shoulder.rotation.set(-2.9, 0, -0.25);
    rig.armR.shoulder.rotation.set(-2.9, 0, 0.25);
    rig.armL.elbow.rotation.x = -0.1;
    rig.armR.elbow.rotation.x = -0.1;
    rig.legL.hip.rotation.x = 0.15;
    rig.legR.hip.rotation.x = -0.2;
    rig.legL.knee.rotation.x = 0.5;
    rig.legR.knee.rotation.x = 0.3;
  }

  private poseBall(view: SceneView, dt: number): void {
    const { h } = view.ball;
    let x = view.ball.x;
    let y = view.ball.y;

    // A running ball carrier pushes the ball ahead and catches it up again.
    const owner = view.ownerId ? view.actors.find((a) => a.id === view.ownerId) : undefined;
    const rig = owner ? this.rigs.get(owner.id) : undefined;
    if (owner && rig && h === 0 && rig.speed > 1.2) {
      rig.touch += dt * (0.9 + rig.speed * 0.18);
      if (rig.touch >= 1) {
        rig.touch -= 1;
        rig.touchKickT = 0.18;
      }
      const ease = 1 - (1 - rig.touch) * (1 - rig.touch);
      const ahead = 0.55 + 1.3 * ease;
      x = owner.pos.x + Math.sin(rig.yaw) * ahead;
      y = owner.pos.y + Math.cos(rig.yaw) * ahead;
    }

    const target = new THREE.Vector3(wx(x), BALL_R + h, wz(y));
    // The net stops the ball.
    if (Math.abs(target.x) > PITCH_W / 2 && Math.abs(target.z) < GOAL_HALF + 0.3) {
      target.x = Math.sign(target.x) * Math.min(Math.abs(target.x), PITCH_W / 2 + 2.0);
      target.y = Math.min(target.y, 2.3);
    }
    if (this.ballShown.lengthSq() === 0) this.ballShown.copy(target);
    this.ballShown.lerp(target, 1 - Math.exp(-dt * 22));
    const moved = Math.hypot(this.ballShown.x - this.lastBall.x, this.ballShown.z - this.lastBall.y);
    this.lastBall = { x: this.ballShown.x, y: this.ballShown.z };
    this.ballSpin += moved / BALL_R;
    this.ball.position.copy(this.ballShown);
    this.ball.rotation.set(this.ballSpin, this.ballSpin * 0.3, 0);
    this.ballBlob.position.set(this.ballShown.x + h * 0.15, 0.03, this.ballShown.z + h * 0.2);
    this.ballBlob.scale.setScalar(0.55 * Math.max(0.5, 1 - h * 0.08));
  }

  /** The back of the net bellies out where the ball hits it, then settles. */
  private poseNets(dt: number): void {
    const b = this.ball.position;
    this.nets.forEach((net) => {
      const depth = net.end * b.x - PITCH_W / 2;
      if (depth > 0.8 && Math.abs(b.z) < GOAL_HALF && b.y < 2.44) {
        net.amp = Math.max(net.amp, Math.min(0.75, (depth - 0.8) * 0.8));
        net.at = { x: -b.z, y: b.y - 1.22 };
      }
      if (net.amp < 0.004) {
        if (net.amp > 0) {
          net.amp = 0;
          (net.geo.attributes.position.array as Float32Array).set(net.base);
          net.geo.attributes.position.needsUpdate = true;
        }
        return;
      }
      net.amp *= Math.exp(-dt * 2.2);
      const wobble = net.amp * (0.7 + 0.3 * Math.cos(this.time * 13));
      const pos = net.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const dx = net.base[i * 3] - net.at.x;
        const dy = net.base[i * 3 + 1] - net.at.y;
        pos.setZ(i, net.base[i * 3 + 2] + net.end * wobble * Math.exp(-(dx * dx + dy * dy) / 1.8));
      }
      pos.needsUpdate = true;
    });
  }

  /** A fading streak behind a hard-hit ball. */
  private poseTrail(dt: number): void {
    const p = this.ball.position.clone();
    const last = this.trailPts[0];
    const speed = last && dt > 0 ? p.distanceTo(last) / dt : 0;
    this.trailPts.unshift(p);
    if (this.trailPts.length > TRAIL) this.trailPts.pop();
    const alpha = THREE.MathUtils.clamp((speed - 15) / 12, 0, 1);
    this.trail.forEach((sprite, i) => {
      const at = this.trailPts[i];
      const k = 1 - i / TRAIL;
      sprite.visible = !!at && alpha > 0 && i > 0;
      if (!sprite.visible) return;
      sprite.position.copy(at);
      sprite.scale.setScalar(0.85 * k + 0.15);
      sprite.material.opacity = alpha * k * 0.55;
    });
  }

  private poseCards(view: SceneView): void {
    while (this.cardSprites.length < view.markers.length) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
      sprite.renderOrder = 11;
      this.scene.add(sprite);
      this.cardSprites.push(sprite);
    }
    this.cardSprites.forEach((sprite, i) => {
      const marker = view.markers[i];
      const actor = marker ? view.actors.find((a) => a.id === marker.actorId) : undefined;
      if (!marker || !actor) {
        sprite.visible = false;
        return;
      }
      sprite.visible = true;
      sprite.material.map = this.cardTextures[marker.kind];
      sprite.material.needsUpdate = true;
      sprite.scale.set(marker.kind === 'injury' ? 1.4 : 1.1, 1.5, 1);
      sprite.position.set(wx(actor.pos.x), 2.25 * PLAYER_SCALE + 2.4, wz(actor.pos.y));
    });
  }

  /* ----------------------------------------------------------------- camera */

  private moveCamera(view: SceneView, dt: number, cut: boolean): void {
    const k = cut ? 1 : 1 - Math.exp(-dt * (this.replayCam ? 4 : 2.4));
    // Move in on key moments, pull back for open play.
    this.zoom += ((view.highlight ? 1 : 0) - this.zoom) * (1 - Math.exp(-dt * 1.2));

    const bx = wx(view.ball.x);
    const bz = wz(view.ball.y);
    const target = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let shadowSpan = 38;

    if (this.replayCam) {
      // Replays rotate through three angles: pitch-side, behind the goal and
      // the reverse angle from the far touchline.
      const fx = THREE.MathUtils.clamp(bx, -PITCH_W / 2 + 6, PITCH_W / 2 - 6);
      const end = bx >= 0 ? 1 : -1;
      if (this.replayAngle === 1) {
        target.set(bx - end * 7, 1, bz * 0.8);
        pos.set(end * (PITCH_W / 2 + 9), 7.5, bz * 0.45);
      } else if (this.replayAngle === 2) {
        target.set(fx, 1, bz);
        pos.set(fx * 0.85, 10, bz - 22);
      } else {
        target.set(fx, 1, bz);
        pos.set(fx * 0.92, 9, bz + 21);
      }
      shadowSpan = 30;
    } else if (this.mode === 'tactical') {
      // Whole pitch in view, from high over the near touchline.
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const hFov = Math.atan(Math.tan(halfFov) * this.aspect);
      const need = Math.max((PITCH_W / 2 + 6) / Math.tan(hFov), (PITCH_H / 2 + 12) / Math.tan(halfFov));
      target.set(0, 0, -1);
      pos.set(0, need * 0.92, need * 0.42);
      shadowSpan = 70;
    } else {
      // A narrow screen sees less width, so stand further back on phones.
      const widthBoost = this.aspect < 1.4 ? 1.3 : 1;
      const dist = (46 - this.zoom * 15) * widthBoost;
      const height = (22 - this.zoom * 7) * widthBoost;
      const fx = THREE.MathUtils.clamp(bx, -PITCH_W / 2 + 12, PITCH_W / 2 - 12);
      target.set(fx, 0, bz * 0.55);
      pos.set(fx * 0.9, height, bz * 0.3 + dist);
    }

    this.focus.lerp(target, k);
    this.camPos.lerp(pos, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.focus);

    // Keep the shadow map's box on what the camera sees, so it stays sharp.
    this.sun.target.position.copy(this.focus);
    this.sun.position.set(this.focus.x - 28, 60, this.focus.z + 34);
    const cam = this.sun.shadow.camera;
    if (cam.right !== shadowSpan) {
      cam.left = -shadowSpan;
      cam.right = shadowSpan;
      cam.top = shadowSpan;
      cam.bottom = -shadowSpan;
      cam.near = 10;
      cam.far = 160;
      cam.updateProjectionMatrix();
    }
  }
}

/* ----------------------------------------------------------------- helpers */

/** Torso centre height, and its side profile (radius, height from centre): a V from chest to waist. */
const TORSO_Y = 1.37;
const TORSO_PROFILE: [number, number][] = [
  [0.001, -0.28],
  [0.15, -0.27],
  [0.165, -0.13],
  [0.172, 0.0],
  [0.198, 0.14],
  [0.205, 0.21],
  [0.17, 0.27],
  [0.09, 0.3],
  [0.001, 0.305],
];
const TORSO_SX = 1.18;
const TORSO_SZ = 0.72;

function torsoRadius(y: number): number {
  for (let i = 1; i < TORSO_PROFILE.length; i++) {
    const [r0, y0] = TORSO_PROFILE[i - 1];
    const [r1, y1] = TORSO_PROFILE[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return TORSO_PROFILE[TORSO_PROFILE.length - 1][0];
}

/** A plane bent onto the front of the torso (w x h, centred at cx, cy from torso centre). */
function torsoDecal(w: number, h: number, cx: number, cy: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, h, 10, 6);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const y = pos.getY(i) + cy;
    const r = torsoRadius(y);
    const u = x / (r * TORSO_SX);
    pos.setXYZ(i, x, y, r * TORSO_SZ * Math.sqrt(Math.max(0.04, 1 - u * u)) + 0.006);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildGeometries() {
  const torso = new THREE.LatheGeometry(
    TORSO_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  );
  torso.scale(TORSO_SX, 1, TORSO_SZ);
  const head = new THREE.SphereGeometry(0.125, 18, 14);
  head.scale(0.95, 1.08, 1);
  return {
    thigh: new THREE.CylinderGeometry(0.085, 0.07, 0.24, 10),
    shortsLeg: new THREE.CylinderGeometry(0.108, 0.1, 0.24, 10),
    shin: new THREE.CylinderGeometry(0.07, 0.05, 0.42, 10),
    boot: new THREE.BoxGeometry(0.11, 0.08, 0.26),
    pelvis: new THREE.BoxGeometry(0.36, 0.2, 0.22),
    torso,
    collar: new THREE.TorusGeometry(0.075, 0.022, 6, 16),
    neck: new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10),
    ...faceGeometries(head),
    hairShort: new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.05),
    hairAfro: new THREE.SphereGeometry(0.165, 14, 10),
    bun: new THREE.SphereGeometry(0.055, 8, 8),
    sleeve: new THREE.CylinderGeometry(0.072, 0.064, 0.2, 10),
    upperArm: new THREE.CylinderGeometry(0.052, 0.048, 0.12, 8),
    forearm: new THREE.CylinderGeometry(0.047, 0.04, 0.26, 8),
    hand: new THREE.SphereGeometry(0.048, 8, 6),
    backDecal: torsoDecal(0.3, 0.3, 0, 0.05),
    chestDecal: torsoDecal(0.28, 0.09, 0, 0.13),
    blob: new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
  };
}

/** Head parts pre-merged by material, so a detailed face costs three draw calls. */
function faceGeometries(head: THREE.BufferGeometry) {
  const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);
  const ear = (side: number) => {
    const geo = new THREE.SphereGeometry(0.032, 8, 6);
    geo.scale(0.5, 1, 0.8);
    return at(geo, side * 0.12, 1.87, -0.005);
  };
  const headSkin = mergeGeometries([
    at(head.clone(), 0, 1.87, 0),
    at(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10, 1, true), 0, 1.74, 0),
    at(new THREE.SphereGeometry(0.022, 6, 6), 0, 1.86, 0.122),
    ear(-1),
    ear(1),
  ])!;

  const eye = (side: number) => at(new THREE.SphereGeometry(0.016, 8, 6), side * 0.043, 1.895, 0.108);
  const mouth = at(new THREE.BoxGeometry(0.045, 0.009, 0.01), 0, 1.822, 0.117);
  const face = mergeGeometries([eye(-1), eye(1), mouth])!;

  const brow = (side: number) => {
    const geo = new THREE.BoxGeometry(0.05, 0.012, 0.014);
    geo.rotateZ(side * -0.12);
    return at(geo, side * 0.045, 1.924, 0.112);
  };
  const brows = mergeGeometries([brow(-1), brow(1)])!;

  // Lower half of a slightly larger head: reads as a beard at match distance.
  const beard = new THREE.SphereGeometry(0.131, 14, 8, 0, Math.PI * 2, Math.PI / 1.75, Math.PI / 3);
  beard.scale(0.95, 1.08, 1);
  beard.translate(0, 1.87, 0.004);

  return { headSkin, face, brows, beard };
}

/** Fine tiling noise used as a bump map: blades catch the floodlights. */
function grassBump(): THREE.Texture {
  const tex = canvasTexture(256, 256, (ctx) => {
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 46);
  return tex;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function approachAngle(from: number, to: number, t: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

function canvasTexture(
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture(): THREE.Texture {
  return canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#03060f');
    g.addColorStop(0.55, '#0c1730');
    g.addColorStop(1, '#23375c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });
}

function glowTexture(): THREE.Texture {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,250,225,0.9)');
    g.addColorStop(0.25, 'rgba(255,245,210,0.35)');
    g.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function blobTexture(): THREE.Texture {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function ballTexture(): THREE.Texture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#111827';
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 6; i++) {
        const cx = 20 + i * 43 + (row % 2) * 21;
        const cy = 20 + row * 44;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
        }
        ctx.fill();
      }
    }
  });
}

/** Back of the shirt: full name arched over the number, as on a real kit. */
function backTexture(name: string, number: string, ink: string): THREE.Texture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 40;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    while (size > 14 && ctx.measureText(name).width > 236) {
      size -= 2;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(name, 128, 30);
    ctx.font = '900 168px system-ui, sans-serif';
    ctx.fillText(number, 128, 160);
  });
}

/** Front: club crest on one side of the chest, small number on the other. */
function chestTexture(number: string, ink: string, trim: string): THREE.Texture {
  return canvasTexture(256, 84, (ctx) => {
    // Crest: a small shield.
    ctx.fillStyle = trim;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(176, 12);
    ctx.lineTo(212, 12);
    ctx.lineTo(212, 46);
    ctx.quadraticCurveTo(212, 66, 194, 76);
    ctx.quadraticCurveTo(176, 66, 176, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = '900 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number, 72, 46);
  });
}

function badgeTexture(text: string, color: string): THREE.Texture {
  return canvasTexture(64, 64, (ctx) => {
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.fillStyle = readableOn(color);
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 34);
  });
}

function labelTexture(text: string): { texture: THREE.Texture; aspect: number } {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = '800 40px system-ui, sans-serif';
  const w = Math.ceil(probe.measureText(text).width) + 36;
  const h = 60;
  const texture = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = 'rgba(8,12,22,0.82)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
  return { texture, aspect: w / h };
}

function cardTexture(color: string): THREE.Texture {
  return canvasTexture(48, 64, (ctx) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 4, 40, 56, 6);
    ctx.fill();
    ctx.stroke();
  });
}

function injuryTexture(): THREE.Texture {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(4, 4, 56, 56, 10);
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(14, 26, 36, 12);
    ctx.fillRect(26, 14, 12, 36);
  });
}

function netTexture(): THREE.Texture {
  const tex = canvasTexture(64, 64, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 64; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 64);
      ctx.moveTo(0, i);
      ctx.lineTo(64, i);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 3);
  return tex;
}

function boardTexture(): THREE.CanvasTexture {
  const colors = ['#0ea5e9', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#facc15'];
  const words = ['GAFFER', 'MATCHDAY', 'KICK OFF', 'GAFFER', 'FOOTBALL', 'TOP EDGE'];
  return canvasTexture(1024, 64, (ctx) => {
    for (let i = 0; i < 4; i++) {
      const color = colors[i % colors.length];
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, color);
      g.addColorStop(1, shade(color, -0.25));
      ctx.fillStyle = g;
      ctx.fillRect(i * 256, 0, 256, 64);
      ctx.fillStyle = readableOn(color);
      ctx.font = '900 38px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(words[i % words.length], i * 256 + 128, 34);
    }
  });
}

function seatTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 32, (ctx) => {
    ctx.fillStyle = '#1b2433';
    ctx.fillRect(0, 0, 256, 32);
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = Math.random() < 0.1 ? '#1e3a8a' : '#2748a8';
      ctx.beginPath();
      ctx.roundRect(x + 1, 6, 6, 18, 2);
      ctx.fill();
    }
  });
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => clampByte(Math.round(c * (1 + amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export type { SideKey };
