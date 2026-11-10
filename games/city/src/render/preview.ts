import * as THREE from 'three';
import { CELL, N } from '../sim/defs';

/** Translucent cell highlights for the active tool, plus a coverage ring. */
export class PreviewLayer {
  readonly group = new THREE.Group();
  private cells: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private line: THREE.Mesh;
  private handle: THREE.Mesh;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
    this.cells = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.96, 0.6, CELL * 0.96).translate(0, 0.3, 0), mat, N * N);
    this.cells.count = 0;
    this.cells.frustumCulled = false;
    this.cells.renderOrder = 5;
    this.cells.setColorAt(0, new THREE.Color());
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 6;
    this.line = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    this.line.visible = false;
    this.line.renderOrder = 6;
    this.handle = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.handle.visible = false;
    this.handle.renderOrder = 7;
    this.group.add(this.cells, this.ring, this.line, this.handle);
  }

  /** Show cells (by index) in a colour; extra height for building ghosts. */
  show(cells: number[], color: string, height = 0.6) {
    const m = new THREE.Matrix4(), c = new THREE.Color(color);
    const n = Math.min(cells.length, N * N);
    for (let k = 0; k < n; k++) {
      const i = cells[k];
      m.makeScale(1, height / 0.6, 1).setPosition((i % N) * CELL + CELL / 2, 0, Math.floor(i / N) * CELL + CELL / 2);
      this.cells.setMatrixAt(k, m);
      this.cells.setColorAt(k, c);
    }
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
  }

  /** Mixed colours per cell. */
  showEach(cells: { i: number; color: string }[]) {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const n = Math.min(cells.length, N * N);
    for (let k = 0; k < n; k++) {
      const { i, color } = cells[k];
      m.makeTranslation((i % N) * CELL + CELL / 2, 0, Math.floor(i / N) * CELL + CELL / 2);
      this.cells.setMatrixAt(k, m);
      this.cells.setColorAt(k, c.set(color));
    }
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
  }

  ringAt(x: number, z: number, r: number) {
    this.ring.visible = r > 0;
    this.ring.position.set(x, 0.8, z);
    this.ring.scale.setScalar(r);
  }

  /** A flat band along a polyline (a curved road being laid), and the bend handle. */
  path(pts: { x: number; z: number }[], width: number, color: string, handle?: { x: number; z: number }) {
    if (pts.length < 2 && !handle) { this.line.visible = this.handle.visible = false; return; }
    const pos: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (-(b.z - a.z) / l) * width / 2, nz = ((b.x - a.x) / l) * width / 2;
      const y = 0.9;
      pos.push(a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz, a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, a.x - nx, y, a.z - nz);
    }
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry();
    this.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    (this.line.material as THREE.MeshBasicMaterial).color.set(color);
    this.line.visible = pts.length > 1;
    this.handle.visible = !!handle;
    if (handle) this.handle.position.set(handle.x, 1.2, handle.z);
  }

  clear() { this.cells.count = 0; this.ring.visible = false; this.line.visible = false; this.handle.visible = false; }
}
