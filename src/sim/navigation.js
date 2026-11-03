import { findPath } from '../logic/pathfind.js';

/**
 * Steering around obstacles. If the way is clear, go straight. Otherwise follow an A* path,
 * re-planned every `interval` seconds because the target keeps moving. Path state is kept on
 * the actor itself (actor.nav), so enemies and test bots share one implementation.
 */
export class Navigator {
  constructor(grid) {
    this.grid = grid;
  }

  /** Unit direction { x, z } to move `actor` toward `target`, plus `pathing` (true when detouring). */
  steer(actor, target, dt, interval = 0.35) {
    const g = this.grid;
    const nav = (actor.nav ??= { path: null, timer: 0 });
    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const dist = Math.hypot(dx, dz) || 1;
    const direct = { x: dx / dist, z: dz / dist, pathing: false };

    if (g.lineClear(actor.x, actor.z, target.x, target.z, actor.radius)) {
      nav.path = null;
      return direct;
    }

    nav.timer -= dt;
    if (!nav.path || nav.timer <= 0) {
      nav.path = findPath(g, actor.x, actor.z, target.x, target.z);
      nav.timer = interval;
    }
    const path = nav.path;
    if (!path) return direct; // unreachable: press toward the target and let collision stop us

    while (path.length > 0 && Math.hypot(path[0].x - actor.x, path[0].z - actor.z) < 0.35) path.shift();
    // Cut corners when a later waypoint is already in the clear.
    while (path.length > 1 && g.lineClear(actor.x, actor.z, path[1].x, path[1].z, actor.radius)) path.shift();

    const wp = path[0] ?? target;
    const wx = wp.x - actor.x;
    const wz = wp.z - actor.z;
    const wd = Math.hypot(wx, wz) || 1;
    return { x: wx / wd, z: wz / wd, pathing: true };
  }
}
