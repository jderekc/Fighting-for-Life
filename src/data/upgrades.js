// Shop upgrades: data only. Each has up to three tiers (scope guard: three tiers).
// `stat` names a perk (see perksOf in src/logic/profile.js); each bought tier adds `add` to it.
// Prices are tuned against coins = damage dealt: levels 1-3 pay out roughly 1,700 coins in total.

import { STATS } from './stats.js';

export const MAX_TIER = 3;
const U = STATS.upgrades; // add + costs per upgrade live in stats.json

export const UPGRADES = Object.freeze([
  Object.freeze({ id: 'sharpen', name: 'Sharper Sword', blurb: '+20% damage per tier', stat: 'damageMult', add: U.sharpen.add, costs: U.sharpen.costs }),
  Object.freeze({ id: 'luck', name: 'Lucky Charm', blurb: '+4% crit chance per tier', stat: 'critChance', add: U.luck.add, costs: U.luck.costs }),
  Object.freeze({ id: 'power', name: 'Mighty Crits', blurb: '+0.25x crit damage per tier', stat: 'critMult', add: U.power.add, costs: U.power.costs }),
  Object.freeze({ id: 'heart', name: 'Hearty Soup', blurb: '+20 max health per tier', stat: 'maxHealth', add: U.heart.add, costs: U.heart.costs }),
  Object.freeze({ id: 'apple', name: 'Juicy Apples', blurb: 'apples heal +10% more per tier', stat: 'appleHeal', add: U.apple.add, costs: U.apple.costs }),
]);

export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id) ?? null;
}
