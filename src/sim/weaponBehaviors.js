import { inMeleeArc } from '../logic/combat.js';
import { SIGHT } from '../logic/grid.js';
import { dist } from '../logic/math.js';

// A behavior applies a weapon's effect at the moment of attack. It only mutates the
// world through world.damageEnemy() (and world.schedule / world.fireDart / world.emit); targeting, facing and cooldowns are handled by World.
// To add a new kind of weapon, register a function here and set `behavior` in data/weapons.js.

/** One strike of an arc weapon: everything inside the arc in front of the hero that it can see. */
function strikeArc(world, weapon) {
  const { hero } = world;
  for (const enemy of world.activeEnemies()) {
    if (!inMeleeArc(hero, hero.facing, enemy, weapon.range, weapon.arc)) continue;
    // No hitting through walls or trees (a stream is fine to swing across).
    if (!world.grid.lineClear(hero.x, hero.z, enemy.x, enemy.z, 0, SIGHT)) continue;
    world.damageEnemy(enemy, weapon.damage, weapon.knockback);
  }
}

const behaviors = {
  /** Hits every living enemy inside an arc in front of the hero. `hits` > 1 (daggers): the rest follow `hitGap` seconds apart. */
  meleeArc(world, weapon) {
    strikeArc(world, weapon);
    for (let i = 1; i < (weapon.hits ?? 1); i++) world.schedule(i * weapon.hitGap, () => strikeArc(world, weapon));
  },

  /** The hammer: after `windup` seconds a shockwave hits every enemy within `radius` (plus the bought slam radius), all directions. */
  slam(world, weapon) {
    world.schedule(weapon.windup, () => {
      const { hero } = world;
      const radius = weapon.radius + world.perks.slamRadius;
      world.emit({ type: 'heroSlam', x: hero.x, z: hero.z, radius });
      for (const enemy of world.activeEnemies()) {
        if (dist(hero.x, hero.z, enemy.x, enemy.z) - hero.radius - enemy.radius > radius) continue;
        if (!world.grid.lineClear(hero.x, hero.z, enemy.x, enemy.z, 0, SIGHT)) continue; // walls and trees shelter what is behind them
        world.damageEnemy(enemy, weapon.damage, weapon.knockback);
      }
    });
  },

  /** The toy gun: a dart flies out and hits the first enemy it meets. */
  shoot(world, weapon) {
    world.fireDart(weapon);
  },

  /** The toy sniper: an instant shot along the aim, up to `range`, stopped by walls and trees; hits the first enemy on the line. */
  beam(world, weapon) {
    const { hero } = world;
    const dx = Math.sin(hero.facing);
    const dz = Math.cos(hero.facing);
    const reach = world.rayLength(hero.x, hero.z, dx, dz, weapon.range);
    let best = null;
    let bestT = Infinity;
    for (const enemy of world.activeEnemies()) {
      const rx = enemy.x - hero.x;
      const rz = enemy.z - hero.z;
      const t = rx * dx + rz * dz; // distance along the shot
      if (t < 0 || t > reach + enemy.radius) continue;
      if (Math.abs(rx * dz - rz * dx) > enemy.radius + 0.15) continue; // distance from the line
      if (t < bestT) [best, bestT] = [enemy, t];
    }
    const length = best ? Math.min(bestT, reach) : reach;
    world.emit({ type: 'heroShot', kind: 'beam', x: hero.x, z: hero.z, x1: hero.x + dx * length, z1: hero.z + dz * length, hit: best !== null });
    if (best) world.damageEnemy(best, weapon.damage, weapon.knockback);
  },
};

export function runWeaponBehavior(world, weapon) {
  const behavior = behaviors[weapon.behavior];
  if (!behavior) throw new Error(`Unknown weapon behavior: ${weapon.behavior}`);
  behavior(world, weapon);
}

export const BEHAVIOR_NAMES = Object.freeze(Object.keys(behaviors));
