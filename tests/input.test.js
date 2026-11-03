import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { Input } from '../src/core/Input.js';

// Input only needs addEventListener/removeEventListener on its target and a navigator.getGamepads.
const fakeTarget = () => ({ addEventListener() {}, removeEventListener() {} });

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
function stubNavigator(getGamepads) {
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads }, configurable: true, writable: true });
}
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'navigator', original);
  else delete globalThis.navigator;
});

test('a gamepad blocked by a permissions policy falls back to keyboard-only and never throws', () => {
  let calls = 0;
  stubNavigator(() => {
    calls++;
    throw new DOMException(
      'Access to the feature "gamepad" is disallowed by permissions policy.',
      'SecurityError',
    );
  });
  const input = new Input(fakeTarget());
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(input.read(), { moveX: 0, moveZ: 0, attack: false });
  }
  assert.equal(calls, 1, 'stops asking after the first SecurityError');
});

test('no Gamepad API at all is fine', () => {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  assert.deepEqual(new Input(fakeTarget()).read(), { moveX: 0, moveZ: 0, attack: false });
});

test('a connected gamepad moves and attacks; stick drift is ignored', () => {
  const pad = (axes, pressed = []) => ({
    connected: true,
    axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })),
  });
  let current = pad([0.05, -0.05]);
  stubNavigator(() => [current]);
  const input = new Input(fakeTarget());
  assert.deepEqual(input.read(), { moveX: 0, moveZ: 0, attack: false }, 'drift inside the deadzone');

  current = pad([0, -1], [0]); // stick up + A button
  const r = input.read();
  assert.ok(r.moveZ < -0.99 && Math.abs(r.moveX) < 1e-9, 'up is -z');
  assert.equal(r.attack, true);
  assert.equal(input.consumeConfirm(), true, 'A press is a one-shot confirm');
  assert.equal(input.consumeConfirm(), false);
});
