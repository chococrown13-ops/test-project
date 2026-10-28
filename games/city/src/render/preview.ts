import * as THREE from 'three';
import { CELL, N } from '../sim/defs';

/** Translucent cell highlights for the active tool, plus a coverage ring. */
export class PreviewLayer {
  readonly group = new THREE.Group();
  private cells: THREE.InstancedMesh;
  private ring: THREE.Mesh;

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
    this.group.add(this.cells, this.ring);
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

  clear() { this.cells.count = 0; this.ring.visible = false; }
}
