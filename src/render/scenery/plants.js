import * as THREE from 'three';
import { TREE_SPECIES } from '../../data/biomes.js';
import { cellRng, rockLook, treeSpecies, windStrength } from '../../logic/terrain.js';

const mark = (group) => {
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
};

const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};

// ---- Trees: each builder fills a "sway" group (which tilts in the wind) and returns the crown height. ----
// A tree always fits inside its one cell (1x1), since the cell is solid.

const TREE_BUILDERS = {
  oak(g, m, rnd) {
    const leaves = m.leaves('oak');
    g.add(box(0.4, 1.6, 0.4, m.bark('oak'), 0, 0.8, 0));
    g.add(box(1.7, 1.0, 1.7, leaves, 0, 1.95, 0), box(1.1, 0.85, 1.1, leaves, 0, 2.85, 0));
    return 2.5 + rnd() * 0.3;
  },
  birch(g, m, rnd) {
    const leaves = m.leaves('birch');
    const bark = m.bark('birch');
    g.add(box(0.28, 2.3, 0.28, bark, 0, 1.15, 0));
    g.add(box(1.3, 0.8, 1.3, leaves, 0, 2.2, 0), box(1.0, 0.75, 1.0, leaves, 0.1, 2.9, -0.05), box(0.6, 0.6, 0.6, leaves, -0.05, 3.45, 0.05));
    return 2.9 + rnd() * 0.3;
  },
  pine(g, m, rnd) {
    const leaves = m.leaves('pine');
    g.add(box(0.36, 1.1, 0.36, m.bark('pine'), 0, 0.55, 0));
    // Stacked, shrinking tiers make a blocky cone.
    const tiers = [1.8, 1.45, 1.1, 0.75, 0.4];
    tiers.forEach((w, i) => g.add(box(w, 0.55, w, leaves, 0, 1.25 + i * 0.5, 0)));
    return 2.2 + rnd() * 0.3;
  },
  palm(g, m, rnd) {
    // A leaning trunk of stacked blocks topped with a fan of fronds.
    const bark = m.bark('palm');
    const leaves = m.leaves('palm');
    const lean = (rnd() - 0.5) * 0.18;
    for (let i = 0; i < 5; i++) g.add(box(0.3 - i * 0.015, 0.55, 0.3 - i * 0.015, bark, lean * i * 0.5, 0.28 + i * 0.52, 0));
    const topX = lean * 2;
    const topY = 2.75;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rnd() * 0.4;
      const frond = box(1.25, 0.1, 0.34, leaves, topX + Math.cos(a) * 0.55, topY, Math.sin(a) * 0.55);
      frond.rotation.y = -a;
      frond.rotation.z = -0.35; // droops outward
      g.add(frond);
    }
    g.add(box(0.5, 0.2, 0.5, leaves, topX, topY + 0.12, 0));
    return 2.8 + rnd() * 0.2;
  },
  dead(g, m, rnd) {
    // A bare, wind-bitten trunk with a few stubby branches.
    const bark = m.bark('dead');
    g.add(box(0.34, 2.4, 0.34, bark, 0, 1.2, 0));
    const arm = (w, y, x, z, tilt) => {
      const b = box(w, 0.16, 0.16, bark, x, y, z);
      b.rotation.z = tilt;
      b.rotation.y = rnd() * Math.PI;
      g.add(b);
    };
    arm(0.9, 1.7, 0.35, 0, 0.5);
    arm(0.7, 2.1, -0.3, 0.1, -0.6);
    arm(0.5, 2.5, 0.15, -0.2, 0.4);
    return 2.4 + rnd() * 0.2;
  },
  maple(g, m, rnd) {
    const leaves = m.leaves('maple');
    g.add(box(0.46, 1.4, 0.46, m.bark('maple'), 0, 0.7, 0));
    g.add(box(1.8, 0.95, 1.8, leaves, 0, 1.75, 0), box(1.4, 0.8, 1.4, leaves, 0, 2.65, 0), box(0.8, 0.5, 0.8, leaves, 0.1, 3.2, 0.05));
    return 2.4 + rnd() * 0.3;
  },
};
export const TREE_BUILDER_IDS = Object.freeze(Object.keys(TREE_BUILDERS));

/** @returns {{ root: THREE.Group, sway: THREE.Group, crownY: number }} */
export function createTree(materials, species, rnd) {
  const build = TREE_BUILDERS[species];
  if (!build) throw new Error(`Unknown tree species: ${species}`);
  const root = new THREE.Group(); // turns on the spot
  const sway = new THREE.Group(); // tilts about the base
  root.add(sway);
  const crownY = build(sway, materials, rnd);
  const s = 0.9 + rnd() * 0.3;
  root.scale.set(1, s, 1);
  root.rotation.y = Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.3;
  mark(root);
  return { root, sway, crownY: crownY * s };
}

// ---- Rocks: texture and shape come from the biome, so a field of rocks isn't a field of the same rock. ----

const ROCK_BUILDERS = {
  boulder(g, mat, rnd) {
    const big = 0.55 + rnd() * 0.15;
    const a = box(big + 0.3, big, big + 0.2, mat, 0, big / 2, 0);
    a.rotation.y = rnd() * 1.2;
    const b = box(0.5, 0.4, 0.45, mat, 0.28, 0.2, 0.22);
    b.rotation.y = rnd() * 1.2;
    g.add(a, b);
    if (rnd() > 0.4) g.add(box(0.3, 0.3, 0.3, mat, -0.3, 0.15, -0.25));
  },
  slab(g, mat, rnd) {
    const a = box(1.1, 0.3, 0.8, mat, 0, 0.15, 0);
    a.rotation.y = rnd() * 0.6 - 0.3;
    const b = box(0.65, 0.26, 0.5, mat, 0.1, 0.43, -0.05);
    b.rotation.y = rnd() * 0.8;
    g.add(a, b);
  },
  spire(g, mat, rnd) {
    const a = box(0.62, 0.55, 0.62, mat, 0, 0.275, 0);
    const b = box(0.44, 0.55, 0.44, mat, 0.03, 0.82, 0.02);
    const c = box(0.26, 0.5, 0.26, mat, 0.0, 1.35, 0.03);
    a.rotation.y = rnd();
    b.rotation.y = rnd();
    g.add(a, b, c);
  },
  pile(g, mat, rnd) {
    const n = 4 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const size = 0.26 + rnd() * 0.22;
      const angle = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const r = i === 0 ? 0 : 0.28 + rnd() * 0.12;
      const m = box(size, size * (0.7 + rnd() * 0.4), size, mat, Math.cos(angle) * r, size * 0.35, Math.sin(angle) * r);
      m.rotation.y = rnd() * 1.5;
      g.add(m);
    }
  },
};
export const ROCK_BUILDER_IDS = Object.freeze(Object.keys(ROCK_BUILDERS));

export function createRock(materials, look, rnd) {
  const build = ROCK_BUILDERS[look.shape];
  if (!build) throw new Error(`Unknown rock shape: ${look.shape}`);
  const g = new THREE.Group();
  build(g, materials.rock(look.texture), rnd);
  g.rotation.y = rnd() * Math.PI;
  return mark(g);
}

export function createFlower(materials, color) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), materials.stem);
  stem.position.y = 0.17;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), materials.petal(color));
  head.position.y = 0.36;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.09), materials.flowerCenter);
  core.position.y = 0.38;
  g.add(stem, head, core);
  return g;
}

// ---- Wind: flowers lean the most, trees only a little, and only in gusts. ----
const FLOWER_SWAY = { calm: 0.05, gust: 0.1 }; // radians
const TREE_SWAY = { calm: 0.006, gust: 0.026 };

/** Trees, rocks and flowers placed from level data. */
export class Plants {
  constructor(parent, materials, grid, scenery, flowers, { biome, seed = 7 }) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.trees = [];
    this.wind = biome.wind ?? { gain: 1, treeSway: 1 };

    for (const [ix, iz] of scenery.trees) {
      const species = treeSpecies(biome, ix, iz, seed);
      const rnd = cellRng(ix, iz, seed);
      const tree = createTree(materials, species, rnd);
      const y = grid.heightAtCell(ix, iz);
      tree.root.position.set(grid.centerX(ix), y, grid.centerZ(iz));
      this.group.add(tree.root);
      this.trees.push({ ...tree, species, x: tree.root.position.x, z: tree.root.position.z, y, phase: rnd() * Math.PI * 2 });
    }
    for (const [ix, iz] of scenery.rocks) {
      const rock = createRock(materials, rockLook(biome, ix, iz, seed), cellRng(ix, iz, seed + 9));
      rock.position.set(grid.centerX(ix), grid.heightAtCell(ix, iz), grid.centerZ(iz));
      this.group.add(rock);
    }
    this.flowers = flowers.map((f) => {
      const mesh = createFlower(materials, f.color);
      mesh.position.set(f.x, grid.heightAt(f.x, f.z), f.z);
      this.group.add(mesh);
      return { mesh, phase: f.phase };
    });
  }

  update(time) {
    const wind = windStrength(time, this.wind.gain);
    const flowerAmp = FLOWER_SWAY.calm + FLOWER_SWAY.gust * wind;
    for (const f of this.flowers) f.mesh.rotation.z = Math.sin(time * 2 + f.phase) * flowerAmp;
    const treeAmp = TREE_SWAY.calm + TREE_SWAY.gust * wind;
    for (const t of this.trees) {
      const k = TREE_SPECIES[t.species].sway * this.wind.treeSway;
      t.sway.rotation.z = Math.sin(time * 1.1 + t.phase) * treeAmp * k;
      t.sway.rotation.x = Math.sin(time * 0.8 + t.phase * 1.7) * treeAmp * k * 0.6;
    }
  }

  dispose() {
    this.group.traverse((o) => o.isMesh && o.geometry.dispose());
    this.group.removeFromParent();
  }
}

// ---- Falling leaves: a few at a time drift down from tree crowns, more in a gust. ----

const MAX_LEAVES = 28;

export class FallingLeaves {
  constructor(parent, grid, trees, seed = 3, gain = 1) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.grid = grid;
    this.trees = trees;
    this.gain = gain;
    this.rnd = cellRng(seed, 99, 5);
    this.geometry = new THREE.BoxGeometry(0.16, 0.03, 0.12);
    this.materials = new Map();
    for (const [id, s] of Object.entries(TREE_SPECIES)) {
      this.materials.set(id, new THREE.MeshLambertMaterial({ color: s.leaf }));
    }
    this.leaves = [];
    this.spawnTimer = 1;
  }

  update(dt, time) {
    const wind = windStrength(time, this.gain);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.trees.length > 0 && this.leaves.length < MAX_LEAVES) {
      const tree = this.trees[Math.floor(this.rnd() * this.trees.length)];
      // Species decide how willing they are to drop leaves; the roll keeps pines rare.
      if (this.rnd() < Math.min(1, TREE_SPECIES[tree.species].drop)) this.spawn(tree);
      this.spawnTimer = (0.9 + this.rnd() * 1.2) / (0.5 + wind * 1.5);
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i];
      l.age += dt;
      l.mesh.position.x += (wind * 0.9 + 0.1 + Math.sin(l.age * 2 + l.phase) * 0.35) * dt;
      l.mesh.position.z += Math.cos(l.age * 1.7 + l.phase) * 0.25 * dt;
      l.mesh.position.y -= l.fall * dt;
      l.mesh.rotation.x += l.spin * dt;
      l.mesh.rotation.z += l.spin * 0.6 * dt;
      const floor = this.grid.heightAt(l.mesh.position.x, l.mesh.position.z) + 0.03;
      if (l.mesh.position.y <= floor) {
        this.group.remove(l.mesh);
        this.leaves.splice(i, 1);
      }
    }
  }

  spawn(tree) {
    const mesh = new THREE.Mesh(this.geometry, this.materials.get(tree.species));
    mesh.position.set(tree.x + (this.rnd() - 0.5) * 1.2, tree.y + tree.crownY, tree.z + (this.rnd() - 0.5) * 1.2);
    this.group.add(mesh);
    this.leaves.push({ mesh, age: 0, phase: this.rnd() * 6.28, fall: 0.45 + this.rnd() * 0.35, spin: (this.rnd() - 0.5) * 5 });
  }

  dispose() {
    this.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.group.removeFromParent();
  }
}
