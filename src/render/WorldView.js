import * as THREE from 'three';
import { BIOMES } from '../data/biomes.js';
import { rectCells, sceneryOf, waterRects } from '../logic/levelGrid.js';
import { Arena } from './Arena.js';
import { animateApple, createAppleMesh, disposeApple } from './AppleView.js';
import { CharacterView } from './CharacterView.js';
import { createArrowMesh, createDartMesh } from './ArrowView.js';
import { animateCoin, createCoinMesh } from './CoinView.js';
import { Effects } from './Effects.js';
import { animateKey, createKeyMesh, disposeKey } from './KeyView.js';
import { cleanHeroName, DEFAULT_HERO_ID, HEROES } from '../data/heroes.js';
import { NameTag } from './NameTag.js';
import { Scenery } from './scenery/Scenery.js';

const BODY_RADIUS = 0.3; // how far from a character's center its body reaches, for standing on steps

/**
 * Turns a World (pure sim) into three.js objects. It reads sim state every frame and reacts to
 * the events the sim emitted, but never changes the sim.
 */
export class WorldView {
  /**
   * @param {{kind:string, name:string}} heroInfo from the profile (who the player is playing)
   * @param {{shake?: (strength:number, seconds:number) => void}} hooks things the view cannot do itself (the camera belongs to the Stage)
   */
  constructor(scene, camera, world, hud, heroInfo = { kind: DEFAULT_HERO_ID, name: HEROES[DEFAULT_HERO_ID].defaultName }, hooks = {}) {
    this.hooks = hooks;
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.hud = hud;

    this.group = new THREE.Group();
    scene.add(this.group);

    // No ground block under the stream: the water draws its own bed.
    const waterCells = new Set(waterRects(sceneryOf(world.level)).flatMap(rectCells).map(([x, z]) => `${x},${z}`));
    this.arena = new Arena(world.level.arena, {
      holes: waterCells,
      grid: world.grid,
      biome: BIOMES[world.level.biome ?? 'meadow'],
      seed: world.level.id,
    });
    this.group.add(this.arena.group);
    this.scenery = new Scenery(this.group, world.level, world);
    this.effects = new Effects(this.group);

    const heroDef = HEROES[heroInfo.kind] ?? HEROES[DEFAULT_HERO_ID];
    this.hero = new CharacterView(heroDef.look, { weapon: world.weapon.id });
    this.hero.addTo(this.group);
    this.nameTag = heroDef.nameTag ? new NameTag(cleanHeroName(heroInfo.name, heroDef.id)) : null;
    if (this.nameTag) this.group.add(this.nameTag.sprite);

    this.enemyViews = new Map(); // enemy id -> CharacterView
    this.appleViews = new Map(); // apple id -> mesh
    this.coinViews = new Map(); // coin pile id -> mesh
    this.arrowViews = new Map(); // arrow id -> mesh
    this.dartViews = new Map(); // the hero's dart id -> mesh
    this.aimLine = createAimLine(); // the sniper's line to its target
    this.group.add(this.aimLine);
    this.keyMesh = null;
    this.clock = 0;
  }

  /** Call once per frame with the events drained from the sim. */
  update(dt, events) {
    this.clock += dt;
    const { world } = this;

    for (const ev of events) this.handleEvent(ev);
    this.scenery.update(dt, world);

    // Hero
    this.settleGround(this.hero, world.hero, dt);
    this.hero.sync(world.hero, dt);
    this.nameTag?.follow(world.hero.x, (this.hero.groundY ?? 0) + 2.45, world.hero.z);
    // Blink while invulnerable after a hit.
    // (Only while playing: invuln stops counting down once the fight ends, so it would blink forever.)
    const blinkOff = world.state === 'playing' && world.hero.invuln > 0 && Math.floor(this.clock * 20) % 2 === 0;
    this.hero.root.visible = !blinkOff;

    // Enemies: views are created when an enemy leaves 'pending'.
    for (const e of world.enemies) {
      if (e.state === 'pending') continue;
      let view = this.enemyViews.get(e.id);
      if (!view) {
        if (e.state === 'dead') continue; // died before a view ever existed
        view = new CharacterView(e.def.look, { healthBar: true, camera: this.camera, bow: e.def.weapon === 'bow' });
        view.addTo(this.group);
        this.enemyViews.set(e.id, view);
      }
      this.settleGround(view, e, dt);
      view.sync(e, dt, e.health.fraction);
      if (view.finished) {
        view.removeFrom(this.group);
        view.dispose();
        this.enemyViews.delete(e.id);
      }
    }

    // Apples
    for (const apple of world.apples.apples) {
      let mesh = this.appleViews.get(apple.id);
      if (!mesh) {
        mesh = createAppleMesh();
        this.group.add(mesh);
        this.appleViews.set(apple.id, mesh);
      }
      animateApple(mesh, apple.x, apple.z, this.clock, apple.id);
      mesh.position.y += world.grid.heightAt(apple.x, apple.z);
    }
    this.pruneApples();

    // Enemy arrows
    const liveArrows = new Set();
    for (const a of world.projectiles) {
      liveArrows.add(a.id);
      let mesh = this.arrowViews.get(a.id);
      if (!mesh) {
        mesh = createArrowMesh();
        mesh.rotation.y = Math.atan2(a.vx, a.vz);
        this.group.add(mesh);
        this.arrowViews.set(a.id, mesh);
      }
      mesh.position.set(a.x, 1.1 + world.grid.heightAt(a.x, a.z), a.z);
    }
    for (const [id, mesh] of this.arrowViews) {
      if (!liveArrows.has(id)) {
        this.group.remove(mesh);
        this.arrowViews.delete(id);
      }
    }

    // The hero's darts
    const liveDarts = new Set();
    for (const d of world.heroShots) {
      liveDarts.add(d.id);
      let mesh = this.dartViews.get(d.id);
      if (!mesh) {
        mesh = createDartMesh();
        mesh.rotation.y = Math.atan2(d.vx, d.vz);
        this.group.add(mesh);
        this.dartViews.set(d.id, mesh);
      }
      mesh.position.set(d.x, 1.1 + world.grid.heightAt(d.x, d.z), d.z);
    }
    for (const [id, mesh] of this.dartViews) {
      if (!liveDarts.has(id)) {
        this.group.remove(mesh);
        this.dartViews.delete(id);
      }
    }

    // The sniper's aim line: from the hero to the enemy the next shot would hit.
    const aim = world.aimTarget;
    this.aimLine.visible = world.state === 'playing' && aim !== null;
    if (this.aimLine.visible) {
      const h = world.hero;
      const dx = aim.x - h.x;
      const dz = aim.z - h.z;
      const len = Math.hypot(dx, dz);
      this.aimLine.position.set(h.x + dx / 2, 1.1 + (this.hero.groundY ?? 0), h.z + dz / 2);
      this.aimLine.scale.set(0.09, 0.09, len);
      this.aimLine.rotation.y = Math.atan2(dx, dz);
      this.aimLine.material.opacity = 0.35 + 0.2 * Math.sin(this.clock * 12);
    }

    // Coin piles
    const livePiles = new Set();
    for (const pile of world.coinPiles) {
      livePiles.add(pile.id);
      let mesh = this.coinViews.get(pile.id);
      if (!mesh) {
        mesh = createCoinMesh(pile.value);
        this.group.add(mesh);
        this.coinViews.set(pile.id, mesh);
      }
      animateCoin(mesh, pile.x, world.grid.heightAt(pile.x, pile.z), pile.z, this.clock, pile.id);
    }
    for (const [id, mesh] of this.coinViews) {
      if (!livePiles.has(id)) {
        this.group.remove(mesh); // geometry and material are shared, so nothing to dispose
        this.coinViews.delete(id);
      }
    }

    // The key: appears when the last enemy falls, disappears when the hero takes it.
    const key = world.key;
    if (key && !this.keyMesh) {
      this.keyMesh = createKeyMesh();
      this.group.add(this.keyMesh);
    } else if (!key && this.keyMesh) {
      this.group.remove(this.keyMesh);
      disposeKey(this.keyMesh);
      this.keyMesh = null;
    }
    if (key) animateKey(this.keyMesh, key.x, key.z, world.grid.heightAt(key.x, key.z), this.clock);

    this.effects.update(dt);
  }

  /**
   * Put a character's feet on the highest ground its body touches. Going up is instant (otherwise the body
   * sinks into the step it is walking onto); coming down glides, so a drop reads as a quick hop.
   */
  settleGround(view, sim, dt) {
    const target = this.world.grid.maxHeightNear(sim.x, sim.z, BODY_RADIUS);
    if (view.groundY === undefined || target >= view.groundY) view.groundY = target;
    else view.groundY += (target - view.groundY) * Math.min(1, 18 * dt);
  }

  pruneApples() {
    const live = new Set(this.world.apples.apples.map((a) => a.id));
    for (const [id, mesh] of this.appleViews) {
      if (!live.has(id)) {
        this.group.remove(mesh);
        disposeApple(mesh);
        this.appleViews.delete(id);
      }
    }
  }

  handleEvent(ev) {
    switch (ev.type) {
      case 'heroAttack':
        this.hero.startSwing(ev.duration);
        break;
      case 'weaponChanged':
        this.hero.setWeapon(ev.weaponId);
        break;
      case 'heroSlam': {
        const y = this.world.grid.heightAt(ev.x, ev.z);
        this.effects.ring(ev.x, ev.z, ev.radius, { y: y + 0.12 });
        this.effects.ring(ev.x, ev.z, ev.radius * 0.6, { y: y + 0.14, color: '#ffffff', life: 0.3 });
        this.effects.burst(ev.x, ev.z, { color: '#c8a070', count: 16, up: 3, spread: ev.radius * 1.6, life: 0.45, y: y + 0.3 });
        this.hooks.shake?.(0.35, 0.2);
        break;
      }
      case 'heroShot': {
        const y = 1.1 + this.world.grid.heightAt(ev.x, ev.z);
        if (ev.kind === 'beam') {
          this.effects.tracer(ev.x, ev.z, ev.x1, ev.z1, { y });
          this.effects.burst(ev.x1, ev.z1, { color: '#ff5a5a', count: ev.hit ? 8 : 3, up: 2, spread: 1.5, life: 0.3, y });
          this.hooks.shake?.(0.12, 0.2);
        } else {
          this.effects.burst(ev.x + Math.sin(ev.facing) * 0.6, ev.z + Math.cos(ev.facing) * 0.6, { color: '#ffe14d', count: 3, up: 1, spread: 1, life: 0.2, y });
        }
        break;
      }
      case 'shotStopped':
        this.effects.burst(ev.x, ev.z, { color: ev.hit ? '#ff5fa2' : '#ffe14d', count: ev.hit ? 6 : 3, up: 2, spread: 1.5, life: 0.3, y: 1.0 + this.world.grid.heightAt(ev.x, ev.z) });
        break;
      case 'enemyHit': {
        this.enemyViews.get(ev.id)?.flash();
        this.hud.floatText(ev.crit ? `${Math.round(ev.amount)}!` : `${Math.round(ev.amount)}`, ev.x, 2.4 + this.world.grid.heightAt(ev.x, ev.z), ev.z, ev.crit ? 'crit' : 'hit');
        if (ev.crit) this.effects.burst(ev.x, ev.z, { color: '#fff3a0', count: 8, up: 3, y: 1.4 + this.world.grid.heightAt(ev.x, ev.z) });
        break;
      }
      case 'enemyDied':
        this.enemyViews.get(ev.id)?.die();
        this.effects.burst(ev.x, ev.z, { color: '#ffe14d', count: 12, y: 1.2 + this.world.grid.heightAt(ev.x, ev.z) });
        break;
      case 'enemySpawned': {
        const e = this.world.enemies.find((x) => x.id === ev.id);
        if (e?.def.elite || e?.def.announce) {
          this.hud.floatText(`${e.def.name}!`.toUpperCase(), ev.x, 3.6 + this.world.grid.heightAt(ev.x, ev.z), ev.z, 'big');
          this.effects.burst(ev.x, ev.z, { color: '#ff9a3a', count: 20, up: 6, spread: 4, y: 1.0 + this.world.grid.heightAt(ev.x, ev.z) });
        }
        break;
      }
      case 'arrowStopped':
        this.effects.burst(ev.x, ev.z, { color: '#c8a070', count: 4, up: 2, spread: 1.5, life: 0.35, y: 1.0 + this.world.grid.heightAt(ev.x, ev.z) });
        break;
      case 'enemyNova': {
        const y = 0.5 + this.world.grid.heightAt(ev.x, ev.z);
        this.effects.burst(ev.x, ev.z, { color: '#ffd23a', count: 22, up: 1.5, spread: 4.5, life: 0.4, y });
        this.effects.burst(ev.x, ev.z, { color: '#ff7a1a', count: 10, up: 2, spread: 3, life: 0.4, y });
        break;
      }
      case 'enemyAttack':
        this.enemyViews.get(ev.id)?.startSwing(0.2);
        break;
      case 'heroHurt':
        this.hero.flash();
        this.hud.floatText(`-${Math.round(ev.amount)}`, ev.x, 2.4 + this.world.grid.heightAt(ev.x, ev.z), ev.z, 'hurt');
        this.hud.bounceHealth();
        break;
      case 'applePicked':
        this.effects.burst(ev.x, ev.z, { color: '#e03030', count: 8, up: 4, y: 0.6 + this.world.grid.heightAt(ev.x, ev.z) });
        this.effects.burst(ev.x, ev.z, { color: '#4cc04c', count: 5, up: 4, y: 0.6 + this.world.grid.heightAt(ev.x, ev.z) });
        this.hud.floatText(`+${Math.round(ev.healed)}`, ev.x, 2.0 + this.world.grid.heightAt(ev.x, ev.z), ev.z, 'heal');
        this.hud.bounceHealth();
        break;
      case 'coinsDropped':
        this.effects.burst(ev.x, ev.z, { color: '#ffd23a', count: 8, up: 4, y: 0.8 + this.world.grid.heightAt(ev.x, ev.z) });
        break;
      case 'coinsPicked':
        if (!ev.swept) this.effects.burst(ev.x, ev.z, { color: '#ffd23a', count: 6, up: 4, y: 0.8 + this.world.grid.heightAt(ev.x, ev.z) });
        this.hud.floatText(`+${ev.value}`, ev.x, 1.8 + this.world.grid.heightAt(ev.x, ev.z), ev.z, 'coin');
        this.hud.bounceCoins();
        break;
      case 'keyDropped':
        this.effects.burst(ev.x, ev.z, { color: '#ffd23a', count: 18, up: 6, spread: 4, y: 1.0 + this.world.grid.heightAt(ev.x, ev.z) });
        break;
      case 'keyPicked':
        this.effects.burst(ev.x, ev.z, { color: '#ffd23a', count: 14, up: 5, y: 1.0 + this.world.grid.heightAt(ev.x, ev.z) });
        this.hud.floatText('Key!', ev.x, 2.2 + this.world.grid.heightAt(ev.x, ev.z), ev.z, 'heal');
        break;
      default:
        break;
    }
  }

  dispose() {
    for (const view of this.enemyViews.values()) view.dispose();
    this.hero.dispose();
    this.nameTag?.dispose();
    this.aimLine.material.dispose();
    this.aimLine.geometry.dispose();
    for (const mesh of this.appleViews.values()) disposeApple(mesh);
    if (this.keyMesh) disposeKey(this.keyMesh);
    this.arena.dispose();
    this.scenery.dispose();
    this.effects.dispose();
    this.group.removeFromParent();
  }
}

/** A thin translucent red box, stretched between the hero and a target each frame. */
function createAimLine() {
  const line = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.45, depthWrite: false }));
  line.visible = false;
  return line;
}
