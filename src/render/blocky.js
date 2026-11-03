import * as THREE from 'three';
import { makeFaceTexture } from './textures.js';

// Builds a Minecraft-style character out of boxes. Limbs hang from pivot groups placed at the
// shoulders and hips, so rotating a pivot swings the whole limb. No skeleton, no animation files.
// The model faces +z. Total height is about 1.9 units at scale 1.

const lambert = (color) => new THREE.MeshLambertMaterial({ color });

function limb(width, height, depth, material, pivotX, pivotY) {
  const pivot = new THREE.Group();
  pivot.position.set(pivotX, pivotY, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.y = -height / 2; // hangs down from the pivot
  pivot.add(mesh);
  return pivot;
}

/**
 * @param {{skin?:string, shirt?:string, pants?:string, hair?:string, scale?:number}} look
 */
export function createBlocky(look = {}) {
  const { skin = '#e0ac86', shirt = '#3b82f6', pants = '#334155', hair = '#4b2e1a', scale = 1 } = look;

  const root = new THREE.Group();
  const skinMat = lambert(skin);
  const shirtMat = lambert(shirt);
  const pantsMat = lambert(pants);
  const hairMat = lambert(hair);
  const faceMat = new THREE.MeshLambertMaterial({ map: makeFaceTexture(skin) });
  const materials = [skinMat, shirtMat, pantsMat, hairMat, faceMat];

  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The face goes on +z (front).
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [
    skinMat, skinMat, skinMat, skinMat, faceMat, skinMat,
  ]);
  head.position.y = 1.65;

  const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.54), hairMat);
  hairCap.position.y = 1.65 + 0.25 - 0.05;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.25), shirtMat);
  body.position.y = 1.05;

  const legL = limb(0.24, 0.7, 0.25, pantsMat, 0.125, 0.7);
  const legR = limb(0.24, 0.7, 0.25, pantsMat, -0.125, 0.7);
  const armL = limb(0.25, 0.7, 0.25, shirtMat, 0.375, 1.4);
  const armR = limb(0.25, 0.7, 0.25, shirtMat, -0.375, 1.4);

  root.add(head, hairCap, body, legL, legR, armL, armR);
  root.scale.setScalar(scale);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  return { root, head, hairCap, body, armL, armR, legL, legR, materials };
}

/** A simple sword held at the end of an arm pivot (hand is at local y = -0.7). */
export function createSword() {
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.04), lambert('#d5dbe3'));
  blade.position.y = -0.6;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.09), lambert('#e0b030'));
  guard.position.y = -0.1;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), lambert('#6b4423'));
  grip.position.y = 0.05;
  sword.add(blade, guard, grip);
  sword.position.set(0, -0.7, 0.05);
  sword.rotation.x = -0.9; // angled forward in the hand
  sword.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return sword;
}

const castShadows = (group) => {
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return group;
};
const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  return m;
};

/** A short blade with a teal wrap, held point-forward. Two of them make the Shin-kai pair. */
export function createDagger() {
  const g = new THREE.Group();
  g.add(box(0.08, 0.5, 0.03, '#e9f2f7', 0, -0.4, 0), box(0.2, 0.05, 0.07, '#2bb3c0', 0, -0.13, 0), box(0.06, 0.2, 0.06, '#1f6f78', 0, 0, 0));
  g.position.set(0, -0.7, 0.05);
  g.rotation.x = -0.9;
  return castShadows(g);
}

/** A big stone-headed hammer: long handle, a chunky head with a gold band. */
export function createHammer() {
  const g = new THREE.Group();
  g.add(box(0.08, 1.05, 0.08, '#7a4a22', 0, -0.4, 0), box(0.5, 0.34, 0.34, '#8d97a6', 0, -0.98, 0), box(0.54, 0.07, 0.38, '#e0b030', 0, -0.98, 0), box(0.1, 0.1, 0.1, '#e0b030', 0, 0.14, 0));
  g.position.set(0, -0.7, 0.05);
  g.rotation.x = -0.9;
  return castShadows(g);
}

/** A bright toy blaster. It points along the arm, so it aims forward once the arm is raised. */
export function createGun() {
  const g = new THREE.Group();
  g.add(box(0.14, 0.42, 0.18, '#ff8a2a', 0, -0.16, 0), box(0.07, 0.3, 0.07, '#2bb3c0', 0, -0.5, 0.02), box(0.09, 0.09, 0.09, '#ffe14d', 0, -0.68, 0.02), box(0.1, 0.2, 0.1, '#3b3b4a', 0, 0.02, -0.12));
  g.position.set(0, -0.7, 0.05);
  return castShadows(g);
}

/** A long toy rifle with a scope. */
export function createSniper() {
  const g = new THREE.Group();
  g.add(box(0.1, 1.1, 0.13, '#3a4a5a', 0, -0.4, 0), box(0.08, 0.32, 0.08, '#2bb3c0', 0, -0.35, 0.12), box(0.13, 0.3, 0.2, '#ff8a2a', 0, 0.1, -0.02), box(0.06, 0.12, 0.06, '#ffe14d', 0, -0.98, 0));
  g.position.set(0, -0.7, 0.05);
  return castShadows(g);
}

/** What the hero holds for each weapon: { right, left } groups for the arm pivots (left is null for one-handed weapons). One builder per weapon id. */
export const HELD_WEAPONS = Object.freeze({
  sword: () => ({ right: createSword(), left: null }),
  dagger: () => ({ right: createDagger(), left: createDagger() }),
  hammer: () => ({ right: createHammer(), left: null }),
  gun: () => ({ right: createGun(), left: null }),
  sniper: () => ({ right: createSniper(), left: null }),
});

/** A bow for the left hand. Its long axis is local z (it stands upright once the arm is raised forward); the tips and the string curve back toward the archer (limb tilt signs matter: the tips must lean to the string's side). */
export function createBow() {
  const bow = new THREE.Group();
  const wood = lambert('#7a4a22');
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), lambert('#4a2e14'));
  const limb = (z, tilt) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.42), wood);
    m.position.set(0, 0.11, z);
    m.rotation.x = tilt;
    return m;
  };
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.0), lambert('#e8e2c8'));
  string.position.set(0, 0.2, 0); // through both tips, on the archer's side
  bow.add(grip, limb(0.34, -0.45), limb(-0.34, 0.45), string);
  bow.position.set(0, -0.7, 0.05);
  bow.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return bow;
}

export function createQuiver() {
  const g = new THREE.Group();
  const q = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.16), lambert('#5b3a1e'));
  const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), lambert('#d9483b'));
  fletch.position.y = 0.34;
  g.add(q, fletch);
  g.position.set(0.05, 1.15, -0.22);
  g.rotation.z = 0.25;
  return g;
}

/** Tints every material toward red (or any color) for hit flashes and telegraphs. */
export function setEmissive(model, color, intensity) {
  for (const m of model.materials) {
    m.emissive.set(color);
    m.emissiveIntensity = intensity;
  }
}
