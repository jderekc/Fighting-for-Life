import { angleDiff, angleTo, dist } from './math.js';

/**
 * Is `target` inside a melee swing from `attacker` facing `facing`?
 * `range` is edge-to-edge reach, `arc` is the total swing width in radians.
 * Overlapping bodies always count as hit, so close enemies are never missed.
 */
export function inMeleeArc(attacker, facing, target, range, arc) {
  const d = dist(attacker.x, attacker.z, target.x, target.z);
  const bodies = target.radius + (attacker.radius ?? 0);
  if (d - bodies > range) return false;
  if (d <= bodies) return true;
  const toTarget = angleTo(attacker.x, attacker.z, target.x, target.z);
  return Math.abs(angleDiff(facing, toTarget)) <= arc / 2;
}
