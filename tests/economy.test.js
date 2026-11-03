import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { ENEMIES } from '../src/data/enemies.js';
import { LEVELS, validateLevel } from '../src/data/levels.js';
import { MAX_TIER, UPGRADES } from '../src/data/upgrades.js';
import { NO_SCENERY, shopZone } from '../src/logic/levelGrid.js';
import { dist } from '../src/logic/math.js';
import { buyUpgrade, createProfile, nextCost, perksOf, tierOf } from '../src/logic/profile.js';
import { World } from '../src/sim/World.js';

const DT = 1 / 60;
const IDLE = { moveX: 0, moveZ: 0, attack: false };
const field = { ...LEVELS[0], scenery: NO_SCENERY, heroStart: { x: 0, z: 0 }, appleSpots: [] };
const oneEnemy = (type = 'grunt', extra = {}) => ({ ...field, enemies: [{ type, x: 3, z: 0, delay: 0, ...extra }] });
const spawned = (lvl, opts) => {
  const w = new World(lvl, 'sword', opts);
  w.step(DT, IDLE);
  return w;
};
const noCrit = { ...perksOf(createProfile(), CONFIG), critChance: 0 };
const alwaysCrit = { ...perksOf(createProfile(), CONFIG), critChance: 1 };

test('base crit is 1% at 1.5x, and a crit multiplies the hit', () => {
  assert.equal(CONFIG.hero.crit.chance, 0.01);
  assert.equal(CONFIG.hero.crit.multiplier, 1.5);
  const a = spawned(oneEnemy(), { perks: noCrit });
  a.damageEnemy(a.enemies[0], 10);
  assert.equal(a.enemies[0].damageTaken, 10);
  const b = spawned(oneEnemy(), { perks: alwaysCrit });
  b.damageEnemy(b.enemies[0], 10);
  assert.equal(b.enemies[0].damageTaken, 15);
  assert.ok(b.drainEvents().some((e) => e.type === 'enemyHit' && e.crit === true && e.amount === 15));
});

test('crits happen about 1% of the time at base', () => {
  const w = spawned(oneEnemy('grunt'), {});
  let crits = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    w.enemies[0].state = 'chase';
    w.enemies[0].health.current = 1e9;
    w.enemies[0].health.max = 1e9;
    w.damageEnemy(w.enemies[0], 1);
    for (const ev of w.drainEvents()) if (ev.type === 'enemyHit' && ev.crit) crits++;
  }
  assert.ok(crits / N > 0.005 && crits / N < 0.017, `crit rate ${crits / N}`);
});

test('coins: 100 damage drops 90..110 coins, spread over the whole range', () => {
  const values = [];
  for (let seed = 1; seed <= 300; seed++) {
    const w = spawned(oneEnemy('grunt'), { seed, perks: noCrit });
    const e = w.enemies[0];
    e.health.max = 1000;
    e.health.current = 100;
    w.damageEnemy(e, 100);
    assert.ok(e.dead);
    assert.equal(w.coinPiles.length, 1);
    values.push(w.coinPiles[0].value);
  }
  assert.ok(Math.min(...values) >= 90 && Math.max(...values) <= 110);
  assert.ok(Math.min(...values) <= 93 && Math.max(...values) >= 107, 'randomised across the range');
});

test('overkill counts: damage past the last hit point still pays coins', () => {
  const w = spawned(oneEnemy('grunt'), { perks: noCrit });
  w.damageEnemy(w.enemies[0], 400); // grunt has 40 HP
  assert.equal(w.enemies[0].damageTaken, 400);
  assert.ok(w.coinPiles[0].value >= 360 && w.coinPiles[0].value <= 440);
});

test('armor absorbs a quarter of the elite\'s damage taken', () => {
  const w = spawned(oneEnemy('bowmaster'), { perks: noCrit });
  w.damageEnemy(w.enemies[0], 10);
  assert.equal(w.enemies[0].damageTaken, 7.5);
  assert.equal(ENEMIES.bowmaster.armor, 0.25);
});

test('coin piles are taken on contact, drift toward the hero, and are swept into the wallet on a win', () => {
  const w = spawned({ ...oneEnemy('grunt'), enemies: [{ type: 'grunt', x: 3, z: 0, delay: 0 }, { type: 'grunt', x: 20, z: 20, delay: 999 }] }, { perks: noCrit, startCoins: 5 });
  w.hero.x = 1.2; // within the magnet radius of where the grunt falls
  w.damageEnemy(w.enemies[0], 40);
  const pile = w.coinPiles[0];
  const d0 = dist(pile.x, pile.z, w.hero.x, w.hero.z);
  w.step(DT, IDLE);
  assert.ok(dist(pile.x, pile.z, w.hero.x, w.hero.z) < d0, 'magnet pulls it closer');
  for (let i = 0; i < 120; i++) w.step(DT, IDLE);
  assert.equal(w.coinPiles.length, 0);
  assert.ok(w.coins > 5 + 30);
  assert.equal(w.coinsEarned, w.coins - 5);
  // a pile far away is swept in when the level is won
  const w2 = spawned(oneEnemy('grunt'), { perks: noCrit });
  w2.hero.x = -10;
  w2.damageEnemy(w2.enemies[0], 40);
  const value = w2.coinPiles[0].value;
  w2.win();
  assert.equal(w2.coins, value, 'swept in exactly once');
  assert.equal(w2.coinsEarned, value);
  assert.equal(w2.coinPiles.length, 0);
  assert.equal(w2.drainEvents().filter((e) => e.type === 'coinsPicked').length, 1);
});

test('profile: buying spends coins, raises a tier up to three, and changes the perks', () => {
  let p = { ...createProfile(), coins: 5000 };
  assert.equal(perksOf(p, CONFIG).damageMult, 1);
  for (let t = 1; t <= MAX_TIER; t++) {
    const r = buyUpgrade(p, 'sharpen');
    assert.ok(r.ok);
    p = r.profile;
    assert.equal(tierOf(p, 'sharpen'), t);
  }
  assert.equal(buyUpgrade(p, 'sharpen').reason, 'maxed');
  assert.equal(nextCost(p, 'sharpen'), null);
  assert.ok(Math.abs(perksOf(p, CONFIG).damageMult - 1.6) < 1e-9);
  assert.equal(buyUpgrade({ ...createProfile(), coins: 10 }, 'luck').reason, 'poor');
  assert.equal(buyUpgrade(p, 'nope').reason, 'unknown');
  assert.equal(p.coins, 5000 - 200 - 400 - 700);
  const all = { coins: 1e6, tiers: Object.fromEntries(UPGRADES.map((u) => [u.id, 3])) };
  const perks = perksOf(all, CONFIG);
  assert.ok(Math.abs(perks.critChance - 0.13) < 1e-9 && Math.abs(perks.critMult - 2.25) < 1e-9);
  assert.equal(perks.maxHealth, 160);
  assert.ok(Math.abs(perks.appleHeal - 0.55) < 1e-9);
});

test('upgrade data: three tiers each, positive increasing costs, every stat is a perk', () => {
  const keys = Object.keys(perksOf(createProfile(), CONFIG));
  for (const u of UPGRADES) {
    assert.equal(u.costs.length, MAX_TIER);
    assert.ok(u.costs.every((c, i) => c > 0 && (i === 0 || c > u.costs[i - 1])), u.id);
    assert.ok(keys.includes(u.stat), u.id);
  }
});

test('perks reach the fight: more damage, more max health, bigger apple heals; applyPerks heals the extra health', () => {
  const p = { coins: 0, tiers: { sharpen: 2, heart: 1, apple: 1 } };
  const perks = perksOf(p, CONFIG);
  const w = spawned(oneEnemy(), { perks: { ...perks, critChance: 0 } });
  assert.equal(w.hero.health.max, 120);
  assert.equal(w.hero.health.current, 120);
  w.damageEnemy(w.enemies[0], 10);
  assert.ok(Math.abs(w.enemies[0].damageTaken - 14) < 1e-9);
  const w2 = spawned(oneEnemy(), {});
  w2.hero.health.damage(50);
  w2.applyPerks(perksOf({ coins: 0, tiers: { heart: 1 } }, CONFIG));
  assert.equal(w2.hero.health.max, 120);
  assert.equal(w2.hero.health.current, 70);
});

test('elite poise: a few hits during its windup do not stop the shot; a grunt is interrupted by one', () => {
  const boss = spawned({ ...oneEnemy('bowmaster'), enemies: [{ type: 'bowmaster', x: 3, z: 0, delay: 0 }] }, { perks: noCrit });
  const e = boss.enemies[0];
  for (let i = 0; i < 200 && e.state !== 'windup'; i++) boss.step(DT, IDLE);
  assert.equal(e.state, 'windup');
  boss.damageEnemy(e, 1);
  boss.damageEnemy(e, 1);
  boss.damageEnemy(e, 1);
  assert.equal(e.state, 'windup', 'three hits are within its poise');
  boss.damageEnemy(e, 1);
  assert.equal(e.state, 'recover', 'the fourth staggers it');
  const g = spawned({ ...oneEnemy('grunt'), enemies: [{ type: 'grunt', x: 1.2, z: 0, delay: 0 }] }, { perks: noCrit });
  const ge = g.enemies[0];
  for (let i = 0; i < 200 && ge.state !== 'windup'; i++) g.step(DT, IDLE);
  g.damageEnemy(ge, 1);
  assert.equal(ge.state, 'recover');
});

test('archer: stops at range, telegraphs, fires an arrow that hurts the hero for its damage', () => {
  const w = spawned({ ...field, enemies: [{ type: 'bowmaster', x: 12, z: 0, delay: 0 }] }, { perks: noCrit });
  const e = w.enemies[0];
  let fired = false;
  let hurt = null;
  for (let i = 0; i < 60 * 12 && !hurt; i++) {
    w.step(DT, IDLE);
    for (const ev of w.drainEvents()) {
      if (ev.type === 'arrowFired') fired = true;
      if (ev.type === 'heroHurt') hurt = ev;
    }
  }
  assert.ok(fired && hurt, 'fired and hit');
  assert.equal(hurt.amount, ENEMIES.bowmaster.damage);
  assert.ok(dist(e.x, e.z, w.hero.x, w.hero.z) > 4, 'it shoots from a distance instead of closing in');
});

test('arrows stop at walls and trees, and a hero who steps aside is missed', () => {
  const w = spawned({ ...field, enemies: [{ type: 'bowmaster', x: 6, z: 0, delay: 0 }] }, { perks: noCrit });
  w.grid.block(w.grid.cellX(3), w.grid.cellZ(0), 3); // a solid block (MOVE | SIGHT) between archer and hero
  w.fireArrow(w.enemies[0]);
  for (let i = 0; i < 120; i++) w.step(DT, IDLE);
  assert.equal(w.projectiles.length, 0);
  assert.equal(w.hero.health.current, w.hero.health.max, 'the wall took the arrow');
  // Baseline: a hero who stands still IS hit by the same arrow; one who steps out of the line is not.
  const shoot = (move) => {
    const w2 = spawned({ ...field, enemies: [{ type: 'bowmaster', x: 9, z: 0, delay: 999 }] }, { perks: noCrit });
    w2.fireArrow(w2.enemies[0]);
    w2.enemies[0].state = 'recover'; // no second shot: this test is about the one arrow
    w2.enemies[0].timer = 99;
    for (let i = 0; i < 90; i++) w2.step(DT, move);
    return w2;
  };
  assert.ok(shoot(IDLE).hero.health.current < 100, 'standing still takes the arrow');
  assert.equal(shoot({ moveX: 0, moveZ: 1, attack: false }).hero.health.current, 100, 'sidestepped');
  // An archer standing right against a wall cannot shoot through it.
  const w3 = spawned({ ...field, enemies: [{ type: 'bowmaster', x: 6, z: 0, delay: 999 }] }, { perks: noCrit });
  const b3 = w3.enemies[0];
  w3.grid.block(w3.grid.cellX(b3.x - 0.6), w3.grid.cellZ(0), 3);
  w3.fireArrow(b3);
  b3.state = 'recover';
  b3.timer = 99;
  for (let i = 0; i < 120; i++) w3.step(DT, IDLE);
  assert.equal(w3.hero.health.current, 100);
});

test('level 3 finale: the elite appears only after every grunt is down, and he drops the key', () => {
  const l3 = LEVELS.find((l) => l.id === 3);
  const w = new World(l3, 'sword', { seed: 4, perks: noCrit });
  const boss = w.enemies.find((e) => e.def.elite);
  assert.ok(boss && boss.finale);
  w.hero.health.max = w.hero.health.current = 1e9; // keep the idle hero alive while the grunts pile on
  for (let i = 0; i < 60 * 60; i++) w.step(DT, IDLE);
  assert.equal(boss.state, 'pending', 'nobody fought: the finale has not started');
  for (const e of w.enemies) if (!e.finale && e.state !== 'dead') {
    if (e.state === 'pending') e.state = 'chase';
    w.damageEnemy(e, 9999);
  }
  assert.equal(w.key, null, 'no key yet: the elite is still to come');
  assert.equal(w.enemiesRemaining, 1);
  for (let i = 0; i < 60 * 3; i++) w.step(DT, IDLE);
  assert.notEqual(boss.state, 'pending', 'it arrives a couple of seconds after the field is clear');
  w.damageEnemy(boss, 9999);
  assert.ok(w.key, 'the key comes from the elite');
  assert.ok(Math.abs(boss.damageTaken - 9999 * 0.75) < 1e-6 && w.coinPiles.length >= 1, "armored damage is what pays coins");
});

test('the shop level is a no-enemy oasis with a 6x8 shop, an 18x24 map and an open gate', () => {
  const shop = LEVELS.find((l) => l.kind === 'shop');
  assert.deepEqual(validateLevel(shop), []);
  assert.equal(LEVELS[LEVELS.length - 1], shop, 'it comes after level 3');
  assert.deepEqual(shop.arena, { width: 18, depth: 24 });
  assert.equal(shop.enemies.length, 0);
  const b = shop.scenery.buildings[0];
  assert.deepEqual([b.w, b.d], [6, 8]);
  assert.equal(shop.biome, 'oasis');
  assert.equal(shop.scenery.gate.unlocked, true);
});

test('shop: the counter blocks walking, the zone in front of it opens the shop, and the gate needs no key', () => {
  const shop = LEVELS.find((l) => l.kind === 'shop');
  const w = new World(shop, 'sword', {});
  assert.equal(w.objective, 'shop');
  assert.ok(w.shopZone && shopZone(shop));
  w.step(DT, IDLE);
  assert.equal(w.nearShop, false);
  // desk cells are blocked for walking
  const d = shop.scenery.shop.desk;
  assert.ok(w.grid.blocked(d.ix, d.iz) && w.grid.blocked(d.ix + d.w - 1, d.iz));
  // standing in front of the desk is "near"; behind it (the keeper's side) is not reachable by walking
  w.hero.x = 0;
  w.hero.z = -4;
  w.step(DT, IDLE);
  assert.equal(w.nearShop, true);
  w.hero.x = 0;
  w.hero.z = 8;
  w.step(DT, IDLE);
  assert.equal(w.nearShop, false);
  // walk the counter from the front: the hero cannot get behind it
  w.hero.x = 0;
  w.hero.z = -4;
  for (let i = 0; i < 120; i++) w.step(DT, { moveX: 0, moveZ: -1, attack: false });
  assert.ok(w.hero.z > -5.1, `stopped at the counter, z=${w.hero.z.toFixed(2)}`);
  assert.equal(w.hasKey, false);
});

test('the keeper is invulnerable by construction: he is not an enemy and swinging at him does nothing', () => {
  const shop = LEVELS.find((l) => l.kind === 'shop');
  const w = new World(shop, 'sword', {});
  w.hero.x = 0;
  w.hero.z = -4;
  const events = [];
  for (let i = 0; i < 120; i++) {
    w.step(DT, { moveX: 0, moveZ: 0, attack: true });
    events.push(...w.drainEvents());
  }
  assert.equal(w.enemies.length, 0);
  assert.ok(events.some((e) => e.type === 'heroAttack'), 'the swings really happened');
  assert.ok(!events.some((e) => e.type === 'enemyHit' || e.type === 'coinsDropped'), 'and hit nothing');
  assert.equal(w.state, 'playing');
});

test('every enemy hit radius stays under half a block (path planning ignores body size)', () => {
  for (const e of Object.values(ENEMIES)) assert.ok(e.radius < 0.5, e.id);
});
