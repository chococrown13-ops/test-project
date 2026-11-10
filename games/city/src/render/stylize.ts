import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The illustrated look: soft ink lines where depth or surface direction
 * changes, drawn in a darker shade of whatever lies beneath (never pure
 * black), fading out with distance so a whole city does not turn into a
 * scribble; then a gentle warm grade and a faint vignette.
 *
 * Reads the scene's colour and depth from the composer's buffer, plus a
 * normal buffer it renders itself with shadows switched off.
 */
export class StylizePass extends Pass {
  private quad: FullScreenQuad;
  private normals: THREE.WebGLRenderTarget;
  private normalMat = new THREE.MeshNormalMaterial();
  private uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 2 },
    uFar: { value: 6000 },
    uFade: { value: new THREE.Vector2(400, 1600) },
    uStrength: { value: 0.55 },
    uNight: { value: 0 },
  };
  /** Normal buffer size relative to the screen: 1 sharp, 0.5 for lighter devices. */
  normalScale = 1;
  /** Objects to leave out of the normal render (sky, invisible shadow casters). */
  skip: THREE.Object3D[] = [];

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    super();
    this.normals = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tDepth, tNormal;
        uniform vec2 uTexel, uFade;
        uniform float uNear, uFar, uStrength, uNight;
        varying vec2 vUv;
        float lin(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return (uNear * uFar) / (uFar - d * (uFar - uNear));
        }
        vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 col = base.rgb;
          float d0 = lin(vUv);
          bool sky = texture2D(tDepth, vUv).x > 0.99999;
          if (!sky) {
            vec2 ox = vec2(uTexel.x, 0.0), oy = vec2(0.0, uTexel.y);
            // Depth jumps, relative to distance so sloping ground stays clean.
            float dd = abs(lin(vUv + ox) - d0) + abs(lin(vUv - ox) - d0) + abs(lin(vUv + oy) - d0) + abs(lin(vUv - oy) - d0);
            float depthEdge = smoothstep(0.012 * d0, 0.05 * d0, dd);
            // Creases: neighbouring surfaces that face different ways (roof ridges, wall corners).
            vec3 n0 = nrm(vUv);
            float nd = (1.0 - dot(n0, nrm(vUv + ox))) + (1.0 - dot(n0, nrm(vUv - ox))) + (1.0 - dot(n0, nrm(vUv + oy))) + (1.0 - dot(n0, nrm(vUv - oy)));
            float normalEdge = smoothstep(0.35, 0.9, nd);
            float edge = max(depthEdge, normalEdge * 0.75);
            float fade = 1.0 - smoothstep(uFade.x, uFade.y, d0);
            // Ink is the colour beneath, darker and a touch warmer: never a black stroke.
            vec3 ink = col * vec3(0.5, 0.44, 0.4);
            col = mix(col, ink, edge * fade * uStrength);
          }
          // Gentle grade: a little more colour, warm light by day, a faint vignette.
          float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(lum), col, 1.08);
          col *= mix(vec3(1.035, 1.0, 0.955), vec3(0.98, 0.99, 1.03), uNight);
          vec2 c = vUv - 0.5;
          col *= 1.0 - 0.12 * smoothstep(0.45, 0.95, length(c * vec2(1.25, 1.0)));
          gl_FragColor = vec4(col, base.a);
        }`,
    });
    this.quad = new FullScreenQuad(mat);
  }

  setSize(width: number, height: number) {
    this.normals.setSize(Math.max(1, Math.floor(width * this.normalScale)), Math.max(1, Math.floor(height * this.normalScale)));
    this.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  /** Lines thin out with the camera distance; night softens the warm tint. */
  configure(viewDist: number, night: number) {
    this.uniforms.uFade.value.set(viewDist * 1.1, viewDist * 3.6);
    this.uniforms.uNight.value = night;
    this.uniforms.uStrength.value = 0.55 - night * 0.2;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    // Normal buffer: opaque geometry only, no shadows, no sky, sprites or see-through overlays.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverseVisible((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Sprite).isSprite || (m && !Array.isArray(m) && (m.transparent || m.colorWrite === false)) || this.skip.includes(o)) hidden.push(o);
    });
    for (const o of hidden) o.visible = false;
    const auto = renderer.shadowMap.autoUpdate, bg = this.scene.background, fog = this.scene.fog;
    const clear = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    renderer.shadowMap.autoUpdate = false;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normalMat;
    renderer.setRenderTarget(this.normals);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.scene.fog = fog;
    renderer.shadowMap.autoUpdate = auto;
    renderer.setClearColor(clear, clearAlpha);
    for (const o of hidden) o.visible = true;

    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    this.uniforms.tNormal.value = this.normals.texture;
    this.uniforms.uNear.value = this.camera.near;
    this.uniforms.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.normals.dispose();
    this.normalMat.dispose();
    this.quad.dispose();
  }
}
