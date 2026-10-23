/**
 * Builds public/models/player.glb from Mixamo's X Bot (as shipped with the
 * three.js examples): one mesh, ~3k vertices for 22 players on a phone,
 * idle/walk/run only, and a per-vertex body part so the game can dress it.
 *
 *   node scripts/build-player-model.mjs path/to/Xbot.glb
 *
 * _REGION: body part, 0 torso, 1 leg, 2 arm, 3 head (the mannequin head, which
 * the game hides and replaces with a face).
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [src, out = 'public/models/player.glb', ratioArg = '0.11'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

// Keep only the locomotion clips.
const KEEP = new Set(['idle', 'walk', 'run']);
root.listAnimations().forEach((a) => {
  if (!KEEP.has(a.getName())) {
    a.dispose();
    return;
  }
  // Fingers, eyes and end bones never show at match distance.
  a.listChannels().forEach((c) => {
    if (/Hand[A-Z]|Eye|_End/.test(c.getTargetNode()?.getName() ?? '')) {
      c.getSampler()?.dispose();
      c.dispose();
    }
  });
});

// Merge the two surfaces (body and joint rings) into one primitive.
const meshes = root.listMeshes();
const material = doc.createMaterial('kit').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7);
const skinNodes = root.listNodes().filter((n) => n.getMesh());
const keepNode = skinNodes[0];
const target = keepNode.getMesh().listPrimitives()[0];
const merged = mergePrimitives(skinNodes.map((n) => n.getMesh().listPrimitives()[0]));
target.setMaterial(material);
Object.entries(merged).forEach(([semantic, { array, size, type }]) => {
  const acc = doc.createAccessor().setArray(array).setType(type);
  if (semantic === 'indices') target.setIndices(acc);
  else target.setAttribute(semantic, acc);
});
skinNodes.slice(1).forEach((n) => n.dispose());
meshes.slice(1).forEach((m) => m.dispose());
root.listMaterials().forEach((m) => m !== material && m.dispose());

await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratioArg), error: 0.02 }), resample(), dedup(), prune());

// Body part of each vertex from its strongest joint. The game paints the kit
// per pixel from this and the bind-pose height, so seams come out straight.
const skin = keepNode.getSkin();
const joints = skin.listJoints();
const prim = keepNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const J = prim.getAttribute('JOINTS_0');
const W = prim.getAttribute('WEIGHTS_0');
const region = new Float32Array(pos.getCount());
const p = [], j = [], w = [];
for (let v = 0; v < pos.getCount(); v++) {
  J.getElement(v, j);
  W.getElement(v, w);
  const name = joints[j[w.indexOf(Math.max(...w))]].getName().replace('mixamorig:', '');
  region[v] = /^Head|Eye/.test(name) ? 3 : /UpLeg|Leg$|Foot|Toe/.test(name) ? 1 : /Arm|Hand/.test(name) ? 2 : 0;
}
prim.setAttribute('_REGION', doc.createAccessor().setArray(region).setType('SCALAR'));

// Anchor points the game needs, in bind (mesh) space.
let minY = Infinity, maxY = -Infinity;
for (let v = 0; v < pos.getCount(); v++) {
  pos.getElement(v, p);
  minY = Math.min(minY, p[1]);
  maxY = Math.max(maxY, p[1]);
}
root.listScenes()[0].setExtras({
  height: maxY - minY,
  floor: minY,
});

await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log('vertices', pos.getCount(), 'triangles', prim.getIndices().getCount() / 3, 'height', (maxY - minY).toFixed(3));

function mergePrimitives(prims) {
  const semantics = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
  const out = {};
  let offset = 0;
  const indices = [];
  semantics.forEach((s) => {
    const accs = prims.map((pr) => pr.getAttribute(s));
    const Ctor = accs[0].getArray().constructor;
    const total = accs.reduce((n, a) => n + a.getArray().length, 0);
    const array = new Ctor(total);
    let at = 0;
    accs.forEach((a) => {
      array.set(a.getArray(), at);
      at += a.getArray().length;
    });
    out[s] = { array, type: accs[0].getType() };
  });
  prims.forEach((pr) => {
    const idx = pr.getIndices().getArray();
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset);
    offset += pr.getAttribute('POSITION').getCount();
  });
  out.indices = { array: new Uint32Array(indices), type: 'SCALAR' };
  return out;
}
