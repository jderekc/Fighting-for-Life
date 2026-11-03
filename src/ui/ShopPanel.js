import { UPGRADES, MAX_TIER } from '../data/upgrades.js';
import { nextCost, tierOf } from '../logic/profile.js';

const REASONS = { poor: 'Not enough coins yet!', maxed: 'Already at the top tier!', unknown: 'No such item.' };

/** The shop menu: one row per upgrade. Click a Buy button or press 1-5. Esc closes it (until you walk away and come back). */
export class ShopPanel {
  constructor(root = document, { onBuy = () => {}, onClose = () => {} } = {}) {
    this.root = root;
    this.el = root.getElementById('shop');
    this.onBuy = onBuy;
    this.onClose = onClose;
    this.visible = false;
    root.addEventListener('keydown', (e) => {
      if (!this.visible || e.repeat) return; // holding a key must not buy tier after tier
      if (e.code === 'Escape') {
        this.onClose();
        return;
      }
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && UPGRADES[Number(m[1]) - 1]) this.onBuy(UPGRADES[Number(m[1]) - 1].id);
    });
  }

  show(profile, message = '') {
    this.visible = true;
    this.el.hidden = false;
    this.render(profile, message);
  }

  hide() {
    this.visible = false;
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  render(profile, message = '') {
    const make = (tag, cls, text) => {
      const e = this.root.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const panel = make('div', 'shop-panel');
    const head = make('div', 'shop-head');
    head.append(make('h2', '', 'Mystic Shop'), make('div', 'shop-coins', `${profile.coins} coins`));
    panel.append(head);

    UPGRADES.forEach((up, i) => {
      const tier = tierOf(profile, up.id);
      const cost = nextCost(profile, up.id);
      const row = make('div', 'shop-row');
      const info = make('div', 'shop-info');
      info.append(make('div', 'shop-name', `${i + 1}. ${up.name}`), make('div', 'shop-blurb', up.blurb));
      const pips = make('div', 'shop-pips', '●'.repeat(tier) + '○'.repeat(MAX_TIER - tier));
      const button = make('button', 'shop-buy', cost === null ? 'MAX' : `Buy ${cost}`);
      button.disabled = cost === null;
      button.dataset.affordable = cost !== null && profile.coins >= cost ? 'yes' : 'no';
      button.addEventListener('click', () => this.onBuy(up.id));
      row.append(info, pips, button);
      panel.append(row);
    });

    panel.append(make('div', 'shop-msg', message), make('div', 'shop-hint', 'Click Buy or press 1-5 · Esc closes · the gate is open when you are ready'));
    this.el.replaceChildren(panel);
  }

  /** Show a short message (e.g. "Not enough coins") without rebuilding everything the caller knows about. */
  flash(profile, message) {
    if (this.visible) this.render(profile, message);
  }

  static reasonText(reason) {
    return REASONS[reason] ?? '';
  }
}
