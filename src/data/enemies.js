// Enemy definitions. The NUMBERS (health, damage, speed...) are in stats.json; this file adds names, looks and behaviors.
// Distances for attackRange are edge-to-edge (between bodies).
import { STATS } from './stats.js';

const S = STATS.enemies;

export const ENEMIES = Object.freeze({
  grunt: Object.freeze({
    ...S.grunt,
    id: 'grunt',
    name: 'Blocky Brute',
    look: Object.freeze({ skin: '#6fae5a', shirt: '#8a3b3b', pants: '#3a2a2a', hair: '#2d4a22' }),
  }),
  // Sun-headed fire brute. Melee burns hard; up close but out of reach it flares sparks in every direction (50% to connect).
  barchernarcher: Object.freeze({
    ...S.barchernarcher,
    id: 'barchernarcher',
    name: 'Barchernarcher',
    announce: true, // shown with a banner when it turns up, like the elite
    behavior: 'flare',
    // The spark burst: all around, out to `range` (edge to edge). One roll per burst decides whether the sparks connect.
    look: Object.freeze({ model: 'sun', skin: '#ffcf3a', shirt: '#7a2a14', pants: '#ffe27a', hair: '#ff8a1a' }),
  }),
  // A sleeping rock that never moves. Touching it hurts, and the longer you stay the worse each hit gets.
  neelysomnaly: Object.freeze({
    ...S.neelysomnaly,
    id: 'neelysomnaly',
    name: 'Neelysomnaly',
    behavior: 'sleeper',
    optional: true, // does not count toward clearing the level (no key is waiting on it)
    immovable: true, // no knockback, no pushing
    look: Object.freeze({ model: 'rock' }),
  }),
  // The first elite: big, slow, armored, with a bow. Distances: attackRange is how far away it will start shooting.
  bowmaster: Object.freeze({
    ...S.bowmaster,
    id: 'bowmaster',
    name: 'Elite Bowmaster',
    elite: true,
    behavior: 'archer', // stops at attackRange and shoots (see enemyAI.js)
    weapon: 'bow',
    look: Object.freeze({ skin: '#c9a27a', shirt: '#2f5a3a', pants: '#4a3524', hair: '#8b1a1a', scale: 1.45 }),
  }),
});

export function getEnemyDef(id) {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy type: ${id}`);
  return def;
}
