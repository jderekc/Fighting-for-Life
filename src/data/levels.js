import { ruinSolidCells } from '../logic/levelGrid.js';
import { buildingCells, buildLevelGrid, gateCells, MAX_TERRAIN_HEIGHT, rectCells, sceneryOf, waterRects, STEP_HEIGHT, terrainClass } from '../logic/levelGrid.js';
import { findPath, floodReachable } from '../logic/pathfind.js';
import { BIOMES } from './biomes.js';
import { ENEMIES } from './enemies.js';

// Levels are data. Enemy/apple/hero positions are WORLD coordinates (x, z; centre of the arena is 0,0).
// Scenery is in CELL coordinates (ix, iz; 0,0 is the north-west corner), see src/logic/levelGrid.js.
// `delay` is seconds after level start before an enemy appears.
//
// Cell <-> world for a 36x26 arena: x = ix - 17.5, z = iz - 12.5 (cell centres).

/** Arenas may be any rectangle (portrait, landscape, square) within these limits, in blocks. */
export const MIN_ARENA = 12;
export const MAX_ARENA = 128;

export const LEVELS = Object.freeze([
  Object.freeze({
    id: 1,
    name: 'Meadow Brawl',
    biome: 'meadow',
    arena: Object.freeze({ width: 36, depth: 26 }),
    heroStart: Object.freeze({ x: 0, z: 7 }),
    scenery: Object.freeze({
      // A stream that bends: it enters on the west at the south, turns north, and leaves on the east. Two bridges.
      streams: [
        { ix: 0, iz: 14, w: 18, d: 2 },
        { ix: 18, iz: 12, w: 2, d: 4 },
        { ix: 18, iz: 10, w: 18, d: 2 },
      ],
      bridges: [
        { ix: 7, iz: 14, w: 2, d: 2 },
        { ix: 28, iz: 10, w: 2, d: 2 },
      ],
      // A cottage in the south-east with a door on the south wall (faces the camera, so the swing is visible). There is an apple inside.
      buildings: [{ ix: 28, iz: 16, w: 5, d: 5, door: { side: 'S', index: 2 } }],
      // Elevation, painted as height rectangles (see src/logic/levelGrid.js). Ledges and stairs follow from the heights.
      terrain: [
        // North-west: an L-shaped highland (1.5) with a taller peak (3.0). Stairs up from the meadow, and a 2.25 landing to the peak.
        { ix: 2, iz: 2, w: 10, d: 4, h: 1.5 },
        { ix: 4, iz: 6, w: 6, d: 3, h: 1.5 },
        { ix: 10, iz: 5, w: 3, d: 2, h: 1.5 },
        { ix: 5, iz: 2, w: 6, d: 3, h: 3 },
        { ix: 6, iz: 5, w: 2, d: 1, h: 2.25 },
        { ix: 6, iz: 9, w: 2, d: 1, h: 0.75 },
        // North-east: a 2.25 plateau with a side lobe, reached by climbing a low shelf (0.75 -> 1.5 -> 2.25).
        { ix: 24, iz: 1, w: 8, d: 4, h: 2.25 },
        { ix: 27, iz: 5, w: 5, d: 3, h: 2.25 },
        { ix: 24, iz: 5, w: 3, d: 3, h: 1.5 },
        { ix: 25, iz: 8, w: 2, d: 1, h: 0.75 },
        // South-west: gentle mounds you can just walk up (no ledges), with a small peak.
        { ix: 4, iz: 19, w: 6, d: 4, h: 0.75 },
        { ix: 7, iz: 17, w: 5, d: 3, h: 0.75 },
        { ix: 10, iz: 21, w: 3, d: 3, h: 0.75 },
        { ix: 6, iz: 20, w: 3, d: 2, h: 1.5 },
      ],
      trees: [
        [19, 3], [30, 14], [14, 21], [24, 15], [34, 22],
        [16, 4], [14, 7], [35, 5], [1, 9], [3, 24], [35, 18], [4, 17],
        [22, 25], [27, 23], [10, 24], [34, 13], [22, 8], [17, 11], [13, 17],
        [1, 13], [8, 10], [32, 24], [2, 20], [21, 14], [9, 3], [30, 3],
        [25, 5], [11, 18], [10, 22],
      ],
      rocks: [
        [18, 5], [24, 24], [30, 22], [24, 19], [16, 11], [20, 17], [31, 12], [13, 8], [34, 23],
        [20, 0], [11, 19], [7, 7], [3, 3],
      ],
      // The exit: a locked gate in the north wall. The last enemy drops the key.
      gate: { ix: 15, iz: 0, side: 'N' },
      flowers: { count: 90, seed: 5 },
    }),
    enemies: [
      // A sleeping rock by the path: optional, never moves (touching it hurts more each hit).
      { type: 'neelysomnaly', x: -12.5, z: 7.5, delay: 0 },
      // Wave 1 (north bank)
      { type: 'grunt', x: -14, z: -2, delay: 1.5 },
      { type: 'grunt', x: 5.5, z: -3.5, delay: 1.5 },
      // Wave 2
      { type: 'grunt', x: -4, z: -9, delay: 12 },
      { type: 'grunt', x: -8.5, z: -6.5, delay: 13 }, // on the west highland
      { type: 'grunt', x: 10.5, z: -9.5, delay: 14 }, // on the east plateau
      // Wave 3 (a couple start on the hero's side of the stream)
      { type: 'grunt', x: -16.5, z: -6.5, delay: 26 },
      { type: 'grunt', x: 16, z: -6, delay: 26 },
      { type: 'grunt', x: -0.5, z: -2.5, delay: 27 },
      { type: 'grunt', x: -6, z: 5, delay: 28 },
      { type: 'grunt', x: 14, z: 1, delay: 28 },
    ],
    appleSpots: [
      { x: -9.5, z: -9.5 }, // on the north-west peak
      { x: -0.5, z: -8.5 },
      { x: 10.5, z: -7.5 }, // on the north-east plateau
      { x: -3, z: 8 },
      { x: 12.5, z: 5.5 }, // inside the cottage
    ],
  }),
  Object.freeze({
    id: 2,
    name: 'Hilltop Trail',
    biome: 'meadow',
    // Portrait: 24 wide, 36 deep. Cell <-> world: x = ix - 11.5, z = iz - 17.5. The exit gate is at the far (north) end.
    arena: Object.freeze({ width: 24, depth: 36 }),
    heroStart: Object.freeze({ x: 0.5, z: 13.5 }),
    scenery: Object.freeze({
      streams: [
        { ix: 0, iz: 21, w: 9, d: 2 },
        { ix: 7, iz: 16, w: 2, d: 5 },
        { ix: 7, iz: 14, w: 17, d: 2 },
      ],
      bridges: [
        { ix: 3, iz: 21, w: 2, d: 2 },
        { ix: 17, iz: 14, w: 2, d: 2 },
      ],
      terrain: [
        // North-west: a highland with a stair on its south side.
        { ix: 1, iz: 3, w: 7, d: 5, h: 1.5 },
        { ix: 3, iz: 8, w: 4, d: 3, h: 1.5 },
        { ix: 4, iz: 11, w: 2, d: 1, h: 0.75 },
        // North-east: a tall ridge, climbed from a shelf on its west side.
        { ix: 16, iz: 3, w: 6, d: 7, h: 2.25 },
        { ix: 13, iz: 6, w: 3, d: 4, h: 1.5 },
        { ix: 14, iz: 10, w: 2, d: 1, h: 0.75 },
        // South-west: low mounds with a little peak.
        { ix: 3, iz: 26, w: 6, d: 5, h: 0.75 },
        { ix: 5, iz: 27, w: 3, d: 3, h: 1.5 },
      ],
      trees: [
        [11, 8], [20, 33], [14, 35], [4, 0], [14, 12], [12, 21], [5, 18], [22, 25], [22, 21],
        [1, 12], [14, 0], [13, 17], [3, 34], [9, 35], [2, 28], [14, 26], [1, 17], [5, 13],
        [9, 11], [9, 19], [2, 6], [20, 8], [17, 4], [6, 6],
      ],
      rocks: [
        [12, 17], [0, 12], [20, 23], [16, 22], [22, 12], [10, 27], [15, 27], [14, 4], [17, 8],
        [19, 5],
      ],
      gate: { ix: 11, iz: 0, side: 'N' },
      flowers: { count: 60, seed: 9 },
    }),
    enemies: [
      { type: 'neelysomnaly', x: -7.5, z: 7.5, delay: 0 },
      { type: 'neelysomnaly', x: 9.5, z: 0.5, delay: 0 },
      { type: 'grunt', x: -1.5, z: -10.5, delay: 1.5 },
      { type: 'grunt', x: 8.5, z: -5.5, delay: 1.5 },
      { type: 'grunt', x: -6.5, z: -16.5, delay: 12 },
      { type: 'grunt', x: 0.5, z: -7.5, delay: 13 },
      { type: 'grunt', x: 6.5, z: -11.5, delay: 14 }, // on the ridge
      { type: 'grunt', x: -8.5, z: -12.5, delay: 25 }, // on the highland
      { type: 'grunt', x: 9.5, z: -6.5, delay: 25 },
      { type: 'grunt', x: 0.5, z: -1.5, delay: 26 },
      { type: 'grunt', x: -8.5, z: 6.5, delay: 27 },
      { type: 'grunt', x: 8.5, z: 4.5, delay: 38 },
      { type: 'grunt', x: -9.5, z: 0.5, delay: 38 },
      { type: 'grunt', x: -2.5, z: -13.5, delay: 39 },
      // The sun-headed Barchernarcher: the only one here, arrives once everything else is down, and drops the key.
      { type: 'barchernarcher', x: 0.5, z: -14.5, delay: 1.5, finale: true },
    ],
    appleSpots: [
      { x: 7.5, z: -11.5 }, // on the ridge
      { x: -1.5, z: -8.5 },
      { x: 6.5, z: 9.5 }, // open hillside (no buildings on this level)
      { x: 0.5, z: 8.5 },
    ],
  }),
  Object.freeze({
    id: 3,
    name: 'Windy Summit',
    biome: 'mountain',
    // Landscape 40x32. Cell <-> world: x = ix - 19.5, z = iz - 15.5. You start at the foot of the mountain (south),
    // climb terraced slopes past an old vine-covered temple, and the exit gate is on the cold level ground to the north.
    arena: Object.freeze({ width: 40, depth: 32 }),
    heroStart: Object.freeze({ x: 0.5, z: 14.5 }),
    scenery: Object.freeze({
      ponds: [
        { ix: 4, iz: 1, w: 5, d: 2 },
        { ix: 5, iz: 3, w: 3, d: 1 },
      ],
      ruins: [{ ix: 11, iz: 10, w: 9, d: 9, seed: 3 }],
      terrain: [
        // Terraces: each is only 0.75 above the one outside it, so the whole mountain can be walked up (stone steps between).
        { ix: 3, iz: 4, w: 34, d: 25, h: 0.75 },
        { ix: 1, iz: 14, w: 5, d: 10, h: 0.75 },
        { ix: 34, iz: 2, w: 5, d: 9, h: 0.75 },
        { ix: 6, iz: 6, w: 27, d: 20, h: 1.5 },
        { ix: 30, iz: 10, w: 5, d: 9, h: 1.5 },
        { ix: 9, iz: 8, w: 21, d: 14, h: 2.25 },
        { ix: 24, iz: 9, w: 5, d: 4, h: 3 },
        { ix: 14, iz: 22, w: 3, d: 5, h: 0.75 }, // a gully cut into the slope
      ],
      trees: [[26,21], [20,21], [14,5], [18,22], [26,25], [15,23], [3,20], [26,23], [27,17], [7,14], [18,26], [37,3], [32,3], [7,17], [35,30], [36,12], [13,23], [32,6], [5,19], [22,29], [38,5], [29,23], [12,2], [33,1], [3,28], [24,20], [30,16], [23,5], [24,25], [5,8], [22,11], [17,8], [4,23], [8,24]],
      rocks: [[16,5], [14,8], [19,24], [15,28], [1,1], [1,8], [28,20], [38,9], [6,22], [32,19], [12,7], [37,26], [10,26], [11,4], [34,27], [10,20]],
      gate: { ix: 20, iz: 0, side: 'N' },
      flowers: { count: 14, seed: 4 },
    }),
    enemies: [
      { type: 'neelysomnaly', x: 5.5, z: -4.5, delay: 0 },
      { type: 'neelysomnaly', x: -15.5, z: -0.5, delay: 0 },
      { type: 'grunt', x: -7.5, z: 11.5, delay: 1.5 },
      { type: 'grunt', x: 8.5, z: 10.5, delay: 1.5 },
      { type: 'grunt', x: -11.5, z: 5.5, delay: 12 },
      { type: 'grunt', x: 13.5, z: 6.5, delay: 12 },
      { type: 'grunt', x: 2.5, z: 7.5, delay: 13 },
      { type: 'grunt', x: 5.5, z: -1.5, delay: 24 },
      { type: 'grunt', x: -4.5, z: -1.5, delay: 24 },
      { type: 'grunt', x: 6.5, z: -4.5, delay: 25 },
      { type: 'grunt', x: -9.5, z: -3.5, delay: 36 },
      { type: 'grunt', x: 0.5, z: -8.5, delay: 36 },
      { type: 'grunt', x: 11.5, z: -1.5, delay: 37 },
      { type: 'grunt', x: -14.5, z: -11.5, delay: 48 },
      { type: 'grunt', x: 16.5, z: -9.5, delay: 49 },
      // A Barchernarcher turns up somewhere (and sometime) before the boss: spot and delay are chosen when the fight starts.
      { type: 'barchernarcher', random: { spots: [{ x: -6.5, z: -6.5 }, { x: 4.5, z: -8.5 }, { x: -12.5, z: -8.5 }, { x: 12.5, z: -8.5 }], delay: [10, 40] } },
      // The finale: the first elite. He appears (2 s after the last grunt falls) in the middle of the temple ruins, and drops the key.
      { type: 'bowmaster', x: -4.5, z: -1.5, delay: 2, finale: true },
    ],
    appleSpots: [
      { x: -4.5, z: 0.5 }, // inside the temple
      { x: 7.5, z: -5.5 }, // on the summit
      { x: 0.5, z: 11.5 },
      { x: 12.5, z: -3.5 },
    ],
  }),
  Object.freeze({
    id: 4,
    kind: 'shop', // no enemies, no key: spend coins at the desk, then walk through the open gate
    name: 'Mystic Oasis',
    biome: 'oasis',
    // 18x24. Cell <-> world: x = ix - 8.5, z = iz - 11.5. The 6x8 shop sits in the north; you arrive from the south.
    arena: Object.freeze({ width: 18, depth: 24 }),
    heroStart: Object.freeze({ x: 0.5, z: 9.5 }),
    scenery: Object.freeze({
      ponds: [
        { ix: 1, iz: 14, w: 4, d: 4 },
        { ix: 13, iz: 13, w: 3, d: 3 },
      ],
      buildings: [{ ix: 6, iz: 3, w: 6, d: 8, door: { side: 'S', index: 2 } }],
      // The counter runs across the 4-wide interior; the keeper stands behind it (north), a half block right of cell 8 = centered.
      shop: { desk: { ix: 7, iz: 6, w: 4, d: 1 }, keeper: { ix: 8, iz: 5, dx: 0.5 } },
      terrain: [
        { ix: 13, iz: 19, w: 4, d: 3, h: 0.75 }, // a low dune
        { ix: 1, iz: 3, w: 3, d: 4, h: 0.75 },
      ],
      trees: [[2, 19], [15, 18], [1, 4], [16, 14], [2, 1], [14, 12], [11, 14], [5, 13], [2, 21], [15, 9], [5, 18], [4, 7], [14, 3]],
      rocks: [[4, 4], [13, 18], [4, 9], [13, 21], [5, 15], [1, 9], [16, 11], [13, 10]],
      gate: { ix: 9, iz: 0, side: 'N', unlocked: true },
      flowers: { count: 26, seed: 6 },
    }),
    enemies: [],
    appleSpots: [],
  }),
]);

/** Returns a list of human-readable problems; empty means the level is valid. */
export function validateLevel(level) {
  const problems = [];
  if (level.biome !== undefined && !BIOMES[level.biome]) problems.push(`unknown biome "${level.biome}"`);
  const { width: aw, depth: ad } = level.arena;
  for (const [name, v] of [['width', aw], ['depth', ad]]) {
    if (!Number.isInteger(v) || v < MIN_ARENA || v > MAX_ARENA) problems.push(`arena ${name} must be a whole number from ${MIN_ARENA} to ${MAX_ARENA} (got ${v})`);
  }
  if (problems.length > 0) return problems; // the rest assumes a sane size
  const halfW = level.arena.width / 2;
  const halfD = level.arena.depth / 2;
  const inside = (p) => Math.abs(p.x) <= halfW - 0.5 && Math.abs(p.z) <= halfD - 0.5;
  const scenery = sceneryOf(level);
  const grid = buildLevelGrid(level);
  const inGrid = ([ix, iz]) => grid.inBounds(ix, iz);
  const onSolid = (p) => grid.blockedForPlanning(grid.cellX(p.x), grid.cellZ(p.z));
  const reachable = (p) => findPath(grid, level.heroStart.x, level.heroStart.z, p.x, p.z) !== null;

  if (!inside(level.heroStart)) problems.push('heroStart is outside the arena');
  else if (onSolid(level.heroStart)) problems.push('heroStart is on an obstacle');

  level.enemies.forEach((e, i) => {
    if (!ENEMIES[e.type]) problems.push(`enemy ${i}: unknown type "${e.type}"`);
    // A random spawn names several possible spots and a delay window; every spot must be good.
    const spots = e.random ? e.random.spots : [e];
    if (e.random && (!(spots.length > 0) || !Array.isArray(e.random.delay) || !(e.random.delay[0] >= 0 && e.random.delay[1] >= e.random.delay[0]))) {
      problems.push(`enemy ${i}: random needs spots and delay [min, max]`);
    }
    for (const spot of spots) {
      if (!inside(spot)) problems.push(`enemy ${i}: outside the arena`);
      else if (onSolid(spot)) problems.push(`enemy ${i}: spawns on an obstacle`);
      else if (!reachable(spot)) problems.push(`enemy ${i}: cannot reach the hero start (blocked by water/walls?)`);
    }
    // A rock that never moves must have room to walk around it (two free cells each way), or somebody gets wedged against it.
    if (ENEMIES[e.type]?.immovable && inside(e)) {
      const cx = grid.cellX(e.x);
      const cz = grid.cellZ(e.z);
      let tight = false;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (grid.blockedForPlanning(cx + dx, cz + dz)) tight = true;
      if (tight) problems.push(`enemy ${i}: a sleeping rock needs 2 free cells of room all round`);
    }
    if (!e.random && !(e.delay >= 0)) problems.push(`enemy ${i}: delay must be >= 0`);
  });
  level.appleSpots.forEach((s, i) => {
    if (!inside(s)) problems.push(`apple spot ${i}: outside the arena`);
    else if (onSolid(s)) problems.push(`apple spot ${i}: on an obstacle`);
    else if (!reachable(s)) problems.push(`apple spot ${i}: unreachable from the hero start`);
  });
  if (level.enemies.length === 0 && level.kind !== 'shop') problems.push('level has no enemies');
  if (level.kind === 'shop') {
    if (level.enemies.length > 0) problems.push('a shop level has no enemies');
    if (!scenery.shop) problems.push('a shop level needs scenery.shop');
    if (!scenery.gate) problems.push('a shop level needs an exit gate');
  }

  // Scenery must not overlap other scenery (a building on the water, a tree on a bridge, ...).
  const key = ([x, z]) => `${x},${z}`;
  const bridgeCells = new Set(scenery.bridges.flatMap(rectCells).map(key));
  // Open water only: a bridge covers the water under it.
  const water = new Set(waterRects(scenery).flatMap(rectCells).map(key).filter((k) => !bridgeCells.has(k)));
  const footprints = scenery.buildings.map((b) => new Set(rectCells(b).map(key)));
  const plants = new Set(scenery.trees.concat(scenery.rocks).map(key));

  scenery.trees.concat(scenery.rocks).forEach((cell, i) => {
    if (!inGrid(cell)) problems.push(`tree/rock ${i}: outside the arena`);
    const k = key(cell);
    if (water.has(k) || footprints.some((f) => f.has(k))) problems.push(`tree/rock ${i} at ${k}: overlaps water or a building`);
    else if (bridgeCells.has(k)) problems.push(`tree/rock ${i} at ${k}: sits on a bridge`);
  });
  scenery.buildings.forEach((b, i) => {
    for (const cell of rectCells(b)) {
      const k = key(cell);
      const clash = water.has(k) || bridgeCells.has(k) || plants.has(k) || footprints.some((f, j) => j !== i && f.has(k));
      if (clash) {
        problems.push(`building ${i}: overlaps water, a bridge, a tree/rock or another building at ${k}`);
        break;
      }
    }
  });
  // Canopies are ~1.8 wide, so they spill about 0.4 into neighbouring cells: keep them clear of cottages (roof
  // overhang) and of ground much higher than their own (cliffs).
  const NEIGHBORS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  scenery.trees.forEach(([tx, tz], i) => {
    const base = grid.heightAtCell(tx, tz);
    for (const [dx, dz] of NEIGHBORS8) {
      const k = key([tx + dx, tz + dz]);
      if (footprints.some((f) => f.has(k))) {
        problems.push(`tree ${i} at ${tx},${tz}: its leaves would poke through a cottage (keep one empty cell between)`);
        break;
      }
      if (grid.heightAtCell(tx + dx, tz + dz) > base + STEP_HEIGHT + 1e-6) {
        problems.push(`tree ${i} at ${tx},${tz}: its leaves would poke into a cliff next to it`);
        break;
      }
    }
  });

  // Ruins: inside the arena, on flat level-or-raised ground, clear of water/plants/buildings, trees kept off their
  // walls, and every open cell inside a ruin can be walked to (through the gaps in the walls).
  const ruinCellSets = scenery.ruins.map((r) => new Set(rectCells(r).map(key)));
  scenery.ruins.forEach((r, i) => {
    const cells = rectCells(r);
    if (r.w < 5 || r.d < 5) problems.push(`ruin ${i}: must be at least 5x5 cells`);
    if (!cells.every(inGrid)) { problems.push(`ruin ${i}: extends outside the arena`); return; }
    if (cells.some((c) => water.has(key(c)) || bridgeCells.has(key(c)) || plants.has(key(c)) || footprints.some((f) => f.has(key(c))))) {
      problems.push(`ruin ${i}: overlaps water, a bridge, a tree/rock or a building`);
    }
    const h0 = grid.heightAtCell(r.ix, r.iz);
    if (cells.some((c) => Math.abs(grid.heightAtCell(c[0], c[1]) - h0) > 1e-6 || terrainClass(grid, c[0], c[1]) === 'ledge' || terrainClass(grid, c[0], c[1]) === 'step')) {
      problems.push(`ruin ${i}: must stand on flat ground`);
    }
    if (scenery.ruins.some((o, j) => j !== i && rectCells(o).some((c) => ruinCellSets[i].has(key(c))))) problems.push(`ruin ${i}: overlaps another ruin`);
    const solid = new Set(ruinSolidCells(r).map(key));
    const reached = floodReachable(grid, grid.cellX(level.heroStart.x), grid.cellZ(level.heroStart.z));
    if (cells.some((c) => !solid.has(key(c)) && !reached.has(key(c)))) problems.push(`ruin ${i}: some of its open ground cannot be reached`);
    scenery.trees.forEach(([tx, tz], t) => {
      if (NEIGHBORS8.some(([dx, dz]) => ruinCellSets[i].has(key([tx + dx, tz + dz])))) problems.push(`tree ${t} at ${tx},${tz}: too close to a ruin (its leaves would poke through the stones)`);
    });
  });

  // The exit gate: on the edge it names, on level ground, with free ground in front, and reachable.
  if (scenery.gate) {
    const g = scenery.gate;
    if (!['N', 'S', 'W', 'E'].includes(g.side)) problems.push(`gate: unknown side "${g.side}"`);
    else {
      const edge = { N: g.iz === 0, S: g.iz === ad - 1, W: g.ix === 0, E: g.ix === aw - 1 }[g.side];
      const { gate, pillars, front } = gateCells(g);
      if (!edge) problems.push(`gate: must sit on the ${g.side} edge of the arena`);
      else if (![gate, ...pillars, front].every(inGrid)) problems.push('gate: its pillars or front cell fall outside the arena');
      else {
        const cells = [gate, ...pillars, front];
        if (cells.some((c) => water.has(key(c)) || bridgeCells.has(key(c)) || plants.has(key(c)) || footprints.some((f) => f.has(key(c))) || ruinCellSets.some((f) => f.has(key(c))))) {
          problems.push('gate: overlaps water, a bridge, a tree/rock, a building or a ruin');
        }
        if (cells.some((c) => grid.heightAtCell(c[0], c[1]) > 0)) problems.push('gate: must stand on level ground');
        else if (!reachable({ x: grid.centerX(front[0]), z: grid.centerZ(front[1]) })) problems.push('gate: cannot be reached from the hero start');
      }
    }
  }

  // Terrain: valid heights, in bounds, off water/bridges/buildings, nothing planted on a ledge or stair,
  // and every walkable piece of high ground can actually be walked to.
  scenery.terrain.forEach((t, i) => {
    if (!rectCells(t).every(inGrid)) problems.push(`terrain ${i}: extends outside the arena`);
    const steps = t.h / STEP_HEIGHT;
    if (!(t.h > 0 && t.h <= MAX_TERRAIN_HEIGHT) || Math.abs(steps - Math.round(steps)) > 1e-9) {
      problems.push(`terrain ${i}: h must be a multiple of ${STEP_HEIGHT} up to ${MAX_TERRAIN_HEIGHT}`);
    }
    if (rectCells(t).some((c) => water.has(key(c)) || bridgeCells.has(key(c)) || footprints.some((f) => f.has(key(c))))) {
      problems.push(`terrain ${i}: overlaps water, a bridge or a building`);
    }
  });
  if (scenery.terrain.length > 0) {
    for (const cell of scenery.trees.concat(scenery.rocks)) {
      const cls = terrainClass(grid, cell[0], cell[1]);
      if (cls === 'ledge' || cls === 'step') problems.push(`tree/rock at ${key(cell)}: sits on a ${cls}`);
    }
    for (const door of grid.doors.values()) {
      if (grid.heightAtCell(door.ix, door.iz) > 0) problems.push(`door at ${door.ix},${door.iz}: buildings must stand on level ground`);
    }
    const reached = floodReachable(grid, grid.cellX(level.heroStart.x), grid.cellZ(level.heroStart.z));
    outer: for (let iz = 0; iz < grid.depth; iz++) {
      for (let ix = 0; ix < grid.width; ix++) {
        if (grid.heightAtCell(ix, iz) > 0 && !grid.blockedForPlanning(ix, iz) && !reached.has(`${ix},${iz}`)) {
          problems.push(`terrain: high ground at ${ix},${iz} cannot be reached from the hero start (no stairs?)`);
          break outer;
        }
      }
    }
  }
  scenery.buildings.forEach((b, i) => {
    if (b.w < 3 || b.d < 3) problems.push(`building ${i}: must be at least 3x3 cells`);
    const lenAlong = b.door.side === 'N' || b.door.side === 'S' ? b.w : b.d;
    if (b.door.index < 1 || b.door.index > lenAlong - 2) problems.push(`building ${i}: door must not be in a corner`);
    if (!buildingCells(b).walls.every(inGrid)) problems.push(`building ${i}: extends outside the arena`);
    else {
      // The door must open onto dry, walkable ground.
      const [dx, dz] = buildingCells(b).door;
      const out = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[b.door.side];
      if (grid.blockedForPlanning(dx + out[0], dz + out[1])) problems.push(`building ${i}: the door opens onto an obstacle`);
    }
  });
  if (scenery.shop) {
    // The desk and the keeper stand inside a building, the keeper behind (north of) the desk, and the floor in front is reachable.
    const { desk, keeper } = scenery.shop;
    const home = scenery.buildings.find((b) => buildingCells(b).interior.some(([x, z]) => x === desk.ix && z === desk.iz));
    if (!home) problems.push('shop: the desk must be inside a building');
    else {
      const inside = new Set(buildingCells(home).interior.map(key));
      if (!rectCells(desk).every((c) => inside.has(key(c)))) problems.push('shop: the desk sticks out of the building');
      if (!inside.has(key([keeper.ix, keeper.iz])) || keeper.iz >= desk.iz) problems.push('shop: the keeper must stand inside, behind (north of) the desk');
      const front = [desk.ix + Math.floor(desk.w / 2), desk.iz + desk.d];
      if (!inside.has(key(front)) || !reachable({ x: grid.centerX(front[0]), z: grid.centerZ(front[1]) })) problems.push('shop: the floor in front of the desk cannot be reached');
    }
  }
  return problems;
}
