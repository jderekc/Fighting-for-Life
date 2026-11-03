import raw from './stats.json' with { type: 'json' };

// The numbers (HP, damage, armor, prices...) live in stats.json. This module freezes them and offers lookups.
// Other data files spread their section in, so tuning a number means editing exactly one place.

const deepFreeze = (o) => {
  if (o && typeof o === 'object') for (const v of Object.values(o)) deepFreeze(v);
  return Object.freeze(o);
};

export const STATS = deepFreeze(raw);

/** stat('enemies.grunt.maxHealth') -> 40. Throws on an unknown path, so a typo cannot silently become `undefined`. */
export function stat(path) {
  let node = STATS;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object' || !(key in node)) throw new Error(`Unknown stat: ${path}`);
    node = node[key];
  }
  return node;
}

/** Flat [path, value] rows for a section (or everything), for the `npm run stats` table and for tests. */
export function statRows(prefix = '') {
  const rows = [];
  const walk = (node, path) => {
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) if (!k.startsWith('_')) walk(v, path ? `${path}.${k}` : k);
    } else rows.push([path, node]);
  };
  walk(prefix ? stat(prefix) : STATS, prefix);
  return rows;
}
