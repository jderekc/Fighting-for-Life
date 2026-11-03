import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inMeleeArc } from '../src/logic/combat.js';
import { Health } from '../src/logic/health.js';
import { applyDeadzone, mergeMove } from '../src/logic/inputMap.js';
import { angleDiff, angleTo, clampLength1 } from '../src/logic/math.js';
import { mulberry32 } from '../src/logic/rng.js';
import { nearestTarget } from '../src/logic/targeting.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('Health: damage and heal clamp and report what was applied', () => {
  const h = new Health(100);
  assert.equal(h.damage(30), 30);
  assert.equal(h.current, 70);
  assert.equal(h.heal(50), 30); // only 30 missing
  assert.equal(h.current, 100);
  assert.equal(h.damage(500), 100);
  assert.ok(h.isDead);
  assert.equal(h.damage(-5), 0); // negative damage is ignored
  assert.equal(h.heal(-5), 0);
});

test('Health: color bands switch at 50% and 25%', () => {
  const h = new Health(100);
  assert.equal(h.band, 'green');
  h.damage(50);
  assert.equal(h.band, 'yellow'); // exactly 50% is not above half
  h.damage(25);
  assert.equal(h.band, 'red'); // exactly 25% is not above a quarter
  assert.throws(() => new Health(0), RangeError);
});

test('angleDiff takes the short way around', () => {
  close(angleDiff(0, Math.PI / 2), Math.PI / 2);
  close(angleDiff(Math.PI * 0.9, -Math.PI * 0.9), Math.PI * 0.2);
  close(angleDiff(0.1, 0.1 + Math.PI * 2), 0);
});

test('angleTo matches the forward = (sin, cos) convention', () => {
  close(angleTo(0, 0, 0, 1), 0); // +z is yaw 0
  close(angleTo(0, 0, 1, 0), Math.PI / 2); // +x is yaw 90deg
  close(angleTo(0, 0, 0, -1), Math.PI);
});

test('clampLength1 fixes diagonal speed but keeps small analog values', () => {
  const [dx, dz] = clampLength1(1, 1);
  close(Math.hypot(dx, dz), 1);
  assert.deepEqual(clampLength1(0.3, 0.2), [0.3, 0.2]);
});

test('nearestTarget picks the closest living target within range', () => {
  const origin = { x: 0, z: 0 };
  const far = { x: 5, z: 0 };
  const near = { x: 2, z: 0 };
  const deadNearest = { x: 1, z: 0, dead: true };
  assert.equal(nearestTarget(origin, [far, near, deadNearest]), near);
  assert.equal(nearestTarget(origin, [far], 3), null);
  assert.equal(nearestTarget(origin, []), null);
});

test('inMeleeArc: range is edge-to-edge and the arc is respected', () => {
  const attacker = { x: 0, z: 0 };
  const facing = 0; // toward +z
  const target = (x, z) => ({ x, z, radius: 0.5 });
  assert.ok(inMeleeArc(attacker, facing, target(0, 2.4), 2, Math.PI / 2)); // 2.4 - 0.5 <= 2
  assert.ok(!inMeleeArc(attacker, facing, target(0, 3), 2, Math.PI / 2)); // out of reach
  assert.ok(!inMeleeArc(attacker, facing, target(2, 0), 2, Math.PI / 2)); // 90deg off, arc is 45deg each side
  assert.ok(inMeleeArc(attacker, facing, target(0.2, 0.1), 2, Math.PI / 4)); // overlapping always hits

  // The attacker's own radius extends reach too (edge-to-edge, both bodies).
  const fat = { x: 0, z: 0, radius: 0.4 };
  assert.ok(inMeleeArc(fat, facing, target(0, 2.85), 2, Math.PI / 2)); // 2.85 - 0.5 - 0.4 <= 2
  assert.ok(!inMeleeArc(fat, facing, target(0, 2.95), 2, Math.PI / 2));
});

test('applyDeadzone ignores drift and reaches full tilt', () => {
  assert.deepEqual(applyDeadzone(0.1, 0.1), [0, 0]);
  const [x, y] = applyDeadzone(1, 0);
  close(x, 1);
  close(y, 0);
});

test('mergeMove: up is -z, opposite keys cancel, diagonals are normalized', () => {
  const noStick = { x: 0, y: 0 };
  assert.deepEqual(mergeMove({ up: true }, noStick), [0, -1]);
  assert.deepEqual(mergeMove({ left: true, right: true }, noStick), [0, 0]);
  const [x, z] = mergeMove({ up: true, right: true }, noStick);
  close(Math.hypot(x, z), 1);
  assert.ok(x > 0 && z < 0);
});

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

// --- A* optimality against brute force --------------------------------------------------------
import { Grid, MOVE as MOVE_FLAG } from '../src/logic/grid.js';
import { findPath } from '../src/logic/pathfind.js';
import { mulberry32 as rng32 } from '../src/logic/rng.js';

function dijkstraLength(grid, from, to) {
  const dist = new Map([[`${from[0]},${from[1]}`, 0]]);
  const todo = [[0, from[0], from[1]]];
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (todo.length) {
    todo.sort((a, b) => a[0] - b[0]);
    const [d, x, z] = todo.shift();
    if (d > (dist.get(`${x},${z}`) ?? Infinity)) continue;
    if (x === to[0] && z === to[1]) return d;
    for (const [dx, dz, c] of dirs) {
      const nx = x + dx;
      const nz = z + dz;
      if (grid.blockedForPlanning(nx, nz)) continue;
      if (dx && dz && (grid.blockedForPlanning(x + dx, z) || grid.blockedForPlanning(x, z + dz))) continue;
      if (d + c < (dist.get(`${nx},${nz}`) ?? Infinity)) {
        dist.set(`${nx},${nz}`, d + c);
        todo.push([d + c, nx, nz]);
      }
    }
  }
  return null;
}

test('A* (binary heap) finds shortest paths: matches brute-force Dijkstra on random grids', () => {
  const rnd = rng32(2024);
  let checked = 0;
  for (let n = 0; n < 2500; n++) {
    const w = 10 + Math.floor(rnd() * 14);
    const d = 10 + Math.floor(rnd() * 14);
    const grid = new Grid(w, d);
    for (let i = 0; i < w * d * 0.3; i++) grid.block(Math.floor(rnd() * w), Math.floor(rnd() * d), MOVE_FLAG);
    const a = [Math.floor(rnd() * w), Math.floor(rnd() * d)];
    const b = [Math.floor(rnd() * w), Math.floor(rnd() * d)];
    if (grid.blockedForPlanning(...a) || grid.blockedForPlanning(...b) || (a[0] === b[0] && a[1] === b[1])) continue;
    const want = dijkstraLength(grid, a, b);
    const path = findPath(grid, grid.centerX(a[0]), grid.centerZ(a[1]), grid.centerX(b[0]), grid.centerZ(b[1]));
    if (want === null) {
      assert.equal(path, null);
      continue;
    }
    assert.ok(path, 'a path exists');
    // Path length in cells (the last waypoint is the exact goal, which equals the cell centre here).
    let got = 0;
    let prev = [grid.centerX(a[0]), grid.centerZ(a[1])];
    for (const p of path) {
      got += Math.hypot(p.x - prev[0], p.z - prev[1]);
      prev = [p.x, p.z];
    }
    assert.ok(Math.abs(got - want) < 1e-3, `grid ${n}: got ${got.toFixed(3)}, optimal ${want.toFixed(3)}`);
    checked++;
  }
  assert.ok(checked > 1000, `checked ${checked} random grids`);
});
