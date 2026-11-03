import { clamp } from './math.js';

/**
 * Push a circular body (anything with x, z, radius) out of blocked grid cells, in place.
 * Pushing along the contact normal makes bodies slide along walls instead of sticking.
 */
export function resolveCircle(grid, body) {
  const r = body.radius;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const ix0 = grid.cellX(body.x - r);
    const ix1 = grid.cellX(body.x + r);
    const iz0 = grid.cellZ(body.z - r);
    const iz1 = grid.cellZ(body.z + r);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        if (!grid.blocked(ix, iz)) continue;
        const minX = ix - grid.width / 2;
        const minZ = iz - grid.depth / 2;
        const maxX = minX + 1;
        const maxZ = minZ + 1;
        const nearX = clamp(body.x, minX, maxX);
        const nearZ = clamp(body.z, minZ, maxZ);
        const dx = body.x - nearX;
        const dz = body.z - nearZ;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          body.x += (dx / d) * (r - d);
          body.z += (dz / d) * (r - d);
        } else {
          // The centre is inside the cell: leave through the nearest face.
          const left = body.x - minX;
          const right = maxX - body.x;
          const top = body.z - minZ;
          const bottom = maxZ - body.z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) body.x = minX - r;
          else if (m === right) body.x = maxX + r;
          else if (m === top) body.z = minZ - r;
          else body.z = maxZ + r;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}
