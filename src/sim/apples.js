import { dist } from '../logic/math.js';

// Apples heal the hero on contact. They appear on a timer at fixed spots and sometimes drop
// from defeated enemies. Only the hero can pick them up.

export class AppleSystem {
  constructor(world) {
    this.world = world;
    this.apples = [];
    this.timer = world.config.apples.firstDelay;
  }

  update(dt) {
    const cfg = this.world.config.apples;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = cfg.interval;
      if (this.apples.length < cfg.maxOnGround) this.spawnAtFreeSpot();
    }
    this.checkPickups();
  }

  spawnAtFreeSpot() {
    const free = this.world.level.appleSpots.filter(
      (s) => !this.apples.some((a) => dist(a.x, a.z, s.x, s.z) < 0.5),
    );
    if (free.length === 0) return null;
    const spot = free[Math.floor(this.world.rng() * free.length)];
    return this.add(spot.x, spot.z);
  }

  /** Called when an enemy is defeated. */
  maybeDrop(enemy) {
    const cfg = this.world.config.apples;
    if (this.apples.length >= cfg.maxDropsOnGround) return null;
    if (this.world.rng() >= cfg.enemyDropChance) return null;
    return this.add(enemy.x, enemy.z);
  }

  add(x, z) {
    const { halfW, halfD } = this.world.bounds;
    const apple = {
      id: this.world.nextId(),
      x: Math.max(-halfW, Math.min(halfW, x)),
      z: Math.max(-halfD, Math.min(halfD, z)),
    };
    this.apples.push(apple);
    this.world.emit({ type: 'appleSpawned', id: apple.id, x: apple.x, z: apple.z });
    return apple;
  }

  checkPickups() {
    const { hero, config } = this.world;
    const cfg = config.apples;
    for (let i = this.apples.length - 1; i >= 0; i--) {
      const apple = this.apples[i];
      if (dist(hero.x, hero.z, apple.x, apple.z) > cfg.pickupRadius) continue;
      if (cfg.pickupOnlyWhenHurt && hero.health.isFull) continue;
      const healed = hero.health.heal(hero.health.max * this.world.perks.appleHeal);
      this.apples.splice(i, 1);
      this.world.emit({ type: 'applePicked', id: apple.id, x: apple.x, z: apple.z, healed });
    }
  }
}
