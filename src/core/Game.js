import { LEVELS } from '../data/levels.js';
import { CONFIG } from '../config.js';
import { buyUpgrade, createProfile, perksOf, swapWeapon, weaponOf, withStartWeapon } from '../logic/profile.js';
import { Stage } from '../render/Stage.js';
import { WorldView } from '../render/WorldView.js';
import { World } from '../sim/World.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { ShopPanel } from '../ui/ShopPanel.js';
import { DevTools } from './DevTools.js';
import { healthAfterWin, healthForRetry } from '../logic/progress.js';
import { Input } from './Input.js';
import { difficultyOf, withDifficulty } from '../logic/difficulty.js';
import { Splash } from '../render/Splash.js';
import { ClickMover } from '../logic/clickMove.js';

const MAX_STEP = 1 / 30; // clamp long frames (tab switch, hitch) so the sim never lurches
const END_SCREEN_LOCKOUT_MS = 800; // ignore "confirm" briefly after win/lose so button-mashing can't skip the screen

/**
 * Top-level state machine: title -> playing -> won | lost -> playing ...
 * A win moves on to the next level (or back to level 1 after the last); a loss retries the same level.
 * Owns the loop and wires input -> sim -> view -> UI. Game rules live in src/sim, not here.
 */
export class Game {
  constructor(container) {
    this.stage = new Stage(container);
    this.input = new Input(window);
    this.input.attachCanvas(this.stage.renderer.domElement);
    this.clickMover = new ClickMover(); // right-click "walk there"
    this.hud = new Hud(document);
    this.screens = new Screens(
      document,
      () => this.confirm(),
      {
        get: () => this.profile.difficulty,
        set: (step) => (this.profile = withDifficulty(this.profile, step)), // takes effect when the next fight starts
      },
      {
        get: () => weaponOf(this.profile),
        set: (id) => (this.profile = withStartWeapon(this.profile, id)), // the free first pick; later swaps go through the shop's trade-in
      },
    );
    this.shopPanel = new ShopPanel(document, { onBuy: (id) => this.buy(id), onSwap: (id) => this.swap(id), onClose: () => this.closeShop() });
    this.shopDismissed = false; // Esc closes the menu until the hero walks away from the desk and back
    this.state = 'title';
    this.world = null;
    this.view = null;
    this.levelIndex = 0;
    this.profile = createProfile(); // coins and bought upgrades; they survive losses and restarts
    this.lastTime = null;
    this.endedAt = 0;
    this.paused = false;
    this.entryHealth = Infinity; // the HP the current level was entered with (a retry starts from it); Infinity = full
    this.frame = this.frame.bind(this);
    this.dev = new DevTools(this); // the DEV menu (` or F2): level jumps, FPS/renderer info, survived errors, damage maths

    // Pause the fight whenever the window loses focus or is hidden.
    const updatePaused = () => {
      this.paused = document.hidden || !document.hasFocus();
    };
    window.addEventListener('blur', () => (this.paused = true));
    window.addEventListener('focus', updatePaused);
    document.addEventListener('visibilitychange', updatePaused);
  }

  boot() {
    this.fadeEl = document.getElementById('fade');
    this.stage.setPixelRatioCap(1.5); // the flyover is heavy; the fights get the full ratio back in start()
    this.splash = new Splash(this.fadeEl); // the title-screen flyover; freed when the first fight starts
    this.screens.show('title');
    requestAnimationFrame(this.frame);
  }

  confirm() {
    if (this.state === 'playing') return;
    if (this.state !== 'title' && performance.now() - this.endedAt < END_SCREEN_LOCKOUT_MS) return;
    // Health carries over and the game never resets it (apples are the only way up); only a fresh run starts full.
    if (this.state === 'title') {
      this.levelIndex = 0;
      this.entryHealth = Infinity;
    } else if (this.state === 'won') {
      if (this.hasNextLevel) {
        this.levelIndex += 1;
        this.entryHealth = healthAfterWin(this.world.hero.health.current);
      } else {
        this.levelIndex = 0; // after the last level, start over fresh (coins and upgrades are kept)
        this.entryHealth = Infinity;
      }
    } else {
      this.entryHealth = healthForRetry(this.entryHealth); // retry the same level, from the health it was entered with
    }
    this.start();
  }

  /** The weapon in the hero's hand: whatever the profile says (chosen on the title screen, changed at the shop). */
  get weaponId() {
    return weaponOf(this.profile);
  }

  /** DEV menu: start level `index` right now, at full health (a testing shortcut, not a game rule). */
  jumpToLevel(index) {
    this.entryHealth = Infinity;
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.start();
  }

  closeShop() {
    this.shopDismissed = true;
    this.shopPanel.hide();
  }

  /** Spend coins at the desk. The live world's wallet and perks are updated straight away. */
  buy(id) {
    if (this.state !== 'playing' || !this.world?.nearShop) return;
    const before = { ...this.profile, coins: this.world.coins };
    const result = buyUpgrade(before, id);
    if (!result.ok) {
      this.shopPanel.flash(before, ShopPanel.reasonText(result.reason));
      return;
    }
    this.profile = result.profile;
    this.world.coins = this.profile.coins;
    this.world.applyPerks(perksOf(this.profile, CONFIG));
    this.hud.bounceCoins();
    this.shopPanel.render(this.profile, 'Thank you!');
  }

  /** Trade the weapon in at the desk: its upgrades go, 25% of what they cost counts toward the new one. Takes effect in the live fight. */
  swap(id) {
    if (this.state !== 'playing' || !this.world?.nearShop) return;
    const before = { ...this.profile, coins: this.world.coins };
    const result = swapWeapon(before, id);
    if (!result.ok) {
      this.shopPanel.flash(before, ShopPanel.reasonText(result.reason));
      return;
    }
    this.profile = result.profile;
    this.world.coins = this.profile.coins;
    this.world.setWeapon(id);
    this.world.applyPerks(perksOf(this.profile, CONFIG));
    this.hud.bounceCoins();
    this.shopPanel.render(this.profile, 'Traded in. Good luck!');
  }

  /** Open the menu while the hero stands at the desk; close it when they leave. */
  updateShop() {
    const near = this.world.nearShop;
    if (near && !this.shopDismissed && !this.shopPanel.visible) this.shopPanel.show({ ...this.profile, coins: this.world.coins });
    else if (!near && (this.shopPanel.visible || this.shopDismissed)) {
      this.shopPanel.hide();
      this.shopDismissed = false;
    }
  }

  get hasNextLevel() {
    return this.levelIndex + 1 < LEVELS.length;
  }

  start() {
    if (this.splash) {
      this.splash.dispose(); // also clears the fade overlay
      this.splash = null;
      this.stage.setPixelRatioCap(2);
    }
    this.view?.dispose();
    this.hud.clearFloaters();
    this.shopPanel.hide();
    this.shopDismissed = false;

    const level = LEVELS[this.levelIndex];
    this.world = new World(level, this.weaponId, {
      startHealth: this.entryHealth,
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
      startCoins: this.profile.coins,
      perks: perksOf(this.profile, CONFIG),
      difficulty: difficultyOf(this.profile),
    });
    this.dev.onWorldStart(this.world);
    this.stage.setArena(level.arena);
    this.view = new WorldView(this.stage.scene, this.stage.camera, this.world, this.hud, this.profile.hero, { shake: (strength, seconds) => this.stage.shake(strength, seconds) });
    this.stage.follow(this.world.hero.x, this.world.hero.z, 0, true);

    this.screens.hide();
    this.hud.show(`${level.id}. ${level.name}`);
    this.state = 'playing';
  }

  frame(timeMs) {
    // Schedule the next frame first, so nothing in this frame can stop the loop; an exception is recorded for the DEV panel and the game keeps running.
    requestAnimationFrame(this.frame);
    try {
      this.tick(timeMs);
    } catch (err) {
      console.error(err);
      this.dev.caught(err);
    }
  }

  tick(timeMs) {
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(MAX_STEP * 3, (timeMs - this.lastTime) / 1000));
    if (this.lastTime !== null) this.dev.frame(timeMs - this.lastTime, dt);
    this.lastTime = timeMs;

    const input = this.input.read();
    // Right click: walk there. Keys or the stick take over at once and cancel it.
    const click = this.input.takeMoveClick();
    if (click && this.world && this.state === 'playing') {
      const p = this.stage.groundPoint(click.x, click.y, this.world.grid.heightAt(this.world.hero.x, this.world.hero.z));
      if (p) {
        const hw = this.world.bounds;
        this.clickMover.set(Math.max(-hw.halfW, Math.min(hw.halfW, p.x)), Math.max(-hw.halfD, Math.min(hw.halfD, p.z)));
      }
    }
    if (input.moveX || input.moveZ || !this.world || this.state !== 'playing') this.clickMover.clear();
    else if (!this.paused) { // while paused the world is frozen, so the stuck detector must not run
      const auto = this.clickMover.update(this.world.hero, (a, t, d) => this.world.nav.steer(a, t, d), dt);
      if (auto) Object.assign(input, auto);
    }
    if (this.input.consumeConfirm()) this.confirm();

    if (this.world && this.state === 'playing' && !this.paused) {
      this.world.step(Math.min(dt, MAX_STEP), input);
    }

    if (this.world && this.view) {
      const events = this.world.drainEvents();
      for (const ev of events) {
        if (ev.type === 'heroHurt') this.stage.shake(0.3, 0.2);
      }
      this.view.update(dt, events);
      this.hud.update(this.world);
      this.stage.follow(this.world.hero.x, this.world.hero.z, dt);
      if (this.state === 'playing' && this.world.level.kind === 'shop') this.updateShop();

      if (this.state === 'playing' && this.world.state !== 'playing') {
        this.state = this.world.state; // 'won' | 'lost'
        this.profile = { ...this.profile, coins: this.world.coins }; // coins picked up are kept even after a knock-out
        this.endedAt = performance.now();
        this.shopPanel.hide();
        const next = this.state === 'won' && this.hasNextLevel ? LEVELS[this.levelIndex + 1] : null;
        const sub = next?.kind === 'shop' ? 'A mystical oasis lies ahead. Spend your coins on upgrades!' : null;
        this.screens.show(next ? 'cleared' : this.state, sub);
      }
    }

    this.hud.updateFloaters(dt, this.stage.camera, this.stage.renderer.domElement);
    if (this.splash && this.state === 'title' && !this.world) {
      // The flyover is the heaviest scene in the game: while the window is unfocused it neither advances nor redraws
      // (the last frame stays on the canvas), except once after a resize, which clears the canvas.
      const resized = this.stage.takeResized();
      if (!this.paused) this.splash.update(dt);
      if (!this.paused || resized) this.stage.renderOther(this.splash.scene, this.splash.camera);
    } else this.stage.render();
  }
}
