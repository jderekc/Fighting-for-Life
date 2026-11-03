import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Input } from '../src/core/Input.js';
import { ClickMover } from '../src/logic/clickMove.js';
import { World } from '../src/sim/World.js';
import { LEVELS } from '../src/data/levels.js';

function rig() {
  const handlers = {};
  const target = {
    addEventListener: (n, f) => (handlers[n] = f),
    removeEventListener() {},
  };
  const canvas = {};
  const input = new Input(target);
  input.attachCanvas(canvas);
  const fire = (name, e) => handlers[name]({ target: canvas, preventDefault() {}, ...e });
  return { input, fire, canvas };
}

test('left mouse button attacks while held, like Space', () => {
  const { input, fire } = rig();
  assert.equal(input.read().attack, false);
  fire('mousedown', { button: 0, clientX: 5, clientY: 5 });
  assert.equal(input.read().attack, true);
  assert.equal(input.takeMoveClick(), null, 'a left click does not walk');
  fire('mouseup', { button: 0 });
  assert.equal(input.read().attack, false);
});

test('right mouse button asks to walk to that spot (and dragging re-aims), without attacking', () => {
  const { input, fire } = rig();
  fire('mousedown', { button: 2, clientX: 40, clientY: 60 });
  assert.deepEqual(input.takeMoveClick(), { x: 40, y: 60 });
  assert.equal(input.takeMoveClick(), null, 'taken once');
  assert.equal(input.read().attack, false);
  fire('mousemove', { clientX: 50, clientY: 70 });
  assert.deepEqual(input.takeMoveClick(), { x: 50, y: 70 });
  fire('mouseup', { button: 2 });
  fire('mousemove', { clientX: 90, clientY: 90 });
  assert.equal(input.takeMoveClick(), null, 'moving without the button does nothing');
});

test('clicks that are not on the canvas (menus, the shop) are ignored; the context menu is suppressed on the canvas', () => {
  const { input, fire } = rig();
  let prevented = 0;
  fire('mousedown', { target: {}, button: 0 });
  fire('mousedown', { target: {}, button: 2, clientX: 1, clientY: 1 });
  assert.equal(input.read().attack, false);
  assert.equal(input.takeMoveClick(), null);
  fire('contextmenu', { preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
});

test('ClickMover walks the hero to the spot with the sim navigation and then stops', () => {
  const lvl = { ...LEVELS[0], enemies: [] };
  const w = new World(lvl, 'sword', { seed: 1 });
  const mover = new ClickMover();
  const tx = w.hero.x + 4;
  const tz = w.hero.z - 3;
  mover.set(tx, tz);
  let steps = 0;
  for (; steps < 60 * 10; steps++) {
    const mv = mover.update(w.hero, (a, t, d) => w.nav.steer(a, t, d), 1 / 60);
    if (!mv) break;
    w.step(1 / 60, { ...mv, attack: false });
  }
  assert.equal(mover.target, null, 'arrived and cleared');
  assert.ok(Math.hypot(w.hero.x - tx, w.hero.z - tz) < 0.3, `ended ${w.hero.x},${w.hero.z}`);
  assert.ok(steps < 60 * 4, 'about 5 blocks should take a few seconds');
});

test('ClickMover goes around water by following the planned path, and gives up when it is stuck', () => {
  const w = new World({ ...LEVELS[0], enemies: [] }, 'sword', { seed: 1 });
  const mover = new ClickMover();
  // A target on the far side of the stream.
  mover.set(0.5, -9.5);
  let t = 0;
  for (; t < 60 * 20; t++) {
    const mv = mover.update(w.hero, (a, tg, d) => w.nav.steer(a, tg, d), 1 / 60);
    if (!mv) break;
    w.step(1 / 60, { ...mv, attack: false });
  }
  assert.ok(Math.hypot(w.hero.x - 0.5, w.hero.z + 9.5) < 0.5 || mover.target === null);

  // Stuck: a fake hero that never moves is dropped after a moment.
  const m2 = new ClickMover();
  m2.set(10, 10);
  const still = { x: 0, z: 0 };
  let live = true;
  for (let i = 0; i < 60 * 2 && live; i++) live = m2.update(still, () => ({ x: 1, z: 0 }), 1 / 60) !== null;
  assert.equal(live, false);
  assert.equal(m2.target, null);
});
