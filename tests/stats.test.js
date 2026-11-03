import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { ENEMIES } from '../src/data/enemies.js';
import { cleanHeroName, HEROES, MAX_NAME_LENGTH } from '../src/data/heroes.js';
import { stat, statRows, STATS } from '../src/data/stats.js';
import { UPGRADES } from '../src/data/upgrades.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buyUpgrade, createProfile, withHeroName } from '../src/logic/profile.js';

test('stats.json is the single source: enemy, weapon, upgrade and config numbers all come from it', () => {
  for (const [id, row] of Object.entries(STATS.enemies)) assert.deepEqual(Object.fromEntries(Object.keys(row).map((k) => [k, ENEMIES[id][k]])), row, id);
  for (const [id, row] of Object.entries(STATS.weapons)) for (const [k, v] of Object.entries(row)) assert.equal(WEAPONS[id][k], v, `${id}.${k}`);
  for (const up of UPGRADES) {
    assert.equal(up.add, STATS.upgrades[up.id].add);
    assert.deepEqual(up.costs, STATS.upgrades[up.id].costs);
  }
  assert.equal(CONFIG.hero.maxHealth, stat('hero.maxHealth'));
  assert.equal(CONFIG.hero.crit.chance, stat('hero.crit.chance'));
  assert.equal(CONFIG.coins.spread, stat('coins.spread'));
  assert.equal(CONFIG.apples.healFraction, stat('apples.healFraction'));
  assert.equal(CONFIG.autoAimExtra, stat('hero.autoAimExtra'));
});

test('every enemy and weapon in the data has a stats row, and every stats row has a definition', () => {
  assert.deepEqual(Object.keys(STATS.enemies).sort(), Object.keys(ENEMIES).sort());
  assert.deepEqual(Object.keys(STATS.weapons).sort(), Object.keys(WEAPONS).sort());
  assert.deepEqual(Object.keys(STATS.upgrades).sort(), UPGRADES.map((u) => u.id).sort());
});

test('stat() looks up dotted paths, throws on typos, and the data is frozen', () => {
  assert.equal(stat('enemies.grunt.maxHealth'), 40);
  assert.equal(stat('enemies.neelysomnaly.ramp'), 1.15);
  assert.deepEqual(stat('upgrades.sharpen.costs'), [200, 400, 700]);
  assert.throws(() => stat('enemies.gruntt.maxHealth'), /Unknown stat/);
  assert.throws(() => stat('enemies.grunt.maxHealth.x'), /Unknown stat/);
  assert.throws(() => {
    'use strict';
    STATS.hero.maxHealth = 1;
  });
  const rows = statRows('enemies.grunt');
  assert.ok(rows.some(([p, v]) => p === 'enemies.grunt.damage' && v === 10));
  assert.ok(!statRows().some(([p]) => p.startsWith('_')), 'the readme key is not a stat');
});

test('stats stay sane: positive health, armor below 1, only whole-ish prices, ascending tiers', () => {
  for (const [id, e] of Object.entries(STATS.enemies)) {
    assert.ok(e.maxHealth > 0, id);
    assert.ok(e.armor >= 0 && e.armor < 1, `${id} armor`);
    assert.ok(e.radius < 0.5, `${id} radius (path planning ignores body size)`);
  }
  for (const [id, u] of Object.entries(STATS.upgrades)) {
    assert.equal(u.costs.length, 3, id);
    assert.ok(u.costs.every((c, i) => Number.isInteger(c) && (i === 0 || c > u.costs[i - 1])), `${id} costs`);
  }
});

test('the default hero is the girl, Nicky, with a name tag; names are cleaned and fall back to Nicky', () => {
  const p = createProfile();
  assert.deepEqual(p.hero, { kind: 'girl', name: 'Nicky' });
  assert.equal(HEROES.girl.nameTag, true);
  assert.equal(withHeroName(p, '  Mia   Rose ').hero.name, 'Mia Rose');
  assert.equal(withHeroName(p, '').hero.name, 'Nicky');
  assert.equal(withHeroName(p, '   ').hero.name, 'Nicky');
  assert.equal(withHeroName(p, null).hero.name, 'Nicky');
  assert.equal(withHeroName(p, 'x'.repeat(40)).hero.name.length, MAX_NAME_LENGTH);
  assert.equal(cleanHeroName('a\u0007b\nc'), 'abc');
  assert.equal(p.hero.name, 'Nicky', 'the original profile is untouched');
});

test('the hero name survives shopping', () => {
  const named = withHeroName({ ...createProfile(), coins: 500 }, 'Mia');
  const bought = buyUpgrade(named, 'sharpen');
  assert.ok(bought.ok);
  assert.equal(bought.profile.hero.name, 'Mia');
  assert.equal(bought.profile.coins, 300);
});
