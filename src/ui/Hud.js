import { Vector3 } from 'three';

const FLOAT_LIFE = 0.9;
const OBJECTIVE_TEXT = {
  fight: (w) => {
    const left = w.enemies.filter((e) => e.state !== 'dead' && !e.def.optional);
    const elites = left.filter((e) => e.def.elite);
    return elites.length > 0 && elites.length === left.length ? `Defeat the ${elites[0].def.name}!` : `Enemies left: ${left.length}`;
  },
  key: () => 'Grab the golden key!',
  gate: () => 'Take it to the gate!',
  shop: (w) => (w.nearShop ? '' : 'Visit the shop, then take the gate!'),
  done: () => '',
};
const scratch = new Vector3(); // reused every frame to avoid garbage

/** DOM overlay: hero health bar, enemy counter, and floating damage/heal numbers. */
export class Hud {
  constructor(root = document) {
    this.hud = root.getElementById('hud');
    this.fill = root.getElementById('hp-fill');
    this.text = root.getElementById('hp-text');
    this.bar = root.getElementById('hp-bar');
    this.enemyCount = root.getElementById('enemy-count');
    this.levelName = root.getElementById('level-name');
    this.coinCount = root.getElementById('coin-count');
    this.coinWrap = root.getElementById('coin-wrap');
    this.floaterLayer = root.getElementById('floaters');
    this.floaters = [];
    this.root = root;
  }

  show(levelName) {
    this.hud.hidden = false;
    this.levelName.textContent = levelName;
  }

  hide() {
    this.hud.hidden = true;
    this.clearFloaters();
  }

  update(world) {
    const { health } = world.hero;
    this.fill.style.width = `${Math.max(0, health.fraction * 100)}%`;
    this.fill.dataset.band = health.band;
    this.text.textContent = `${Math.ceil(health.current)} / ${health.max}`;
    this.coinCount.textContent = String(world.coins);
    this.enemyCount.textContent = OBJECTIVE_TEXT[world.objective]?.(world) ?? '';
  }

  /** A quick scale "pop" on the health bar when hurt or healed. */
  bounceHealth() {
    this.bar.classList.remove('bounce');
    void this.bar.offsetWidth; // restart the CSS animation
    this.bar.classList.add('bounce');
  }

  bounceCoins() {
    this.coinWrap.classList.remove('bounce');
    void this.coinWrap.offsetWidth;
    this.coinWrap.classList.add('bounce');
  }

  floatText(text, x, y, z, kind = 'hit') {
    const el = this.root.createElement('div');
    el.className = `floater ${kind}`;
    el.textContent = text;
    this.floaterLayer.appendChild(el);
    this.floaters.push({ el, x, y, z, t: 0 });
  }

  /** Project floating text from world space to screen space. */
  updateFloaters(dt, camera, canvas) {
    const rect = canvas.getBoundingClientRect();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= FLOAT_LIFE) {
        f.el.remove();
        this.floaters.splice(i, 1);
        continue;
      }
      const v = scratch.set(f.x, f.y + f.t * 1.2, f.z).project(camera);
      f.el.style.left = `${rect.left + ((v.x + 1) / 2) * rect.width}px`;
      f.el.style.top = `${rect.top + ((1 - v.y) / 2) * rect.height}px`;
      f.el.style.opacity = String(1 - f.t / FLOAT_LIFE);
    }
  }

  clearFloaters() {
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
  }
}
