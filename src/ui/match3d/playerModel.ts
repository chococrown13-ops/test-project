import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * The skinned, motion-captured footballer (built by
 * scripts/build-player-model.mjs). Every player is a clone sharing one
 * skeleton layout; a small shader patch paints the kit from a per-vertex
 * region so each clone only needs its own colours.
 */

export type Clip = 'idle' | 'walk' | 'run';
export type BoneKey = 'hips' | 'spine' | 'head' | 'lUpLeg' | 'lLeg' | 'rUpLeg' | 'rLeg' | 'lArm' | 'rArm' | 'lForeArm' | 'rForeArm';

const BONE_NAMES: Record<BoneKey, string> = {
  hips: 'Hips',
  spine: 'Spine2',
  head: 'Head',
  lUpLeg: 'LeftUpLeg',
  lLeg: 'LeftLeg',
  rUpLeg: 'RightUpLeg',
  rLeg: 'RightLeg',
  lArm: 'LeftArm',
  rArm: 'RightArm',
  lForeArm: 'LeftForeArm',
  rForeArm: 'RightForeArm',
};

/** Measurements of the bind pose in model space (metres). */
export interface ModelInfo {
  height: number;
  floor: number;
  head: { center: THREE.Vector3; size: THREE.Vector3 };
  torso: { y0: number; y1: number; front: number; back: number; halfWidth: number };
  /** Kit seams in bind-pose model space: heights on the body and legs, distance out along the arms. */
  seams: { neck: number; waist: number; shorts: number; socks: number; boots: number; sleeve: number; wrist: number };
}

export interface PlayerModel {
  template: THREE.Object3D;
  clips: Record<Clip, THREE.AnimationClip>;
  info: ModelInfo;
}

export interface KitUniforms {
  uSkin: { value: THREE.Color };
  uShirt: { value: THREE.Color };
  uShorts: { value: THREE.Color };
  uSocks: { value: THREE.Color };
  uBoots: { value: THREE.Color };
  uHands: { value: THREE.Color };
}

export interface PlayerInstance {
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  bones: Record<BoneKey, THREE.Bone>;
  /** Each bone's local axes matching world side (x) and forward (z) in the bind pose. */
  side: Map<THREE.Bone, THREE.Vector3>;
  forward: Map<THREE.Bone, THREE.Vector3>;
  uniforms: KitUniforms;
}

export async function loadPlayerModel(url: string): Promise<PlayerModel | null> {
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c])) as Record<Clip, THREE.AnimationClip>;
    if (!clips.idle || !clips.walk || !clips.run) return null;
    const template = gltf.scene;
    template.updateMatrixWorld(true);
    return { template, clips, info: measure(template) };
  } catch (err) {
    console.warn('player model unavailable, using simple players', err);
    return null;
  }
}

function skinnedMeshOf(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  if (!found) throw new Error('no skinned mesh');
  return found;
}

function measure(template: THREE.Object3D): ModelInfo {
  const mesh = skinnedMeshOf(template);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const part = geo.attributes._region;
  const v = new THREE.Vector3();
  const all = new THREE.Box3();
  const head = new THREE.Box3();
  const bind = new Float32Array(pos.count * 3);
  const torso: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    // Skinned position in the bind pose, as the GPU would draw it.
    mesh.applyBoneTransform(i, v.fromBufferAttribute(pos, i)).applyMatrix4(mesh.matrixWorld);
    v.toArray(bind, i * 3);
    all.expandByPoint(v);
    const r = part.getX(i);
    if (r > 2.5) head.expandByPoint(v);
    else if (r < 0.5 && Math.abs(v.x) < 0.2) torso.push(v.clone());
  }
  // Every clone shares the geometry, so this is stored once.
  geo.setAttribute('aBind', new THREE.BufferAttribute(bind, 3));

  const at = (name: string) => boneOf(template, name).getWorldPosition(new THREE.Vector3());
  const neck = at('Neck');
  const hips = at('Hips');
  const knee = at('LeftLeg');
  const ankle = at('LeftFoot');
  const shoulder = at('LeftArm');
  const elbow = at('LeftForeArm');
  const wrist = at('LeftHand');

  const top = neck.y;
  const y0 = top - 0.36;
  const y1 = top - 0.04;
  let front = -Infinity;
  let back = Infinity;
  let halfWidth = 0;
  torso.forEach((p) => {
    if (p.y < y0 || p.y > y1) return;
    front = Math.max(front, p.z);
    back = Math.min(back, p.z);
    halfWidth = Math.max(halfWidth, Math.abs(p.x));
  });
  return {
    height: all.max.y - all.min.y,
    floor: all.min.y,
    head: { center: head.getCenter(new THREE.Vector3()), size: head.getSize(new THREE.Vector3()) },
    torso: { y0, y1, front, back, halfWidth },
    seams: {
      neck: neck.y - 0.03,
      waist: hips.y + 0.03,
      shorts: knee.y + (hips.y - knee.y) * 0.5,
      socks: knee.y - 0.05,
      boots: ankle.y + 0.03,
      sleeve: Math.abs(shoulder.x) + (Math.abs(elbow.x) - Math.abs(shoulder.x)) * 0.5,
      wrist: Math.abs(wrist.x) - 0.02,
    },
  };
}

/**
 * Kit material. Colours are chosen per pixel from the body part and the
 * bind-pose position (so seams are straight lines across the mesh), and the
 * mannequin head is folded away for the face to replace it.
 */
function kitMaterial(info: ModelInfo): { material: THREE.MeshStandardMaterial; uniforms: KitUniforms } {
  const uniforms: KitUniforms = {
    uSkin: { value: new THREE.Color('#e0ac85') },
    uShirt: { value: new THREE.Color('#ffffff') },
    uShorts: { value: new THREE.Color('#ffffff') },
    uSocks: { value: new THREE.Color('#ffffff') },
    uBoots: { value: new THREE.Color('#111827') },
    uHands: { value: new THREE.Color('#e0ac85') },
  };
  const s = info.seams;
  const f = (n: number) => n.toFixed(4);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.66, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _region;\nattribute vec3 aBind;\nflat varying float vPart;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = _region;\nvBind = aBind;\nif (_region > 2.5) transformed = vec3(0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uSkin;\nuniform vec3 uShirt;\nuniform vec3 uShorts;\nuniform vec3 uSocks;\nuniform vec3 uBoots;\nuniform vec3 uHands;\nflat varying float vPart;\nvarying vec3 vBind;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 kit;
        float shine = 0.0;
        if (vPart < 0.5) {
          kit = vBind.y > ${f(s.neck)} && abs(vBind.x) < 0.075 ? uSkin : vBind.y > ${f(s.waist)} ? uShirt : uShorts;
        } else if (vPart < 1.5) {
          float y = vBind.y;
          kit = y > ${f(s.shorts)} ? uShorts : y > ${f(s.socks)} ? uSkin : y > ${f(s.boots)} ? uSocks : uBoots;
          shine = y > ${f(s.boots)} ? 0.0 : 1.0;
          // A band of trim colour at the top of the socks.
          if (y < ${f(s.socks)} && y > ${f(s.socks - 0.035)}) kit = uShorts;
        } else {
          float x = abs(vBind.x);
          kit = x < ${f(s.sleeve)} ? uShirt : x < ${f(s.wrist)} ? uSkin : uHands;
        }
        diffuseColor.rgb *= kit;`,
      )
      // Boots shine a little more than cloth.
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.32, shine);');
  };
  material.customProgramCacheKey = () => 'gaffer-kit';
  return { material, uniforms };
}

/**
 * Pin `obj` to a bone so that in the bind pose it sits at `world` (model
 * space) with model-space orientation `rot` and uniform size `scale`.
 */
export function attachToBone(bone: THREE.Bone, obj: THREE.Object3D, world: THREE.Vector3, scale: number, rot = new THREE.Quaternion()): void {
  bone.updateWorldMatrix(true, false);
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const boneS = bone.getWorldScale(new THREE.Vector3());
  obj.position.copy(bone.worldToLocal(world.clone()));
  obj.quaternion.copy(boneQ.invert().multiply(rot));
  obj.scale.setScalar(scale / boneS.x);
  bone.add(obj);
}

export function boneOf(root: THREE.Object3D, name: string): THREE.Bone {
  const bone = root.getObjectByName(`mixamorig${name}`) ?? root.getObjectByName(`mixamorig:${name}`);
  if (!bone) throw new Error(`missing bone ${name}`);
  return bone as THREE.Bone;
}

/** A fresh player: its own skeleton, mixer and kit colours. */
export function instantiate(model: PlayerModel): PlayerInstance {
  const root = cloneSkinned(model.template);
  root.updateMatrixWorld(true);
  const mesh = skinnedMeshOf(root);
  const { material, uniforms } = kitMaterial(model.info);
  mesh.material = material;
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  const bones = Object.fromEntries(
    (Object.keys(BONE_NAMES) as BoneKey[]).map((k) => [k, boneOf(root, BONE_NAMES[k])]),
  ) as Record<BoneKey, THREE.Bone>;
  const side = new Map<THREE.Bone, THREE.Vector3>();
  const forward = new Map<THREE.Bone, THREE.Vector3>();
  Object.values(bones).forEach((bone) => {
    const inv = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    side.set(bone, new THREE.Vector3(1, 0, 0).applyQuaternion(inv).normalize());
    forward.set(bone, new THREE.Vector3(0, 0, 1).applyQuaternion(inv).normalize());
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {} as Record<Clip, THREE.AnimationAction>;
  (['idle', 'walk', 'run'] as Clip[]).forEach((clip) => {
    const action = mixer.clipAction(model.clips[clip]);
    action.play();
    action.setEffectiveWeight(clip === 'idle' ? 1 : 0);
    // Start each player somewhere different in the cycle.
    action.time = Math.random() * model.clips[clip].duration;
    actions[clip] = action;
  });
  return { root, mesh, mixer, actions, bones, side, forward, uniforms };
}
