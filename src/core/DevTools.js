import { REVISION, Vector2 } from 'three';
import { LEVELS } from '../data/levels.js';
import { STEPS, withDifficulty } from '../logic/difficulty.js';
import { ErrorLog, FpsMeter, formatCalc } from '../logic/devStats.js';
import { DevPanel } from '../ui/DevPanel.js';

/**
 * The DEV menu (toggle with ` or F2): level jumps and cheats, FPS and renderer details, the errors the game survived,
 * and the last damage calculations. It only reads the Game and calls its public methods; the sim stays untouched except for
 * `world.godMode` and `world.calcLog`. Error capture starts at construction, so problems before the panel opens are kept.
 */
export class DevTools {
  constructor(game) {
    this.game = game;
    this.fps = new FpsMeter(120);
    this.errors = new ErrorLog(20);
    this.god = false;
    this.sinceRender = 0;
    this.panel = new DevPanel(document, LEVELS, STEPS.map((s) => s.name), {
      jump: (i) => game.jumpToLevel(i),
      restart: () => game.jumpToLevel(game.levelIndex),
      heal: () => game.world && (game.world.hero.health.current = game.world.hero.health.max),
      coins: () => this.addCoins(500),
      killAll: () => this.killAll(),
      toggleGod: () => this.setGod(!this.god),
      setDifficulty: (step) => {
        game.profile = withDifficulty(game.profile, step);
        game.jumpToLevel(game.levelIndex); // difficulty applies when a fight starts, so restart the level
      },
      clearErrors: () => this.errors.clear(),
    });
    this.hookErrors();
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Backquote' || e.code === 'F2') && !e.repeat) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle() {
    this.panel.visible = !this.panel.visible;
    this.sinceRender = 1; // draw at once
  }

  /** Called by Game after each level starts, to re-apply sticky cheats to the new world. */
  onWorldStart(world) {
    world.godMode = this.god;
  }

  setGod(on) {
    this.god = on;
    if (this.game.world) this.game.world.godMode = on;
  }

  addCoins(n) {
    const g = this.game;
    if (!g.world) return;
    g.world.coins += n;
    g.profile = { ...g.profile, coins: g.world.coins };
  }

  killAll() {
    const w = this.game.world;
    if (!w) return;
    for (const e of w.activeEnemies()) if (!e.def.optional) w.damageEnemy(e, 99999, 0);
  }

  /** Errors that are logged and survived: window errors, rejected promises, console.error/warn, and anything the frame loop caught. */
  hookErrors() {
    window.addEventListener('error', (e) => this.errors.add(e.message || e.error, 'window'));
    window.addEventListener('unhandledrejection', (e) => this.errors.add(e.reason?.message ?? e.reason, 'promise'));
    for (const level of ['error', 'warn']) {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        this.errors.add(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '), `console.${level}`);
        original(...args);
      };
    }
  }

  /** The frame loop caught an exception and kept going. */
  caught(err) {
    this.errors.add(err?.stack?.split('\n').slice(0, 2).join(' @ ') ?? err, 'frame');
  }

  /** Call once per frame with the real frame time in ms. Cheap when the panel is closed. */
  frame(ms, dtSeconds) {
    this.fps.push(ms);
    if (!this.panel.visible) return;
    this.sinceRender += dtSeconds;
    if (this.sinceRender < 0.25) return; // 4 updates a second is plenty to read
    this.sinceRender = 0;
    this.panel.render(this.text(), this.god);
  }

  gpuInfo() {
    if (this._gpu) return this._gpu;
    const r = this.game.stage.renderer;
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
    this._gpu = { renderer, vendor, software, version: r.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1', glVersion: gl.getParameter(gl.VERSION) };
    return this._gpu;
  }

  text() {
    const g = this.game;
    const r = g.stage.renderer;
    const gpu = this.gpuInfo();
    const f = this.fps.stats();
    const info = r.info;
    const size = r.getSize((this._size ??= new Vector2()));
    const perf = [
      `FPS ${f.fps.toFixed(1)}   frame ${f.avgMs.toFixed(1)} ms avg, ${f.worstMs.toFixed(0)} ms worst (last ${f.frames})`,
      `${gpu.version} (${gpu.glVersion})`,
      `GPU ${gpu.renderer}${gpu.software ? '   <-- SOFTWARE RENDERING (slow)' : ''}`,
      `three r${REVISION}   canvas ${size.x}x${size.y} @ pixel ratio ${r.getPixelRatio()}`,
      `last render: ${info.render.calls} draw calls, ${(info.render.triangles / 1000).toFixed(1)}k triangles`,
      `scene: ${g.splash && g.state === 'title' ? 'title flyover (splash)' : 'game world'}${g.paused ? '   (PAUSED: window not focused)' : ''}`,
    ].join('\n');

    const w = g.world;
    let sim = 'no world (title screen)';
    if (w) {
      const alive = w.enemies.filter((e) => e.state !== 'dead' && e.state !== 'pending' && !e.def.optional).length;
      const pending = w.enemies.filter((e) => e.state === 'pending').length;
      const p = w.perks;
      sim = [
        `level ${w.level.id} "${w.level.name}" (${w.level.kind ?? 'fight'})  state ${g.state}/${w.state}  objective ${w.objective}  t ${w.time.toFixed(1)}s`,
        `hero ${w.hero.health.current.toFixed(1)}/${w.hero.health.max} hp  at (${w.hero.x.toFixed(1)}, ${w.hero.z.toFixed(1)})  invuln ${w.hero.invuln.toFixed(2)}s  coins ${w.coins}${w.godMode ? '  GOD' : ''}`,
        `enemies: ${alive} alive, ${pending} not yet arrived, ${w.projectiles.length} arrows, ${w.coinPiles.length} coin piles`,
        `perks: dmg x${p.damageMult}  crit ${(p.critChance * 100).toFixed(0)}% x${p.critMult}  max hp ${p.maxHealth}  apple heal ${p.appleHeal}`,
        `difficulty: ${STEPS[g.profile.difficulty]?.name}  enemy damage x${w.difficulty.enemyDamage}, enemy hp x${w.difficulty.enemyHealth}`,
        `weapon ${w.weapon.id ?? g.weaponId}: ${w.weapon.damage} base dmg`,
      ].join('\n');
    }

    const calc = w?.calcLog.length ? w.calcLog.slice(-8).map(formatCalc).join('\n') : '(no hits yet)';
    const errors = this.errors.entries.length
      ? this.errors.entries.map((e) => `[${e.source}]${e.count > 1 ? ` x${e.count}` : ''} ${e.msg}`).join('\n')
      : 'none';
    return { perf, sim, calc, errors };
  }
}
