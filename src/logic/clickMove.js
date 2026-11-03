import { dist } from './math.js';

const ARRIVE = 0.2; // close enough
const SLOW = 0.6; // start easing off this far from the spot so we do not jitter around it
const STUCK_WINDOW = 0.6; // seconds without real progress -> give up
const STUCK_PROGRESS = 0.15; // blocks of progress that count

/**
 * "Walk to where I right-clicked." Holds one target; each frame turns it into a movement vector
 * the sim consumes like a stick. Pure: the caller supplies the hero, a steering function
 * (the sim's A* navigation) and dt.
 */
export class ClickMover {
  constructor() {
    this.target = null;
    this.reset();
  }

  reset() {
    this.anchor = null;
    this.anchorT = 0;
  }

  set(x, z) {
    this.target = { x, z };
    this.reset();
  }

  clear() {
    this.target = null;
    this.reset();
  }

  /** @returns {{moveX:number, moveZ:number}|null} null when there is nothing (left) to do */
  update(hero, steer, dt) {
    if (!this.target) return null;
    const d = dist(hero.x, hero.z, this.target.x, this.target.z);
    if (d < ARRIVE) {
      this.clear();
      return null;
    }
    // Stuck against something (a wall the planner could not route around, a rock): stop trying.
    if (!this.anchor) this.anchor = { x: hero.x, z: hero.z };
    this.anchorT += dt;
    if (this.anchorT >= STUCK_WINDOW) {
      if (dist(hero.x, hero.z, this.anchor.x, this.anchor.z) < STUCK_PROGRESS) {
        this.clear();
        return null;
      }
      this.anchor = { x: hero.x, z: hero.z };
      this.anchorT = 0;
    }
    const dir = steer(hero, this.target, dt);
    const ease = Math.min(1, d / SLOW);
    return { moveX: dir.x * ease, moveZ: dir.z * ease };
  }
}
