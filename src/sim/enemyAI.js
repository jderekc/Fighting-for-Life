import { resolveCircle } from '../logic/collide.js';
import { SIGHT } from '../logic/grid.js';
import { angleTo, clamp, dist } from '../logic/math.js';

// Enemy state machine: chase -> windup (telegraph) -> recover -> chase. Archers (def.behavior) stop at attackRange and shoot arrows.
// Getting hit during windup staggers the enemy, which makes timing matter.

export function updateEnemy(world, enemy, dt) {
  const { hero } = world;
  const def = enemy.def;
  if (def.behavior === 'sleeper') {
    updateSleeper(world, enemy, dt);
    return;
  }

  // Knockback velocity decays smoothly.
  enemy.x += enemy.vx * dt;
  enemy.z += enemy.vz * dt;
  const decay = Math.exp(-world.config.knockbackDecay * dt);
  enemy.vx *= decay;
  enemy.vz *= decay;

  enemy.facing = angleTo(enemy.x, enemy.z, hero.x, hero.z);
  const gap = () => dist(enemy.x, enemy.z, hero.x, hero.z) - hero.radius - enemy.radius;
  // Walls and trees block attacks both ways (water does not).
  // Archers must be sure their ARROW will get through: a fatter ray sampled finely (arrows are checked every ~0.17 blocks in flight,
  // so a coarse check can say "clear" and then the arrow dies on a pillar corner while the archer flashes red for nothing).
  const canStrike = () =>
    def.behavior === 'archer'
      ? world.grid.lineClear(enemy.x, enemy.z, hero.x, hero.z, 0.12, SIGHT, 0.06)
      : world.grid.lineClear(enemy.x, enemy.z, hero.x, hero.z, 0, SIGHT);

  switch (enemy.state) {
    case 'chase': {
      let attack = null;
      if (gap() <= def.attackRange && canStrike()) attack = 'melee';
      else if (def.nova && gap() <= def.nova.range && canStrike()) attack = 'nova'; // close, but out of melee reach
      if (attack) {
        enemy.state = 'windup';
        enemy.attack = attack;
        enemy.timer = attack === 'nova' ? def.nova.windup : def.windup;
        enemy.windupHits = 0;
        world.emit({ type: 'enemyWindup', id: enemy.id, attack });
      } else {
        const dir = world.nav.steer(enemy, hero, dt);
        const step = def.speed * dt;
        enemy.x += dir.x * step;
        enemy.z += dir.z * step;
        if (dir.pathing) enemy.facing = Math.atan2(dir.x, dir.z); // look where we are going when detouring
      }
      break;
    }
    case 'windup': {
      enemy.timer -= dt;
      if (enemy.timer <= 0) {
        let cooldown = def.cooldown;
        if (def.behavior === 'archer') {
          if (canStrike()) world.fireArrow(enemy); // the arrow flies on its own; stepping out of its line dodges it
          else cooldown = 0.3; // the hero moved behind something during the windup: no shot, look for a new angle
        } else if (enemy.attack === 'nova') {
          // Sparks go every way at once: it only matters whether the hero is within range, then one roll for accuracy.
          const inRange = gap() <= def.nova.range * 1.15 && canStrike();
          const connects = world.rng() < def.nova.accuracy;
          const landed = inRange && connects && world.damageHero(def.nova.damage, enemy);
          world.emit({ type: 'enemyNova', id: enemy.id, x: enemy.x, z: enemy.z, hit: landed });
          cooldown = def.nova.cooldown;
        } else if (gap() <= def.attackRange * 1.3 && canStrike()) {
          // Slightly forgiving reach: stepping away during the telegraph can dodge it.
          world.damageHero(def.damage, enemy);
        }
        if (enemy.attack !== 'nova') world.emit({ type: 'enemyAttack', id: enemy.id });
        enemy.state = 'recover';
        enemy.timer = cooldown;
      }
      break;
    }
    case 'recover': {
      enemy.timer -= dt;
      if (enemy.timer <= 0) enemy.state = 'chase';
      break;
    }
    default:
      break;
  }

  separate(world, enemy);
  const { halfW, halfD } = world.bounds;
  enemy.x = clamp(enemy.x, -halfW, halfW);
  enemy.z = clamp(enemy.z, -halfD, halfD);
  resolveCircle(world.grid, enemy); // last, so nothing ever ends up inside water, a tree or a wall
}

/**
 * A sleeper never moves and never attacks. The hero hurts themself by standing against it: the first touch does `damage`,
 * each following hit is `ramp` times the previous one for the first `rampHits` hits, then it stays there (a plateau),
 * and the ramp starts over after `resetAfter` seconds apart.
 * Hits come at the hero's grace-period rhythm (damageHero refuses while it is running).
 */
function updateSleeper(world, enemy, dt) {
  const { hero } = world;
  const def = enemy.def;
  enemy.contactDamage ??= def.damage;
  enemy.contactHits ??= 0;
  enemy.untouched ??= 0;
  const touching = dist(enemy.x, enemy.z, hero.x, hero.z) - hero.radius - enemy.radius <= def.touchMargin;
  if (touching) {
    enemy.untouched = 0;
    if (world.damageHero(enemy.contactDamage, enemy)) {
      enemy.contactHits += 1;
      // The ramp climbs for the first `rampHits` hits, then plateaus: staying never gets worse than that.
      if (enemy.contactHits < def.rampHits) enemy.contactDamage *= def.ramp;
    }
  } else {
    enemy.untouched += dt;
    if (enemy.untouched >= def.resetAfter) {
      enemy.contactDamage = def.damage;
      enemy.contactHits = 0;
    }
  }
}

/** Push enemies apart from each other and out of the hero so nothing stacks. */
function separate(world, enemy) {
  const push = (ox, oz, minDist, share) => {
    const dx = enemy.x - ox;
    const dz = enemy.z - oz;
    const d = Math.hypot(dx, dz);
    if (d >= minDist) return;
    if (d < 1e-6) {
      enemy.x += minDist * share; // exactly overlapping: nudge along +x
      return;
    }
    const overlap = (minDist - d) * share;
    enemy.x += (dx / d) * overlap;
    enemy.z += (dz / d) * overlap;
  };
  for (const other of world.activeEnemies()) {
    if (other === enemy) continue;
    if (other.def.immovable) {
      // A rock is not pushed: we go around. Slide sideways too, or a grunt lined up behind a rock pins itself against it.
      push(other.x, other.z, enemy.radius + other.radius, 1);
      const rx = enemy.x - other.x;
      const rz = enemy.z - other.z;
      if (Math.hypot(rx, rz) < enemy.radius + other.radius + 0.05) {
        const side = (world.hero.x - enemy.x) * rz - (world.hero.z - enemy.z) * rx >= 0 ? 1 : -1;
        const len = Math.hypot(rx, rz) || 1;
        enemy.x += (-rz / len) * side * 0.04;
        enemy.z += (rx / len) * side * 0.04;
      }
      continue;
    }
    push(other.x, other.z, enemy.radius + other.radius, 0.5);
  }
  push(world.hero.x, world.hero.z, enemy.radius + world.hero.radius, 1);
}
