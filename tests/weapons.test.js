import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { LEVELS } from '../src/data/levels.js';
import { upgradesFor } from '../src/data/upgrades.js';
import { WEAPON_IDS, WEAPONS } from '../src/data/weapons.js';
import { STATS } from '../src/data/stats.js';
import { NO_SCENERY } from '../src/logic/levelGrid.js';
import { buyUpgrade, createProfile, perksOf } from '../src/logic/profile.js';
import { World } from '../src/sim/World.js';

const DT = 1 / 60;
const IDLE = { moveX: 0, moveZ: 0, attack: false };
const ATTACK = { moveX: 0, moveZ: 0, attack: true };
const field = { ...LEVELS[0], scenery: NO_SCENERY, heroStart: { x: 0, z: 0 }, appleSpots: [] };
const noCrit = { ...perksOf(createProfile(), CONFIG), critChance: 0 };

/** A world with the hero at the origin (facing -z) and one frozen, nearly unkillable grunt per [x, z] in `spots`. */
function arena(weaponId, spots, perks = noCrit, type = 'grunt', heroZ = 0) {
  const w = new World({ ...field, heroStart: { x: 0, z: heroZ }, enemies: spots.map(([x, z]) => ({ type, x, z, delay: 0 })) }, weaponId, { perks });
  w.step(DT, IDLE);
  for (const e of w.enemies) {
    e.state = 'recover'; // stands still, does not attack
    e.timer = 1e9;
    e.health.max = e.health.current = 1e6;
  }
  return w;
}
const run = (w, seconds, input = IDLE) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) w.step(DT, input);
};
const taken = (w) => w.enemies.map((e) => e.damageTaken);
const grunt = 1 - STATS.enemies.grunt.armor;

test('every weapon: five of them, 500 coins each, a known behavior, a style, and at most five shop rows', () => {
  assert.deepEqual(WEAPON_IDS, ['sword', 'dagger', 'hammer', 'gun', 'sniper']);
  for (const id of WEAPON_IDS) {
    assert.equal(WEAPONS[id].price, 500, id);
    assert.ok(['swing', 'stab', 'slam', 'shoot'].includes(WEAPONS[id].style), id);
    assert.equal(upgradesFor(id).length, 5, `${id}: three of its own plus heart and apple`);
  }
});

test('daggers: one press is two quick hits, each rolls its own damage; out of reach is a miss', () => {
  const w = arena('dagger', [[0, -1.2]]);
  w.step(DT, ATTACK);
  assert.equal(taken(w)[0], 3 * grunt, 'the first hit lands at once');
  run(w, 0.1);
  assert.ok(Math.abs(taken(w)[0] - 6 * grunt) < 1e-9, 'the second follows 0.07 s later');
  assert.equal(w.drainEvents().filter((e) => e.type === 'enemyHit').length, 2);
  run(w, 0.3, IDLE);
  assert.ok(Math.abs(taken(w)[0] - 6 * grunt) < 1e-9, 'no more without another press');
  const far = arena('dagger', [[0, -3.5]]);
  run(far, 0.3, ATTACK);
  assert.equal(taken(far)[0], 0, 'beyond 1.4 blocks of reach');
});

test('daggers press faster than the sword and hit lighter', () => {
  assert.ok(WEAPONS.dagger.cooldown < WEAPONS.sword.cooldown);
  assert.ok(WEAPONS.dagger.damage < WEAPONS.sword.damage);
  assert.ok(WEAPONS.dagger.knockback < WEAPONS.sword.knockback);
});

test('hammer: nothing happens during the wind-up, then everything near it, in every direction, is hit', () => {
  const w = arena('hammer', [[0, -1.5], [0, 1.5], [1.8, 0], [0, -6]]);
  w.step(DT, ATTACK);
  run(w, WEAPONS.hammer.windup - 0.1);
  assert.deepEqual(taken(w), [0, 0, 0, 0], 'still winding up');
  run(w, 0.2);
  const [front, behind, side, far] = taken(w);
  const hit = WEAPONS.hammer.damage * grunt;
  assert.ok(Math.abs(front - hit) < 1e-9 && Math.abs(behind - hit) < 1e-9 && Math.abs(side - hit) < 1e-9, 'a full circle');
  assert.equal(far, 0, 'outside the radius');
  const slam = w.drainEvents().find((e) => e.type === 'heroSlam');
  assert.ok(slam && slam.radius === WEAPONS.hammer.radius);
});

test('hammer: slower than the sword, knocks enemies back harder, and a wall shelters what is behind it', () => {
  assert.ok(WEAPONS.hammer.cooldown > 2 * WEAPONS.sword.cooldown, 'a hammer swing takes more than twice as long');
  assert.ok(WEAPONS.hammer.damage * grunt >= STATS.enemies.grunt.maxHealth, 'one slam fells a grunt');
  const w = arena('hammer', [[0, -1.5]]);
  w.step(DT, ATTACK);
  run(w, 0.6);
  assert.ok(w.enemies[0].z < -1.8, 'thrown away from the hero (it started at -1.5)');
  const walled = arena('hammer', [[0, -2.5]]);
  walled.grid.block(walled.grid.cellX(0), walled.grid.cellZ(-1.5), 3);
  walled.step(DT, ATTACK);
  run(walled, 0.6);
  assert.equal(taken(walled)[0], 0);
});

test('hammer: "bigger slam" extends the shockwave', () => {
  const spot = [[0, -3.9]]; // 3.9 - 0.3 - 0.45 = 3.15 edge to edge
  const base = arena('hammer', spot);
  base.step(DT, ATTACK);
  run(base, 0.6);
  assert.equal(taken(base)[0], 0, 'beyond the plain radius 2.2');
  let p = { ...createProfile(), weapon: 'hammer', coins: 5000 };
  for (let i = 0; i < 3; i++) p = buyUpgrade(p, 'slam').profile; // +1.2
  const big = arena('hammer', spot, { ...perksOf(p, CONFIG), critChance: 0 });
  big.step(DT, ATTACK);
  run(big, 0.6);
  assert.ok(taken(big)[0] > 0, 'radius 3.4 reaches it');
  assert.ok(Math.abs(perksOf(p, CONFIG).slamRadius - 1.2) < 1e-9);
});

test('toy gun: a dart flies, hits the first enemy in line (not the one behind it), and is then gone', () => {
  const w = arena('gun', [[0, -4], [0, -6]]);
  w.step(DT, ATTACK);
  assert.equal(w.heroShots.length, 1);
  assert.equal(taken(w)[0] + taken(w)[1], 0, 'it has to fly there first');
  run(w, 0.7);
  assert.ok(Math.abs(taken(w)[0] - WEAPONS.gun.damage * grunt) < 1e-9);
  assert.equal(taken(w)[1], 0, 'the second one is shielded by the first');
  assert.equal(w.heroShots.length, 0);
});

test('toy gun: darts stop at walls and fall out of range', () => {
  const w = arena('gun', [[0, -6]]);
  w.grid.block(w.grid.cellX(0), w.grid.cellZ(-3), 3);
  w.step(DT, ATTACK);
  run(w, 1);
  assert.equal(taken(w)[0], 0, 'the wall took it');
  assert.equal(w.heroShots.length, 0);
  const far = arena('gun', [[0, -11]]);
  far.step(DT, ATTACK);
  run(far, 1.5);
  assert.equal(taken(far)[0], 0, 'range is 7');
});

test('sharper bolts cut armor: tier 1 undoes the grunts 0.1, three tiers undo the Bowmaster 0.25, never below zero', () => {
  const hitWith = (weaponId, tiers, type) => {
    let p = { ...createProfile(), weapon: weaponId, coins: 9999 };
    for (let i = 0; i < tiers; i++) p = buyUpgrade(p, 'bolts').profile;
    const w = arena(weaponId, [[0, -4]], { ...perksOf(p, CONFIG), critChance: 0 }, type);
    w.damageEnemy(w.enemies[0], 10);
    return w.enemies[0].damageTaken;
  };
  assert.ok(Math.abs(hitWith('gun', 0, 'grunt') - 9) < 1e-9);
  assert.ok(Math.abs(hitWith('gun', 1, 'grunt') - 10) < 1e-9, 'a grunt has no armor left');
  assert.ok(Math.abs(hitWith('sniper', 1, 'bowmaster') - 8.5) < 1e-9);
  assert.ok(Math.abs(hitWith('sniper', 3, 'bowmaster') - 10) < 1e-9, 'extra piercing does not make armor negative');
});

test('toy sniper: an instant, hard hit from far away; the first enemy on the line takes it; trees and walls block it', () => {
  const w = arena('sniper', [[0, -2], [0, -3.5]], noCrit, 'grunt', 11); // 13 blocks away
  const frontZ = w.enemies[0].z; // (it stepped a hair while spawning)
  w.step(DT, ATTACK);
  assert.ok(Math.abs(taken(w)[0] - WEAPONS.sniper.damage * grunt) < 1e-9, 'no flight time');
  assert.equal(taken(w)[1], 0, 'one shot, one enemy');
  const shot = w.drainEvents().find((e) => e.type === 'heroShot');
  assert.equal(shot.kind, 'beam');
  assert.ok(shot.hit && Math.abs(shot.z1 - frontZ) < 1e-6, 'the tracer ends at the enemy');
  const blocked = arena('sniper', [[0, -10]]);
  blocked.grid.block(blocked.grid.cellX(0), blocked.grid.cellZ(-5), 3);
  assert.equal(blocked.weapon.range, 16);
  blocked.step(DT, ATTACK);
  assert.equal(taken(blocked)[0], 0);
  const none = arena('sniper', [[17.6, 0]]); // beyond range plus auto-aim assist: no one to aim at, so it fires straight ahead and misses
  none.step(DT, ATTACK);
  assert.equal(taken(none)[0], 0, 'off the line');
  assert.equal(none.drainEvents().find((e) => e.type === 'heroShot').hit, false);
});

test('toy sniper: slow and strong, and it shows an aim line to the enemy it would shoot', () => {
  assert.ok(WEAPONS.sniper.cooldown > 3 * WEAPONS.sword.cooldown);
  assert.ok(WEAPONS.sniper.damage > 4 * WEAPONS.sword.damage);
  assert.ok(WEAPONS.sniper.damage * grunt >= STATS.enemies.grunt.maxHealth, 'one shot fells a grunt');
  const w = arena('sniper', [[0, -9], [0, -5]]);
  w.step(DT, IDLE);
  assert.equal(w.aimTarget, w.enemies[1], 'the nearest');
  w.grid.block(w.grid.cellX(0), w.grid.cellZ(-3), 3);
  w.step(DT, IDLE);
  assert.equal(w.aimTarget, null, 'a wall in the way: no line');
  const sword = arena('sword', [[0, -1.5]]);
  sword.step(DT, IDLE);
  assert.equal(sword.aimTarget, null, 'only the sniper has an aim line');
});

test('swapping weapon mid-fight: the new weapon is in hand at once, old half-finished attacks are dropped', () => {
  const w = arena('hammer', [[0, -1.5]]);
  w.step(DT, ATTACK); // slam winding up
  w.drainEvents();
  w.setWeapon('sword');
  assert.equal(w.weapon.id, 'sword');
  assert.equal(w.hero.attackCooldown, 0);
  assert.deepEqual(w.drainEvents(), [{ type: 'weaponChanged', weaponId: 'sword' }]);
  run(w, 0.8);
  assert.equal(taken(w)[0], 0, 'the dropped slam never lands');
  assert.throws(() => w.setWeapon('spoon'), /Unknown weapon/);
});

test('every weapon can finish a real level 1 fight (a bot that never dodges)', async () => {
  const { botInput } = await import('../tools/bot.mjs');
  for (const id of WEAPON_IDS) {
    const w = new World(LEVELS[0], id, { seed: 5 });
    for (let i = 0; i < 60 * 240 && w.state === 'playing'; i++) w.step(DT, botInput(w));
    assert.equal(w.state, 'won', `${id} should win level 1 at Normal`);
  }
});
