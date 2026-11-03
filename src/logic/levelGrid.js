import { Grid, MOVE, SIGHT } from './grid.js';
import { mulberry32 } from './rng.js';
import { unit } from './terrain.js';

// Turns a level's `scenery` data into a Grid, and answers geometry questions about it.
// Scenery shapes are in CELL coordinates (ix, iz), 0,0 = north-west corner of the arena:
//   streams / bridges: { ix, iz, w, d }                    rectangles of cells
//   buildings:         { ix, iz, w, d, door: { side, index } }   side N|S|E|W, index = cell along that wall
//   trees / rocks:     [[ix, iz], ...]
//   terrain:           [{ ix, iz, w, d, h }, ...]  height rectangles painted in order (later ones win), h in multiples of
//                      STEP_HEIGHT (0.75). Any cell with a neighbor lower by LEDGE_DROP (1.5) or more becomes a stone ledge
//                      you cannot walk onto; smaller drops (stairs, low mounds) are walkable. So a 0.75 strip beside a
//                      1.5 plateau is a stair, and 1.5 -> 2.25 -> 3.0 strips make a staircase to a tier.
//   ponds:             [{ ix, iz, w, d }]                  like streams: open water that blocks walking but not attacks
//   ruins:             [{ ix, iz, w, d, seed }]            a broken stone temple: see ruinPieces(). Walls and pillars are solid.
//   shop:              { desk: {ix, iz, w, d}, keeper: {ix, iz, dx?} }   a counter (blocks walking, not attacks) with the shopkeeper
//                      standing behind it; both go inside a building. Walking up to the desk opens the shop.
//   gate:              { ix, iz, side }                    the exit: a locked gate cell on the arena edge (side N|S|W|E) with a
//                      stone pillar on each side of it. It opens for a hero carrying the key (or for anyone when `unlocked: true`).
//   flowers:           { count, seed }                     decoration only, scattered on free cells

export const NO_SCENERY = Object.freeze({
  streams: [], ponds: [], bridges: [], ruins: [], buildings: [], terrain: [], trees: [], rocks: [], gate: null, shop: null, flowers: { count: 0, seed: 1 },
});

/** Every rectangle of open water: streams and ponds behave the same (block walking, not attacks). */
export const waterRects = (scenery) => [...scenery.streams, ...scenery.ponds];

/**
 * The pieces of a ruined temple, from its rectangle alone (so it is data-light and testable).
 * A ring of broken wall (1-2 blocks high, some cells collapsed to rubble), a taller pillar at each corner, a gap in the
 * middle of every side so you can walk in, and (for big ones) four free-standing pillars inside.
 * @returns {{ix:number, iz:number, kind:'wall'|'pillar'|'rubble', h:number}[]}  gaps are simply absent.
 */
export function ruinPieces(r) {
  const seed = r.seed ?? 1;
  const out = [];
  const pillarH = (x, z) => 1.5 + STEP_HEIGHT * Math.floor(unit(x, z, seed + 3) * 2);
  const midX = r.ix + Math.floor(r.w / 2);
  const midZ = r.iz + Math.floor(r.d / 2);
  for (let z = r.iz; z < r.iz + r.d; z++) {
    for (let x = r.ix; x < r.ix + r.w; x++) {
      const onX = x === r.ix || x === r.ix + r.w - 1;
      const onZ = z === r.iz || z === r.iz + r.d - 1;
      if (!onX && !onZ) continue;
      if (onX && onZ) { out.push({ ix: x, iz: z, kind: 'pillar', h: pillarH(x, z) }); continue; }
      if ((onZ && x === midX) || (onX && z === midZ)) continue; // the entrance
      const u = unit(x, z, seed + 1);
      if (u < 0.22) out.push({ ix: x, iz: z, kind: 'rubble', h: 0.3 });
      else out.push({ ix: x, iz: z, kind: 'wall', h: STEP_HEIGHT * (1 + Math.floor(unit(x, z, seed + 2) * 2)) });
    }
  }
  if (r.w >= 7 && r.d >= 7) {
    for (const [x, z] of [[r.ix + 2, r.iz + 2], [r.ix + r.w - 3, r.iz + 2], [r.ix + 2, r.iz + r.d - 3], [r.ix + r.w - 3, r.iz + r.d - 3]]) {
      out.push({ ix: x, iz: z, kind: 'pillar', h: pillarH(x, z) });
    }
  }
  return out;
}
/** Cells a ruin blocks (rubble is low enough to step over). */
export const ruinSolidCells = (ruin) => ruinPieces(ruin).filter((p) => p.kind !== 'rubble').map((p) => [p.ix, p.iz]);

/** The patch of floor in front of the desk where the shop opens, in WORLD coordinates (the desk faces south). */
export function shopZone(level) {
  const s = sceneryOf(level);
  if (!s.shop) return null;
  const d = s.shop.desk;
  const x0 = d.ix - level.arena.width / 2;
  const southEdge = d.iz + d.d - level.arena.depth / 2;
  return { x0: x0 - 0.5, x1: x0 + d.w + 0.5, z0: southEdge, z1: southEdge + 2.2 };
}

export const STEP_HEIGHT = 0.75; // one stair; all terrain heights are multiples of this
export const LEDGE_DROP = 1.5; // a cell this much higher than a neighbor is a ledge (blocks walking)
export const MAX_TERRAIN_HEIGHT = 3;

export const FLOWER_COLORS = Object.freeze(['#ff5a6e', '#ffd84a', '#ffffff', '#ff9ad5', '#b07cff']);

export function sceneryOf(level) {
  return { ...NO_SCENERY, ...(level.scenery ?? {}) };
}

export function rectCells({ ix, iz, w, d }) {
  const cells = [];
  for (let z = iz; z < iz + d; z++) for (let x = ix; x < ix + w; x++) cells.push([x, z]);
  return cells;
}

/** The cells making up a building: its walls, its interior, and its door cell. */
export function buildingCells(b) {
  const door = doorCell(b);
  const walls = [];
  const interior = [];
  for (let z = b.iz; z < b.iz + b.d; z++) {
    for (let x = b.ix; x < b.ix + b.w; x++) {
      const edge = x === b.ix || x === b.ix + b.w - 1 || z === b.iz || z === b.iz + b.d - 1;
      if (!edge) interior.push([x, z]);
      else if (!(x === door[0] && z === door[1])) walls.push([x, z]);
    }
  }
  return { walls, interior, door };
}

export function doorCell(b) {
  const { side, index } = b.door;
  if (side === 'N') return [b.ix + index, b.iz];
  if (side === 'S') return [b.ix + index, b.iz + b.d - 1];
  if (side === 'W') return [b.ix, b.iz + index];
  if (side === 'E') return [b.ix + b.w - 1, b.iz + index];
  throw new Error(`Unknown door side: ${side}`);
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const EPS = 1e-6;

/**
 * What a terrain cell is, from the heights alone:
 *   'none'   level ground
 *   'ledge'  has a neighbor lower by LEDGE_DROP or more: a stone wall you can't walk onto
 *   'step'   a stair: lower neighbors AND higher neighbors (walkable, drawn as stone)
 *   'top'    walkable high ground (plateau, mound, landing)
 */
export function terrainClass(grid, ix, iz) {
  const h = grid.heightAtCell(ix, iz);
  if (h <= EPS) return 'none';
  let lower = false;
  let higher = false;
  for (const [dx, dz] of SIDES) {
    if (!grid.inBounds(ix + dx, iz + dz)) continue;
    const n = grid.heightAtCell(ix + dx, iz + dz);
    if (n <= h - LEDGE_DROP + EPS) return 'ledge';
    if (n < h - EPS) lower = true;
    if (n > h + EPS) higher = true;
  }
  return lower && higher ? 'step' : 'top';
}

/** The gate cell, its two pillar cells, and the cell in front of it (inside the arena); null for an unknown side. */
export function gateCells(gate) {
  const { ix, iz, side } = gate;
  const along = side === 'N' || side === 'S' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  const inward = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[side];
  if (!inward) return null; // unknown side: validateLevel reports it
  return {
    gate: [ix, iz],
    pillars: along.map(([dx, dz]) => [ix + dx, iz + dz]),
    front: [ix + inward[0], iz + inward[1]],
  };
}

export function buildLevelGrid(level) {
  const s = sceneryOf(level);
  const grid = new Grid(level.arena.width, level.arena.depth);

  for (const stream of waterRects(s)) for (const [x, z] of rectCells(stream)) grid.block(x, z, MOVE); // water: walk-blocking only
  for (const bridge of s.bridges) for (const [x, z] of rectCells(bridge)) grid.clear(x, z);
  for (const t of s.terrain) for (const [x, z] of rectCells(t)) grid.setHeight(x, z, t.h);
  for (let iz = 0; iz < grid.depth; iz++) {
    for (let ix = 0; ix < grid.width; ix++) {
      if (terrainClass(grid, ix, iz) === 'ledge') grid.block(ix, iz, MOVE); // a ledge stops walking, not attacks
    }
  }
  if (s.shop) {
    for (const [x, z] of rectCells(s.shop.desk)) grid.block(x, z, MOVE); // you can't walk through the counter
    grid.block(s.shop.keeper.ix, s.shop.keeper.iz, MOVE | SIGHT);
  }
  for (const ruin of s.ruins) for (const [x, z] of ruinSolidCells(ruin)) grid.block(x, z, MOVE | SIGHT);
  for (const [x, z] of s.trees) grid.block(x, z, MOVE | SIGHT);
  for (const [x, z] of s.rocks) grid.block(x, z, MOVE | SIGHT);
  for (const b of s.buildings) {
    const { walls, door } = buildingCells(b);
    for (const [x, z] of walls) grid.block(x, z, MOVE | SIGHT);
    grid.addDoor(door[0], door[1]);
  }
  const gc = s.gate ? gateCells(s.gate) : null;
  if (gc) {
    const { gate, pillars } = gc;
    for (const [x, z] of pillars) grid.block(x, z, MOVE | SIGHT);
    grid.addDoor(gate[0], gate[1]);
    if (!s.gate.unlocked) grid.doors.get(grid.index(gate[0], gate[1])).locked = true; // opens only for a hero with the key
  }
  return grid;
}

/** Deterministic decoration: returns [{ x, z, color, phase }] in world coordinates on free cells. */
export function scatterFlowers(grid, { count, seed }) {
  const rnd = mulberry32(seed);
  const free = [];
  for (let iz = 0; iz < grid.depth; iz++) {
    for (let ix = 0; ix < grid.width; ix++) {
      if (!grid.blockedForPlanning(ix, iz) && !grid.isDoor(ix, iz)) free.push([ix, iz]);
    }
  }
  const flowers = [];
  for (let i = 0; i < count && free.length > 0; i++) {
    const pick = Math.floor(rnd() * free.length);
    const [ix, iz] = free.splice(pick, 1)[0];
    flowers.push({
      x: grid.centerX(ix) + (rnd() - 0.5) * 0.6,
      z: grid.centerZ(iz) + (rnd() - 0.5) * 0.6,
      color: FLOWER_COLORS[Math.floor(rnd() * FLOWER_COLORS.length)],
      phase: rnd() * Math.PI * 2,
    });
  }
  return flowers;
}
