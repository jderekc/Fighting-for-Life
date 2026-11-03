// The level as a grid of 1x1 cells (1 cell = 1 block). It answers "can I stand here?" and
// "can I see/attack through here?". Cell (ix, iz) covers world x in [ix - width/2, ix - width/2 + 1).

export const MOVE = 1; // blocks walking (water, trees, rocks, walls)
export const SIGHT = 2; // blocks attacks and line of sight (walls, trees, rocks; NOT water)

export class Grid {
  constructor(width, depth) {
    this.width = width;
    this.depth = depth;
    this.flags = new Uint8Array(width * depth);
    this.heights = new Float32Array(width * depth); // ground height of each cell (0 = meadow level)
    this.doors = new Map(); // cell index -> { ix, iz, open }
  }

  index(ix, iz) {
    return iz * this.width + ix;
  }

  inBounds(ix, iz) {
    return ix >= 0 && iz >= 0 && ix < this.width && iz < this.depth;
  }

  cellX(x) {
    return Math.floor(x + this.width / 2);
  }

  cellZ(z) {
    return Math.floor(z + this.depth / 2);
  }

  centerX(ix) {
    return ix - this.width / 2 + 0.5;
  }

  centerZ(iz) {
    return iz - this.depth / 2 + 0.5;
  }

  setHeight(ix, iz, h) {
    if (this.inBounds(ix, iz)) this.heights[this.index(ix, iz)] = h;
  }

  heightAtCell(ix, iz) {
    return this.inBounds(ix, iz) ? this.heights[this.index(ix, iz)] : 0;
  }

  /** Ground height under a world position (stepped: it changes at cell edges). */
  heightAt(x, z) {
    return this.heightAtCell(this.cellX(x), this.cellZ(z));
  }

  /**
   * The highest ground within `r` of a point (center and four sides). Characters stand on this, so a body
   * touching a higher step is lifted onto it instead of sinking into it.
   */
  maxHeightNear(x, z, r) {
    return Math.max(this.heightAt(x, z), this.heightAt(x + r, z), this.heightAt(x - r, z), this.heightAt(x, z + r), this.heightAt(x, z - r));
  }

  /** Add flags to a cell (OR). */
  block(ix, iz, flags = MOVE | SIGHT) {
    if (this.inBounds(ix, iz)) this.flags[this.index(ix, iz)] |= flags;
  }

  /** The raw flags of a cell (0 when out of bounds); with setFlags() lets something block a cell for a while and give it back. */
  flagsOf(ix, iz) {
    return this.inBounds(ix, iz) ? this.flags[this.index(ix, iz)] : 0;
  }

  setFlags(ix, iz, flags) {
    if (this.inBounds(ix, iz)) this.flags[this.index(ix, iz)] = flags;
  }

  /** Remove all flags from a cell (used for bridges over water). */
  clear(ix, iz) {
    if (this.inBounds(ix, iz)) this.flags[this.index(ix, iz)] = 0;
  }

  addDoor(ix, iz) {
    if (!this.inBounds(ix, iz)) return; // validateLevel reports it; never write into a neighbouring row
    this.doors.set(this.index(ix, iz), { ix, iz, open: false });
  }

  setDoorOpen(ix, iz, open) {
    const door = this.doors.get(this.index(ix, iz));
    if (door) door.open = open;
  }

  isDoor(ix, iz) {
    return this.doors.has(this.index(ix, iz));
  }

  /** Is the cell blocked for the given flag? Out of bounds counts as blocked. A closed door blocks both. */
  blocked(ix, iz, flag = MOVE) {
    if (!this.inBounds(ix, iz)) return true;
    const i = this.index(ix, iz);
    if (this.flags[i] & flag) return true;
    const door = this.doors.get(i);
    return door ? !door.open : false;
  }

  /** Like blocked(MOVE) but doors count as passable: used for planning, since doors open on approach. */
  blockedForPlanning(ix, iz) {
    if (!this.inBounds(ix, iz)) return true;
    return (this.flags[this.index(ix, iz)] & MOVE) !== 0;
  }

  blockedAt(x, z, flag = MOVE) {
    return this.blocked(this.cellX(x), this.cellZ(z), flag);
  }

  /**
   * Is the straight segment free? `r` is the body radius (checked on four sides of each sample).
   * mode MOVE = can walk it, SIGHT = can attack/see along it.
   */
  lineClear(ax, az, bx, bz, r = 0, flag = MOVE, spacing = 0.25) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (this.blockedAt(x, z, flag)) return false;
      if (r > 0 && (
        this.blockedAt(x + r, z, flag) || this.blockedAt(x - r, z, flag) ||
        this.blockedAt(x, z + r, flag) || this.blockedAt(x, z - r, flag)
      )) return false;
    }
    return true;
  }
}
