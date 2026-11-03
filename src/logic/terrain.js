import { mulberry32 } from './rng.js';

// Deterministic "which variant goes here" helpers: ground patches, tree species, rock looks, and wind.
// Everything is a pure function of (cell, seed), so a level always looks the same and tests can check it.

/** Hash of a cell and seed to an unsigned 32-bit int. */
export function hash2(ix, iz, seed = 0) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Uniform [0, 1) from a cell. */
export const unit = (ix, iz, seed = 0) => hash2(ix, iz, seed) / 4294967296;

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1]: random values on a lattice every `scale` cells, blended in between. */
export function valueNoise(ix, iz, seed, scale) {
  const gx = ix / scale;
  const gz = iz / scale;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const tx = smooth(gx - x0);
  const tz = smooth(gz - z0);
  const a = unit(x0, z0, seed);
  const b = unit(x0 + 1, z0, seed);
  const c = unit(x0, z0 + 1, seed);
  const d = unit(x0 + 1, z0 + 1, seed);
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

const NOISE = [
  { seed: 0, scale: 5 },
  { seed: 1013, scale: 3.5 },
];

/** Ground variant of a cell for a biome's `ground` rules. */
export function groundKind(ix, iz, ground, seed = 1) {
  for (const p of ground.patches) {
    const n = NOISE[p.noise];
    const v = valueNoise(ix, iz, seed + n.seed, n.scale);
    if ((p.min === undefined || v >= p.min) && (p.max === undefined || v <= p.max)) return p.kind;
  }
  if (ground.speckle && unit(ix, iz, seed + 7) < ground.speckle.chance) return ground.speckle.kind;
  return ground.base;
}

/** Pick an item from [{id, weight}] with u in [0, 1). */
export function pickWeighted(list, u) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let t = u * total;
  for (const item of list) {
    t -= item.weight;
    if (t < 0) return item.id;
  }
  return list[list.length - 1].id;
}

export function treeSpecies(biome, ix, iz, seed = 1) {
  return pickWeighted(biome.trees, unit(ix, iz, seed + 31));
}

/** What a rock at this cell looks like: texture id, shape id, and a seed for small random variation. */
export function rockLook(biome, ix, iz, seed = 1) {
  return {
    texture: pickWeighted(biome.rocks.textures, unit(ix, iz, seed + 41)),
    shape: pickWeighted(biome.rocks.shapes, unit(ix, iz, seed + 43)),
    variation: hash2(ix, iz, seed + 47),
  };
}

/** Per-cell random generator (for building one tree/rock without caring about build order). */
export const cellRng = (ix, iz, seed = 1) => mulberry32(hash2(ix, iz, seed + 53));

/**
 * Wind strength in [0, 1] at time t (seconds). Slow gusts with calm stretches between them,
 * so things sway noticeably only now and then.
 */
export function windStrength(t, gain = 1) {
  const raw = 0.45 + 0.4 * Math.sin(t * 0.37) + 0.25 * Math.sin(t * 0.91 + 1.3) + 0.12 * Math.sin(t * 2.3 + 0.4);
  const clamped = Math.max(0, Math.min(1, raw));
  return clamped * clamped * gain; // gain > 1 is a windier place (can exceed 1)
}
