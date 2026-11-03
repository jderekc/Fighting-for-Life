// Weapons are data. To add one: add an entry here, and if it needs a new
// `behavior`, register it in src/sim/weaponBehaviors.js.

import { STATS } from './stats.js';

// Damage, reach and timings are in stats.json (weapons.<id>); this file adds names, shapes and behaviors.
export const WEAPONS = Object.freeze({
  sword: Object.freeze({
    id: 'sword',
    name: 'Sword',
    behavior: 'meleeArc',
    ...STATS.weapons.sword, // damage, range (edge-to-edge), cooldown, swingTime (animation), knockback
    arc: Math.PI * 0.75, // total swing width in radians
  }),
});

export function getWeapon(id) {
  const weapon = WEAPONS[id];
  if (!weapon) throw new Error(`Unknown weapon: ${id}`);
  return weapon;
}
