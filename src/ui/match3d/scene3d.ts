import * as THREE from 'three';
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
 * director's scene snapshot and poses a stadium full of low-poly players to
 * match. Kept deliberately cheap — shared geometry, Lambert materials, blob
 * shadows instead of shadow maps — so it holds frame rate on a phone.
 *
 * Axes: pitch x (0-105) -> world x centred on 0, pitch y (0-68) -> world z
 * centred on 0, y is up. The main camera sits on the +z touchline.
 */

export type CameraMode = 'broadcast' | 'tactical';

/** Players are drawn larger than life so they read on a small screen. */
const PLAYER_SCALE = 1.65;
const BALL_R = 0.3;

const wx = (x: number) => x - PITCH_W / 2;
const wz = (y: number) => y - PITCH_H / 2;

const SKIN = ['#f1c7a5', '#d9a47c', '#b07a52', '#8a5a3b', '#5c3a24'];
const HAIR = ['#1f1a17', '#3b2a1e', '#6b4a2b', '#c9a15b', '#111111'];

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  shadow: THREE.Mesh;
  badge: THREE.Sprite;
  badgeKey: string;
  shirt: THREE.MeshLambertMaterial;
  shorts: THREE.MeshLambertMaterial;
  prev: { x: number; y: number };
  phase: number;
  yaw: number;
  kitKey: string;
}

export class Match3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
  private rigs = new Map<string, Rig>();
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private ownerLabel: THREE.Sprite;
  private ownerLabelKey = '';
  private cardSprites: THREE.Sprite[] = [];
  private cardTextures: Record<'yellow' | 'red' | 'injury', THREE.Texture>;

  private geo = {
    leg: new THREE.CylinderGeometry(0.085, 0.07, 0.82, 8).translate(0, -0.41, 0),
    boot: new THREE.BoxGeometry(0.13, 0.08, 0.26).translate(0, -0.84, 0.05),
    shorts: new THREE.BoxGeometry(0.44, 0.26, 0.27),
    torso: new THREE.CylinderGeometry(0.235, 0.2, 0.62, 10),
    arm: new THREE.CylinderGeometry(0.065, 0.055, 0.6, 7).translate(0, -0.3, 0),
    head: new THREE.SphereGeometry(0.14, 12, 10),
    hair: new THREE.SphereGeometry(0.148, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.1),
    blob: new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
  };
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  private blobMat: THREE.MeshBasicMaterial;

  private mode: CameraMode = 'broadcast';
  private focus = new THREE.Vector3(0, 0, 0);
  private camPos = new THREE.Vector3(0, 30, 60);
  private zoom = 0;
  private aspect = 1;
  private ballSpin = 0;
  private lastBall = { x: PITCH_W / 2, y: PITCH_H / 2 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color('#0d1626');
    this.scene.fog = new THREE.Fog('#0d1626', 140, 260);

    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#2d5a2a', 1.5));
    const sun = new THREE.DirectionalLight('#ffffff', 1.9);
    sun.position.set(-30, 70, 45);
    this.scene.add(sun);

    this.blobMat = new THREE.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      depthWrite: false,
    });

    this.buildStadium();

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 18, 14),
      new THREE.MeshLambertMaterial({ map: ballTexture() }),
    );
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(this.geo.blob, this.blobMat);
    this.ballShadow.scale.setScalar(0.55);
    this.scene.add(this.ballShadow);

    this.ownerLabel = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.ownerLabel.renderOrder = 10;
    this.scene.add(this.ownerLabel);

    this.cardTextures = {
      yellow: cardTexture('#facc15'),
      red: cardTexture('#ef4444'),
      injury: injuryTexture(),
    };
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  setCameraMode(mode: CameraMode): void {
    this.mode = mode;
  }

  render(view: SceneView, dt: number): void {
    this.syncPlayers(view, dt);
    this.poseBall(view, dt);
    this.poseCards(view);
    this.moveCamera(view, dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
  }

  /* ---------------------------------------------------------------- stadium */

  private buildStadium(): void {
    // Pitch: the same markings the 2D view draws, painted onto a texture.
    const fullW = PITCH_W + MARGIN * 2;
    const fullH = PITCH_H + MARGIN * 2;
    const texW = 2048;
    const s = texW / fullW;
    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = Math.round(fullH * s);
    const ctx = canvas.getContext('2d')!;
    drawPitch(ctx, canvas.width, canvas.height, s, (x) => (x + MARGIN) * s, (y) => (y + MARGIN) * s);
    const grassTex = new THREE.CanvasTexture(canvas);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(fullW, fullH).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: grassTex }),
    );
    this.scene.add(pitch);

    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(fullW + 30, fullH + 30).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#1b5a28' }),
    );
    apron.position.y = -0.02;
    this.scene.add(apron);

    // Advertising boards round the pitch.
    const boardTex = boardTexture();
    const boardMat = new THREE.MeshLambertMaterial({ map: boardTex });
    const board = (length: number, x: number, z: number, rotY: number) => {
      const tex = boardTex.clone();
      tex.needsUpdate = true;
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.set(length / 16, 1);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.9, 0.12),
        [boardMat, boardMat, boardMat, boardMat, new THREE.MeshLambertMaterial({ map: tex }), boardMat],
      );
      mesh.position.set(x, 0.45, z);
      mesh.rotation.y = rotY;
      this.scene.add(mesh);
    };
    board(PITCH_W + 6, 0, -(PITCH_H / 2 + MARGIN + 0.5), 0);
    board(PITCH_W + 6, 0, PITCH_H / 2 + MARGIN + 0.5, Math.PI);
    board(PITCH_H + 6, -(PITCH_W / 2 + MARGIN + 0.5), 0, Math.PI / 2);
    board(PITCH_H + 6, PITCH_W / 2 + MARGIN + 0.5, 0, -Math.PI / 2);

    // Stands on three sides; the camera side stays open.
    const crowd = crowdTexture();
    const stand = (length: number, depth: number, cx: number, cz: number, rotY: number) => {
      const group = new THREE.Group();
      const tiers = 7;
      for (let i = 0; i < tiers; i++) {
        const tex = crowd.clone();
        tex.needsUpdate = true;
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.set(length / 12, 1);
        tex.offset.x = Math.random();
        const step = new THREE.Mesh(
          new THREE.BoxGeometry(length, 1.6, depth / tiers),
          [
            new THREE.MeshLambertMaterial({ color: '#1e293b' }),
            new THREE.MeshLambertMaterial({ color: '#1e293b' }),
            new THREE.MeshLambertMaterial({ color: '#273449' }),
            new THREE.MeshLambertMaterial({ color: '#1e293b' }),
            new THREE.MeshLambertMaterial({ map: tex }),
            new THREE.MeshLambertMaterial({ color: '#1e293b' }),
          ],
        );
        step.position.set(0, 0.8 + i * 1.6, -(i + 0.5) * (depth / tiers));
        group.add(step);
      }
      // Roof edge.
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(length, 0.4, depth + 3),
        new THREE.MeshLambertMaterial({ color: '#334155' }),
      );
      roof.position.set(0, tiers * 1.6 + 4, -(depth + 3) / 2);
      group.add(roof);
      group.position.set(cx, 0, cz);
      group.rotation.y = rotY;
      this.scene.add(group);
    };
    stand(PITCH_W + 20, 16, 0, -(PITCH_H / 2 + MARGIN + 3), 0);
    stand(PITCH_H + 14, 14, -(PITCH_W / 2 + MARGIN + 3), 0, Math.PI / 2);
    stand(PITCH_H + 14, 14, PITCH_W / 2 + MARGIN + 3, 0, -Math.PI / 2);

    // Floodlights in the corners.
    const poleMat = new THREE.MeshLambertMaterial({ color: '#475569' });
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff7d6' });
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 34, 8), poleMat);
      pole.position.set(sx * (PITCH_W / 2 + 18), 17, sz * (PITCH_H / 2 + 16));
      this.scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.8), lampMat);
      lamp.position.set(pole.position.x, 34, pole.position.z);
      lamp.lookAt(0, 0, 0);
      this.scene.add(lamp);
    });

    // Goals: posts, bar and a see-through net.
    const postMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const netMat = new THREE.MeshBasicMaterial({
      map: netTexture(),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const goalH = 2.44;
    const goalD = 2;
    [-1, 1].forEach((end) => {
      const gx = end * (PITCH_W / 2);
      const group = new THREE.Group();
      const postGeo = new THREE.CylinderGeometry(0.07, 0.07, goalH, 8);
      [-GOAL_HALF, GOAL_HALF].forEach((z) => {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(0, goalH / 2, z);
        group.add(post);
      });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GOAL_HALF * 2, 8), postMat);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, goalH, 0);
      group.add(bar);

      const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF * 2, goalH), netMat);
      back.rotation.y = Math.PI / 2;
      back.position.set(end * goalD, goalH / 2, 0);
      group.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(goalD, GOAL_HALF * 2), netMat);
      top.rotation.x = -Math.PI / 2;
      top.position.set((end * goalD) / 2, goalH, 0);
      group.add(top);
      [-GOAL_HALF, GOAL_HALF].forEach((z) => {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(goalD, goalH), netMat);
        side.position.set((end * goalD) / 2, goalH / 2, z);
        group.add(side);
      });
      group.position.x = gx;
      this.scene.add(group);
    });
  }

  /* ---------------------------------------------------------------- players */

  private material(color: string): THREE.MeshLambertMaterial {
    let mat = this.mats.get(color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color });
      this.mats.set(color, mat);
    }
    return mat;
  }

  private buildRig(id: string, x: number, y: number): Rig {
    const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const skin = this.material(SKIN[hash % SKIN.length]);
    const hair = this.material(HAIR[(hash >> 3) % HAIR.length]);
    const socks = this.material('#f8fafc');
    const boots = this.material('#111827');
    const shirt = new THREE.MeshLambertMaterial({ color: '#888' });
    const shorts = new THREE.MeshLambertMaterial({ color: '#222' });

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    root.scale.setScalar(PLAYER_SCALE);

    const leg = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.11, 0.9, 0);
      pivot.add(new THREE.Mesh(this.geo.leg, socks));
      pivot.add(new THREE.Mesh(this.geo.boot, boots));
      body.add(pivot);
      return pivot;
    };
    const arm = (side: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.29, 1.56, 0);
      pivot.rotation.z = side * 0.12;
      pivot.add(new THREE.Mesh(this.geo.arm, shirt));
      body.add(pivot);
      return pivot;
    };
    const legL = leg(-1);
    const legR = leg(1);
    const shortsMesh = new THREE.Mesh(this.geo.shorts, shorts);
    shortsMesh.position.y = 0.96;
    body.add(shortsMesh);
    const torso = new THREE.Mesh(this.geo.torso, shirt);
    torso.position.y = 1.36;
    body.add(torso);
    const armL = arm(-1);
    const armR = arm(1);
    const head = new THREE.Mesh(this.geo.head, skin);
    head.position.y = 1.83;
    body.add(head);
    const hairMesh = new THREE.Mesh(this.geo.hair, hair);
    hairMesh.position.y = 1.85;
    body.add(hairMesh);

    this.scene.add(root);

    const shadow = new THREE.Mesh(this.geo.blob, this.blobMat);
    shadow.position.y = 0.02;
    this.scene.add(shadow);

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
      shadow,
      badge,
      badgeKey: '',
      shirt,
      shorts,
      prev: { x, y },
      phase: Math.random() * 6,
      yaw: 0,
      kitKey: '',
    };
  }

  private removeRig(rig: Rig): void {
    this.scene.remove(rig.root, rig.shadow, rig.badge);
    rig.shirt.dispose();
    rig.shorts.dispose();
    rig.badge.material.map?.dispose();
    rig.badge.material.dispose();
  }

  private syncPlayers(view: SceneView, dt: number): void {
    const seen = new Set<string>();
    const ball = view.ball;

    view.actors.forEach((actor) => {
      seen.add(actor.id);
      let rig = this.rigs.get(actor.id);
      if (!rig) {
        rig = this.buildRig(actor.id, actor.pos.x, actor.pos.y);
        this.rigs.set(actor.id, rig);
      }

      const kit = view.kits[actor.side];
      const shirtColor = actor.isKeeper ? kit.keeper : kit.fill;
      const shortsColor = actor.isKeeper ? '#1f2937' : kit.trim;
      const kitKey = `${shirtColor}|${shortsColor}`;
      if (rig.kitKey !== kitKey) {
        rig.kitKey = kitKey;
        rig.shirt.color.set(shirtColor);
        rig.shorts.color.set(shortsColor);
      }

      const badgeKey = `${actor.number}|${shirtColor}`;
      if (rig.badgeKey !== badgeKey) {
        rig.badgeKey = badgeKey;
        rig.badge.material.map?.dispose();
        rig.badge.material.map = badgeTexture(String(actor.number), shirtColor);
        rig.badge.material.needsUpdate = true;
      }

      // Velocity from the frame-to-frame move drives the run cycle and facing.
      const vx = dt > 0 ? (actor.pos.x - rig.prev.x) / dt : 0;
      const vy = dt > 0 ? (actor.pos.y - rig.prev.y) / dt : 0;
      rig.prev = { x: actor.pos.x, y: actor.pos.y };
      const speed = Math.hypot(vx, vy);

      rig.phase += dt * (2.2 + speed * 1.35);
      const stride = Math.min(0.95, speed * 0.13);
      const swing = Math.sin(rig.phase) * stride;
      rig.legL.rotation.x = swing;
      rig.legR.rotation.x = -swing;
      rig.armL.rotation.x = -swing * 0.9;
      rig.armR.rotation.x = swing * 0.9;
      rig.body.position.y = Math.abs(Math.cos(rig.phase)) * stride * 0.06;

      let wantYaw: number;
      if (speed > 0.6) {
        wantYaw = Math.atan2(vx, vy);
      } else {
        wantYaw = Math.atan2(ball.x - actor.pos.x, ball.y - actor.pos.y);
      }
      rig.yaw = approachAngle(rig.yaw, wantYaw, Math.min(1, dt * 8));
      rig.root.rotation.y = rig.yaw;

      const x = wx(actor.pos.x);
      const z = wz(actor.pos.y);
      rig.root.position.set(x, 0, z);
      rig.shadow.position.set(x + 0.25, 0.02, z + 0.3);
      rig.shadow.scale.setScalar(PLAYER_SCALE * 0.75);

      rig.badge.position.set(x, 2.35 * PLAYER_SCALE + 0.35, z);
      const badgeSize = this.mode === 'tactical' ? 4.2 : 1.25;
      rig.badge.scale.set(badgeSize, badgeSize, 1);
      rig.badge.visible = !actor.leaving;
    });

    this.rigs.forEach((rig, id) => {
      if (!seen.has(id)) {
        this.removeRig(rig);
        this.rigs.delete(id);
      }
    });

    // Name tag over whoever has the ball.
    const owner = view.ownerId ? view.actors.find((a) => a.id === view.ownerId) : undefined;
    if (owner && this.mode === 'broadcast') {
      const key = `${owner.number} ${owner.label}`;
      if (key !== this.ownerLabelKey) {
        this.ownerLabelKey = key;
        this.ownerLabel.material.map?.dispose();
        const { texture, aspect } = labelTexture(key);
        this.ownerLabel.material.map = texture;
        this.ownerLabel.material.needsUpdate = true;
        this.ownerLabel.userData.aspect = aspect;
      }
      const h = 1.1;
      this.ownerLabel.scale.set(h * (this.ownerLabel.userData.aspect ?? 3), h, 1);
      this.ownerLabel.position.set(wx(owner.pos.x), 2.35 * PLAYER_SCALE + 1.55, wz(owner.pos.y));
      this.ownerLabel.visible = true;
    } else {
      this.ownerLabel.visible = false;
    }
  }

  private poseBall(view: SceneView, dt: number): void {
    const { x, y, h } = view.ball;
    const moved = Math.hypot(x - this.lastBall.x, y - this.lastBall.y);
    this.lastBall = { x, y };
    this.ballSpin += moved / BALL_R;
    this.ball.position.set(wx(x), BALL_R + h, wz(y));
    this.ball.rotation.set(this.ballSpin, this.ballSpin * 0.3, 0);
    this.ballShadow.position.set(wx(x) + h * 0.15, 0.03, wz(y) + h * 0.2);
    const shrink = Math.max(0.5, 1 - h * 0.08);
    this.ballShadow.scale.setScalar(0.55 * shrink);
    void dt;
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
      sprite.position.set(wx(actor.pos.x), 2.35 * PLAYER_SCALE + 2.3, wz(actor.pos.y));
    });
  }

  /* ----------------------------------------------------------------- camera */

  private moveCamera(view: SceneView, dt: number): void {
    const k = 1 - Math.exp(-dt * 2.4);
    // Move in on key moments, pull back for open play.
    this.zoom += ((view.highlight ? 1 : 0) - this.zoom) * (1 - Math.exp(-dt * 1.2));

    const bx = wx(view.ball.x);
    const bz = wz(view.ball.y);
    const target = new THREE.Vector3();
    const pos = new THREE.Vector3();

    if (this.mode === 'tactical') {
      // Whole pitch in view, from high over the near touchline.
      const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
      const hFov = Math.atan(Math.tan(halfFov) * this.aspect);
      const need = Math.max((PITCH_W / 2 + 6) / Math.tan(hFov), (PITCH_H / 2 + 12) / Math.tan(halfFov));
      target.set(0, 0, -1);
      pos.set(0, need * 0.92, need * 0.42);
    } else {
      // A narrow screen sees less width, so stand further back on phones.
      const widthBoost = this.aspect < 1.4 ? 1.28 : 1;
      const dist = (44 - this.zoom * 14) * widthBoost;
      const height = (24 - this.zoom * 7) * widthBoost;
      const fx = THREE.MathUtils.clamp(bx, -PITCH_W / 2 + 12, PITCH_W / 2 - 12);
      target.set(fx, 0, bz * 0.55);
      pos.set(fx * 0.9, height, bz * 0.3 + dist);
    }

    this.focus.lerp(target, k);
    this.camPos.lerp(pos, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.focus);
  }
}

/* ----------------------------------------------------------------- helpers */

function approachAngle(from: number, to: number, t: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  return canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#111827';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const cx = 10 + i * 22;
      const cy = i % 2 === 0 ? 18 : 46;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
      }
      ctx.fill();
    }
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
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
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
  tex.repeat.set(6, 3);
  return tex;
}

function boardTexture(): THREE.CanvasTexture {
  const colors = ['#0ea5e9', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#facc15'];
  const words = ['GAFFER', 'MATCHDAY', 'KICK OFF', 'GAFFER', 'FOOTBALL', 'TOP EDGE'];
  return canvasTexture(512, 32, (ctx) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(i * 128, 0, 128, 32);
      ctx.fillStyle = readableOn(colors[i % colors.length]);
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(words[i % words.length], i * 128 + 64, 17);
    }
  });
}

function crowdTexture(): THREE.CanvasTexture {
  const palette = ['#e2e8f0', '#f87171', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#94a3b8', '#1e293b'];
  return canvasTexture(256, 32, (ctx) => {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 32);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      const x = Math.random() * 256;
      const y = 6 + Math.random() * 22;
      ctx.fillRect(x, y, 2.5, 3.5);
      ctx.fillStyle = '#e8c3a0';
      ctx.fillRect(x + 0.4, y - 2, 1.7, 1.8);
    }
  });
}

export type { SideKey };
