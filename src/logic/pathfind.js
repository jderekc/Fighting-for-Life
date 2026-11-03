const SQRT2 = Math.SQRT2;

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * Binary min-heap of [priority, cell index]. The priority is copied in at push time: A* lowers a cell's score in
 * place when it finds a better route and pushes it again, and the stale entry must keep the key it was placed with
 * (reading a shared, mutable score array would silently break the heap order).
 */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(priority, item) {
    const a = this.items;
    a.push([priority, item]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  /** Removes and returns the item with the smallest priority. */
  pop() {
    const a = this.items;
    const top = a[0][1];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* over the grid (8 directions, no corner cutting). Doors count as passable because
 * they open when someone walks up. Returns waypoints [{x, z}, ...] from the cell after the
 * start up to the goal (the last waypoint is the exact goal position), or null if unreachable.
 * The open list is a binary heap with lazy deletion, so even a 128x128 arena (16k cells) plans in a few milliseconds.
 */
export function findPath(grid, sx, sz, gx, gz) {
  const start = { ix: grid.cellX(sx), iz: grid.cellZ(sz) };
  const goal = { ix: grid.cellX(gx), iz: grid.cellZ(gz) };
  if (grid.blockedForPlanning(start.ix, start.iz) || grid.blockedForPlanning(goal.ix, goal.iz)) return null;

  const total = grid.width * grid.depth;
  const gScore = new Float32Array(total).fill(Infinity);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const startIdx = grid.index(start.ix, start.iz);
  const goalIdx = grid.index(goal.ix, goal.iz);
  const h = (ix, iz) => {
    const dx = Math.abs(ix - goal.ix);
    const dz = Math.abs(iz - goal.iz);
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz); // octile distance
  };

  gScore[startIdx] = 0;
  const open = new MinHeap();
  open.push(h(start.ix, start.iz), startIdx);

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue; // stale duplicate left by lazy deletion
    if (current === goalIdx) break;
    closed[current] = 1;

    const cx = current % grid.width;
    const cz = (current - cx) / grid.width;
    for (const [dx, dz, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (grid.blockedForPlanning(nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (grid.blockedForPlanning(cx + dx, cz) || grid.blockedForPlanning(cx, cz + dz))) continue;
      const n = grid.index(nx, nz);
      if (closed[n]) continue;
      const tentative = gScore[current] + cost;
      if (tentative >= gScore[n]) continue;
      gScore[n] = tentative;
      parent[n] = current;
      open.push(tentative + h(nx, nz), n);
    }
  }

  if (goalIdx !== startIdx && parent[goalIdx] === -1) return null;

  const cells = [];
  for (let i = goalIdx; i !== startIdx; i = parent[i]) cells.push(i);
  cells.reverse();
  const path = cells.map((i) => {
    const ix = i % grid.width;
    return { x: grid.centerX(ix), z: grid.centerZ((i - ix) / grid.width) };
  });
  if (path.length > 0) path[path.length - 1] = { x: gx, z: gz };
  return path;
}

/** Every cell you can walk to from (ix, iz) moving in the four straight directions. Returns a Set of "ix,iz". */
export function floodReachable(grid, ix, iz) {
  const seen = new Set();
  if (grid.blockedForPlanning(ix, iz)) return seen;
  const stack = [[ix, iz]];
  seen.add(`${ix},${iz}`);
  while (stack.length > 0) {
    const [x, z] = stack.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      const key = `${nx},${nz}`;
      if (seen.has(key) || grid.blockedForPlanning(nx, nz)) continue;
      seen.add(key);
      stack.push([nx, nz]);
    }
  }
  return seen;
}
