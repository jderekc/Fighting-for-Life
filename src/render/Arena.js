import * as THREE from 'three';
import { BIOMES } from '../data/biomes.js';
import { terrainClass } from '../logic/levelGrid.js';
import { groundKind, unit } from '../logic/terrain.js';
import { makeGroundTexture, makeStoneVariantTexture } from './textures.js';

const TURN = Math.PI / 2;

/**
 * The arena floor with a one-block stone wall ring, plus hills.
 * Everything is InstancedMesh, one per (shape, texture), so hundreds of blocks cost a handful of draw calls.
 * Ground variants come from the biome (soft patches of lush/dry/dirt grass, clover speckles); each block is also
 * turned a random quarter-turn so the texture never repeats in a visible grid.
 */
export class Arena {
  /**
   * @param {{width:number, depth:number}} size
   * @param {{holes?:Set<string>, grid?:object, biome?:object, seed?:number}} options
   *   grid: the level Grid, whose height map decides where hills, ledges and stairs are
   *   holes: "ix,iz" cells with no ground block (the stream bed is drawn by the water)
   */
  constructor({ width, depth }, { holes = new Set(), grid = null, biome = BIOMES.meadow, seed = 1 } = {}) {
    this.group = new THREE.Group();
    this.disposables = [];
    const own = (d) => (this.disposables.push(d), d);

    const box = own(new THREE.BoxGeometry(1, 1, 1));
    // A column from the meadow surface (y = 0) up to height h. Side texture repeats once per block of height,
    // so a tall cliff keeps square pixels instead of stretching one texture.
    const columns = new Map();
    const column = (h) => {
      if (!columns.has(h)) {
        const g = own(new THREE.BoxGeometry(1, h, 1));
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          const face = Math.floor(i / 4); // 0,1 = +x,-x, 2,3 = +y,-y (top/bottom), 4,5 = +z,-z
          if (face < 2 || face > 3) uv.setY(i, uv.getY(i) * h);
        }
        columns.set(h, g);
      }
      return columns.get(h);
    };
    const repeat = (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    };

    const groundMats = new Map();
    const groundMat = (kind) => {
      if (!groundMats.has(kind)) {
        const tex = own(repeat(makeGroundTexture(kind)));
        groundMats.set(kind, own(new THREE.MeshLambertMaterial({ map: tex })));
      }
      return groundMats.get(kind);
    };
    const stoneMats = new Map();
    const stoneMat = (kind) => {
      if (!stoneMats.has(kind)) {
        const tex = own(repeat(makeStoneVariantTexture(kind)));
        stoneMats.set(kind, own(new THREE.MeshLambertMaterial({ map: tex })));
      }
      return stoneMats.get(kind);
    };

    // Collect instances into buckets keyed by geometry + material, then make one InstancedMesh per bucket.
    const buckets = new Map();
    const add = (geometry, material, ix, iz, y, shade = 1) => {
      const key = `${geometry.uuid}|${material.uuid}`;
      if (!buckets.has(key)) buckets.set(key, { geometry, material, items: [] });
      buckets.get(key).items.push({ x: ix - width / 2 + 0.5, y, z: iz - depth / 2 + 0.5, turn: Math.floor(unit(ix, iz, seed + 3) * 4), shade });
    };
    const checker = (ix, iz) => ((ix + iz) % 2 === 0 ? 1 : 0.92); // subtle, so the ground reads as individual blocks
    const mossy = (ix, iz) => (unit(ix, iz, seed + 5) < 0.35 ? 'mossy' : 'granite');

    for (let ix = 0; ix < width; ix++) {
      for (let iz = 0; iz < depth; iz++) {
        if (holes.has(`${ix},${iz}`)) continue;
        add(box, groundMat(groundKind(ix, iz, biome.ground, seed)), ix, iz, -0.5, checker(ix, iz));
      }
    }

    // Raised terrain: a column per cell. Ledges (unwalkable cliffs) are mossy stone, stairs are stone, the rest is grass.
    if (grid) {
      for (let ix = 0; ix < width; ix++) {
        for (let iz = 0; iz < depth; iz++) {
          const cls = terrainClass(grid, ix, iz);
          if (cls === 'none') continue;
          const h = grid.heightAtCell(ix, iz);
          if (cls === 'ledge') add(column(h), stoneMat(mossy(ix, iz)), ix, iz, h / 2);
          else if (cls === 'step') add(column(h), stoneMat('granite'), ix, iz, h / 2);
          else add(column(h), groundMat(groundKind(ix, iz, biome.ground, seed)), ix, iz, h / 2, checker(ix, iz));
        }
      }
    }

    // Wall ring, one block high, just outside the playable area.
    for (let ix = -1; ix <= width; ix++) {
      add(box, stoneMat(mossy(ix, -1)), ix, -1, 0.5);
      add(box, stoneMat(mossy(ix, depth)), ix, depth, 0.5);
    }
    for (let iz = 0; iz < depth; iz++) {
      add(box, stoneMat(mossy(-1, iz)), -1, iz, 0.5);
      add(box, stoneMat(mossy(width, iz)), width, iz, 0.5);
    }

    const m = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (const { geometry, material, items } of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach((it, n) => {
        m.makeRotationY(it.turn * TURN).setPosition(it.x, it.y, it.z);
        mesh.setMatrixAt(n, m);
        if (it.shade !== 1) mesh.setColorAt(n, tint.setScalar(it.shade));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.disposables.push(mesh); // InstancedMesh.dispose() frees its instance buffers
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
