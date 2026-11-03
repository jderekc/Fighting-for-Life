import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS } from '../src/data/levels.js';
import { ErrorLog, FpsMeter, formatCalc } from '../src/logic/devStats.js';
import { withDifficulty, difficultyOf } from '../src/logic/difficulty.js';
import { createProfile, perksOf } from '../src/logic/profile.js';
import { CONFIG } from '../src/config.js';
import { World } from '../src/sim/World.js';

test('FpsMeter: fps from the mean frame time, worst frame, rolling window, junk ignored', () => {
  const m = new FpsMeter(4);
  assert.deepEqual(m.stats(), { fps: 0, avgMs: 0, worstMs: 0, frames: 0 });
  for (const ms of [100, 20, 20, 20, 20]) m.push(ms); // the 100 ms hitch falls out of the window
  m.push(NaN);
  m.push(-5);
  const s = m.stats();
  assert.equal(s.frames, 4);
  assert.equal(Math.round(s.fps), 50);
  assert.equal(s.worstMs, 20);
});

test('ErrorLog: repeats are counted once, the list is capped, clear empties it', () => {
  const log = new ErrorLog(2);
  log.add('boom', 'frame');
  log.add('boom', 'frame');
  log.add('boom', 'window'); // same text, other source = separate entry
  assert.equal(log.entries.length, 2);
  assert.equal(log.entries[0].count, 2);
  log.add('third', 'frame');
  assert.equal(log.entries.length, 2, 'capped');
  assert.equal(log.total, 4);
  log.clear();
  assert.deepEqual([log.entries.length, log.total], [0, 0]);
});

test('World logs every damage calculation, and god mode logs a hit without applying it', () => {
  const level = { ...LEVELS[0], enemies: [{ type: 'grunt', x: 0.9, z: 0.5, delay: 0 }] };
  const profile = withDifficulty(createProfile(), 3); // Hard
  const w = new World(level, 'sword', { seed: 3, perks: perksOf(profile, CONFIG), difficulty: difficultyOf(profile), startHealth: 100 });
  w.step(1 / 60, { moveX: 0, moveZ: 0, attack: false });
  const grunt = w.activeEnemies()[0];
  w.damageEnemy(grunt, 20, 0);
  const hit = w.calcLog.find((e) => e.kind === 'hit');
  assert.equal(hit.target, 'grunt');
  assert.equal(hit.base, 20);
  assert.ok(Math.abs(hit.dealt - 20 * hit.damageMult * (hit.crit ? hit.critMult : 1) * (1 - hit.armor)) < 1e-9);
  assert.match(formatCalc(hit), /hero -> grunt: 20 x /);

  w.godMode = true;
  const before = w.hero.health.current;
  assert.equal(w.damageHero(10, grunt), true);
  assert.equal(w.hero.health.current, before, 'god mode: not applied');
  const hurt = w.calcLog.findLast((e) => e.kind === 'hurt');
  assert.equal(hurt.god, true);
  assert.equal(hurt.applied, 10 * difficultyOf(profile).enemyDamage);
  assert.match(formatCalc(hurt), /GOD MODE/);

  w.godMode = false;
  w.hero.invuln = 0;
  w.damageHero(10, grunt);
  assert.ok(w.hero.health.current < before);
  assert.equal(w.calcLog.findLast((e) => e.kind === 'hurt').god, undefined);
});
