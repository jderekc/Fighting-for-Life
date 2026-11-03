import * as THREE from 'three';
import { gateCells } from '../../logic/levelGrid.js';
import { lerp } from '../../logic/math.js';

const PILLAR_H = 3.2;
const DOOR_H = 2.4;
const SLIDE = 0.5; // each door half slides this far into its pillar
const SPEED = 4;

/**
 * The exit: two stone pillars, a lintel with a golden keystone, and a two-part iron door that slides
 * into the pillars. It is locked (gold padlock) until the hero carries the key, then glows and opens.
 * Built facing +z in local space (opening along x); rotated for gates on the west/east edges.
 */
export class Gate {
  constructor(parent, materials, grid, gate) {
    this.materials = materials;
    this.geometries = [];
    const keep = (g) => (this.geometries.push(g), g);
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };

    this.root = new THREE.Group();
    parent.add(this.root);
    const { gate: cell } = gateCells(gate);
    this.root.position.set(grid.centerX(cell[0]), 0, grid.centerZ(cell[1]));
    this.root.rotation.y = gate.side === 'W' || gate.side === 'E' ? Math.PI / 2 : 0;
    this.cell = cell;

    const stone = materials.rock('granite');
    const mossy = materials.rock('mossy');
    box(1, PILLAR_H, 1, stone, -1, PILLAR_H / 2, 0);
    box(1, PILLAR_H, 1, mossy, 1, PILLAR_H / 2, 0);
    box(1.2, 0.3, 1.2, stone, -1, PILLAR_H + 0.15, 0); // caps
    box(1.2, 0.3, 1.2, stone, 1, PILLAR_H + 0.15, 0);
    box(3, PILLAR_H - DOOR_H, 1, stone, 0, DOOR_H + (PILLAR_H - DOOR_H) / 2, 0); // lintel
    this.keystone = box(0.5, 0.5, 1.06, materials.gold, 0, DOOR_H + 0.4, 0);

    this.left = box(0.5, DOOR_H, 0.14, materials.iron, -0.25, DOOR_H / 2, 0);
    this.right = box(0.5, DOOR_H, 0.14, materials.iron, 0.25, DOOR_H / 2, 0);
    for (const y of [0.45, 1.2, 1.95]) { // iron straps
      this.left.add(this.strap(keep, y - DOOR_H / 2, 0.52));
      this.right.add(this.strap(keep, y - DOOR_H / 2, 0.52));
    }
    this.lock = new THREE.Mesh(keep(new THREE.BoxGeometry(0.24, 0.3, 0.1)), materials.gold);
    this.lock.position.set(-0.13, -0.1, 0.1); // on the right panel, at the seam, slightly proud of the door
    this.right.add(this.lock);
    this.lock.visible = gate.unlocked !== true; // an unlocked gate has no padlock

    this.portal = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, DOOR_H)), materials.portal);
    this.portal.position.set(0, DOOR_H / 2, 0);
    this.root.add(this.portal);

    this.open = 0; // 0 closed .. 1 open (eased in update)
  }

  strap(keep, y, w) {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, 0.1, 0.18)), this.materials.rock('slate'));
    m.position.set(0, y, 0);
    return m;
  }

  update(dt, world, time) {
    const gate = world.gate;
    if (!gate) return;
    const target = gate.open ? 1 : 0;
    this.open += Math.sign(target - this.open) * Math.min(Math.abs(target - this.open), SPEED * dt);
    const e = this.open * this.open * (3 - 2 * this.open);
    this.left.position.x = -0.25 - SLIDE * e;
    this.right.position.x = 0.25 + SLIDE * e;
    this.lock.visible = world.gate.locked && e < 0.05;

    // Hint glow: the keystone pulses once the key is in hand; the doorway shimmers while open.
    const ready = world.hasKey || !gate.locked;
    this.materials.gold.emissiveIntensity = ready ? 0.9 + 0.7 * Math.sin(time * 6) : 0.5;
    this.materials.portal.opacity = lerp(this.materials.portal.opacity, e > 0.6 ? 0.28 + 0.12 * Math.sin(time * 5) : 0, Math.min(1, 10 * dt));
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.root.removeFromParent();
  }
}
