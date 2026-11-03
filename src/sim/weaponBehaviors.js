import { inMeleeArc } from '../logic/combat.js';
import { SIGHT } from '../logic/grid.js';

// A behavior applies a weapon's effect at the moment of attack. It only mutates the
// world through world.damageEnemy(); targeting, facing and cooldowns are handled by World.
// To add a new kind of weapon, register a function here and set `behavior` in data/weapons.js.

const behaviors = {
  /** Hits every living enemy inside an arc in front of the hero. */
  meleeArc(world, weapon) {
    const { hero } = world;
    for (const enemy of world.activeEnemies()) {
      if (!inMeleeArc(hero, hero.facing, enemy, weapon.range, weapon.arc)) continue;
      // No hitting through walls or trees (a stream is fine to swing across).
      if (!world.grid.lineClear(hero.x, hero.z, enemy.x, enemy.z, 0, SIGHT)) continue;
      world.damageEnemy(enemy, weapon.damage, weapon.knockback);
    }
  },
};

export function runWeaponBehavior(world, weapon) {
  const behavior = behaviors[weapon.behavior];
  if (!behavior) throw new Error(`Unknown weapon behavior: ${weapon.behavior}`);
  behavior(world, weapon);
}

export const BEHAVIOR_NAMES = Object.freeze(Object.keys(behaviors));
