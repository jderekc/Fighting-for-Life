import { ENEMIES } from '../data/enemies.js';
import { CharacterView } from './CharacterView.js';
import { DUEL_SPOTS, hash, heightAt, PLATEAU, riverDistance } from './splashLand.js';

// Wandering mobs on the title-screen grounds: a handful of grunts, the sun brute, the bowmaster and two sleeping rocks, reusing
// the in-game looks through CharacterView (walk animation, facing). They wander inside a home circle or patrol waypoints, pause now
// and then, and never leave the terrace, enter the cathedral, cross the rivers or walk into the two duels. Seeded (hash), so every
// page load moves them the same way (they keep walking through the 48 s wrap; the screen is black then). Cheap: one sync() per mob per frame, no pathfinding.

const PLATEAU_TOL = 0.4; // how far from the terrace height a target may be

/** True when (x, z) is open ground on the terrace: on the plateau, outside the cathedral and its steps, off the rivers, off the path. */
function openGround(x, z) {
  if (Math.abs(heightAt(x, z) - PLATEAU) > PLATEAU_TOL) return false;
  if (Math.abs(x) < 15.5 && z > -21 && z < 22.5) return false; // the cathedral footprint, its steps and the plinth
  if (riverDistance(x, z) < 7) return false;
  if (Math.hypot(x, z) > 36) return false; // the forest starts past the terrace
  for (const d of DUEL_SPOTS) if (Math.hypot(x - d.x, z - d.z) < 5.5) return false;
  return true;
}

const MOBS = [
  // Up and down the lantern path, between the lantern rows (posts at path centre +-2.5; the bridge starts at z 34). The third
  // point used to be (3.4, 29.5), outside the row, and the walk back brushed the post at (3.2, 28.6).
  { look: 'grunt', kind: 'patrol', points: [[-0.4, 26], [0.9, 31], [1.5, 32.6]], speed: 1.5 },
  { look: 'grunt', kind: 'wander', home: { x: 18.5, z: 31, r: 4 }, speed: 1.3 },
  { look: 'grunt', kind: 'wander', home: { x: -21, z: 26, r: 4 }, speed: 1.4 },
  { look: 'barchernarcher', kind: 'wander', home: { x: -23, z: -13, r: 5 }, speed: 1.0 },
  { look: 'bowmaster', kind: 'patrol', points: [[22, -4], [23, 10], [27, 2]], speed: 1.1, options: { bow: true } },
  { look: 'neelysomnaly', kind: 'still', home: { x: -11, z: -23, r: 0 } },
  { look: 'neelysomnaly', kind: 'still', home: { x: 13, z: -24.5, r: 0 } },
];

export class Wanderers {
  constructor(scene) {
    this.scene = scene;
    this.mobs = MOBS.map((def, i) => {
      const look = ENEMIES[def.look].look;
      const view = new CharacterView(look, def.options ?? {});
      view.addTo(scene);
      const start = def.kind === 'patrol' ? { x: def.points[0][0], z: def.points[0][1] } : { x: def.home.x, z: def.home.z };
      const mob = { def, view, i, x: start.x, z: start.z, facing: hash(i, 1) * Math.PI * 2, state: 'chase', target: null, pause: hash(i, 2) * 2, step: 0, n: 0, tries: 0 };
      view.groundY = heightAt(mob.x, mob.z);
      view.sync(mob, 0); // place it before the first frame
      return mob;
    });
  }

  /** Pick the next destination: the next patrol point, or a seeded spot in the home circle that is open ground. */
  nextTarget(m) {
    const { def } = m;
    if (def.kind === 'patrol') {
      m.step = (m.step + 1) % def.points.length;
      return { x: def.points[m.step][0], z: def.points[m.step][1] };
    }
    for (let k = 0; k < 12; k++) {
      m.n += 1;
      const a = hash(m.i * 7 + m.n, 3) * Math.PI * 2;
      const r = Math.sqrt(hash(m.n, m.i * 5 + 1)) * def.home.r;
      const x = def.home.x + Math.cos(a) * r;
      const z = def.home.z + Math.sin(a) * r;
      if (openGround(x, z) && Math.hypot(x - m.x, z - m.z) > 1.5) return { x, z };
    }
    return { x: def.home.x, z: def.home.z };
  }

  update(dt) {
    for (const m of this.mobs) {
      const { def } = m;
      if (def.kind !== 'still') {
        if (m.pause > 0) m.pause -= dt;
        else {
          if (!m.target) m.target = this.nextTarget(m);
          const dx = m.target.x - m.x;
          const dz = m.target.z - m.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.15) {
            m.target = null;
            m.pause = 0.8 + hash(m.i, m.n + m.step) * 2.6; // a breather at every stop
          } else {
            const stepLen = Math.min(dist, def.speed * dt);
            m.x += (dx / dist) * stepLen;
            m.z += (dz / dist) * stepLen;
            m.facing = Math.atan2(dx, dz); // forward = (sin yaw, cos yaw)
          }
        }
        m.view.groundY = heightAt(m.x, m.z);
      }
      m.view.sync(m, dt);
    }
  }

  dispose() {
    for (const m of this.mobs) {
      m.view.removeFrom(this.scene);
      m.view.dispose();
    }
  }
}
