import { clampLength1 } from './math.js';

/** Radial deadzone with rescaling, so small stick drift is ignored and full tilt still reaches 1. */
export function applyDeadzone(x, y, deadzone = 0.2) {
  const len = Math.hypot(x, y);
  if (len < deadzone) return [0, 0];
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return [(x / len) * scaled, (y / len) * scaled];
}

/**
 * Combine keyboard direction keys and gamepad stick into one move vector.
 * Screen-relative: up is -z (away from the camera), right is +x.
 */
export function mergeMove(keys, stick) {
  const kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const kz = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const [sx, sz] = applyDeadzone(stick.x, stick.y);
  const x = kx + sx;
  const z = kz + sz;
  return clampLength1(x, z);
}
