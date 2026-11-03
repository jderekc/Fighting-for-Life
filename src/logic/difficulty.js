import { STATS } from '../data/stats.js';

// Difficulty is one slider position (an index into stats.json difficulty.steps) kept in the profile.
// It scales what enemies do to the hero (damage) and how tough they are (health). Coins follow damage dealt, so tougher
// enemies also pay more; the hero's own numbers and the shop prices do not change.

export const STEPS = STATS.difficulty.steps;
export const DEFAULT_DIFFICULTY = STATS.difficulty.default;
export const NEUTRAL = Object.freeze({ enemyDamage: 1, enemyHealth: 1 });

export const clampStep = (i) => Math.max(0, Math.min(STEPS.length - 1, Number.isFinite(+i) ? Math.round(+i) : DEFAULT_DIFFICULTY));

/** The multipliers for a profile ({enemyDamage, enemyHealth, name}). */
export const difficultyOf = (profile) => STEPS[clampStep(profile?.difficulty ?? DEFAULT_DIFFICULTY)];

/** A new profile with the slider moved (clamped to the available steps). */
export const withDifficulty = (profile, step) => ({ ...profile, difficulty: clampStep(step) });
