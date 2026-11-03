import * as THREE from 'three';

// The shape of the title-screen world: noise, the two rivers and the height of the ground anywhere. Pure functions, shared by the
// terrain mesh and everything that is placed on it.

export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const hash = (x, z) => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
export function vnoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}
export const fbm = (x, z) => vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.25 + vnoise(x * 4.3, z * 4.3) * 0.125 + vnoise(x * 8.7, z * 8.7) * 0.0625;

// ---------- the land ----------
export const SIZE = 220; // world is SIZE x SIZE, centred on the cathedral
export const PLATEAU = 3; // the cathedral terrace height

// Two winding rivers (polylines) that meet in front of the cathedral.
export const river1 = [];
for (let x = -120; x <= 120; x += 3) river1.push(new THREE.Vector3(x, 0.45, 40 + 14 * Math.sin(x * 0.04) + 6 * Math.sin(x * 0.11)));
export const river2 = [];
for (let z = -120; z <= 44; z += 3) river2.push(new THREE.Vector3(-52 + 16 * Math.sin(z * 0.045), 0.45, z));

export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (const p of pts) {
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export const riverDistance = (x, z) => Math.min(distToPolyline(x, z, river1), distToPolyline(x, z, river2));

// A cliff shelf on the west bank of river2 with a brook that runs over its edge: the waterfall. The upper brook crosses the
// shelf top, the fall drops at the shelf's east edge, the lower brook is carved into the bank down to the river.
export const SHELF = { x: -63, z: 14, r: 10, h: 13.5 };
export const brookTop = [new THREE.Vector3(-71, SHELF.h + 0.12, 9), new THREE.Vector3(-64, SHELF.h + 0.12, 12.5), new THREE.Vector3(-57, SHELF.h + 0.12, 13.5), new THREE.Vector3(-52.9, SHELF.h + 0.12, 14)];
export const brookLow = [new THREE.Vector3(-51.2, 0.45, 14), new THREE.Vector3(-48, 0.45, 13.6), new THREE.Vector3(-45.5, 0.45, 12.6), new THREE.Vector3(-43.5, 0.45, 12)];
export const FALL = { x: -52.6, z: 14, top: SHELF.h, bottom: 0.45 };
export const brookDistance = (x, z) => distToPolyline(x, z, brookLow);

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.018 + 5, z * 0.018 - 2) - 1);
  const mountains = smoothstep(34, 105, r) * (10 + 38 * Math.pow(ridge, 1.4));
  let h = 1.5 + mountains + (fbm(x * 0.07, z * 0.07) - 0.4) * 6 * smoothstep(20, 40, r);
  const carve = Math.max(smoothstep(13, 3.6, riverDistance(x, z)), smoothstep(5, 1.4, brookDistance(x, z)));
  h = lerp(h, 0, carve);
  h = lerp(h, PLATEAU, smoothstep(40, 30, r)); // a flat terrace for the cathedral and the fight
  const shelf = smoothstep(SHELF.r + 1.2, SHELF.r - 0.4, Math.hypot(x - SHELF.x, z - SHELF.z)); // a sharp-edged cliff shelf
  h = lerp(h, Math.max(h, SHELF.h), shelf);
  return Math.round(Math.max(0, h) / 0.75) * 0.75; // blocky terraces
}

// ---------- the flight and the fights ----------
// The camera glide over one loop: positions and the points it looks at, as control points of centripetal Catmull-Rom curves
// (Splash.js). Kept here, as plain numbers, so a test can check the glide never dips into the ground.
export const FLIGHT_PATH = [[-96, 52, -66], [-62, 40, -14], [-40, 24, 40], [-14, 9.5, 36], [14, 10, 37], [36, 20, 16], [30, 28, -30], [66, 46, -60]];
export const FLIGHT_LOOK = [[8, 8, 0], [0, 12, 0], [0, 8, 12], [-3, 5, 22], [5, 5, 24], [0, 12, 4], [0, 12, 0], [0, 10, 0]];
/** Where the two hero-vs-mob duels stand on the terrace (Splash.js); the wanderers keep clear of them (splashLife.js). */
export const DUEL_SPOTS = [
  { x: -4, z: 22 },
  { x: 9, z: 25 },
];

/** Steepness at (x, z): the largest height difference over 3 units in x or z, per unit. */
export const slopeAt = (x, z) => Math.max(Math.abs(heightAt(x + 1.5, z) - heightAt(x - 1.5, z)), Math.abs(heightAt(x, z + 1.5) - heightAt(x, z - 1.5))) / 3;
