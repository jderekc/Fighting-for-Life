import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Screens } from '../src/ui/Screens.js';
import { clampStep, DEFAULT_DIFFICULTY, difficultyOf, STEPS, withDifficulty } from '../src/logic/difficulty.js';
import { buyUpgrade, createProfile } from '../src/logic/profile.js';
import { LEVELS } from '../src/data/levels.js';
import { World } from '../src/sim/World.js';

const DT = 1 / 60;
const IDLE = { moveX: 0, moveZ: 0, attack: false };
const bare = { ...LEVELS[0], scenery: undefined, enemies: [], appleSpots: [], heroStart: { x: 0.5, z: 0.5 } };

test('difficulty: default is Normal (x1 / x1), steps are ordered, the slider position is clamped and survives shopping', () => {
  const p = createProfile();
  assert.equal(p.difficulty, DEFAULT_DIFFICULTY);
  assert.deepEqual([difficultyOf(p).enemyDamage, difficultyOf(p).enemyHealth], [1, 1]);
  for (let i = 1; i < STEPS.length; i++) {
    assert.ok(STEPS[i].enemyDamage > STEPS[i - 1].enemyDamage && STEPS[i].enemyHealth > STEPS[i - 1].enemyHealth, 'harder steps are harder');
  }
  assert.equal(withDifficulty(p, 99).difficulty, STEPS.length - 1);
  assert.equal(withDifficulty(p, -3).difficulty, 0);
  assert.equal(clampStep('abc'), DEFAULT_DIFFICULTY);
  assert.equal(buyUpgrade({ ...withDifficulty(p, 4), coins: 500 }, 'sharpen').profile.difficulty, 4);
});

test('difficulty scales damage to the hero and enemy health, nothing else', () => {
  const run = (step) => {
    const d = difficultyOf(withDifficulty(createProfile(), step));
    const w = new World({ ...bare, enemies: [{ type: 'grunt', x: 0.9, z: 0.5, delay: 0 }, { type: 'grunt', x: -10.5, z: -10.5, delay: 9999 }] }, 'sword', { seed: 1, difficulty: d, startHealth: 100 });
    const grunt = w.enemies[0];
    for (let i = 0; i < 60 * 3 && w.hero.health.current === 100; i++) w.step(DT, IDLE);
    return { hit: 100 - w.hero.health.current, hp: grunt.health.max, sword: w.weapon.damage, speed: w.hero.speed };
  };
  const easy = run(0);
  const normal = run(2);
  const hard = run(4);
  assert.equal(normal.hit, 10);
  assert.equal(easy.hit, 5);
  assert.equal(hard.hit, 15);
  assert.deepEqual([easy.hp, normal.hp, hard.hp], [30, 40, 52]);
  assert.deepEqual([easy.sword, hard.sword, easy.speed, hard.speed], [10, 10, 5.5, 5.5]);
});

test('the slider on the title and lose screens changes the profile; other screens have none', () => {
  const el = { className: '', hidden: true, children: [], replaceChildren() { this.children = []; }, append(...n) { this.children.push(...n); } };
  const mkEl = (tag) => ({ tag, className: '', textContent: '', children: [], listeners: {}, append(...n) { this.children.push(...n); }, addEventListener(t, f) { this.listeners[t] = f; } });
  const doc = { getElementById: () => el, createElement: mkEl };
  let step = 2;
  const screens = new Screens(doc, () => {}, { get: () => step, set: (s) => (step = s) });
  const slider = (name) => {
    screens.show(name);
    return el.children.flatMap((c) => c.children ?? []).find((c) => c.type === 'range');
  };
  const range = slider('title');
  assert.ok(range, 'title has a slider');
  assert.equal(range.value, '2');
  range.value = '4';
  range.listeners.input();
  assert.equal(step, 4);
  assert.ok(slider('lost'));
  assert.equal(slider('won'), undefined);
  assert.equal(slider('cleared'), undefined);
});

import { difficultyIcon } from '../src/ui/difficultyIcons.js';

test('the slider emblem shows better gear as the difficulty rises', () => {
  const kit = (step) => [...difficultyIcon(step).matchAll(/data-kit="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(kit(0), ['wood-sword']);
  assert.deepEqual(kit(1), ['wood-shield', 'wood-sword']);
  assert.deepEqual(kit(2), ['wood-shield', 'iron-sword']);
  assert.deepEqual(kit(3), ['iron-sword', 'iron-sword', 'wood-shield']);
  assert.deepEqual(kit(4), ['flame-sword', 'flame-sword', 'iron-shield']);
  assert.deepEqual(kit(-5), kit(0));
  assert.deepEqual(kit(99), kit(4));
  assert.equal(new Set([0, 1, 2, 3, 4].map(difficultyIcon)).size, 5, 'five different pictures');
});
