import { upgradesFor, MAX_TIER } from '../data/upgrades.js';
import { WEAPON_IDS, WEAPONS } from '../data/weapons.js';
import { nextCost, tierOf, tradeInCredit, weaponOf } from '../logic/profile.js';

const REASONS = { poor: 'Not enough coins yet!', maxed: 'Already at the top tier!', unknown: 'No such item.', same: 'You are already holding that one.' };

/**
 * The shop menu: one row per upgrade for the weapon in hand (click Buy or press 1-5), then a trade-in row with the other weapons (click or press 6-9).
 * Esc closes it (until you walk away and come back).
 */
export class ShopPanel {
  constructor(root = document, { onBuy = () => {}, onSwap = () => {}, onClose = () => {} } = {}) {
    this.root = root;
    this.el = root.getElementById('shop');
    this.onBuy = onBuy;
    this.onSwap = onSwap;
    this.onClose = onClose;
    this.others = []; // the weapons on offer, in key order (6, 7, ...)
    this.visible = false;
    this.rows = []; // the upgrades on sale to the current weapon, in key order
    root.addEventListener('keydown', (e) => {
      if (!this.visible || e.repeat) return; // holding a key must not buy tier after tier
      if (e.code === 'Escape') {
        this.onClose();
        return;
      }
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (!m) return;
      const n = Number(m[1]);
      if (n <= 5 && this.rows[n - 1]) this.onBuy(this.rows[n - 1].id);
      else if (n >= 6 && this.others[n - 6]) this.onSwap(this.others[n - 6]);
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

    this.rows = upgradesFor(weaponOf(profile));
    this.rows.forEach((up, i) => {
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

    // Trade-in: swap the weapon in hand. Its upgrades go; a quarter of what they cost counts toward the new weapon.
    const held = weaponOf(profile);
    const credit = tradeInCredit(profile);
    this.others = WEAPON_IDS.filter((id) => id !== held);
    const swap = make('div', 'shop-swap');
    swap.append(make('div', 'shop-name', `Holding: ${WEAPONS[held].name}`), make('div', 'shop-blurb', credit > 0 ? `Trade-in gives you ${credit} coins back toward a new weapon (its upgrades are lost)` : 'Trading in a weapon loses its upgrades'));
    const grid = make('div', 'shop-swap-grid');
    this.others.forEach((id, i) => {
      const price = Math.max(0, WEAPONS[id].price - credit);
      const button = make('button', 'shop-weapon', '');
      button.append(make('span', 'shop-weapon-name', `${i + 6}. ${WEAPONS[id].name}`), make('span', 'shop-weapon-price', price === 0 ? 'Free!' : `${price} coins`));
      button.dataset.affordable = profile.coins + credit >= WEAPONS[id].price ? 'yes' : 'no';
      button.addEventListener('click', () => this.onSwap(id));
      grid.append(button);
    });
    swap.append(grid);
    panel.append(swap);

    panel.append(make('div', 'shop-msg', message), make('div', 'shop-hint', 'Click or press 1-5 to upgrade, 6-9 to trade in your weapon · Esc closes · the gate is open when you are ready'));
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
