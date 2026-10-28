import * as THREE from 'three';

/**
 * Shared uniforms: the time of day drives sunlight, sky, and the lit
 * windows that make a Korean city at night.
 */
export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
};

/**
 * Building material. Windows, shop signs and green rooftops are drawn in the
 * shader from world position, so one box per building is enough and floors
 * line up at 3 m everywhere.
 *
 * Per instance:
 *  aStyle  0 villa · 1 apartment · 2 shops · 3 office glass · 4 factory · 5 plain
 *  aSign   signboard colour for shops
 *  aInfo   x: seed · y: powered (1/0) · z: abandoned (1/0)
 */
export function buildingMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
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
        varying float vTop;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 cwM = modelMatrix * instanceMatrix;
        vWP = (cwM * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(cwM) * objectNormal);
        vStyle = aStyle; vSign = aSign; vInfo = aInfo;
        vTop = (cwM * vec4(0.0, 1.0, 0.0, 1.0)).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        varying vec3 vWP;
        varying vec3 vWN;
        varying float vStyle;
        varying vec3 vSign;
        varying vec3 vInfo;
        varying float vTop;
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
          // Ground floor: shopfronts, or the open parking (필로티) under 다세대 buildings.
          if (vWP.y < 3.0 && st < 4.5) win = st < 0.5 ? 0.0 : 1.0;
          // Apartment balconies: a pale rail band under each window row.
          if (abs(st - 1.0) < 0.5 && fv < 0.3 && vWP.y > 3.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93), 0.6);
          // Shops: a signboard band on each of the first floors, in a loud colour.
          if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) { diffuseColor.rgb = vSign; win = 0.0; }
          // Apartment brand stripe near the roof.
          if (abs(st - 1.0) < 0.5 && vWP.y > vTop - 2.4 && vWP.y < vTop - 1.2) { diffuseColor.rgb = vSign; win = 0.0; }
          vec3 glass = st > 2.5 && st < 3.5 ? vec3(0.32, 0.45, 0.58) : vec3(0.18, 0.22, 0.28);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * (1.0 - abandoned * 0.5));
          float on = step(0.42, h21(vec2(floorIx * 7.0 + vInfo.x * 91.0, colIx)));
          lit = win * on * vInfo.y * (1.0 - abandoned);
          if (abs(st - 2.0) < 0.5 && fy < 3.0 && fv > 0.85) lit = vInfo.y * 0.8;
          // A thin slab line at every floor gives the facade its rhythm.
          if (st < 4.5 && fv < 0.035 && vWP.y > 2.9) diffuseColor.rgb *= 0.86;
          // Contact shade: walls darken toward the pavement, a cheap ambient occlusion.
          diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 3.2, vWP.y));
          winTint = h21(vec2(floorIx * 3.1 + vInfo.x * 17.0, colIx * 1.7));
        }
        diffuseColor.rgb *= 1.0 - abandoned * 0.35;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += lit * uNight * (abs(floor(vStyle + 0.5) - 2.0) < 0.5 && vWP.y < 9.0 && fract(vWP.y / 3.0) > 0.85 ? vSign * 1.6 : (winTint < 0.7 ? vec3(1.0, 0.78, 0.45) : winTint < 0.9 ? vec3(0.95, 0.92, 0.82) : vec3(0.55, 0.7, 1.0)) * 1.35);`);
  };
  m.customProgramCacheKey = () => 'city-building';
  return m;
}
