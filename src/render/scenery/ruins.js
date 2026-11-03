import * as THREE from 'three';
import { ruinPieces } from '../../logic/levelGrid.js';
import { cellRng, windStrength } from '../../logic/terrain.js';

const VINE_SWAY = 0.09; // radians per unit of wind: vines move more than trees

/** Broken stone temples with vines creeping over them. Built from `scenery.ruins`; vines sway in the biome's wind. */
export class Ruins {
  constructor(parent, materials, grid, ruins, { gain = 1, seed = 1 } = {}) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.gain = gain;
    this.vines = [];
    this.geometries = [];
    const keep = (g) => (this.geometries.push(g), g);
    const mesh = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    const stone = [materials.rock('granite'), materials.rock('slate'), materials.rock('mossy')];
    const leaf = materials.leaves('vine');

    for (const ruin of ruins) {
      for (const p of ruinPieces(ruin)) {
        const rnd = cellRng(p.ix, p.iz, seed + 77);
        const x = grid.centerX(p.ix);
        const z = grid.centerZ(p.iz);
        const y0 = grid.heightAtCell(p.ix, p.iz);
        const piece = new THREE.Group();
        piece.position.set(x, y0, z);
        piece.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2);
        const mat = stone[Math.floor(rnd() * stone.length)];
        if (p.kind === 'rubble') {
          for (let i = 0; i < 4; i++) {
            const s = 0.22 + rnd() * 0.2;
            const b = mesh(s, s * 0.8, s, stone[Math.floor(rnd() * 3)], (rnd() - 0.5) * 0.7, s * 0.4, (rnd() - 0.5) * 0.7);
            b.rotation.y = rnd() * 1.5;
            piece.add(b);
          }
          if (rnd() < 0.7) piece.add(mesh(0.5, 0.06, 0.4, leaf, (rnd() - 0.5) * 0.3, 0.3, (rnd() - 0.5) * 0.3));
        } else if (p.kind === 'pillar') {
          piece.add(mesh(0.9, p.h, 0.9, mat, 0, p.h / 2, 0));
          piece.add(mesh(1.0, 0.18, 1.0, materials.rock('granite'), 0, 0.09, 0)); // base block
          if (rnd() < 0.5) piece.add(mesh(0.6, 0.35, 0.6, mat, 0.08, p.h + 0.17, -0.05)); // a broken capital
        } else {
          piece.add(mesh(1, p.h, 0.7, mat, 0, p.h / 2, 0));
          if (rnd() < 0.6) piece.add(mesh(0.5, 0.4, 0.7, mat, (rnd() - 0.5) * 0.4, p.h + 0.2, 0)); // jagged top
        }
        if (p.kind !== 'rubble') {
          piece.add(mesh(1.02, 0.1, p.kind === 'wall' ? 0.74 : 1.02, leaf, 0, p.h + 0.02, 0)); // moss cap
          // Hanging vines: thin strips pinned at the top and swinging from there.
          const n = 2 + Math.floor(rnd() * 3);
          for (let i = 0; i < n; i++) {
            const len = Math.min(p.h - 0.1, 0.5 + rnd() * 0.9);
            const pivot = new THREE.Group();
            const face = Math.floor(rnd() * 4);
            const off = p.kind === 'wall' ? (face % 2 === 0 ? 0.52 : 0.37) : 0.47;
            const along = (rnd() - 0.5) * 0.7;
            pivot.position.set(face % 2 === 0 ? (face === 0 ? off : -off) : along, p.h, face % 2 === 1 ? (face === 1 ? off : -off) : along);
            pivot.add(mesh(0.14, len, 0.05, leaf, 0, -len / 2, 0));
            if (rnd() < 0.6) pivot.add(mesh(0.26, 0.12, 0.08, leaf, 0.04, -len * 0.55, 0));
            piece.add(pivot);
            this.vines.push({ pivot, phase: rnd() * Math.PI * 2, amp: 0.6 + rnd() * 0.8 });
          }
          if (p.kind === 'pillar' || rnd() < 0.5) { // a creeper climbing the lower part
            piece.add(mesh(0.4, p.h * 0.55, 0.06, leaf, (rnd() - 0.5) * 0.3, p.h * 0.3, p.kind === 'wall' ? 0.36 : 0.47));
          }
        }
        this.group.add(piece);
      }
    }
  }

  update(time) {
    const wind = windStrength(time, this.gain);
    for (const v of this.vines) {
      v.pivot.rotation.z = Math.sin(time * 1.9 + v.phase) * VINE_SWAY * v.amp * (0.4 + wind);
      v.pivot.rotation.x = Math.sin(time * 1.4 + v.phase * 1.3) * VINE_SWAY * 0.6 * v.amp * (0.4 + wind);
    }
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.group.removeFromParent();
  }
}
