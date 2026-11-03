import * as THREE from 'three';
import { rectCells } from '../../logic/levelGrid.js';

const WATER_TOP = -0.25; // a little below the grass, so the banks read as a step down
const BRIDGE_TOP = 0.05;

/** Stream cells as a single InstancedMesh with a gently scrolling texture. */
export class Water {
  constructor(parent, materials, grid, streams) {
    this.materials = materials;
    this.group = new THREE.Group();
    parent.add(this.group);
    const cells = streams.flatMap(rectCells);
    this.geometry = new THREE.BoxGeometry(1, 1 + WATER_TOP, 1); // from y=-1 up to WATER_TOP
    this.mesh = new THREE.InstancedMesh(this.geometry, materials.water, Math.max(1, cells.length));
    this.mesh.count = cells.length;
    cells.forEach(([ix, iz], i) => {
      this.mesh.setMatrixAt(i, new THREE.Matrix4().setPosition(grid.centerX(ix), (WATER_TOP - 1) / 2, grid.centerZ(iz)));
    });
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }

  update(time) {
    this.materials.waterMap.offset.set((time * 0.12) % 1, (time * 0.03) % 1);
  }

  dispose() {
    this.geometry.dispose();
    this.mesh.dispose();
    this.group.removeFromParent();
  }
}

/** A plank bridge over water, with posts and rails along its two long sides. */
export class Bridges {
  constructor(parent, materials, grid, bridges) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.geometries = [];
    const keep = (g) => (this.geometries.push(g), g);
    const plank = keep(new THREE.BoxGeometry(1, 0.12, 1));
    const post = keep(new THREE.BoxGeometry(0.14, 0.8, 0.14));
    const railBox = (w, d) => keep(new THREE.BoxGeometry(w, 0.09, d));

    for (const b of bridges) {
      const cx0 = grid.centerX(b.ix) - 0.5; // west edge of the bridge in world x
      const cz0 = grid.centerZ(b.iz) - 0.5; // north edge
      for (let dz = 0; dz < b.d; dz++) {
        for (let dx = 0; dx < b.w; dx++) {
          const deck = new THREE.Mesh(plank, materials.deck);
          deck.position.set(cx0 + dx + 0.5, BRIDGE_TOP - 0.06, cz0 + dz + 0.5);
          deck.receiveShadow = true;
          deck.castShadow = true;
          this.group.add(deck);
        }
      }
      // Rails run along the long axis. With a tie (square bridge) the long axis is north-south,
      // since the streams in this game run east-west.
      const alongZ = b.d >= b.w;
      const length = alongZ ? b.d : b.w;
      const sides = alongZ ? [cx0 + 0.07, cx0 + b.w - 0.07] : [cz0 + 0.07, cz0 + b.d - 0.07];
      for (const side of sides) {
        const rail = new THREE.Mesh(alongZ ? railBox(0.09, length) : railBox(length, 0.09), materials.planks);
        rail.position.set(alongZ ? side : cx0 + length / 2, 0.85, alongZ ? cz0 + length / 2 : side);
        rail.castShadow = true;
        this.group.add(rail);
        for (let i = 0; i <= length; i++) {
          const p = new THREE.Mesh(post, materials.planks);
          const along = i === length ? length - 0.07 : i === 0 ? 0.07 : i;
          p.position.set(alongZ ? side : cx0 + along, 0.4, alongZ ? cz0 + along : side);
          p.castShadow = true;
          this.group.add(p);
        }
      }
    }
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.group.removeFromParent();
  }
}
