import { dist } from './math.js';

/**
 * Nearest living target within maxRange (center-to-center), or null.
 * Targets are any objects with x, z and an optional `dead` flag.
 */
export function nearestTarget(origin, candidates, maxRange = Infinity) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (c.dead) continue;
    const d = dist(origin.x, origin.z, c.x, c.z);
    if (d <= maxRange && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
