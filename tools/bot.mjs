// A scripted "player" for balance measurements: fights the nearest real enemy, walks around sleeping rocks, fetches the key, goes through the gate.
// It never dodges, so its HP loss is an upper-ish bound for a careful player and a lower bound for a careless one. Kept in step with botInput in tests/sim.test.js.
import {dist} from '../src/logic/math.js';
const DT=1/60;
/** A sensible player walks around a sleeping rock instead of into it: bend the heading away from rocks that are ahead. */
function avoidRocks(world, dir) {
  const h = world.hero;
  let { x, z } = dir;
  for (const r of world.activeEnemies()) {
    if (!r.def.optional) continue;
    const dx = r.x - h.x;
    const dz = r.z - h.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2 || d < 1e-6) continue;
    const ahead = (x * dx + z * dz) / d; // 1 = straight at it
    if (ahead < 0.3) continue;
    let px = -dz / d;
    let pz = dx / d;
    if (x * px + z * pz < 0) [px, pz] = [-px, -pz]; // slip past on the side we already lean toward
    x += px * ahead * 1.5;
    z += pz * ahead * 1.5;
  }
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

export function botInput(world) {
  const h = world.hero;
  // After the last enemy: fetch the key, then walk through the gate.
  const goal = world.key ?? (world.objective === 'gate' || world.objective === 'shop' ? world.gate : null);
  if (goal) {
    const dir = avoidRocks(world, world.nav.steer(h, goal, DT));
    return { moveX: dir.x, moveZ: dir.z, attack: false };
  }
  let best = null;
  let bestD = Infinity;
  for (const e of world.activeEnemies()) {
    if (e.def.optional) continue; // this bot skips the sleeping rocks (see the economy tests for one that fights them)
    const d = dist(h.x, h.z, e.x, e.z);
    if (d < bestD) [best, bestD] = [e, d];
  }
  if (!best) {
    // Waiting for the next wave: do not idle against a sleeping rock (it hurts more every hit).
    const rock = world.activeEnemies().find((e) => e.def.optional && dist(h.x, h.z, e.x, e.z) < 2.5);
    if (rock) {
      const d = dist(h.x, h.z, rock.x, rock.z) || 1;
      return { moveX: (h.x - rock.x) / d, moveZ: (h.z - rock.z) / d, attack: false };
    }
    return { moveX: 0, moveZ: 0, attack: false };
  }
  const reach = world.weapon.range * 0.6 + h.radius + best.radius;
  const approach = bestD > reach && bestD > 1e-6;
  // Walk around water/walls the same way enemies do, instead of straight into them.
  const dir = approach ? avoidRocks(world, world.nav.steer(h, best, DT)) : { x: 0, z: 0 };
  return { moveX: dir.x, moveZ: dir.z, attack: true };
}

