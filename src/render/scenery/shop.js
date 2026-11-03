import * as THREE from 'three';
import { rectCells } from '../../logic/levelGrid.js';
import { createBlocky } from '../blocky.js';

const COUNTER_H = 0.95;

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 20;
  const g = c.getContext('2d');
  g.fillStyle = '#5b3a1e';
  g.fillRect(0, 0, 64, 20);
  g.fillStyle = '#7a4f28';
  g.fillRect(2, 2, 60, 16);
  g.fillStyle = '#ffd23a';
  g.font = 'bold 14px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('SHOP', 32, 11);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/** The counter, shelves, sign and the (invulnerable, never-moving) shopkeeper in a wizard hat. All cosmetic: the sim only knows the desk cells. */
export class ShopView {
  constructor(parent, materials, grid, shop, buildings) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.geometries = [];
    this.owned = [];
    const keep = (g) => (this.geometries.push(g), g);
    const lam = (color, emissive) => {
      const m = new THREE.MeshLambertMaterial({ color });
      if (emissive) {
        m.emissive.set(emissive);
        m.emissiveIntensity = 0.7;
      }
      this.owned.push(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z, parentObj = this.group) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parentObj.add(m);
      return m;
    };

    // Counter: a plank body per cell and a slightly wider top.
    const desk = shop.desk;
    for (const [ix, iz] of rectCells(desk)) box(1, COUNTER_H, 0.9, materials.planks, grid.centerX(ix), COUNTER_H / 2, grid.centerZ(iz));
    const cx = grid.centerX(desk.ix) + (desk.w - 1) / 2;
    const cz = grid.centerZ(desk.iz) + (desk.d - 1) / 2;
    box(desk.w + 0.2, 0.12, desk.d + 0.2, materials.door, cx, COUNTER_H + 0.06, cz);

    // Goods on the counter: little glowing bottles and a gem.
    const goods = [[-1.2, '#ff5a9a', '#ff2a7a'], [-0.4, '#5ad2ff', '#2aa0ff'], [0.5, '#9aff7a', '#4ad02a'], [1.3, '#ffd23a', '#c89000']];
    goods.slice(0, Math.min(4, desk.w)).forEach(([dx, color, glow], i) => {
      box(0.18, 0.3, 0.18, lam(color, glow), cx + dx * (desk.w / 4.5), COUNTER_H + 0.27, cz + (i % 2 ? 0.12 : -0.12));
    });

    // The sign stands on the counter, facing the customer (south).
    const signMat = new THREE.MeshLambertMaterial({ map: signTexture() });
    this.owned.push(signMat);
    box(1.4, 0.44, 0.06, signMat, cx, COUNTER_H + 0.62, cz + 0.28);
    box(0.06, 0.4, 0.06, materials.planks, cx - 0.6, COUNTER_H + 0.32, cz + 0.28);
    box(0.06, 0.4, 0.06, materials.planks, cx + 0.6, COUNTER_H + 0.32, cz + 0.28);

    // Shelves along the north wall of the shop, stocked with colored goods.
    const b = buildings.find((bb) => bb.door && shop.keeper.ix >= bb.ix && shop.keeper.ix < bb.ix + bb.w);
    if (b) {
      const row = b.iz + 1;
      for (let ix = b.ix + 1; ix < b.ix + b.w - 1; ix++) {
        const sx = grid.centerX(ix);
        const sz = grid.centerZ(row) - 0.28;
        box(1, 1.7, 0.4, materials.planks, sx, 0.85, sz);
        for (const y of [0.55, 1.15]) {
          const colors = ['#ff5a9a', '#5ad2ff', '#9aff7a', '#ffd23a', '#c58aff'];
          box(0.18, 0.22, 0.18, lam(colors[(ix + Math.round(y * 3)) % colors.length], '#222244'), sx - 0.22, y + 0.12, sz + 0.2);
          box(0.18, 0.22, 0.18, lam(colors[(ix * 2 + Math.round(y * 5)) % colors.length], '#222244'), sx + 0.2, y + 0.12, sz + 0.2);
        }
      }
    }

    // The shopkeeper.
    this.keeper = createBlocky({ skin: '#e8c39a', shirt: '#5b3aa8', pants: '#3a2a6a', hair: '#eeeef5' });
    this.owned.push(...this.keeper.materials);
    const kx = grid.centerX(shop.keeper.ix) + (shop.keeper.dx ?? 0);
    const kz = grid.centerZ(shop.keeper.iz);
    this.keeper.root.position.set(kx, 0.05, kz);
    this.keeper.root.rotation.y = 0; // faces +z, toward the customer
    const hatMat = lam('#5b3aa8');
    const gold = lam('#ffd23a', '#c89000');
    box(0.8, 0.08, 0.8, hatMat, 0, 2.0, 0, this.keeper.root);
    box(0.52, 0.28, 0.52, hatMat, 0, 2.18, 0, this.keeper.root);
    box(0.36, 0.28, 0.36, hatMat, 0.03, 2.44, 0, this.keeper.root);
    box(0.2, 0.26, 0.2, hatMat, 0.08, 2.68, 0, this.keeper.root);
    box(0.12, 0.12, 0.12, gold, 0.08, 2.86, 0, this.keeper.root);
    this.group.add(this.keeper.root);
    this.kx = kx;
  }

  update(time, near) {
    const { armR, armL, root } = this.keeper;
    root.position.y = 0.05 + Math.sin(time * 2) * 0.015; // breathing
    armR.rotation.x = near ? -2.5 + Math.sin(time * 9) * 0.35 : -0.15 + Math.sin(time * 1.4) * 0.05; // waves at a customer
    armL.rotation.x = Math.sin(time * 1.4 + 1) * 0.05;
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.keeper.root.traverse((o) => o.isMesh && o.geometry.dispose()); // the blocky model's own boxes
    for (const m of this.owned) {
      m.map?.dispose();
      m.dispose();
    }
    this.group.removeFromParent();
  }
}
