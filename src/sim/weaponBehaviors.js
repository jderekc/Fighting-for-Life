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

/**
 * The enemy (nearest to the hero) whose body the barrel itself runs through: at point-blank range a shot would start beyond it,
 * so it is hit straight away instead of being skipped.
 */
function inBarrel(world, muzzle, pad) {
  const h = world.hero;
  const sx = muzzle.x - h.x;
  const sz = muzzle.z - h.z;
  const len2 = sx * sx + sz * sz;
  if (len2 < 1e-9) return null;
  let best = null;
  let bestD = Infinity;
  for (const e of world.activeEnemies()) {
    const t = Math.max(0, Math.min(1, ((e.x - h.x) * sx + (e.z - h.z) * sz) / len2));
    if (dist(h.x + sx * t, h.z + sz * t, e.x, e.z) > e.radius + pad) continue;
    const d = dist(h.x, h.z, e.x, e.z);
    if (d < bestD) [best, bestD] = [e, d];
  }
  return best;
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

  /** The toy gun: a dart leaves the barrel and hits the first enemy it meets (one right at the barrel is hit at once). */
  shoot(world, weapon) {
    const near = inBarrel(world, world.muzzle(weapon), weapon.dartRadius);
    if (!near) {
      world.fireDart(weapon);
      return;
    }
    const m = world.muzzle(weapon);
    world.emit({ type: 'heroShot', kind: 'dart', id: -1, x: m.x, z: m.z, facing: world.hero.facing });
    world.damageEnemy(near, weapon.damage, weapon.knockback);
    world.emit({ type: 'shotStopped', x: near.x, z: near.z, hit: true });
  },

  /** The toy sniper: an instant shot from the barrel toward the target, up to `range`, stopped by walls and trees; hits the first enemy on the line. */
  beam(world, weapon) {
    const origin = world.muzzle(weapon);
    const near = inBarrel(world, origin, 0.15);
    if (near) {
      world.emit({ type: 'heroShot', kind: 'beam', x: origin.x, z: origin.z, x1: near.x, z1: near.z, hit: true });
      world.damageEnemy(near, weapon.damage, weapon.knockback);
      return;
    }
    const angle = world.shotAngle(origin);
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    const reach = world.rayLength(origin.x, origin.z, dx, dz, weapon.range);
    let best = null;
    let bestT = Infinity;
    for (const enemy of world.activeEnemies()) {
      const rx = enemy.x - origin.x;
      const rz = enemy.z - origin.z;
      const t = rx * dx + rz * dz; // distance along the shot
      if (t < 0 || t > reach + enemy.radius) continue;
      if (Math.abs(rx * dz - rz * dx) > enemy.radius + 0.15) continue; // distance from the line
      if (t < bestT) [best, bestT] = [enemy, t];
    }
    const length = best ? Math.min(bestT, reach) : reach;
    world.emit({ type: 'heroShot', kind: 'beam', x: origin.x, z: origin.z, x1: origin.x + dx * length, z1: origin.z + dz * length, hit: best !== null });
    if (best) world.damageEnemy(best, weapon.damage, weapon.knockback);
  },
};

export function runWeaponBehavior(world, weapon) {
  const behavior = behaviors[weapon.behavior];
  if (!behavior) throw new Error(`Unknown weapon behavior: ${weapon.behavior}`);
  behavior(world, weapon);
}

export const BEHAVIOR_NAMES = Object.freeze(Object.keys(behaviors));
