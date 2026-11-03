import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEAPON_IDS, WEAPONS } from '../src/data/weapons.js';
import { buyUpgrade, createProfile, swapWeapon, withStartWeapon } from '../src/logic/profile.js';
import { HELD_WEAPONS } from '../src/render/blocky.js';
import { ShopPanel } from '../src/ui/ShopPanel.js';
import { Screens } from '../src/ui/Screens.js';
import { WEAPON_ICON_IDS, weaponIcon } from '../src/ui/weaponIcons.js';

// A tiny fake DOM: just enough for Screens and ShopPanel.
function fakeDom() {
  const mk = (tag) => ({
    tag, className: '', textContent: '', children: [], listeners: {}, attrs: {}, dataset: {}, hidden: false, style: { setProperty() {} },
    append(...n) { this.children.push(...n); },
    replaceChildren(...n) { this.children = n; },
    addEventListener(t, f) { this.listeners[t] = f; },
    setAttribute(k, v) { this.attrs[k] = v; },
  });
  const byId = { screen: mk('div'), shop: mk('div') };
  const doc = { ...mk('doc'), getElementById: (id) => byId[id], createElement: mk };
  return { doc, byId };
}
const walk = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) walk(c, out);
  return out;
};
const text = (node) => walk(node).map((n) => n.textContent).join(' | ');

test('every weapon has an icon, a held model, a style and a blurb', () => {
  assert.deepEqual([...WEAPON_ICON_IDS].sort(), [...WEAPON_IDS].sort());
  assert.deepEqual(Object.keys(HELD_WEAPONS).sort(), [...WEAPON_IDS].sort());
  for (const id of WEAPON_IDS) {
    assert.ok(weaponIcon(id).includes(`data-weapon="${id}"`));
    const held = HELD_WEAPONS[id]();
    assert.ok(held.right, id);
    assert.equal(Boolean(held.left), id === 'dagger', 'only the daggers come in a pair');
    assert.ok(WEAPONS[id].blurb.length > 0 && WEAPONS[id].name.length > 0);
  }
  assert.ok(weaponIcon('mystery').includes('<rect'), 'an unknown id still draws something');
});

test('title screen: one card per weapon, the current one is checked, clicking one chooses it (free); other screens have no picker', () => {
  const { doc, byId } = fakeDom();
  let chosen = 'sword';
  const screens = new Screens(doc, () => {}, null, { get: () => chosen, set: (id) => (chosen = id) });
  screens.show('title');
  const cards = walk(byId.screen).filter((n) => n.className === 'weapon-card');
  assert.equal(cards.length, WEAPON_IDS.length);
  const checked = () => cards.filter((c) => c.attrs['aria-checked'] === 'true').length;
  assert.equal(checked(), 1);
  assert.equal(cards[0].attrs['aria-checked'], 'true');
  cards[3].listeners.click();
  assert.equal(chosen, 'gun');
  assert.equal(cards[3].attrs['aria-checked'], 'true');
  assert.equal(checked(), 1);
  let stopped = false;
  cards[1].listeners.keydown({ code: 'Enter', stopPropagation: () => (stopped = true) });
  assert.ok(stopped, 'Enter on a card does not start the game');
  for (const name of ['lost', 'cleared', 'won']) {
    screens.show(name);
    assert.equal(walk(byId.screen).filter((n) => n.className === 'weapon-card').length, 0, name);
  }
  assert.equal(withStartWeapon(createProfile(), chosen).weapon, 'gun');
});

test('shop: the trade-in row lists every other weapon with its price after the credit; keys 6-9 and clicks swap', () => {
  const { doc, byId } = fakeDom();
  const swapped = [];
  const bought = [];
  const shop = new ShopPanel(doc, { onBuy: (id) => bought.push(id), onSwap: (id) => swapped.push(id) });
  let p = { ...createProfile(), coins: 3000 };
  for (const id of ['sharpen', 'sharpen', 'sharpen', 'power']) p = buyUpgrade(p, id).profile; // 1300 + 150 = 1450 spent -> credit 362
  shop.show(p);
  const buttons = walk(byId.shop).filter((n) => n.className === 'shop-weapon');
  assert.equal(buttons.length, WEAPON_IDS.length - 1, 'every weapon but the one in hand');
  const credit = 362;
  assert.match(text(byId.shop), new RegExp(`${500 - credit} coins`));
  assert.match(text(byId.shop), /Holding: Sword/);
  assert.equal(buttons[0].dataset.affordable, 'yes');
  buttons[0].listeners.click();
  assert.deepEqual(swapped, ['dagger']);
  doc.listeners.keydown({ code: 'Digit9' });
  doc.listeners.keydown({ code: 'Digit6' });
  assert.deepEqual(swapped, ['dagger', 'sniper', 'dagger'], 'keys 6-9 map to the weapons shown, in order');
  doc.listeners.keydown({ code: 'Digit1' });
  assert.deepEqual(bought, ['sharpen']);
  // after the swap the shop shows the new weapon's upgrades and offers the old one back
  const after = swapWeapon(p, 'dagger').profile;
  shop.render(after);
  assert.match(text(byId.shop), /Holding: Shin-kai Daggers/);
  assert.match(text(byId.shop), /Sharper Daggers/);
  assert.equal(walk(byId.shop).filter((n) => n.className === 'shop-weapon').length, WEAPON_IDS.length - 1);
  assert.match(text(byId.shop), /6\. Sword/, 'the old weapon is on offer again, first in the list');
});

test('shop: a broke player sees greyed-out weapons, and the reason texts cover swap failures', () => {
  const { doc, byId } = fakeDom();
  const shop = new ShopPanel(doc, {});
  shop.show({ ...createProfile(), coins: 100 });
  const buttons = walk(byId.shop).filter((n) => n.className === 'shop-weapon');
  assert.ok(buttons.every((b) => b.dataset.affordable === 'no'));
  assert.ok(ShopPanel.reasonText('same').length > 0 && ShopPanel.reasonText('poor').length > 0);
});
