// Shop upgrades: data only. Each has up to three tiers (scope guard: three tiers).
// `stat` names a perk (see perksOf in src/logic/profile.js); each bought tier adds `add` to it.
// Weapon upgrades belong to one weapon (own effects and prices; swapping weapons resets them for a 25% refund).
// Global upgrades (heart, apple) are never refunded or reset. The shop shows at most five rows (keys 1-5), so a weapon has three of its own.
// Prices are tuned against coins = damage dealt: levels 1-3 pay out roughly 1,700 coins in total.

import { STATS } from './stats.js';

export const MAX_TIER = 3;
export const MAX_SHOP_ROWS = 5;
const U = STATS.upgrades; // add + costs per upgrade live in stats.json

const make = (weapon, id, name, blurb, stat) => Object.freeze({ id, weapon, name, blurb, stat, add: U[weapon ?? 'global'][id].add, costs: U[weapon ?? 'global'][id].costs });

export const GLOBAL_UPGRADES = Object.freeze([
  make(null, 'heart', 'Hearty Soup', '+20 max health per tier', 'maxHealth'),
  make(null, 'apple', 'Juicy Apples', 'apples heal +10% more per tier', 'appleHeal'),
]);

/** Weapon id -> that weapon's own upgrades. Add a weapon's list here (and its rows under stats.json upgrades.<id>). */
export const WEAPON_UPGRADES = Object.freeze({
  sword: Object.freeze([
    make('sword', 'sharpen', 'Sharper Sword', '+20% damage per tier', 'damageMult'),
    make('sword', 'luck', 'Lucky Charm', '+4% crit chance per tier', 'critChance'),
    make('sword', 'power', 'Mighty Crits', '+0.25x crit damage per tier', 'critMult'),
  ]),
  dagger: Object.freeze([
    make('dagger', 'sharpen', 'Sharper Daggers', '+20% damage per tier', 'damageMult'),
    make('dagger', 'luck', 'Lucky Charm', '+4% crit chance per tier (both hits roll!)', 'critChance'),
    make('dagger', 'power', 'Mighty Crits', '+0.25x crit damage per tier', 'critMult'),
  ]),
  hammer: Object.freeze([
    make('hammer', 'slam', 'Bigger Slam', 'the shockwave reaches +0.4 blocks further per tier', 'slamRadius'),
    make('hammer', 'luck', 'Lucky Charm', '+4% crit chance per tier', 'critChance'),
    make('hammer', 'power', 'Mighty Crits', '+0.25x crit damage per tier', 'critMult'),
  ]),
  gun: Object.freeze([
    make('gun', 'bolts', 'Sharper Bolts', 'darts cut through 10% more armor per tier', 'armorPierce'),
    make('gun', 'luck', 'Lucky Charm', '+4% crit chance per tier', 'critChance'),
    make('gun', 'power', 'Mighty Crits', '+0.25x crit damage per tier', 'critMult'),
  ]),
  sniper: Object.freeze([
    make('sniper', 'bolts', 'Sharper Bolts', 'shots cut through 10% more armor per tier', 'armorPierce'),
    make('sniper', 'luck', 'Lucky Charm', '+4% crit chance per tier', 'critChance'),
    make('sniper', 'power', 'Mighty Crits', '+0.25x crit damage per tier', 'critMult'),
  ]),
});

/** Every upgrade in the game (all weapons, then global). */
export const UPGRADES = Object.freeze([...Object.values(WEAPON_UPGRADES).flat(), ...GLOBAL_UPGRADES]);

/** What the shop sells to someone holding this weapon: its own upgrades, then the global ones. */
export const upgradesFor = (weaponId) => [...(WEAPON_UPGRADES[weaponId] ?? []), ...GLOBAL_UPGRADES];

export function getUpgrade(weaponId, id) {
  return upgradesFor(weaponId).find((u) => u.id === id) ?? null;
}
