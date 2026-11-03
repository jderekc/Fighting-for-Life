// Global tunables. Anything a designer might want to nudge lives here or in src/data/.
// Units: world units are roughly "blocks" (1 unit = 1 block), seconds, radians.

import { STATS } from './data/stats.js';

// Numbers for the hero, coins and apples come from src/data/stats.json; the rest (camera, doors...) is here.
export const CONFIG = Object.freeze({
  hero: STATS.hero,
  // Coins: an enemy drops (total damage it took) x a random factor in [1 - spread, 1 + spread], rounded.
  // Damage counts in full even past the enemy's remaining health (a big last hit or a crit pays out extra).
  coins: STATS.coins,
  // Extra reach beyond the weapon's range when auto-targeting the nearest enemy.
  autoAimExtra: STATS.hero.autoAimExtra,
  apples: Object.freeze({ ...STATS.apples, pickupOnlyWhenHurt: true }), // an apple at full health stays on the ground
  knockbackDecay: 8, // higher = knockback fades faster
  key: Object.freeze({ pickupRadius: 1.1 }),
  doors: Object.freeze({
    openRadius: 1.8, // a door opens when the hero or any enemy is this close (no button needed)
    closeDelay: 0.8, // seconds after everyone leaves before it swings shut
  }),
  camera: Object.freeze({
    height: 14,
    back: 10, // tilt is atan(height / back), about 54 degrees
    follow: 6,
    fov: 45,
  }),
});
