// Weapons are data. To add one: add a row in stats.json (weapons.<id> and upgrades.<id>), an entry here, a model in
// src/render/blocky.js, and a list in data/upgrades.js. If it needs a new `behavior`, register it in src/sim/weaponBehaviors.js.

import { STATS } from './stats.js';

// Damage, reach, timings and price are in stats.json (weapons.<id>); this file adds names, shapes and behaviors.
// `style` is how the hero's body moves (render only): swing, stab (both hands), slam (overhead), shoot (arm held out).
const W = STATS.weapons;

export const WEAPONS = Object.freeze({
  sword: Object.freeze({
    id: 'sword',
    name: 'Sword',
    blurb: 'Balanced and quick',
    behavior: 'meleeArc',
    style: 'swing',
    ...W.sword, // damage, range (edge-to-edge), cooldown, swingTime (animation), knockback, price (shop)
    arc: Math.PI * 0.75, // total swing width in radians
  }),
  dagger: Object.freeze({
    id: 'dagger',
    name: 'Shin-kai Daggers',
    blurb: 'Super fast double hits',
    behavior: 'meleeArc',
    style: 'stab',
    ...W.dagger, // `hits` strikes per press, `hitGap` seconds apart
    arc: Math.PI * 0.55,
  }),
  hammer: Object.freeze({
    id: 'hammer',
    name: 'Mjolnir Hammer',
    blurb: 'Slow, but a huge slam!',
    behavior: 'slam',
    style: 'slam',
    ...W.hammer, // `windup` before the slam lands, `radius` of the shockwave
  }),
  gun: Object.freeze({
    id: 'gun',
    name: 'Toy Gun',
    blurb: 'Shoots from a distance',
    behavior: 'shoot',
    style: 'shoot',
    ...W.gun, // `range` is how far a dart flies, `dartSpeed` and `dartRadius`
    // Where shots leave the barrel, measured from the hero's centre: `forward` along her facing and `side` toward her right hand
    // (the gun is held in the right arm). Matches the model in render/blocky.js; tests/weapons.test.js checks the two agree.
    muzzle: Object.freeze({ forward: 1.4, side: 0.375 }),
  }),
  sniper: Object.freeze({
    id: 'sniper',
    name: 'Toy Sniper',
    blurb: 'One big shot, very far',
    behavior: 'beam',
    style: 'shoot',
    aimLine: true, // the game draws a line to the enemy it will shoot
    ...W.sniper,
    muzzle: Object.freeze({ forward: 1.7, side: 0.375 }), // see the gun
  }),
});

export const WEAPON_IDS = Object.freeze(Object.keys(WEAPONS));

export function getWeapon(id) {
  const weapon = WEAPONS[id];
  if (!weapon) throw new Error(`Unknown weapon: ${id}`);
  return weapon;
}
