import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { ENEMIES } from '../src/data/enemies.js';
import { MEADOW_26X18 as meadow } from './fixtures.js';
import { LEVELS, validateLevel } from '../src/data/levels.js';
import { WEAPONS, getWeapon } from '../src/data/weapons.js';
import { LEDGE_DROP, NO_SCENERY, STEP_HEIGHT, terrainClass } from '../src/logic/levelGrid.js';
import { dist } from '../src/logic/math.js';
import { World } from '../src/sim/World.js';
import { BEHAVIOR_NAMES } from '../src/sim/weaponBehaviors.js';

const DT = 1 / 60;
const IDLE = { moveX: 0, moveZ: 0, attack: false };
const level = LEVELS[0];
// Geometry-sensitive tests run on an empty field so they don't depend on where level 1 puts its trees and water.
const bare = { ...level, scenery: NO_SCENERY };

/** Walks toward the nearest enemy and swings constantly. */
/** A sensible player walks around a sleeping rock instead of into it: bend the heading away from rocks that are ahead. */
function avoidRocks(world, dir) {
  const h = world.hero;
  let { x, z } = dir;
  for (const r of world.activeEnemies()) {
    if (!r.def.optional) continue;
    const dx = r.x - h.x;
    const dz = r.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2 || d < 1e-6) continue;
    const ahead = (x * dx + z * dz) / d; // 1 = straight at it
    if (ahead < 0.3) continue;
    let px = -dz / d;
    let pz = dx / d;
    if (x * px + z * pz < 0) [px, pz] = [-px, -pz]; // slip past on the side we already lean toward
    x += px * ahead * 1.5;
    z += pz * ahead * 1.5;
  }
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

function botInput(world) {
  const h = world.hero;
  // After the last enemy: fetch the key, then walk through the gate.
  const goal = world.key ?? (world.objective === 'gate' || world.objective === 'shop' ? world.gate : null);
  if (goal) {
    const dir = avoidRocks(world, world.nav.steer(h, goal, DT));
    return { moveX: dir.x, moveZ: dir.z, attack: false };
  }
  let best = null;
  let bestD = Infinity;
  for (const e of world.activeEnemies()) {
    if (e.def.optional) continue; // this bot skips the sleeping rocks (see the economy tests for one that fights them)
    const d = dist(h.x, h.z, e.x, e.z);
    if (d < bestD) [best, bestD] = [e, d];
  }
  if (!best) {
    // Waiting for the next wave: do not idle against a sleeping rock (it hurts more every hit).
    const rock = world.activeEnemies().find((e) => e.def.optional && dist(h.x, h.z, e.x, e.z) < 2.5);
    if (rock) {
      const d = dist(h.x, h.z, rock.x, rock.z) || 1;
      return { moveX: (h.x - rock.x) / d, moveZ: (h.z - rock.z) / d, attack: false };
    }
    return { moveX: 0, moveZ: 0, attack: false };
  }
  const reach = world.weapon.range * 0.6 + h.radius + best.radius;
  const approach = bestD > reach && bestD > 1e-6;
  // Walk around water/walls the same way enemies do, instead of straight into them.
  const dir = approach ? avoidRocks(world, world.nav.steer(h, best, DT)) : { x: 0, z: 0 };
  return { moveX: dir.x, moveZ: dir.z, attack: true };
}

function run(world, inputFn, maxSeconds) {
  const steps = Math.round(maxSeconds / DT);
  for (let i = 0; i < steps && world.state === 'playing'; i++) world.step(DT, inputFn(world));
  return world;
}

test('data: every level validates, every weapon has a known behavior and positive stats', () => {
  for (const l of LEVELS) assert.deepEqual(validateLevel(l), [], `level ${l.id}`);
  for (const w of Object.values(WEAPONS)) {
    assert.ok(BEHAVIOR_NAMES.includes(w.behavior), `${w.id} behavior`);
    for (const key of ['damage', 'range', 'cooldown', 'swingTime']) assert.ok(w[key] > 0, `${w.id}.${key}`);
  }
  for (const e of Object.values(ENEMIES)) {
    // A sleeper never chases or winds up: it only needs health, contact damage and a ramp.
    const keys = e.behavior === 'sleeper' ? ['maxHealth', 'damage', 'ramp', 'touchMargin', 'resetAfter'] : ['maxHealth', 'speed', 'damage', 'windup', 'cooldown'];
    for (const key of keys) assert.ok(e[key] > 0, `${e.id}.${key}`);
  }
  assert.throws(() => getWeapon('nope'), /Unknown weapon/);
});

test('validateLevel reports problems', () => {
  const bad = { ...bare, enemies: [{ type: 'ghost', x: 999, z: 0, delay: -1 }], appleSpots: [] };
  const problems = validateLevel(bad);
  assert.ok(problems.some((p) => p.includes('unknown type')));
  assert.ok(problems.some((p) => p.includes('outside the arena')));
  assert.ok(problems.some((p) => p.includes('delay')));
});

test('hero moves screen-relative and stays inside the arena', () => {
  const w = new World(level, 'sword');
  const z0 = w.hero.z;
  w.step(DT, { moveX: 0, moveZ: -1, attack: false });
  assert.ok(w.hero.z < z0, 'up moves toward -z');
  for (let i = 0; i < 600; i++) w.step(DT, { moveX: 1, moveZ: 1, attack: false });
  assert.ok(Math.abs(w.hero.x) <= w.bounds.halfW + 1e-9);
  assert.ok(Math.abs(w.hero.z) <= w.bounds.halfD + 1e-9);
});

test('non-finite input never corrupts the hero position', () => {
  const w = new World(level, 'sword');
  w.step(DT, { moveX: NaN, moveZ: Infinity, attack: false });
  w.step(DT, { moveX: undefined, moveZ: -0.5, attack: false });
  assert.ok(Number.isFinite(w.hero.x) && Number.isFinite(w.hero.z));
});

test('enemies are pending until their delay, then spawn with an event', () => {
  const w = new World(level, 'sword');
  const awake = () => w.activeEnemies().filter((e) => !e.def.optional); // the sleeping rock is there from the start
  assert.equal(awake().length, 0);
  run(w, () => IDLE, 1.0);
  assert.equal(awake().length, 0);
  run(w, () => IDLE, 0.6);
  assert.equal(awake().length, 2);
  assert.equal(w.drainEvents().filter((e) => e.type === 'enemySpawned' && !w.enemies.find((x) => x.id === e.id).def.optional).length, 2);
  assert.equal(w.drainEvents().length, 0, 'drain empties the queue');
});

test('sword hits an enemy in front, applies damage and knockback, and ignores one behind', () => {
  const lvl = {
    ...bare,
    heroStart: { x: 0, z: 5 },
    enemies: [
      { type: 'grunt', x: 0, z: 3.0, delay: 0 }, // in front? hero starts at z=5 facing -z, so this is ahead
      { type: 'grunt', x: 0, z: 7.5, delay: 0 }, // behind the hero
    ],
  };
  const w = new World(lvl, 'sword');
  w.step(DT, IDLE); // spawn
  const [front, behind] = w.enemies;
  front.z = 3.6;
  behind.z = 6.4;
  w.step(DT, { ...IDLE, attack: true });
  assert.equal(front.health.current, front.health.max - WEAPONS.sword.damage);
  assert.equal(behind.health.current, behind.health.max);
  assert.ok(front.vz < 0, 'front enemy is knocked away from the hero (toward -z)');
});

test('sword reach is edge-to-edge: counts BOTH the hero radius and the enemy radius', () => {
  const { range } = WEAPONS.sword;
  const reach = range + CONFIG.hero.radius + ENEMIES.grunt.radius; // max centre distance that still hits
  const hitAt = (centreDistance) => {
    const lvl = { ...bare, enemies: [{ type: 'grunt', x: 0, z: 0, delay: 0 }] };
    const w = new World(lvl, 'sword');
    w.step(DT, IDLE); // spawn the enemy
    const e = w.enemies[0];
    e.state = 'recover'; // freeze it so it does not walk during the swing
    e.timer = 10;
    w.hero.x = 0;
    w.hero.z = 0;
    w.hero.facing = 0;
    e.x = 0;
    e.z = centreDistance; // straight ahead of the hero (facing = 0 is +z)
    w.step(DT, { ...IDLE, attack: true });
    return e.health.current < e.health.max;
  };
  assert.ok(hitAt(reach - 0.05), `should hit just inside reach (${reach.toFixed(2)})`);
  assert.ok(!hitAt(reach + 0.05), 'should miss just outside reach');
});

test('attack respects its cooldown', () => {
  const w = new World(level, 'sword');
  let swings = 0;
  for (let i = 0; i < 120; i++) {
    w.step(DT, { ...IDLE, attack: true });
    swings += w.drainEvents().filter((e) => e.type === 'heroAttack').length;
  }
  // 2 seconds at a 0.45s cooldown: swing at t=0, then roughly every 0.45s => 5 swings
  assert.ok(swings >= 4 && swings <= 5, `swings=${swings}`);
});

test('enemy telegraphs, then damages the hero; hero gets a grace period', () => {
  const lvl = { ...bare, enemies: [{ type: 'grunt', x: 0, z: 4.0, delay: 0 }] };
  const w = new World(lvl, 'sword');
  const def = ENEMIES.grunt;
  const events = [];
  for (let i = 0; i < 90; i++) {
    w.step(DT, IDLE);
    events.push(...w.drainEvents());
  }
  assert.ok(events.some((e) => e.type === 'enemyWindup'), 'windup telegraph happened');
  const hurts = events.filter((e) => e.type === 'heroHurt');
  assert.ok(hurts.length >= 1);
  assert.equal(hurts[0].amount, def.damage);
  assert.equal(w.hero.health.current, w.hero.health.max - def.damage * hurts.length);
});

test('hero grace period: hits during invulnerability are ignored, then allowed again', () => {
  const w = new World(level, 'sword');
  const grace = CONFIG.hero.invulnAfterHit;
  assert.equal(w.damageHero(10, null), true);
  assert.equal(w.damageHero(10, null), false, 'second hit inside the grace window is ignored');
  assert.equal(w.hero.health.current, 90);
  for (let t = 0; t < grace + 0.05; t += DT) w.step(DT, IDLE);
  assert.equal(w.damageHero(10, null), true, 'allowed again once the grace period ends');
  assert.equal(w.hero.health.current, 80);
});

test('simulation works at the real in-game step (1/30) as well as 1/60', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    const w = new World(level, 'sword', { seed: 3 });
    for (let i = 0; i < Math.round(120 / dt) && w.state === 'playing'; i++) w.step(dt, botInput(w));
    assert.equal(w.state, 'won', `dt=${dt.toFixed(4)} state=${w.state}`);
  }
  // Windup timing must be time-based, not frame-based: ~0.45s to land the first hit at either step.
  const firstHitTime = (dt) => {
    const lvl = { ...bare, enemies: [{ type: 'grunt', x: 0, z: 4.0, delay: 0 }] };
    const w = new World(lvl, 'sword');
    for (let i = 0; i < 400 && w.hero.health.current === w.hero.health.max; i++) w.step(dt, IDLE);
    return w.time;
  };
  assert.ok(Math.abs(firstHitTime(1 / 30) - firstHitTime(1 / 60)) < 0.1);
});

test('hitting an enemy during windup staggers it and cancels the attack', () => {
  const lvl = { ...bare, heroStart: { x: 0, z: 5 }, enemies: [{ type: 'grunt', x: 0, z: 4.0, delay: 0 }] };
  const w = new World(lvl, 'sword');
  const e = w.enemies[0];
  for (let i = 0; i < 5 && e.state !== 'windup'; i++) w.step(DT, IDLE);
  assert.equal(e.state, 'windup');
  w.damageEnemy(e, 1, 0);
  assert.equal(e.state, 'recover');
  assert.equal(e.timer, ENEMIES.grunt.stagger);
});

test('apples: heal a fraction of max, stay on the ground at full health, respect caps', () => {
  const lvl = { ...bare, enemies: [{ type: 'grunt', x: -12, z: -8, delay: 999 }] };
  const w = new World(lvl, 'sword', { seed: 7 });
  const apple = w.apples.add(w.hero.x, w.hero.z);
  w.step(DT, IDLE);
  assert.equal(w.apples.apples.length, 1, 'full health: apple is left alone');

  w.hero.health.damage(60);
  w.step(DT, IDLE);
  assert.equal(w.apples.apples.length, 0);
  const picked = w.drainEvents().find((e) => e.type === 'applePicked' && e.id === apple.id);
  assert.ok(picked);
  assert.equal(picked.healed, CONFIG.hero.maxHealth * CONFIG.apples.healFraction);
  assert.equal(w.hero.health.current, 40 + 25);

  // Timed spawns stop at maxOnGround.
  const w2 = new World(lvl, 'sword', { seed: 7 });
  run(w2, () => IDLE, 8 + CONFIG.apples.interval * 5);
  assert.ok(w2.apples.apples.length <= CONFIG.apples.maxOnGround);
  assert.ok(w2.apples.apples.length >= 1);
});

test('apples spawn only at the level spots', () => {
  const lvl = { ...bare, enemies: [{ type: 'grunt', x: -12, z: -8, delay: 999 }] };
  const w = new World(lvl, 'sword', { seed: 3 });
  run(w, () => IDLE, 60);
  for (const a of w.apples.apples) {
    assert.ok(lvl.appleSpots.some((s) => s.x === a.x && s.z === a.z));
  }
});

test('a hero who never fights loses', () => {
  const w = run(new World(level, 'sword', { seed: 5 }), () => IDLE, 60);
  assert.equal(w.state, 'lost');
  assert.ok(w.drainEvents().some((e) => e.type === 'heroDown'));
});

test('a hero who fights wins level 1 across many seeds, in well under a minute', () => {
  const results = [];
  for (let seed = 1; seed <= 25; seed++) {
    const w = run(new World(level, 'sword', { seed }), botInput, 120);
    results.push({ seed, state: w.state, hp: w.hero.health.current, time: w.time });
  }
  const wins = results.filter((r) => r.state === 'won');
  assert.equal(wins.length, results.length, `non-wins: ${JSON.stringify(results.filter((r) => r.state !== 'won'))}`);
  const avgHp = wins.reduce((s, r) => s + r.hp, 0) / wins.length;
  const avgTime = wins.reduce((s, r) => s + r.time, 0) / wins.length;
  console.log(`  bot x${wins.length}: avg HP left ${avgHp.toFixed(1)}/100, avg time ${avgTime.toFixed(1)}s`);
  assert.ok(avgTime < 60, 'level 1 should take well under a minute for a competent player');
});

test('the world is deterministic for a given seed', () => {
  const a = run(new World(level, 'sword', { seed: 11 }), botInput, 120);
  const b = run(new World(level, 'sword', { seed: 11 }), botInput, 120);
  assert.equal(a.time, b.time);
  assert.equal(a.hero.health.current, b.hero.health.current);
});

test('step does nothing once the fight is over', () => {
  const w = run(new World(level, 'sword', { seed: 5 }), () => IDLE, 60);
  const t = w.time;
  w.step(DT, IDLE);
  assert.equal(w.time, t);
});

// ---------------------------------------------------------------------------------------------
// Scenery: obstacles, bridges, doors, line of sight
// ---------------------------------------------------------------------------------------------

// Level 1 geometry used below (26x18 arena, x = ix - 12.5, z = iz - 8.5):
//   stream rows iz 8-9  => z in [-1, 1];   bridges (cells 6-7 and 18-19) span x in [-7, -5] and [5, 7]
//   cottage door (south wall) cell (22, 15) => centre (9.5, 6.5); interior x in [8.0, 11.0], z in [3.0, 6.0]
const idleLevel = { ...meadow, enemies: [{ type: 'grunt', x: -12, z: -8, delay: 999 }] };

test('the hero cannot walk into the stream, and stops at its bank', () => {
  const w = new World(idleLevel, 'sword');
  w.hero.x = 0.5;
  w.hero.z = 5;
  for (let i = 0; i < 600; i++) {
    w.step(DT, { moveX: 0, moveZ: -1, attack: false });
    assert.ok(!w.grid.blockedAt(w.hero.x, w.hero.z), 'hero is never inside a blocked cell');
  }
  assert.ok(w.hero.z >= 1 + w.hero.radius - 1e-6, `stopped at the south bank, z=${w.hero.z}`);
});

test('the hero crosses the stream on a bridge, and cannot cut through a house wall', () => {
  const w = new World(idleLevel, 'sword');
  w.hero.x = -5.5; // middle of the west bridge
  w.hero.z = 5;
  for (let i = 0; i < 240 && w.hero.z > -5; i++) w.step(DT, { moveX: 0, moveZ: -1, attack: false });
  assert.ok(w.hero.z < -3, `crossed to the north bank, z=${w.hero.z}`);

  const w2 = new World(idleLevel, 'sword');
  w2.hero.x = 13; // east of the cottage... clamp keeps us inside; walk west into its east wall instead
  w2.hero.x = 12.4;
  w2.hero.z = 4.5;
  for (let i = 0; i < 120; i++) w2.step(DT, { moveX: -1, moveZ: 0, attack: false });
  assert.ok(w2.hero.x >= 12 + w2.hero.radius - 1e-6, `blocked by the east wall, x=${w2.hero.x}`);
});

test('doors open on approach, stay open while someone is in the doorway, and close afterwards', () => {
  const w = new World(idleLevel, 'sword');
  const door = w.doors[0];
  assert.deepEqual([door.x, door.z], [9.5, 6.5]);
  w.hero.x = 9.5; // 2.3 south of the door: outside the 1.8 open radius
  w.hero.z = 8.8;
  w.step(DT, IDLE);
  assert.equal(door.open, false);
  assert.ok(w.grid.blockedAt(door.x, door.z), 'closed door blocks walking');

  w.hero.z = 7.9; // 1.4 away
  w.step(DT, IDLE);
  assert.equal(door.open, true);
  assert.ok(!w.grid.blockedAt(door.x, door.z), 'open door lets you through');
  assert.ok(w.drainEvents().some((e) => e.type === 'doorOpened'));

  // Standing in the doorway keeps it open even past the close delay.
  w.hero.z = door.z;
  for (let i = 0; i < 180; i++) w.step(DT, IDLE);
  assert.equal(door.open, true, 'does not close on the hero');

  // Walk away: it closes after the delay.
  w.hero.x = 0;
  w.hero.z = 5;
  for (let i = 0; i < Math.round((CONFIG.doors.closeDelay + 0.3) / DT); i++) w.step(DT, IDLE);
  assert.equal(door.open, false);
  assert.ok(w.drainEvents().some((e) => e.type === 'doorClosed'));
});

test('enemies on the far bank reach the hero by crossing a bridge, never through the water', () => {
  const lvl = { ...meadow, enemies: [{ type: 'grunt', x: -8, z: -5, delay: 0 }] };
  const w = new World(lvl, 'sword');
  w.hero.x = -0.5;
  w.hero.z = 5.5;
  const crossingXs = [];
  let hurt = false;
  for (let i = 0; i < 60 * 25 && !hurt; i++) {
    w.step(DT, IDLE);
    const e = w.enemies[0];
    assert.ok(!w.grid.blockedAt(e.x, e.z), `enemy stayed out of obstacles at t=${w.time.toFixed(2)} (${e.x.toFixed(2)}, ${e.z.toFixed(2)})`);
    if (e.z > -1 && e.z < 1) crossingXs.push(e.x);
    hurt = w.hero.health.current < w.hero.health.max;
  }
  assert.ok(hurt, 'the enemy found its way to the hero');
  assert.ok(crossingXs.length > 0, 'it crossed the stream');
  const onBridge = (x) => (x >= -7 && x <= -5) || (x >= 5 && x <= 7);
  assert.ok(crossingXs.every(onBridge), `crossed only on a bridge, saw x in [${Math.min(...crossingXs).toFixed(2)}, ${Math.max(...crossingXs).toFixed(2)}]`);
});

test('attacks do not pass through walls, but do pass over water', () => {
  // Wall: hero inside the cottage swinging east at an enemy just outside the east wall.
  const wall = new World({ ...meadow, enemies: [{ type: 'grunt', x: 12.7, z: 4.5, delay: 0 }] }, 'sword');
  wall.step(DT, IDLE);
  const outside = wall.enemies[0];
  outside.state = 'recover';
  outside.timer = 10;
  wall.hero.x = 10.5;
  wall.hero.z = 4.5;
  wall.hero.facing = Math.PI / 2; // east
  const reachable = dist(wall.hero.x, wall.hero.z, outside.x, outside.z) - wall.hero.radius - outside.radius <= WEAPONS.sword.range;
  assert.ok(reachable, 'test setup: the enemy is within sword reach, only the wall is in the way');
  wall.step(DT, { ...IDLE, attack: true });
  assert.equal(outside.health.current, outside.health.max, 'the wall blocked the swing');

  // Water: a narrow (1 cell) stream does not block a swing across it.
  const narrow = {
    ...bare,
    scenery: { ...NO_SCENERY, streams: [{ ix: 0, iz: 8, w: 26, d: 1 }] }, // z in [-1, 0]
    enemies: [{ type: 'grunt', x: 0.5, z: -1.4, delay: 0 }],
  };
  const w = new World(narrow, 'sword');
  w.step(DT, IDLE);
  const across = w.enemies[0];
  across.state = 'recover';
  across.timer = 10;
  w.hero.x = 0.5;
  w.hero.z = 0.4; // on the south bank, 1.8 from the enemy centre
  w.hero.facing = Math.PI;
  w.step(DT, { ...IDLE, attack: true });
  assert.equal(across.health.current, across.health.max - WEAPONS.sword.damage, 'hit across the water');
});

test('the apple inside the cottage can really be reached by walking through the door', () => {
  const w = new World(idleLevel, 'sword', { seed: 2 });
  w.hero.health.damage(60); // apples are only picked up when hurt
  const spot = meadow.appleSpots.find((s) => s.x === 9.5 && s.z === 4.5);
  const apple = w.apples.add(spot.x, spot.z);
  const events = [];
  for (let i = 0; i < 60 * 20; i++) {
    const dir = w.nav.steer(w.hero, spot, DT);
    w.step(DT, { moveX: dir.x, moveZ: dir.z, attack: false });
    events.push(...w.drainEvents());
    if (events.some((e) => e.type === 'applePicked' && e.id === apple.id)) break;
  }
  assert.ok(events.some((e) => e.type === 'doorOpened'), 'the door opened for us');
  assert.ok(events.some((e) => e.type === 'applePicked' && e.id === apple.id), 'picked up the apple inside');
  assert.ok(w.time < 15, `took ${w.time.toFixed(1)}s`);
});

test('validateLevel catches obstacle mistakes', () => {
  const bridgeless = { ...meadow, scenery: { ...meadow.scenery, bridges: [] } };
  assert.ok(validateLevel(bridgeless).some((p) => p.includes('cannot reach')), 'no bridges: north bank is cut off');

  const inWater = { ...meadow, enemies: [{ type: 'grunt', x: 0, z: 0, delay: 0 }] };
  assert.ok(validateLevel(inWater).some((p) => p.includes('spawns on an obstacle')));

  const doorIntoWater = {
    ...meadow,
    // Rows 10-14: directly south of the stream (rows 8-9), so the cell in front of the north door is water.
    scenery: { ...meadow.scenery, buildings: [{ ix: 20, iz: 10, w: 5, d: 5, door: { side: 'N', index: 2 } }] },
  };
  assert.ok(validateLevel(doorIntoWater).some((p) => p.includes('door opens onto an obstacle')));

  const buildingOnWater = {
    ...meadow,
    scenery: { ...meadow.scenery, buildings: [{ ix: 20, iz: 7, w: 5, d: 5, door: { side: 'W', index: 2 } }] },
  };
  assert.ok(validateLevel(buildingOnWater).some((p) => p.includes('building 0: overlaps')));

  const treeOnBridge = { ...meadow, scenery: { ...meadow.scenery, trees: [...meadow.scenery.trees, [6, 8]] } };
  assert.ok(validateLevel(treeOnBridge).some((p) => p.includes('sits on a bridge')));
  const treeInWater = { ...meadow, scenery: { ...meadow.scenery, trees: [...meadow.scenery.trees, [12, 8]] } };
  assert.ok(validateLevel(treeInWater).some((p) => p.includes('overlaps water')));

  const cornerDoor = {
    ...meadow,
    scenery: { ...meadow.scenery, buildings: [{ ix: 20, iz: 11, w: 5, d: 5, door: { side: 'W', index: 0 } }] },
  };
  assert.ok(validateLevel(cornerDoor).some((p) => p.includes('corner')));
});

test('data: every enemy fits through a 1-cell gap (radius < 0.5), since path planning ignores body size', () => {
  for (const [name, e] of Object.entries(ENEMIES)) assert.ok(e.radius < 0.5, `${name} radius ${e.radius} must be < 0.5`);
});

// ---------------------------------------------------------------------------------------------
// Terrain (level 1), as painted in src/data/levels.js. Cell (ix, iz) => world x = ix - 18 .. , z = iz - 13 ..
//   north-west highland 1.5 with a 3.0 peak; its meadow stairs are cells (6,9),(7,9) => world x [-12,-10], z [-4,-3]
//   cell (4,8) is a ledge: the south rim of the highland, world x [-14,-13], z [-5,-4]
// ---------------------------------------------------------------------------------------------
const terrainLevel = { ...level, enemies: [{ type: 'grunt', x: 0, z: 9, delay: 999 }] };
const walkNorth = (w, steps = 500) => {
  for (let i = 0; i < steps; i++) w.step(DT, { moveX: 0, moveZ: -1, attack: false });
};

test('terrain classes follow from the heights: ledges are cliffs, stairs and mounds are walkable', () => {
  const g = new World(terrainLevel, 'sword').grid;
  assert.equal(terrainClass(g, 4, 8), 'ledge', 'south rim of the highland');
  assert.equal(terrainClass(g, 6, 9), 'step', 'meadow stair: lower on one side, higher on the other');
  assert.equal(terrainClass(g, 6, 8), 'top', 'landing at the top of the stair');
  assert.equal(terrainClass(g, 6, 5), 'step', 'the 2.25 stair to the peak');
  assert.equal(terrainClass(g, 0, 0), 'none');
  assert.equal(terrainClass(g, 7, 20), 'top', 'a low mound is walkable all the way round (no ledge)');
  // The rule itself: no walkable cell may sit LEDGE_DROP or more above a walkable neighbour.
  for (let iz = 0; iz < g.depth; iz++) {
    for (let ix = 0; ix < g.width; ix++) {
      if (g.blockedForPlanning(ix, iz)) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (g.blockedForPlanning(ix + dx, iz + dz)) continue;
        const dh = Math.abs(g.heightAtCell(ix, iz) - g.heightAtCell(ix + dx, iz + dz));
        assert.ok(dh < LEDGE_DROP, `walkable step of ${dh} at ${ix},${iz}`);
      }
    }
  }
});

test('a highland has a stone ledge you cannot walk onto, away from its stairs', () => {
  const w = new World(terrainLevel, 'sword');
  w.hero.x = -13.5;
  w.hero.z = -2;
  walkNorth(w);
  assert.ok(w.hero.z >= -4 + w.hero.radius - 1e-6, `stopped at the ledge, z=${w.hero.z}`);
  assert.equal(w.grid.heightAt(w.hero.x, w.hero.z), 0);
});

test('stairs lead up to the peak, passing every step height on the way', () => {
  const w = new World(terrainLevel, 'sword');
  w.hero.x = -11.5;
  w.hero.z = -2;
  const heights = new Set();
  for (let i = 0; i < 600; i++) {
    w.step(DT, { moveX: 0, moveZ: -1, attack: false });
    heights.add(w.grid.heightAt(w.hero.x, w.hero.z));
  }
  assert.equal(w.grid.heightAt(w.hero.x, w.hero.z), 3, 'standing on the peak');
  for (const h of [0, 0.75, 1.5, 2.25, 3]) assert.ok(heights.has(h), `passed height ${h}`);
});

test('the view lifts a body onto the highest step it touches (no sinking into stairs)', () => {
  const g = new World(terrainLevel, 'sword').grid;
  // The 0.75 stair is cell row 9 (z in [-4, -3)). A centre at z = -2.8 is in the meadow row below it, 0.2 from the stair.
  const z = -2.8;
  assert.equal(g.heightAt(-11.5, z), 0);
  assert.equal(g.maxHeightNear(-11.5, z, 0.3), STEP_HEIGHT, 'feet are raised because the body overlaps the stair');
  assert.equal(g.maxHeightNear(-11.5, z, 0.1), 0, 'a body that does not reach it stays on the ground');
});

test('an enemy on the meadow reaches a hero on the peak by the stairs, and attacks cross a ledge', () => {
  const lvl = { ...level, enemies: [{ type: 'grunt', x: -13.5, z: -2, delay: 0 }] };
  const w = new World(lvl, 'sword');
  w.hero.x = -11.5;
  w.hero.z = -9.5;
  assert.equal(w.grid.heightAt(w.hero.x, w.hero.z), 3);
  let hurt = false;
  for (let i = 0; i < 60 * 30 && !hurt; i++) {
    w.step(DT, IDLE);
    const e = w.enemies[0];
    assert.ok(!w.grid.blockedAt(e.x, e.z), 'enemy never stands inside a ledge');
    hurt = w.hero.health.current < w.hero.health.max;
  }
  assert.ok(hurt, 'the enemy climbed the stairs to reach her');
  assert.ok(w.grid.lineClear(-13.5, -3.5, -13.5, -4.6, 0, 2), 'sight is clear across a ledge');
});

test('validateLevel catches terrain mistakes', () => {
  const withScenery = (patch) => ({ ...level, scenery: { ...level.scenery, ...patch } });
  const sealed = withScenery({ terrain: [{ ix: 20, iz: 20, w: 5, d: 4, h: 2.25 }], trees: [], rocks: [] });
  assert.ok(validateLevel(sealed).some((p) => p.includes('cannot be reached')), 'a plateau with no stairs');
  assert.ok(validateLevel(withScenery({ terrain: [{ ix: 20, iz: 20, w: 5, d: 4, h: 1.0 }] })).some((p) => p.includes('multiple of')));
  assert.ok(validateLevel(withScenery({ terrain: [{ ix: 20, iz: 20, w: 5, d: 4, h: 6 }] })).some((p) => p.includes('multiple of')));
  assert.ok(validateLevel(withScenery({ terrain: [...level.scenery.terrain, { ix: 5, iz: 14, w: 3, d: 3, h: 0.75 }] })).some((p) => p.includes('overlaps water')));
  assert.ok(validateLevel(withScenery({ trees: [...level.scenery.trees, [4, 8]] })).some((p) => p.includes('sits on a ledge')));
  assert.ok(validateLevel(withScenery({ rocks: [...level.scenery.rocks, [6, 9]] })).some((p) => p.includes('sits on a step')));
});

test('validateLevel keeps tree canopies off cottages and cliffs', () => {
  const withTrees = (t) => ({ ...level, scenery: { ...level.scenery, trees: [...level.scenery.trees, t] } });
  assert.ok(validateLevel(withTrees([27, 19])).some((p) => p.includes('poke through a cottage')));
  assert.ok(validateLevel(withTrees([27, 17])).some((p) => p.includes('poke through a cottage')), 'diagonal counts too');
  assert.deepEqual(validateLevel(withTrees([26, 21])), [], 'one empty cell away is fine');
  assert.ok(validateLevel(withTrees([13, 5])).some((p) => p.includes('poke into a cliff')));
  assert.ok(validateLevel(withTrees([1, 5])).some((p) => p.includes('poke into a cliff')));
});

// ---------------------------------------------------------------------------------------------
// Key, gate, and levels of different shapes
// ---------------------------------------------------------------------------------------------

/** Kill every enemy but leave the last one for the caller (spawned, alive). */
function allButLast(w) {
  const alive = w.enemies;
  for (const e of alive.slice(0, -1)) {
    e.state = 'chase';
    w.damageEnemy(e, 9999);
  }
  const last = alive[alive.length - 1];
  last.state = 'chase';
  return last;
}

test('the last enemy drops a key; the gate stays shut without it, opens with it, and walking through wins', () => {
  const w = new World(level, 'sword', { seed: 3 });
  const last = allButLast(w);
  assert.equal(w.objective, 'fight');
  assert.equal(w.key, null, 'no key while enemies remain');
  last.x = -6;
  last.z = 4;
  w.damageEnemy(last, 9999);
  assert.deepEqual([w.key.x, w.key.z], [-6, 4], 'the key drops where the last enemy fell');
  assert.ok(w.drainEvents().some((e) => e.type === 'keyDropped'));
  assert.equal(w.state, 'playing', 'not won yet');
  assert.equal(w.objective, 'key');

  // Standing at the gate with no key: it stays locked.
  const gate = w.gate;
  w.hero.x = gate.x;
  w.hero.z = gate.z + 1;
  for (let i = 0; i < 30; i++) w.step(DT, IDLE);
  assert.equal(gate.open, false, 'locked without the key');
  assert.ok(w.grid.blockedAt(gate.x, gate.z));
  assert.equal(w.state, 'playing');

  // Pick up the key.
  w.hero.x = -6;
  w.hero.z = 4;
  w.step(DT, IDLE);
  assert.equal(w.hasKey, true);
  assert.equal(w.key, null);
  assert.equal(w.objective, 'gate');
  assert.ok(w.drainEvents().some((e) => e.type === 'keyPicked'));

  // Now the gate opens for the hero, and stepping into it clears the level.
  w.hero.x = gate.x;
  w.hero.z = gate.z + 1;
  w.step(DT, IDLE);
  assert.equal(gate.open, true, 'opens for a hero with the key');
  assert.equal(w.state, 'playing', 'near the gate is not through it');
  for (let i = 0; i < 90 && w.state === 'playing'; i++) w.step(DT, { moveX: 0, moveZ: -1, attack: false });
  assert.equal(w.state, 'won');
  assert.ok(w.drainEvents().some((e) => e.type === 'levelCleared'));
});

test('enemies and apples do not open the exit gate', () => {
  const w = new World(level, 'sword');
  const gate = w.gate;
  const e = w.enemies[0];
  e.state = 'recover';
  e.timer = 99;
  e.x = gate.x;
  e.z = gate.z + 0.8;
  w.hero.x = 0;
  w.hero.z = 8;
  for (let i = 0; i < 10; i++) w.step(DT, IDLE);
  assert.equal(gate.open, false);
});

test('a level with no gate is won as soon as the last enemy falls', () => {
  const w = new World({ ...bare, enemies: [{ type: 'grunt', x: 0, z: 0, delay: 0 }] }, 'sword');
  assert.equal(w.gate, null);
  w.step(DT, IDLE);
  w.damageEnemy(w.enemies[0], 9999);
  w.step(DT, IDLE);
  assert.equal(w.state, 'won');
  assert.equal(w.key, null);
});

test('dying with the key on the ground still loses, and a held key is not re-dropped', () => {
  const w = new World(level, 'sword');
  allButLast(w);
  w.damageEnemy(w.enemies[w.enemies.length - 1], 9999);
  assert.ok(w.key);
  w.hero.health.damage(9999);
  w.step(DT, IDLE);
  assert.equal(w.state, 'lost');
});

test('every level can be won by walking: fight, take the key, go through the gate', () => {
  for (const lvl of LEVELS) {
    for (const seed of [1, 2, 3]) {
      const w = run(new World(lvl, 'sword', { seed }), botInput, 180);
      assert.equal(w.state, 'won', `level ${lvl.id} seed ${seed}: state ${w.state}, objective ${w.objective}, t=${w.time.toFixed(1)}`);
    }
  }
});

test('levels may be portrait, landscape or square; the hero stays inside whatever the shape is', () => {
  const portrait = LEVELS.find((l) => l.arena.depth > l.arena.width);
  const landscape = LEVELS.find((l) => l.arena.width > l.arena.depth);
  assert.ok(portrait && landscape, 'the game ships both shapes');
  for (const lvl of [portrait, landscape]) {
    const w = new World({ ...lvl, enemies: [{ type: 'grunt', x: lvl.heroStart.x, z: lvl.heroStart.z + 0.1, delay: 999 }] }, 'sword');
    assert.equal(w.bounds.halfW, lvl.arena.width / 2 - 0.5);
    assert.equal(w.bounds.halfD, lvl.arena.depth / 2 - 0.5);
    for (let i = 0; i < 1500; i++) w.step(DT, { moveX: 1, moveZ: 1, attack: false });
    assert.ok(Math.abs(w.hero.x) <= w.bounds.halfW + 1e-9 && Math.abs(w.hero.z) <= w.bounds.halfD + 1e-9);
  }
});

test('arena size limits: whole numbers from 12 to 128', () => {
  const sized = (width, depth) => ({ ...bare, arena: { width, depth }, heroStart: { x: 0, z: 0 }, enemies: [{ type: 'grunt', x: 2, z: 2, delay: 0 }], appleSpots: [] });
  assert.deepEqual(validateLevel(sized(24, 36)), []);
  assert.deepEqual(validateLevel(sized(128, 128)), []);
  assert.deepEqual(validateLevel(sized(12, 12)), []);
  assert.ok(validateLevel(sized(129, 40))[0].includes('width'));
  assert.ok(validateLevel(sized(40, 200))[0].includes('depth'));
  assert.ok(validateLevel(sized(8, 40))[0].includes('width'));
  assert.ok(validateLevel(sized(30.5, 40))[0].includes('width'));
});

test('the biggest arena (128x128) plans a path across the whole map quickly', () => {
  const big = {
    ...bare,
    arena: { width: 128, depth: 128 },
    heroStart: { x: -60, z: 60 },
    scenery: { ...NO_SCENERY, streams: [{ ix: 0, iz: 60, w: 100, d: 3 }], bridges: [] },
    enemies: [{ type: 'grunt', x: 60, z: -60, delay: 0 }],
    appleSpots: [],
  };
  const w = new World(big, 'sword');
  const t0 = performance.now();
  const dir = w.nav.steer({ x: 60, z: -60, radius: 0.45 }, { x: -60, z: 60 }, DT); // must detour around the stream's end
  const ms = performance.now() - t0;
  assert.ok(Math.hypot(dir.x, dir.z) > 0, 'found a way');
  assert.ok(ms < 250, `planning took ${ms.toFixed(0)} ms`);
});

test('gate placement is validated', () => {
  const withGate = (gate) => ({ ...level, scenery: { ...level.scenery, gate } });
  assert.ok(validateLevel(withGate({ ix: 15, iz: 3, side: 'N' })).some((p) => p.includes('must sit on the N edge')));
  assert.ok(validateLevel(withGate({ ix: 0, iz: 0, side: 'N' })).some((p) => p.includes('outside the arena')), 'a corner has no room for pillars');
  assert.ok(validateLevel(withGate({ ix: 15, iz: 0, side: 'Q' })).some((p) => p.includes('unknown side')));
  const onMound = { ...level, scenery: { ...level.scenery, terrain: [...level.scenery.terrain, { ix: 14, iz: 0, w: 3, d: 3, h: 0.75 }] } };
  assert.ok(validateLevel(onMound).some((p) => p.includes('level ground')), 'a gate cannot stand on raised ground');
});
