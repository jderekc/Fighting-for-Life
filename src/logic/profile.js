import { cleanHeroName, DEFAULT_HERO_ID, HEROES } from '../data/heroes.js';
import { DEFAULT_DIFFICULTY } from './difficulty.js';
import { getUpgrade, MAX_TIER } from '../data/upgrades.js';

// The player's persistent state: coins and bought upgrade tiers. Pure and immutable (every change returns a new profile),
// so it is trivial to test and, later, to save.

// `hero` is who the player is playing: { kind, name }. The girl, Nicky, is the default; character selection will set both.
export const createProfile = () => ({ coins: 0, tiers: {}, difficulty: DEFAULT_DIFFICULTY, hero: { kind: DEFAULT_HERO_ID, name: HEROES[DEFAULT_HERO_ID].defaultName } });

/** A new profile with a different hero name (cleaned and shortened; empty falls back to the default name). */
export const withHeroName = (profile, name) => ({ ...profile, hero: { ...profile.hero, name: cleanHeroName(name, profile.hero.kind) } });

export const tierOf = (profile, id) => profile.tiers[id] ?? 0;

/** Price of the next tier, or null when the upgrade is unknown or fully bought. */
export function nextCost(profile, id) {
  const up = getUpgrade(id);
  if (!up) return null;
  const tier = tierOf(profile, id);
  return tier >= MAX_TIER ? null : up.costs[tier];
}

/** @returns {{ok: true, profile} | {ok: false, reason: 'unknown'|'maxed'|'poor'}} */
export function buyUpgrade(profile, id) {
  if (!getUpgrade(id)) return { ok: false, reason: 'unknown' };
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
  };
  for (const [id, tier] of Object.entries(profile.tiers)) {
    const up = getUpgrade(id);
    if (up) perks[up.stat] += up.add * Math.min(tier, MAX_TIER);
  }
  perks.critChance = Math.min(1, perks.critChance);
  return perks;
}
