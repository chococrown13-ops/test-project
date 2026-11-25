import * as THREE from 'three';

/**
 * Shared uniforms: the time of day drives sunlight, sky, and the lit
 * windows that make a Korean city at night.
 */
export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  /** 0..1: how much snow lies on the ground and roofs (winter months). */
  uSnow: { value: 0 },
};

/**
 * Building material. Windows, shop signs and green rooftops are drawn in the
 * shader from world position, so one box per building is enough and floors
 * line up at 3 m everywhere.
 *
 * Per instance:
 *  aStyle  0 villa · 1 apartment · 2 shops · 3 office glass · 4 factory · 5 plain ·
 *          6 house · 7 한옥 timber · 8 villa with white-framed windows · 9 판상형 slab (blank ends) ·
 *          10 상가주택 (glass shopfront, windows above) · 11 signboard (lit at night)
 *  aSign   signboard colour for shops
 *  aInfo   x: seed · y: powered (1/0) · z: abandoned (1/0)
 */
export function buildingMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.uniforms.uSnow = shared.uSnow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aStyle;
        attribute vec3 aSign;
        attribute vec3 aInfo;
        varying vec3 vWP;
        varying vec3 vWN;
        varying float vStyle;
        varying vec3 vSign;
        varying vec3 vInfo;
        varying float vTop;
        varying float vLY;
        varying float vH;
        varying vec3 vLN;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 cwM = modelMatrix * instanceMatrix;
        vWP = (cwM * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(cwM) * objectNormal);
        vStyle = aStyle; vSign = aSign; vInfo = aInfo;
        vTop = (cwM * vec4(0.0, 1.0, 0.0, 1.0)).y;
        vLY = position.y; vH = length(instanceMatrix[1].xyz); vLN = objectNormal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        uniform float uSnow;
        varying vec3 vWP;
        varying vec3 vWN;
        varying float vStyle;
        varying vec3 vSign;
        varying vec3 vInfo;
        varying float vTop;
        varying float vLY;
        varying float vH;
        varying vec3 vLN;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float lit = 0.0;
        float winTint = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float st = floor(vStyle + 0.5);
        bool side = abs(vWN.y) < 0.5;
        float abandoned = vInfo.z;
        if (!side) {
          // Rooftops: the green waterproof paint on Korean villas and shops.
          if (st < 0.5 || abs(st - 2.0) < 0.5) diffuseColor.rgb = vec3(0.36, 0.55, 0.42);
          else diffuseColor.rgb *= 0.78;
          // Winter: roofs whiten under the snow.
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.96, 0.98), uSnow * 0.85);
        } else {
          vec2 t = normalize(vec2(-vWN.z, vWN.x));
          float u = dot(vWP.xz, t);
          float fy = vWP.y / 3.0;
          float floorIx = floor(fy);
          float fv = fract(fy);
          float spacing = st < 0.5 ? 3.2 : st < 1.5 ? 2.6 : st < 2.5 ? 3.4 : st < 3.5 ? 1.7 : 6.0;
          float cu = fract(u / spacing);
          float colIx = floor(u / spacing);
          float win = 0.0;
          if (st < 0.5) win = step(0.35, fv) * step(fv, 0.72) * step(0.28, cu) * step(cu, 0.72);
          else if (st < 1.5) win = step(0.3, fv) * step(fv, 0.8) * step(0.12, cu) * step(cu, 0.88);
          else if (st < 2.5) win = step(0.25, fv) * step(fv, 0.85) * step(0.08, cu) * step(cu, 0.92);
          else if (st < 3.5) win = step(0.1, fv) * step(cu, 0.94);
          else if (st < 4.5) win = step(0.6, fv) * step(fv, 0.85) * step(0.3, cu) * step(cu, 0.7) * step(fy, 1.0);
          else if (st > 5.5) {
            // Styles from the old town: measured from this part's own foot.
            float yl = vLY * vH, fl = fract(yl / 3.0);
            if (st < 6.5) {
              // House: small windows.
              float c = fract(u / 3.4);
              win = step(0.38, fl) * step(fl, 0.72) * step(0.3, c) * step(c, 0.7);
            } else if (st < 7.5) {
              // 한옥: timber posts and beam, papered lattice doors between.
              float c = fract(u / 2.6);
              if (vLY > 0.84 || c < 0.07) diffuseColor.rgb = vec3(0.36, 0.26, 0.2);
              else if (vLY > 0.18 && vLY < 0.78 && c > 0.18 && c < 0.82) {
                float lat = max(step(fract(u * 2.2), 0.12), step(fract(yl * 2.2), 0.12));
                diffuseColor.rgb = mix(vec3(0.93, 0.88, 0.76), vec3(0.4, 0.3, 0.22), lat);
                win = 0.0;
              }
            } else if (st < 8.5) {
              // Brick or tile villa: white-framed windows.
              float c = fract(u / 3.2);
              float frame = step(0.3, fl) * step(fl, 0.8) * step(0.22, c) * step(c, 0.78);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), frame);
              win = step(0.34, fl) * step(fl, 0.76) * step(0.26, c) * step(c, 0.74);
            } else if (st < 9.5) {
              // 판상형 slab: balconies on the long faces, blank gable ends.
              if (abs(vLN.x) < 0.5) {
                float c = fract(u / 2.8), unit = floor(u / 2.8);
                if (fl < 0.28 && yl > 3.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), 0.6);
                win = step(0.32, fl) * step(fl, 0.8) * step(0.1, c) * step(c, 0.9) * step(3.0, yl);
                // A party wall between every two flats, and a white frame splitting each balcony window.
                if (mod(unit, 2.0) < 0.5 && c < 0.07 && yl > 3.0) diffuseColor.rgb *= 0.78;
                if (win > 0.5 && abs(c - 0.5) < 0.03) { win = 0.0; diffuseColor.rgb = vec3(0.93, 0.93, 0.9); }
                // An air-conditioner cage under some windows.
                if (fl > 0.06 && fl < 0.26 && c > 0.66 && c < 0.86 && yl > 3.0 && h21(vec2(unit, floor(yl / 3.0))) > 0.6) diffuseColor.rgb = vec3(0.62, 0.63, 0.62);
              }
            } else if (st < 10.5) {
              // 상가주택: a glass front on the ground floor, ordinary windows above.
              float c = fract(u / 3.6);
              win = yl < 3.0 ? step(0.12, fl) * step(fl, 0.66) * step(0.06, c) * step(c, 0.94)
                             : step(0.3, fl) * step(fl, 0.72) * step(0.15, c) * step(c, 0.85);
            }
          }
          // Ground floor: shopfronts, or the open parking (필로티) under 다세대 buildings.
          if (vWP.y < 3.0 && st < 4.5) win = st < 0.5 ? 0.0 : 1.0;
          // Apartment balconies: a pale rail band under each window row.
          if (abs(st - 1.0) < 0.5 && fv < 0.3 && vWP.y > 3.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93), 0.6);
          // Shops: a signboard band on each of the first floors, in a loud colour.
          if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) { diffuseColor.rgb = vSign; win = 0.0; }
          // Apartment brand stripe near the roof.
          if ((abs(st - 1.0) < 0.5 || abs(st - 9.0) < 0.5) && vWP.y > vTop - 2.4 && vWP.y < vTop - 1.2) { diffuseColor.rgb = vSign; win = 0.0; }
          vec3 glass = st > 2.5 && st < 3.5 ? vec3(0.32, 0.45, 0.58) : vec3(0.18, 0.22, 0.28);
          float pane = h21(vec2(floorIx * 5.3 + vInfo.x * 13.0, colIx * 2.9));
          if (st > 2.5 && st < 3.5) {
            // Curtain wall: the sky reflected, brighter toward the top of each pane and varying pane to pane,
            // and a dark spandrel band at every floor slab.
            glass = mix(glass, vec3(0.66, 0.77, 0.88), 0.25 * fv + 0.22 * pane);
            if (fv < 0.1) { diffuseColor.rgb = vec3(0.27, 0.31, 0.36); win = 0.0; }
          } else {
            // Ordinary windows: a little sky in the glass, and curtains drawn in some.
            glass = mix(glass, vec3(0.45, 0.55, 0.66), 0.28 * fv);
            if (pane > 0.72) glass = mix(glass, vec3(0.86, 0.8, 0.68), 0.45);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * (1.0 - abandoned * 0.5));
          float on = step(0.42, h21(vec2(floorIx * 7.0 + vInfo.x * 91.0, colIx)));
          lit = win * on * vInfo.y * (1.0 - abandoned);
          if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) lit = vInfo.y * 0.8;
          if (st > 10.5) lit = vInfo.y * (1.0 - abandoned);
          // A thin slab line at every floor gives the facade its rhythm.
          if ((st < 4.5 || (st > 5.5 && st < 10.5 && st != 7.0)) && fv < 0.035 && vWP.y > 2.9) diffuseColor.rgb *= 0.86;
          // Contact shade: walls darken toward the pavement, a cheap ambient occlusion.
          diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 3.2, vWP.y));
          winTint = h21(vec2(floorIx * 3.1 + vInfo.x * 17.0, colIx * 1.7));
        }
        diffuseColor.rgb *= 1.0 - abandoned * 0.35;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += lit * uNight * (floor(vStyle + 0.5) > 10.5 ? diffuseColor.rgb * 1.4 : abs(floor(vStyle + 0.5) - 2.0) < 0.5 && vWP.y < 9.0 && fract(vWP.y / 3.0) > 0.85 ? vSign * 1.6 : (winTint < 0.7 ? vec3(1.0, 0.78, 0.45) : winTint < 0.9 ? vec3(0.95, 0.92, 0.82) : vec3(0.55, 0.7, 1.0)) * 0.95);`);
  };
  m.customProgramCacheKey = () => 'city-building-2';
  return m;
}
