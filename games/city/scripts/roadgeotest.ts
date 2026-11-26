/* Cross-check with the Unity port: road graph and road meshes for a saved city. */
import { readFileSync } from 'node:fs';
import { unpack } from '../src/sim/save';
import { buildCityNetwork, buildElevatedNetwork } from '../src/render/roadnet';
import { buildGeometry } from '../../shared/roads/network';
import { buildRoadMeshes } from '../../shared/roads/mesh';
import type * as THREE from 'three';

const w = unpack(readFileSync(process.argv[2], 'utf8'))!;
const net = buildCityNetwork(w);
const geo = buildGeometry(net);
let ring = 0, rx = 0;
for (const j of geo.junctions) { ring += j.ring.length; for (const p of j.ring) rx += p.x + p.z; }
let tl = 0; for (const r of geo.ribbons) tl += r.t1 - r.t0;
console.log(`nodes ${net.nodes.size} edges ${net.edges.size} ribbons ${geo.ribbons.length} junctions ${geo.junctions.length} ringpts ${ring} ringsum ${rx.toFixed(2)} ribbonlen ${tl.toFixed(3)}`);
const g = buildRoadMeshes(net, { heights: { asphalt: 0.12, kerb: 0.32, paint: 0.14 }, zebra: 2.2 }, geo);
const counts = g.children.map((m) => ((m as THREE.Mesh).geometry.attributes.position.count / 3));
console.log('tris asphalt/pave/paint', counts.join('/'));
const fly = buildElevatedNetwork(w);
console.log(`fly nodes ${fly.net.nodes.size} edges ${fly.net.edges.size}`);
