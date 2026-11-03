import * as THREE from 'three';
import { buildingCells } from '../../logic/levelGrid.js';
import { lerp } from '../../logic/math.js';

const WALL_HEIGHT = 2.2;
const DOOR_HEIGHT = 1.75;
const FADED = 0.14; // opacity of the roof and front wall while the hero is inside
const FADE_SPEED = 7;
const DOOR_SPEED = 6;

/**
 * Cottages: plank walls, a wood floor, a stepped roof and a door that swings on a hinge.
 * Because the camera looks in from the south at a fixed angle, the roof and the south wall
 * fade out while the hero is inside so the interior stays visible.
 */
export class Buildings {
  constructor(parent, materials, grid, buildings) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.grid = grid;
    this.geometries = [];
    this.houses = [];
    this.doors = new Map(); // "ix,iz" -> { pivot, sign, open }
    const keep = (g) => (this.geometries.push(g), g);
    const wall = keep(new THREE.BoxGeometry(1, WALL_HEIGHT, 1));
    const lintel = keep(new THREE.BoxGeometry(1, WALL_HEIGHT - DOOR_HEIGHT, 1));
    const floorTile = keep(new THREE.BoxGeometry(1, 0.05, 1));

    for (const b of buildings) {
      const { walls, interior, door } = buildingCells(b);
      const southRow = b.iz + b.d - 1;
      const roofMat = materials.roof();
      const frontMat = materials.cutaway(materials.planks);
      const fading = { roofMat, frontMat, roofMeshes: [], frontMeshes: [] };

      const addMesh = (geometry, material, x, y, z, isFront = false) => {
        const m = new THREE.Mesh(geometry, material);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        this.group.add(m);
        if (isFront) fading.frontMeshes.push(m);
        return m;
      };

      for (const [ix, iz] of walls) {
        const front = iz === southRow;
        addMesh(wall, front ? frontMat : materials.planks, grid.centerX(ix), WALL_HEIGHT / 2, grid.centerZ(iz), front);
      }
      for (const [ix, iz] of interior) {
        const tile = addMesh(floorTile, materials.floor, grid.centerX(ix), 0.025, grid.centerZ(iz));
        tile.castShadow = false;
      }

      // Lintel above the doorway, and the door itself.
      const [dx, dz] = door;
      const cx = grid.centerX(dx);
      const cz = grid.centerZ(dz);
      const doorOnFront = dz === southRow;
      addMesh(lintel, doorOnFront ? frontMat : materials.planks, cx, DOOR_HEIGHT + (WALL_HEIGHT - DOOR_HEIGHT) / 2, cz, doorOnFront);
      this.doors.set(`${dx},${dz}`, this.createDoor(materials, keep, b.door.side, cx, cz));

      // Stepped roof: each layer is smaller than the one below.
      const baseW = b.w + 0.9;
      const baseD = b.d + 0.9;
      const midX = grid.centerX(b.ix) + (b.w - 1) / 2;
      const midZ = grid.centerZ(b.iz) + (b.d - 1) / 2;
      for (let layer = 0; ; layer++) {
        const w = baseW - layer * 1.4;
        const d = baseD - layer * 1.4;
        if (w < 0.6 || d < 0.6) break;
        const roofLayer = addMesh(keep(new THREE.BoxGeometry(w, 0.34, d)), roofMat, midX, WALL_HEIGHT + 0.17 + layer * 0.34, midZ);
        fading.roofMeshes.push(roofLayer);
      }

      fading.rect = { ix0: b.ix, ix1: b.ix + b.w - 1, iz0: b.iz, iz1: b.iz + b.d - 1 };
      fading.opacity = 1;
      this.houses.push(fading);
    }
  }

  /** A door panel on a hinge pivot. It swings outward, away from the building. */
  createDoor(materials, keep, side, cx, cz) {
    const alongX = side === 'N' || side === 'S';
    const panel = new THREE.Mesh(
      keep(new THREE.BoxGeometry(alongX ? 0.9 : 0.12, DOOR_HEIGHT, alongX ? 0.12 : 0.9)),
      materials.door,
    );
    panel.castShadow = true;
    const pivot = new THREE.Group();
    if (alongX) {
      pivot.position.set(cx - 0.45, 0, cz); // hinge on the west edge
      panel.position.set(0.45, DOOR_HEIGHT / 2, 0);
    } else {
      pivot.position.set(cx, 0, cz + 0.45); // hinge on the south edge
      panel.position.set(0, DOOR_HEIGHT / 2, -0.45);
    }
    pivot.add(panel);
    this.group.add(pivot);
    // Rotation sign that swings each door outward (derived from the pivot geometry above).
    const sign = { S: -1, N: 1, W: 1, E: -1 }[side];
    return { pivot, sign, open: 0 };
  }

  update(dt, world) {
    // Doors follow the sim's open/closed state with a quick swing.
    for (const d of world.doors) {
      const view = this.doors.get(`${d.ix},${d.iz}`);
      if (!view) continue;
      const target = d.open ? 1 : 0;
      view.open += Math.sign(target - view.open) * Math.min(Math.abs(target - view.open), DOOR_SPEED * dt);
      const eased = view.open * view.open * (3 - 2 * view.open);
      view.pivot.rotation.y = view.sign * eased * (Math.PI / 2) * 0.95;
    }

    // Roof and front wall fade while the hero is inside.
    const cx = this.grid.cellX(world.hero.x);
    const cz = this.grid.cellZ(world.hero.z);
    for (const h of this.houses) {
      const inside = cx >= h.rect.ix0 && cx <= h.rect.ix1 && cz >= h.rect.iz0 && cz <= h.rect.iz1;
      h.opacity = lerp(h.opacity, inside ? FADED : 1, Math.min(1, FADE_SPEED * dt));
      h.roofMat.opacity = h.opacity;
      h.frontMat.opacity = h.opacity;
      const solid = h.opacity > 0.95;
      h.roofMat.depthWrite = solid;
      h.frontMat.depthWrite = solid;
      for (const m of h.roofMeshes) m.castShadow = solid;
      for (const m of h.frontMeshes) m.castShadow = solid;
    }
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.group.removeFromParent();
  }
}
