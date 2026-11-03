import { cleanHeroName, DEFAULT_HERO_ID, HEROES } from '../data/heroes.js';
import { DEFAULT_DIFFICULTY } from './difficulty.js';
import { stat } from '../data/stats.js';
import { getUpgrade, MAX_TIER, WEAPON_UPGRADES } from '../data/upgrades.js';
import { WEAPONS } from '../data/weapons.js';

export const DEFAULT_WEAPON = 'sword';

// The player's persistent state: coins, the weapon, and bought upgrade tiers (the weapon's own plus the global ones). Pure and immutable (every change returns a new profile),
// so it is trivial to test and, later, to save.

// `hero` is who the player is playing: { kind, name }. The girl, Nicky, is the default; character selection will set both.
export const createProfile = () => ({ coins: 0, weapon: DEFAULT_WEAPON, tiers: {}, difficulty: DEFAULT_DIFFICULTY, hero: { kind: DEFAULT_HERO_ID, name: HEROES[DEFAULT_HERO_ID].defaultName } });

/** A new profile with a different hero name (cleaned and shortened; empty falls back to the default name). */
export const withHeroName = (profile, name) => ({ ...profile, hero: { ...profile.hero, name: cleanHeroName(name, profile.hero.kind) } });

export const weaponOf = (profile) => profile.weapon ?? DEFAULT_WEAPON;

export const tierOf = (profile, id) => profile.tiers[id] ?? 0;

/** Price of the next tier, or null when the upgrade is unknown or fully bought. */
export function nextCost(profile, id) {
  const up = getUpgrade(weaponOf(profile), id);
  if (!up) return null;
  const tier = tierOf(profile, id);
  return tier >= MAX_TIER ? null : up.costs[tier];
}

/** Coins spent on the current weapon's own upgrades (global ones don't count). */
export function spentOnWeapon(profile) {
  let spent = 0;
  for (const up of WEAPON_UPGRADES[weaponOf(profile)] ?? []) {
    for (let t = 0; t < Math.min(tierOf(profile, up.id), MAX_TIER); t++) spent += up.costs[t];
  }
  return spent;
}

/** What trading the current weapon in gives back toward the next one: a quarter of the weapon-upgrade coins, rounded down. */
export const tradeInCredit = (profile) => Math.floor(spentOnWeapon(profile) * stat('tradeIn.refund'));

const withoutWeaponTiers = (profile) => {
  const own = new Set((WEAPON_UPGRADES[weaponOf(profile)] ?? []).map((u) => u.id));
  return Object.fromEntries(Object.entries(profile.tiers).filter(([id]) => !own.has(id)));
};

/**
 * Trade the current weapon in for another. Its upgrades are lost; 25% of what they cost is credited against the new weapon's price.
 * `weapons` is the price table (tests pass extras before those weapons exist).
 * @returns {{ok: true, profile, credit, paid} | {ok: false, reason: 'unknown'|'same'|'poor'}}
 */
export function swapWeapon(profile, id, weapons = WEAPONS) {
  const target = weapons[id];
  if (!target) return { ok: false, reason: 'unknown' };
  if (id === weaponOf(profile)) return { ok: false, reason: 'same' };
  const credit = tradeInCredit(profile);
  if (profile.coins + credit < target.price) return { ok: false, reason: 'poor' };
  const paid = Math.max(0, target.price - credit);
  // A credit larger than the price is not lost: the surplus goes into the wallet.
  return { ok: true, profile: { ...profile, coins: profile.coins + credit - target.price, weapon: id, tiers: withoutWeaponTiers(profile) }, credit, paid };
}

/** Choose the starting weapon (title screen): free, and nothing to refund because nothing is bought yet. Only call it before shopping. */
export const withStartWeapon = (profile, id) => (WEAPONS[id] ? { ...profile, weapon: id, tiers: withoutWeaponTiers(profile) } : profile);

/** @returns {{ok: true, profile} | {ok: false, reason: 'unknown'|'maxed'|'poor'}} */
export function buyUpgrade(profile, id) {
  if (!getUpgrade(weaponOf(profile), id)) return { ok: false, reason: 'unknown' };
  const cost = nextCost(profile, id);
  if (cost === null) return { ok: false, reason: 'maxed' };
  if (profile.coins < cost) return { ok: false, reason: 'poor' };
  return { ok: true, profile: { ...profile, coins: profile.coins - cost, tiers: { ...profile.tiers, [id]: tierOf(profile, id) + 1 } } };
}

/** The numbers the fight actually uses, from base config plus bought tiers. */
export function perksOf(profile, config) {
  const perks = {
    damageMult: 1,
    critChance: config.hero.crit.chance,
    critMult: config.hero.crit.multiplier,
    maxHealth: config.hero.maxHealth,
    appleHeal: config.apples.healFraction,
    slamRadius: 0, // hammer: extra shockwave radius
    armorPierce: 0, // gun and sniper ("sharper bolts"): armor an enemy loses against this hero's hits
  };
  for (const [id, tier] of Object.entries(profile.tiers)) {
    const up = getUpgrade(weaponOf(profile), id);
    if (up) perks[up.stat] += up.add * Math.min(tier, MAX_TIER);
  }
  perks.critChance = Math.min(1, perks.critChance);
  return perks;
}
