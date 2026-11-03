import { CONFIG } from '../config.js';
import { getEnemyDef } from '../data/enemies.js';
import { getWeapon } from '../data/weapons.js';
import { resolveCircle } from '../logic/collide.js';
import { Health } from '../logic/health.js';
import { MOVE, SIGHT } from '../logic/grid.js';
import { buildLevelGrid, gateCells, sceneryOf, shopZone } from '../logic/levelGrid.js';
import { angleTo, clamp, clampLength1, dist } from '../logic/math.js';
import { NEUTRAL } from '../logic/difficulty.js';
import { createProfile, perksOf } from '../logic/profile.js';
import { mulberry32 } from '../logic/rng.js';
import { nearestTarget } from '../logic/targeting.js';
import { AppleSystem } from './apples.js';
import { updateEnemy } from './enemyAI.js';
import { Navigator } from './navigation.js';
import { runWeaponBehavior } from './weaponBehaviors.js';

/**
 * The whole fight, with no rendering. The view layer reads this state and drains `events`.
 *
 * Input shape: { moveX, moveZ, attack } where move is screen-relative (up is -z).
 * World states: 'playing' -> 'won' | 'lost'.
 * Winning: defeat every enemy; the last one drops a key; carry it to the locked gate and walk through.
 * (A level with no gate is won as soon as the last enemy falls.)
 */
export class World {
  constructor(level, weaponId, {
    seed = 1,
    config = CONFIG,
    startHealth = Infinity, // clamped to the hero's max, so Infinity means "full"
    startCoins = 0,
    perks = perksOf(createProfile(), config),
    enemyDefs = null, // optional { id: def } overrides (the balance tool tries variations without touching the data)
    difficulty = NEUTRAL, // { enemyDamage, enemyHealth } multipliers (see logic/difficulty.js)
  } = {}) {
    this.level = level;
    this.config = config;
    this.difficulty = difficulty;
    this.perks = perks; // numbers from bought upgrades: damageMult, critChance, critMult, maxHealth, appleHeal
    this.coins = startCoins; // the wallet
    this.coinsEarned = 0; // picked up during this level
    this.coinPiles = []; // { id, x, z, value } lying on the ground
    this.projectiles = []; // enemy arrows in flight: { id, x, z, vx, vz, radius, damage, life, fromId }
    this.heroShots = []; // the hero's darts in flight: { id, x, z, vx, vz, radius, damage, knockback, life }
    this.scheduled = []; // later effects of an attack (a dagger's second hit, the hammer's slam): { at, run }
    this.aimTarget = null; // the enemy a sniper would shoot right now (for the aim line)
    this.weapon = getWeapon(weaponId);
    this.rng = mulberry32(seed);
    this.time = 0;
    this.calcLog = []; // the last damage calculations (DEV panel)
    this.godMode = false; // DEV menu: hits are logged but not applied
    this.state = 'playing';
    this.events = [];
    this._id = 0;

    this.bounds = {
      halfW: level.arena.width / 2 - 0.5,
      halfD: level.arena.depth / 2 - 0.5,
    };

    this.hero = {
      id: this.nextId(),
      x: level.heroStart.x,
      z: level.heroStart.z,
      facing: Math.PI, // facing the enemies (toward -z)
      radius: config.hero.radius,
      health: new Health(perks.maxHealth, startHealth),
      speed: config.hero.speed,
      attackCooldown: 0,
      swingRemaining: 0,
      invuln: 0,
      moving: false,
    };

    this.enemies = level.enemies.map((spawn) => {
      const def = enemyDefs?.[spawn.type] ?? getEnemyDef(spawn.type);
      // `random: { spots: [{x, z}...], delay: [min, max] }` picks where and when this one turns up (once, from the world's seed).
      let at = spawn;
      let delay = spawn.delay;
      if (spawn.random) {
        at = spawn.random.spots[Math.floor(this.rng() * spawn.random.spots.length)];
        const [lo, hi] = spawn.random.delay;
        delay = lo + this.rng() * (hi - lo);
      }
      return {
        id: this.nextId(),
        type: spawn.type,
        def,
        x: at.x,
        z: at.z,
        vx: 0,
        vz: 0,
        facing: 0,
        radius: def.radius,
        health: new Health(Math.max(1, Math.round(def.maxHealth * this.difficulty.enemyHealth))),
        armor: def.armor ?? 0, // fraction of every hit absorbed
        windupHits: 0, // hits taken during the current windup (see def.poise)
        damageTaken: 0, // total damage dealt to it, even past its last hit point (coins are paid on this)
        finale: spawn.finale === true, // appears only once every other enemy is down
        state: 'pending', // pending -> chase/windup/recover -> dead
        timer: 0,
        spawnAt: delay,
        get dead() {
          return this.state === 'dead';
        },
      };
    });

    this.apples = new AppleSystem(this);

    // Obstacles (water, trees, rocks, walls) live in one grid used by collision, pathing and line of sight.
    this.grid = buildLevelGrid(level);
    this.nav = new Navigator(this.grid);
    this.doors = [...this.grid.doors.values()].map((d) => ({
      id: this.nextId(),
      ix: d.ix,
      iz: d.iz,
      x: this.grid.centerX(d.ix),
      z: this.grid.centerZ(d.iz),
      open: false,
      closeTimer: 0,
      locked: d.locked === true, // the exit gate: opens only for a hero holding the key
    }));
    const gc = sceneryOf(level).gate ? gateCells(sceneryOf(level).gate) : null;
    this.gate = gc ? this.doors.find((d) => d.ix === gc.gate[0] && d.iz === gc.gate[1]) ?? null : null;
    this.shopZone = shopZone(level); // world-space rectangle in front of the shop desk, or null
    this.nearShop = false; // the hero is standing at the desk (the UI opens the shop)
    this.key = null; // { id, x, z } while it lies on the ground
    this.hasKey = false;
  }

  nextId() {
    return ++this._id;
  }

  emit(event) {
    this.events.push(event);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Enemies that are on the field and alive. */
  activeEnemies() {
    return this.enemies.filter((e) => e.state !== 'pending' && e.state !== 'dead');
  }

  /** What the player should do next: 'fight' | 'key' (pick it up) | 'gate' (walk through it) | 'shop' (oasis) | 'done'. */
  get objective() {
    if (this.state === 'won') return 'done';
    if (this.level.kind === 'shop') return 'shop';
    if (this.enemiesRemaining > 0) return 'fight';
    if (this.gate) return this.hasKey ? 'gate' : 'key';
    return 'done';
  }

  get enemiesRemaining() {
    return this.enemies.filter((e) => e.state !== 'dead' && !e.def.optional).length; // optional ones (the rocks) never hold up a level
  }

  step(dt, input) {
    if (this.state !== 'playing') return;
    this.time += dt;

    this.updateHero(dt, input);
    this.runScheduled();
    this.updateDoors(dt);

    const othersAlive = this.enemies.some((o) => !o.finale && !o.def.optional && o.state !== 'dead');
    for (const e of this.enemies) {
      if (e.state !== 'pending') continue;
      if (e.finale) {
        if (othersAlive) continue;
        e.finaleAt ??= this.time + e.spawnAt; // delay counts from the moment the field is clear
        if (this.time < e.finaleAt) continue;
      } else if (this.time < e.spawnAt) continue;
      e.state = e.def.behavior === 'sleeper' ? 'sleep' : 'chase';
      if (e.def.immovable) {
        // A rock is an obstacle for everyone's path planning (walkers go around it; shots still pass over it). Given back when it dies.
        const ix = this.grid.cellX(e.x);
        const iz = this.grid.cellZ(e.z);
        e.blockedCell = { ix, iz, prev: this.grid.flagsOf(ix, iz) };
        this.grid.block(ix, iz, MOVE);
      }
      this.emit({ type: 'enemySpawned', id: e.id, x: e.x, z: e.z });
    }
    for (const e of this.activeEnemies()) updateEnemy(this, e, dt);

    this.apples.update(dt);
    const z = this.shopZone;
    this.nearShop = z !== null && this.hero.x >= z.x0 && this.hero.x <= z.x1 && this.hero.z >= z.z0 && this.hero.z <= z.z1;
    this.updateProjectiles(dt);
    this.updateHeroShots(dt);
    this.updateCoins(dt);

    if (this.hero.health.isDead) {
      this.state = 'lost';
      this.emit({ type: 'heroDown' });
    } else if (this.enemiesRemaining === 0) {
      if (!this.gate) this.win();
      else {
        this.updateKey();
        const g = this.gate;
        const h = this.hero;
        const inGate = this.grid.cellX(h.x) === g.ix && this.grid.cellZ(h.z) === g.iz;
        if ((this.hasKey || !g.locked) && g.open && inGate) this.win();
      }
    }
  }

  win() {
    for (const pile of this.coinPiles) this.collectCoins(pile); // anything left on the ground goes in the wallet
    this.coinPiles = [];
    this.state = 'won';
    this.emit({ type: 'levelCleared' });
  }

  /** The last enemy's key: picked up by walking over it. */
  updateKey() {
    if (!this.key) return;
    if (dist(this.hero.x, this.hero.z, this.key.x, this.key.z) <= this.config.key.pickupRadius + this.hero.radius) {
      this.emit({ type: 'keyPicked', x: this.key.x, z: this.key.z });
      this.key = null;
      this.hasKey = true;
    }
  }

  updateHero(dt, input) {
    const h = this.hero;
    h.attackCooldown = Math.max(0, h.attackCooldown - dt);
    h.swingRemaining = Math.max(0, h.swingRemaining - dt);
    h.invuln = Math.max(0, h.invuln - dt);

    // A single bad input value (NaN from a flaky device) must never corrupt world state.
    const finite = (v) => (Number.isFinite(v) ? v : 0);
    const [nx, nz] = clampLength1(finite(input.moveX), finite(input.moveZ));
    h.moving = Math.hypot(nx, nz) > 0.01;
    h.x = clamp(h.x + nx * h.speed * dt, -this.bounds.halfW, this.bounds.halfW);
    h.z = clamp(h.z + nz * h.speed * dt, -this.bounds.halfD, this.bounds.halfD);
    resolveCircle(this.grid, h); // slide along water edges, trees, rocks and walls
    // A sleeping rock is solid: the hero stands against it, never inside it (it is not pushed, so we are).
    for (const e of this.enemies) {
      if (!e.def.immovable || e.state === 'pending' || e.state === 'dead') continue;
      const dx = h.x - e.x;
      const dz = h.z - e.z;
      const min = h.radius + e.radius;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      h.x = e.x + (d < 1e-6 ? min : (dx / d) * min);
      h.z = e.z + (d < 1e-6 ? 0 : (dz / d) * min);
      resolveCircle(this.grid, h);
      h.x = clamp(h.x, -this.bounds.halfW, this.bounds.halfW);
      h.z = clamp(h.z, -this.bounds.halfD, this.bounds.halfD);
    }
    if (h.moving && h.swingRemaining <= 0) h.facing = Math.atan2(nx, nz);

    if (this.weapon.aimLine) {
      const t = this.pickTarget();
      this.aimTarget = t && this.grid.lineClear(h.x, h.z, t.x, t.z, 0, SIGHT) ? t : null;
    } else this.aimTarget = null;

    if (input.attack && h.attackCooldown <= 0) this.heroAttack();
  }

  /** Run `fn` after `delay` seconds of fight time (the rest of a multi-part attack). */
  schedule(delay, fn) {
    this.scheduled.push({ at: this.time + delay, run: fn });
  }

  runScheduled() {
    if (this.scheduled.length === 0) return;
    const due = this.scheduled.filter((s) => s.at <= this.time);
    if (due.length === 0) return;
    this.scheduled = this.scheduled.filter((s) => s.at > this.time);
    for (const s of due) s.run();
  }

  /** Swap the weapon in the hero's hand mid-fight (the shop does this). Half-finished attacks of the old one are dropped. */
  setWeapon(weaponId) {
    this.weapon = getWeapon(weaponId);
    this.scheduled = [];
    this.heroShots = [];
    this.hero.attackCooldown = 0;
    this.hero.swingRemaining = 0;
    this.emit({ type: 'weaponChanged', weaponId });
  }

  /** The enemy auto-aim would pick: the nearest real enemy in reach, else a sleeping rock in reach, else null. */
  pickTarget() {
    const reach = this.weapon.range + this.config.autoAimExtra;
    const awake = this.activeEnemies().filter((e) => !e.def.optional);
    return nearestTarget(this.hero, awake, reach) ?? nearestTarget(this.hero, this.activeEnemies(), reach);
  }

  /** How far a straight line from (x, z) along (dx, dz) runs before a wall or tree stops it, up to `max` (water does not stop it). */
  rayLength(x, z, dx, dz, max, step = 0.25) {
    let clear = 0;
    for (let t = step; t <= max + 1e-9; t += step) {
      if (!this.grid.lineClear(x, z, x + dx * t, z + dz * t, 0, SIGHT)) return clear;
      clear = t;
    }
    return max;
  }

  /** Doors open by themselves when the hero or an enemy comes close, and close after everyone leaves. */
  updateDoors(dt) {
    const { openRadius, closeDelay } = this.config.doors;
    for (const door of this.doors) {
      // The exit gate ignores everyone but a hero who has the key; ordinary doors open for anybody.
      const actors = door.locked ? (this.hasKey ? [this.hero] : []) : [this.hero, ...this.activeEnemies()];
      const near = actors.some((a) => dist(a.x, a.z, door.x, door.z) <= openRadius);
      if (near) {
        door.closeTimer = closeDelay;
        if (!door.open) {
          door.open = true;
          this.grid.setDoorOpen(door.ix, door.iz, true);
          this.emit({ type: 'doorOpened', id: door.id });
        }
      } else if (door.open) {
        door.closeTimer -= dt;
        // Never shut on someone standing in the doorway.
        const occupied = actors.some((a) => dist(a.x, a.z, door.x, door.z) <= 0.5 + a.radius);
        if (door.closeTimer <= 0 && !occupied) {
          door.open = false;
          this.grid.setDoorOpen(door.ix, door.iz, false);
          this.emit({ type: 'doorClosed', id: door.id });
        }
      }
    }
  }

  heroAttack() {
    const h = this.hero;
    const w = this.weapon;
    // Auto-aim: face the nearest enemy within reach plus some assist.
    // Real enemies first: a sleeping rock only gets the swing when nothing else is in reach.
    const target = this.pickTarget();
    if (target) h.facing = angleTo(h.x, h.z, target.x, target.z);

    h.attackCooldown = w.cooldown;
    h.swingRemaining = w.swingTime;
    this.emit({ type: 'heroAttack', weaponId: w.id, facing: h.facing, duration: w.swingTime });
    runWeaponBehavior(this, w);
  }

  /** Returns true if the hit landed (false during post-hit grace). */
  /** Record one damage calculation for the DEV panel (ring buffer; plain data, the panel formats it). */
  logCalc(entry) {
    this.calcLog.push({ t: this.time, ...entry });
    if (this.calcLog.length > 40) this.calcLog.shift();
  }

  damageHero(amount, source) {
    const h = this.hero;
    if (h.invuln > 0 || this.state !== 'playing') return false;
    const scaled = amount * this.difficulty.enemyDamage; // everything that hurts the hero is an enemy
    const by = this.enemies.find((o) => o.id === source?.id)?.def.id ?? 'unknown';
    if (this.godMode) { // DEV menu: the hit is calculated and logged, but not applied
      this.logCalc({ kind: 'hurt', source: by, raw: amount, difficulty: this.difficulty.enemyDamage, applied: scaled, god: true, hpAfter: h.health.current, hpMax: h.health.max });
      h.invuln = this.config.hero.invulnAfterHit;
      return true;
    }
    const applied = h.health.damage(scaled);
    this.logCalc({ kind: 'hurt', source: by, raw: amount, difficulty: this.difficulty.enemyDamage, applied, hpAfter: h.health.current, hpMax: h.health.max });
    h.invuln = this.config.hero.invulnAfterHit;
    this.emit({ type: 'heroHurt', amount: applied, x: h.x, z: h.z, fromId: source?.id });
    return true;
  }

  /**
   * A hit from the hero. `base` is the weapon's damage; upgrades, a critical roll and the enemy's armor are applied here.
   * The full amount counts (coins and the floating number) even when it is more than the enemy had left.
   */
  damageEnemy(enemy, base, knockback = 0) {
    if (enemy.dead || enemy.state === 'pending') return;
    const crit = this.rng() < this.perks.critChance;
    const armor = Math.max(0, enemy.armor - (this.perks.armorPierce ?? 0)); // "sharper bolts" cut through armor
    const dealt = base * this.perks.damageMult * (crit ? this.perks.critMult : 1) * (1 - armor);
    enemy.damageTaken += dealt;
    enemy.health.damage(dealt);
    this.logCalc({ kind: 'hit', target: enemy.def.id, base, damageMult: this.perks.damageMult, crit, critMult: this.perks.critMult, armor, dealt, hpAfter: enemy.health.current, hpMax: enemy.health.max });
    this.emit({ type: 'enemyHit', id: enemy.id, amount: dealt, crit, x: enemy.x, z: enemy.z });

    if (!enemy.def.immovable) {
      const d = dist(this.hero.x, this.hero.z, enemy.x, enemy.z) || 1;
      enemy.vx += ((enemy.x - this.hero.x) / d) * knockback;
      enemy.vz += ((enemy.z - this.hero.z) / d) * knockback;
    }

    if (enemy.health.isDead) {
      enemy.state = 'dead';
      if (enemy.blockedCell) this.grid.setFlags(enemy.blockedCell.ix, enemy.blockedCell.iz, enemy.blockedCell.prev);
      this.emit({ type: 'enemyDied', id: enemy.id, x: enemy.x, z: enemy.z });
      this.apples.maybeDrop(enemy);
      this.dropCoins(enemy);
      if (this.gate && this.enemiesRemaining === 0 && !this.key && !this.hasKey) {
        this.key = { id: this.nextId(), x: enemy.x, z: enemy.z };
        this.emit({ type: 'keyDropped', x: enemy.x, z: enemy.z });
      }
    } else if (enemy.state === 'windup') {
      enemy.windupHits += 1;
      if (enemy.windupHits > (enemy.def.poise ?? 0)) {
        enemy.state = 'recover'; // stagger: the telegraphed attack is cancelled
        enemy.timer = enemy.def.stagger;
      }
    }
  }

  /** Coins for a defeated enemy: its damage taken, times a random factor within +-coins.spread. */
  dropCoins(enemy) {
    const { spread } = this.config.coins;
    const value = Math.round(enemy.damageTaken * (1 + (this.rng() * 2 - 1) * spread));
    if (value <= 0) return;
    const { halfW, halfD } = this.bounds;
    const pile = { id: this.nextId(), x: clamp(enemy.x, -halfW, halfW), z: clamp(enemy.z, -halfD, halfD), value };
    this.coinPiles.push(pile);
    this.emit({ type: 'coinsDropped', id: pile.id, x: pile.x, z: pile.z, value });
  }

  collectCoins(pile, swept = true) {
    this.coins += pile.value;
    this.coinsEarned += pile.value;
    this.emit({ type: 'coinsPicked', id: pile.id, x: pile.x, z: pile.z, value: pile.value, total: this.coins, swept });
  }

  /** Piles drift toward a nearby hero (when nothing blocks the way) and are taken on contact. */
  updateCoins(dt) {
    const { hero } = this;
    const cfg = this.config.coins;
    for (let i = this.coinPiles.length - 1; i >= 0; i--) {
      const pile = this.coinPiles[i];
      const d = dist(hero.x, hero.z, pile.x, pile.z);
      if (d <= cfg.pickupRadius + hero.radius) {
        this.coinPiles.splice(i, 1);
        this.collectCoins(pile, false);
      } else if (d <= cfg.magnetRadius && this.grid.lineClear(pile.x, pile.z, hero.x, hero.z, 0, SIGHT)) {
        const step = Math.min(d, cfg.magnetSpeed * dt);
        pile.x += ((hero.x - pile.x) / d) * step;
        pile.z += ((hero.z - pile.z) / d) * step;
      }
    }
  }

  /** Swap in new upgrade numbers (the shop does this). Extra max health also heals by the same amount. */
  applyPerks(perks) {
    const gained = perks.maxHealth - this.hero.health.max;
    this.perks = perks;
    this.hero.health.max = perks.maxHealth;
    if (gained > 0) this.hero.health.current += gained;
  }

  /** The toy gun: a dart leaves the hero along `facing`. It stops at walls and trees and at the first enemy it touches. */
  fireDart(weapon) {
    const h = this.hero;
    const dx = Math.sin(h.facing);
    const dz = Math.cos(h.facing);
    const dart = {
      id: this.nextId(),
      x: h.x,
      z: h.z,
      vx: dx * weapon.dartSpeed,
      vz: dz * weapon.dartSpeed,
      radius: weapon.dartRadius,
      damage: weapon.damage,
      knockback: weapon.knockback,
      life: weapon.range / weapon.dartSpeed,
    };
    this.heroShots.push(dart);
    this.emit({ type: 'heroShot', kind: 'dart', id: dart.id, x: dart.x, z: dart.z, facing: h.facing });
  }

  /** Darts move in short steps (so a fast one cannot skip over a thin enemy), stop at walls, and hit the first enemy in the way. */
  updateHeroShots(dt) {
    for (let i = this.heroShots.length - 1; i >= 0; i--) {
      const p = this.heroShots[i];
      p.life -= dt;
      const total = Math.hypot(p.vx, p.vz) * dt;
      const steps = Math.max(1, Math.ceil(total / 0.25));
      let gone = false;
      for (let k = 0; k < steps && !gone; k++) {
        const nx = p.x + (p.vx * dt) / steps;
        const nz = p.z + (p.vz * dt) / steps;
        if (Math.abs(nx) > this.bounds.halfW + 0.5 || Math.abs(nz) > this.bounds.halfD + 0.5 || !this.grid.lineClear(p.x, p.z, nx, nz, 0, SIGHT)) {
          this.emit({ type: 'shotStopped', x: p.x, z: p.z });
          gone = true;
          break;
        }
        p.x = nx;
        p.z = nz;
        const hit = this.activeEnemies().find((e) => dist(p.x, p.z, e.x, e.z) <= p.radius + e.radius);
        if (hit) {
          this.damageEnemy(hit, p.damage, p.knockback);
          this.emit({ type: 'shotStopped', x: p.x, z: p.z, hit: true });
          gone = true;
        }
      }
      if (!gone && p.life <= 0) {
        this.emit({ type: 'shotStopped', x: p.x, z: p.z }); // fell out of range
        gone = true;
      }
      if (gone) this.heroShots.splice(i, 1);
    }
  }

  /** An archer releases an arrow toward where the hero is right now. */
  fireArrow(enemy) {
    const a = angleTo(enemy.x, enemy.z, this.hero.x, this.hero.z);
    const speed = enemy.def.arrowSpeed;
    const arrow = {
      id: this.nextId(),
      x: enemy.x, // starts at the archer, so the first wall-check covers anything he stands against
      z: enemy.z,
      vx: Math.sin(a) * speed,
      vz: Math.cos(a) * speed,
      radius: 0.2,
      damage: enemy.def.damage,
      life: 2.5,
      fromId: enemy.id,
    };
    this.projectiles.push(arrow);
    this.emit({ type: 'arrowFired', id: arrow.id, x: arrow.x, z: arrow.z });
  }

  /** Arrows fly straight, stop at walls and trees (water does not stop them), and hurt the hero on contact. */
  updateProjectiles(dt) {
    const { hero } = this;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const nx = p.x + p.vx * dt;
      const nz = p.z + p.vz * dt;
      p.life -= dt;
      const outside = Math.abs(nx) > this.bounds.halfW + 0.5 || Math.abs(nz) > this.bounds.halfD + 0.5;
      if (p.life <= 0 || outside || !this.grid.lineClear(p.x, p.z, nx, nz, 0, SIGHT)) {
        this.projectiles.splice(i, 1);
        this.emit({ type: 'arrowStopped', x: nx, z: nz });
        continue;
      }
      p.x = nx;
      p.z = nz;
      // During the hero's grace period after a hit an arrow flies on through instead of vanishing.
      if (dist(p.x, p.z, hero.x, hero.z) <= hero.radius + p.radius && this.damageHero(p.damage, { id: p.fromId })) {
        this.projectiles.splice(i, 1);
        this.emit({ type: 'arrowStopped', x: p.x, z: p.z });
      }
    }
  }
}
