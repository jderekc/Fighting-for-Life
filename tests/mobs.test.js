import assert from 'node:assert/strict';
import { test } from 'node:test';
import { World } from '../src/sim/World.js';
import { ENEMIES } from '../src/data/enemies.js';
import { LEVELS, validateLevel } from '../src/data/levels.js';
import { findPath } from '../src/logic/pathfind.js';

const DT = 1 / 60;
const IDLE = { moveX: 0, moveZ: 0, attack: false };
const bare = { ...LEVELS[0], scenery: undefined, enemies: [], appleSpots: [], heroStart: { x: 0.5, z: 0.5 } }; // an empty meadow
// A grunt that never arrives keeps the fight (and the clock) running; a level with only rocks would count as already won.
const WAITING = { type: 'grunt', x: -10.5, z: -10.5, delay: 9999 };
const mk = (enemies, opts = {}) => new World({ ...bare, enemies: [...enemies, WAITING] }, 'sword', { seed: 3, ...opts });
const hurts = (w) => w.drainEvents().filter((e) => e.type === 'heroHurt').map((e) => e.amount);

test('Neelysomnaly: first touch is half a grunt hit, then each hit is 1.15x the last', () => {
  assert.equal(ENEMIES.neelysomnaly.damage, ENEMIES.grunt.damage / 2);
  const w = mk([{ type: 'neelysomnaly', x: 1.5, z: 0.5, delay: 0 }], { startHealth: 100 });
  const taken = [];
  for (let i = 0; i < 60 * 6; i++) {
    w.step(DT, { moveX: 1, moveZ: 0, attack: false }); // lean on it
    taken.push(...hurts(w));
  }
  assert.ok(taken.length >= 4, `hits: ${taken.length}`);
  assert.ok(Math.abs(taken[0] - 5) < 1e-9);
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(taken[i] / taken[i - 1] - 1.15) < 1e-6, `hit ${i}`);
  // After the fourth hit it plateaus: staying never gets worse.
  for (let i = 4; i < taken.length; i++) assert.ok(Math.abs(taken[i] - taken[3]) < 1e-9, `hit ${i} plateau`);
  assert.ok(Math.abs(taken[3] - 5 * 1.15 ** 3) < 1e-9);
});

test('Neelysomnaly: it never moves, is solid, and the ramp starts over after you step away', () => {
  const w = mk([{ type: 'neelysomnaly', x: 1.5, z: 0.5, delay: 0 }], { startHealth: 100 });
  for (let i = 0; i < 60 * 3; i++) w.step(DT, { moveX: 1, moveZ: 0, attack: false });
  const rock = w.enemies[0];
  assert.equal(rock.x, 1.5);
  assert.equal(rock.z, 0.5);
  assert.ok(Math.hypot(w.hero.x - rock.x, w.hero.z - rock.z) >= w.hero.radius + rock.radius - 1e-6, 'the hero is never inside it');
  assert.ok(rock.contactDamage > 5);
  hurts(w);
  for (let i = 0; i < 60 * 2.5; i++) w.step(DT, { moveX: -1, moveZ: 0, attack: false });
  hurts(w); // forget the hits taken on the way out
  w.step(DT, IDLE);
  assert.equal(rock.contactDamage, 5, 'reset');
  assert.equal(hurts(w).length, 0, 'no damage from a distance');
});

test('Neelysomnaly: sword hits do not push it, it has high HP, and it pays coins by the normal damage rule', () => {
  assert.ok(ENEMIES.neelysomnaly.maxHealth >= 4 * ENEMIES.grunt.maxHealth);
  const w = mk([{ type: 'neelysomnaly', x: 1.6, z: 0.5, delay: 0 }], { startHealth: 100 });
  w.hero.x = 0.5;
  const rock = w.enemies[0];
  const coinsFor = (n) => n;
  let swings = 0;
  for (let i = 0; i < 60 * 40 && rock.state !== 'dead' && w.state === 'playing'; i++) {
    w.hero.health.heal?.(999);
    w.step(DT, { moveX: 0, moveZ: 0, attack: true });
    swings++;
    assert.equal(rock.x, 1.6);
  }
  assert.equal(rock.state, 'dead');
  const total = w.coinPiles.reduce((s, p) => s + p.value, 0) + w.coins;
  assert.ok(total >= coinsFor(rock.damageTaken * 0.9 - 1) && total <= rock.damageTaken * 1.1 + 1, `coins ${total} vs damage ${rock.damageTaken}`);
});

test('Neelysomnaly is optional: a level with only grunts is won when the grunts are down, whatever the rock does', () => {
  const w = mk([{ type: 'neelysomnaly', x: 5.5, z: 5.5, delay: 0 }, { type: 'grunt', x: 2.5, z: 0.5, delay: 0 }], { startHealth: 100 });
  w.step(DT, IDLE);
  const before = w.enemiesRemaining; // the grunt and the one that never arrives; the rock is not counted
  assert.equal(before, 2);
  w.damageEnemy(w.enemies.find((e) => e.type === 'grunt' && e.spawnAt === 0), 9999, 0);
  w.step(DT, IDLE);
  assert.equal(w.enemiesRemaining, 1);
  assert.equal(w.enemies.find((e) => e.type === 'neelysomnaly').state, 'sleep');
});

test('Barchernarcher: melee hits much harder than a grunt', () => {
  assert.ok(ENEMIES.barchernarcher.damage >= 2 * ENEMIES.grunt.damage);
  assert.ok(ENEMIES.barchernarcher.maxHealth >= 3 * ENEMIES.grunt.maxHealth);
});

test('Barchernarcher: spark burst reaches ~2 blocks in every direction, hits half the time for grunt damage', () => {
  const nova = ENEMIES.barchernarcher.nova;
  assert.equal(nova.damage, ENEMIES.grunt.damage);
  assert.equal(nova.accuracy, 0.5);
  assert.equal(nova.range, 2);
  let hit = 0;
  const trials = 200;
  for (let s = 0; s < trials; s++) {
    // Hero 1.6 blocks away (edge gap 0.7): beyond melee reach (1.0*1.3 ok? gap .7 < 1) -> use 1.9 edge gap ~1.6 free.
    const w = new World({ ...bare, enemies: [{ type: 'barchernarcher', x: 3.0, z: 0.5, delay: 0 }] }, 'sword', { seed: s, startHealth: 100 });
    w.step(DT, IDLE); // spawns
    w.drainEvents();
    w.enemies[0].x = 3.0;
    w.enemies[0].z = 0.5;
    w.hero.x = 0.5;
    w.hero.z = 0.5; // centre distance 2.5 -> edge gap ~1.6: inside the burst, outside melee
    let fired = false;
    for (let i = 0; i < 60 * 1.2; i++) {
      w.step(DT, IDLE);
      for (const ev of w.drainEvents()) {
        if (ev.type === 'enemyNova') {
          fired = true;
          if (ev.hit) hit++;
        }
      }
      if (fired) break;
    }
    assert.ok(fired, `seed ${s}: a burst happened`);
  }
  assert.ok(hit > trials * 0.35 && hit < trials * 0.65, `hit ${hit}/${trials}`);
});

test('Barchernarcher: no burst when the hero is beyond ~2 blocks', () => {
  const w = new World({ ...bare, enemies: [{ type: 'barchernarcher', x: 0.5, z: 8.5, delay: 0 }] }, 'sword', { seed: 1, startHealth: 100 });
  let novas = 0;
  for (let i = 0; i < 60 * 1.2; i++) {
    w.step(DT, IDLE);
    novas += w.drainEvents().filter((e) => e.type === 'enemyNova').length;
  }
  assert.equal(novas, 0);
});

test('random spawn: picks one of the listed spots and a delay in the window, the same for the same seed', () => {
  const spots = [{ x: 3.5, z: 3.5 }, { x: -3.5, z: 3.5 }, { x: 3.5, z: -3.5 }];
  const spawn = [{ type: 'barchernarcher', random: { spots, delay: [10, 40] } }];
  const seen = new Set();
  for (let s = 1; s <= 40; s++) {
    const w = new World({ ...bare, enemies: spawn }, 'sword', { seed: s });
    const e = w.enemies[0];
    assert.ok(spots.some((p) => p.x === e.x && p.z === e.z));
    assert.ok(e.spawnAt >= 10 && e.spawnAt <= 40);
    seen.add(`${e.x},${e.z}`);
    const again = new World({ ...bare, enemies: spawn }, 'sword', { seed: s }).enemies[0];
    assert.deepEqual([again.x, again.z, again.spawnAt], [e.x, e.z, e.spawnAt]);
  }
  assert.ok(seen.size > 1, 'varies with the seed');
});

test('level placements match the brief: rocks 1/2/2, one Barchernarcher on level 2 (the key carrier) and one random one on level 3', () => {
  const count = (l, type) => l.enemies.filter((e) => e.type === type).length;
  assert.deepEqual(LEVELS.slice(0, 3).map((l) => count(l, 'neelysomnaly')), [1, 2, 2]);
  assert.deepEqual(LEVELS.slice(0, 3).map((l) => count(l, 'barchernarcher')), [0, 1, 1]);
  const l2 = LEVELS[1].enemies.find((e) => e.type === 'barchernarcher');
  assert.equal(l2.finale, true, 'last kill drops the key');
  assert.ok(LEVELS[2].enemies.find((e) => e.type === 'barchernarcher').random);
  const bow = LEVELS[2].enemies.find((e) => e.type === 'bowmaster');
  assert.equal(bow.finale, true, 'the level-3 boss is still last');
});

test('validateLevel: a rock needs room; a bad random block is reported; every random spot is checked', () => {
  const [rx, rz] = LEVELS[0].scenery.rocks[0]; // a rock cell
  const [W, D] = [LEVELS[0].arena.width, LEVELS[0].arena.depth];
  const treeNear = { ...LEVELS[0], enemies: [{ type: 'neelysomnaly', x: rx + 1 - W / 2 + 0.5, z: rz - D / 2 + 0.5, delay: 0 }] };
  assert.ok(validateLevel(treeNear).some((p) => p.includes('free cells')));
  const badRandom = { ...LEVELS[2], enemies: [{ type: 'barchernarcher', random: { spots: [{ x: 999, z: 0 }], delay: [10, 5] } }] };
  const problems = validateLevel(badRandom);
  assert.ok(problems.some((p) => p.includes('random needs')));
  assert.ok(problems.some((p) => p.includes('outside the arena')));
});

test('fighting a level-2 Barchernarcher with a sword is winnable and it always drops the key last', () => {
  for (const seed of [1, 2, 3]) {
    const lvl = { ...LEVELS[1], enemies: LEVELS[1].enemies.filter((e) => e.type === 'barchernarcher') };
    const w = new World(lvl, 'sword', { seed, startHealth: 100 });
    let wonFight = false;
    for (let i = 0; i < 60 * 90 && w.state === 'playing'; i++) {
      const b = w.enemies.find((e) => e.state !== 'pending' && e.state !== 'dead');
      let inp = IDLE;
      const goal = w.key ?? (w.objective === 'gate' ? w.gate : null);
      if (goal) {
        const d = w.nav.steer(w.hero, goal, DT);
        inp = { moveX: d.x, moveZ: d.z, attack: false };
      } else if (b) {
        const d = w.nav.steer(w.hero, b, DT);
        const near = Math.hypot(b.x - w.hero.x, b.z - w.hero.z) < 1.5;
        inp = { moveX: near ? 0 : d.x, moveZ: near ? 0 : d.z, attack: true };
      }
      w.step(DT, inp);
      if (w.key || w.hasKey) wonFight = true;
    }
    assert.ok(wonFight, `seed ${seed}: the key dropped`);
    assert.equal(w.state, 'won', `seed ${seed}: ${w.state} hp ${w.hero.health.current}`);
  }
});

test('auto-aim prefers a real enemy over a sleeping rock that is closer', () => {
  const w = mk([{ type: 'neelysomnaly', x: -0.7, z: 0.5, delay: 0 }, { type: 'grunt', x: 2.0, z: 0.5, delay: 0 }], { startHealth: 100 });
  w.step(DT, IDLE);
  w.hero.attackCooldown = 0;
  w.heroAttack();
  assert.ok(Math.abs(w.hero.facing - Math.PI / 2) < 0.1, `facing ${w.hero.facing}`); // +x, toward the grunt
});

test('a rock-pushed hero stays inside the arena', () => {
  const w = mk([{ type: 'neelysomnaly', x: -(bare.arena.width / 2 - 0.5), z: 0.5, delay: 0 }], { startHealth: 100 });
  for (let i = 0; i < 120; i++) w.step(DT, { moveX: -1, moveZ: 0, attack: false });
  assert.ok(w.hero.x >= -w.bounds.halfW - 1e-9);
});

test('walkers go around a sleeping rock: a grunt directly behind one still reaches the hero, and a dead rock gives its cell back', () => {
  const w = mk([{ type: 'neelysomnaly', x: 4.5, z: 0.5, delay: 0 }, { type: 'grunt', x: 8.5, z: 0.5, delay: 0 }], { startHealth: 100 });
  w.hero.x = 0.5;
  w.hero.z = 0.5;
  const cell = [w.grid.cellX(4.5), w.grid.cellZ(0.5)];
  w.step(DT, IDLE);
  assert.ok(w.grid.blockedForPlanning(...cell), 'the rock blocks its cell for planning');
  assert.equal(w.grid.blockedAt(4.5, 0.5, 2), false, 'but not shots (SIGHT)');
  let closest = Infinity;
  for (let i = 0; i < 60 * 8; i++) {
    w.step(DT, IDLE);
    w.hero.health.current = 100;
    const g = w.enemies.find((e) => e.type === 'grunt');
    closest = Math.min(closest, Math.hypot(g.x - w.hero.x, g.z - w.hero.z));
  }
  assert.ok(closest < 2.0, // melee range: 1 block between bodies is ~1.85 between centres
     `the grunt got to ${closest.toFixed(2)} from the hero`);
  w.damageEnemy(w.enemies[0], 9999, 0);
  assert.equal(w.grid.blockedForPlanning(...cell), false, 'the dead rock no longer blocks');
});

test('the archer never wastes a windup on a shot a pillar would stop: every arrow fired at a standing hero lands', () => {
  const lvl = { ...LEVELS[2], enemies: [{ type: 'bowmaster', x: -4.5, z: -1.5, delay: 0 }] };
  for (const [hx, hz] of [[-8, 6], [-12, -8], [0.5, 14.5], [10, -4]]) {
    const w = new World(lvl, 'sword', { seed: 1, startHealth: 100 });
    w.hero.x = hx;
    w.hero.z = hz;
    let fired = 0;
    let hit = 0;
    for (let i = 0; i < 60 * 40; i++) {
      w.step(DT, IDLE);
      w.hero.health.current = 100;
      for (const ev of w.drainEvents()) {
        if (ev.type === 'arrowFired') fired++;
        if (ev.type === 'heroHurt') hit++;
      }
    }
    assert.ok(fired >= 5, `hero at ${hx},${hz}: the archer shoots`);
    assert.ok(hit >= fired - 1, `hero at ${hx},${hz}: ${hit} of ${fired} arrows landed (the last may still be in the air)`);
  }
});

test('the level-3 elite appears in the middle of the temple ruins', () => {
  const ruin = LEVELS[2].scenery.ruins[0];
  const [W, D] = [LEVELS[2].arena.width, LEVELS[2].arena.depth];
  const boss = LEVELS[2].enemies.find((e) => e.type === 'bowmaster');
  const cx = ruin.ix + ruin.w / 2 - W / 2;
  const cz = ruin.iz + ruin.d / 2 - D / 2;
  assert.ok(Math.hypot(boss.x - cx, boss.z - cz) <= 1.5, `boss ${boss.x},${boss.z} vs temple centre ${cx},${cz}`);
});
