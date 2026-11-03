import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveCircle } from '../src/logic/collide.js';
import { Grid, MOVE, SIGHT } from '../src/logic/grid.js';
import { buildLevelGrid, buildingCells, doorCell, scatterFlowers } from '../src/logic/levelGrid.js';
import { findPath } from '../src/logic/pathfind.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('Grid: cell <-> world conversion round-trips', () => {
  const g = new Grid(26, 18);
  assert.equal(g.cellX(-12.9), 0);
  assert.equal(g.cellX(12.9), 25);
  assert.equal(g.cellZ(-8.9), 0);
  close(g.centerX(0), -12.5);
  close(g.centerZ(17), 8.5);
  for (const ix of [0, 7, 25]) assert.equal(g.cellX(g.centerX(ix)), ix);
});

test('Grid: water blocks walking but not sight; walls block both; out of bounds is blocked', () => {
  const g = new Grid(10, 10);
  g.block(2, 2, MOVE); // water
  g.block(4, 4, MOVE | SIGHT); // wall
  assert.ok(g.blocked(2, 2, MOVE));
  assert.ok(!g.blocked(2, 2, SIGHT));
  assert.ok(g.blocked(4, 4, MOVE) && g.blocked(4, 4, SIGHT));
  assert.ok(g.blocked(-1, 0) && g.blocked(10, 3));
});

test('Grid: a closed door blocks everything; an open door blocks nothing; planning ignores doors', () => {
  const g = new Grid(10, 10);
  g.addDoor(5, 5);
  assert.ok(g.blocked(5, 5, MOVE) && g.blocked(5, 5, SIGHT));
  assert.ok(!g.blockedForPlanning(5, 5));
  g.setDoorOpen(5, 5, true);
  assert.ok(!g.blocked(5, 5, MOVE) && !g.blocked(5, 5, SIGHT));
});

test('Grid.lineClear honours the flag and the body radius', () => {
  const g = new Grid(20, 20);
  g.block(10, 10, MOVE); // water cell at world (-0.0..1, ..)
  const [x, z] = [g.centerX(10), g.centerZ(10)];
  assert.ok(!g.lineClear(x - 3, z, x + 3, z, 0, MOVE), 'cannot walk across water');
  assert.ok(g.lineClear(x - 3, z, x + 3, z, 0, SIGHT), 'can see/attack across water');
  assert.ok(g.lineClear(x - 3, z - 1.4, x + 3, z - 1.4, 0.3, MOVE), 'passes with clearance');
  // The cell's north edge is 0.5 north of its centre. A line 0.7 north of centre is 0.2 clear of
  // the edge: fine for a point, but a body of radius 0.3 reaches into the cell.
  assert.ok(g.lineClear(x - 3, z - 0.7, x + 3, z - 0.7, 0, MOVE), 'a point passes');
  assert.ok(!g.lineClear(x - 3, z - 0.7, x + 3, z - 0.7, 0.3, MOVE), 'a fat body clips the cell edge');
});

test('resolveCircle pushes a body out of a cell and lets it slide along a wall', () => {
  const g = new Grid(10, 10);
  g.block(5, 5, MOVE); // cell spans world x 0..1, z 0..1 (width 10 => origin -5)
  const body = { x: -0.1, z: 0.5, radius: 0.4 }; // overlapping the west face
  resolveCircle(g, body);
  close(body.x, -0.4);
  close(body.z, 0.5, 1e-9); // only pushed along the normal: sliding is preserved

  const inside = { x: 0.5, z: 0.5, radius: 0.4 }; // centre inside the cell
  resolveCircle(g, inside);
  assert.ok(!g.blockedAt(inside.x, inside.z), 'ends outside the cell');
});

test('resolveCircle leaves free bodies alone', () => {
  const g = new Grid(10, 10);
  g.block(5, 5, MOVE);
  const body = { x: -3, z: -3, radius: 0.45 };
  resolveCircle(g, body);
  assert.deepEqual(body, { x: -3, z: -3, radius: 0.45 });
});

test('findPath goes around a wall through the gap, and reports unreachable goals', () => {
  const g = new Grid(10, 10);
  for (let iz = 0; iz < 10; iz++) if (iz !== 7) g.block(5, iz, MOVE | SIGHT); // wall with one gap at iz=7
  const start = { x: g.centerX(1), z: g.centerZ(1) };
  const goal = { x: g.centerX(8), z: g.centerZ(1) };
  const path = findPath(g, start.x, start.z, goal.x, goal.z);
  assert.ok(path, 'path exists');
  assert.ok(path.some((p) => g.cellX(p.x) === 5 && g.cellZ(p.z) === 7), 'passes through the gap');
  assert.deepEqual(path.at(-1), { x: goal.x, z: goal.z });
  for (const p of path) assert.ok(!g.blockedForPlanning(g.cellX(p.x), g.cellZ(p.z)), 'never steps on a blocked cell');

  g.block(5, 7, MOVE | SIGHT); // close the gap
  assert.equal(findPath(g, start.x, start.z, goal.x, goal.z), null);
});

test('findPath never cuts a corner diagonally', () => {
  const g = new Grid(6, 6);
  g.block(2, 3, MOVE);
  g.block(3, 2, MOVE); // diagonal gap between (2,2)->(3,3)
  const path = findPath(g, g.centerX(2), g.centerZ(2), g.centerX(3), g.centerZ(3));
  assert.ok(path.length > 1, 'must go around, not squeeze through the diagonal');
});

test('findPath treats doors as passable (they open on approach)', () => {
  const g = new Grid(10, 10);
  for (let iz = 0; iz < 10; iz++) g.block(5, iz, MOVE | SIGHT);
  g.clear(5, 4);
  g.addDoor(5, 4);
  assert.ok(findPath(g, g.centerX(1), g.centerZ(4), g.centerX(8), g.centerZ(4)));
});

test('building geometry: perimeter walls, interior, one door cell on the chosen side', () => {
  const b = { ix: 2, iz: 3, w: 5, d: 4, door: { side: 'W', index: 2 } };
  assert.deepEqual(doorCell(b), [2, 5]);
  const { walls, interior, door } = buildingCells(b);
  assert.equal(interior.length, 3 * 2);
  assert.equal(walls.length, 5 * 4 - 3 * 2 - 1); // perimeter minus the door cell
  assert.ok(!walls.some(([x, z]) => x === door[0] && z === door[1]));
  assert.deepEqual(doorCell({ ...b, door: { side: 'S', index: 1 } }), [3, 6]);
  assert.throws(() => doorCell({ ...b, door: { side: 'X', index: 1 } }), /Unknown door side/);
});

test('buildLevelGrid: streams block walking, bridges clear it, buildings wall in an interior with a door', () => {
  const level = {
    arena: { width: 20, depth: 12 },
    scenery: {
      streams: [{ ix: 0, iz: 5, w: 20, d: 2 }],
      bridges: [{ ix: 8, iz: 5, w: 2, d: 2 }],
      trees: [[3, 2]],
      rocks: [[15, 2]],
      // Built one row south of the stream so the cell in front of the north door is dry land.
      buildings: [{ ix: 12, iz: 8, w: 5, d: 4, door: { side: 'N', index: 2 } }],
    },
  };
  const g = buildLevelGrid(level);
  assert.ok(g.blocked(2, 5) && g.blocked(18, 6), 'stream');
  assert.ok(!g.blocked(8, 5) && !g.blocked(9, 6), 'bridge');
  assert.ok(g.blocked(3, 2) && g.blocked(15, 2), 'tree and rock');
  assert.ok(g.blocked(12, 9, SIGHT), 'building wall');
  assert.ok(!g.blocked(14, 9), 'interior is open');
  assert.ok(g.isDoor(14, 8) && g.blocked(14, 8), 'closed door in the north wall');
  assert.ok(!g.blocked(2, 5, SIGHT), 'water does not block sight');
  const path = findPath(g, g.centerX(1), g.centerZ(1), g.centerX(14), g.centerZ(9));
  assert.ok(path, 'reachable across the bridge and through the door');
  assert.ok(path.some((p) => g.cellX(p.x) === 14 && g.cellZ(p.z) === 8), 'the route goes through the door cell');

  // And the earlier mistake, as a regression: a door facing straight into water is unreachable.
  const walledOff = buildLevelGrid({ ...level, scenery: { ...level.scenery, buildings: [{ ix: 12, iz: 7, w: 5, d: 4, door: { side: 'N', index: 2 } }] } });
  assert.equal(findPath(walledOff, walledOff.centerX(1), walledOff.centerZ(1), walledOff.centerX(14), walledOff.centerZ(9)), null);
});

test('scatterFlowers is deterministic, stays on free cells, and respects the count', () => {
  const g = buildLevelGrid({
    arena: { width: 20, depth: 12 },
    scenery: { streams: [{ ix: 0, iz: 5, w: 20, d: 2 }], trees: [[3, 2]] },
  });
  const a = scatterFlowers(g, { count: 25, seed: 9 });
  const b = scatterFlowers(g, { count: 25, seed: 9 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 25);
  for (const f of a) assert.ok(!g.blockedAt(f.x, f.z, MOVE), `flower at ${f.x},${f.z} sits on a blocked cell`);
  assert.notDeepEqual(a, scatterFlowers(g, { count: 25, seed: 10 }));
});
