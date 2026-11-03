import * as THREE from 'three';
import { createBlocky } from './blocky.js';

// Models for the two special mobs. Both return the same shape as createBlocky (root, limbs, materials)
// plus an optional `animate(t, sim)` that CharacterView calls every frame.

const basic = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
const stub = () => new THREE.Group();

/** Barchernarcher: a blocky body with a blazing sun for a head and legs that are streams of light. */
export function createSunMan(look) {
  const model = createBlocky(look);
  const { root, head, hairCap, legL, legR } = model;
  hairCap.visible = false;
  head.visible = false; // replaced by the sun

  const sun = new THREE.Group();
  sun.position.y = 1.7;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), basic('#ffd23a'));
  const hot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.66), basic('#fff6c0'));
  sun.add(core, hot);
  // Rays: flat bars around the disc, alternating long and short.
  const rays = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const len = i % 2 ? 0.28 : 0.42;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.1, len, 0.1), basic(i % 2 ? '#ff9a1a' : '#ffbe2e'));
    const a = (i / 12) * Math.PI * 2;
    ray.position.set(Math.sin(a) * (0.5 + len / 2), Math.cos(a) * (0.5 + len / 2), 0);
    ray.rotation.z = -a;
    rays.add(ray);
  }
  sun.add(rays);
  // A cartoon face on the +z side of the disc.
  const eyeMat = basic('#7a2a14');
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.02), eyeMat);
    eye.position.set(x, 0.06, 0.34);
    sun.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.02), eyeMat);
  mouth.position.set(0, -0.14, 0.34);
  sun.add(mouth);
  root.add(sun);

  // Legs of light: replace the leg materials with glowing, slightly see-through ones.
  const glow = basic('#fff0a0', 0.9);
  const glow2 = basic('#ffd23a', 0.55);
  for (const leg of [legL, legR]) {
    const mesh = leg.children[0];
    mesh.material = glow;
    mesh.castShadow = false;
    const halo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.74, 0.35), glow2);
    halo.position.copy(mesh.position);
    halo.castShadow = false;
    leg.add(halo);
  }

  model.animate = (t, sim) => {
    rays.rotation.z = t * 0.9;
    const pulse = 1 + 0.06 * Math.sin(t * 6) + (sim?.state === 'windup' ? 0.18 : 0);
    sun.scale.setScalar(pulse);
  };
  return model;
}

function zText(text) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#cfe8d0';
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Neelysomnaly: a blackish rock with green vines, asleep. A faint "ZzzZz" drifts up from it. */
export function createRock() {
  const root = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: '#2b2d30' });
  const stone2 = new THREE.MeshLambertMaterial({ color: '#383b40' });
  const vine = new THREE.MeshLambertMaterial({ color: '#3f8f3a' });
  const leaf = new THREE.MeshLambertMaterial({ color: '#5fb04a' });
  const materials = [stone, stone2, vine, leaf];

  const add = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    root.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.95, 0.6, 0.85), stone, 0, 0.3, 0, 0.2);
  add(new THREE.BoxGeometry(0.7, 0.5, 0.65), stone2, -0.05, 0.8, 0.02, -0.35);
  add(new THREE.BoxGeometry(0.4, 0.34, 0.4), stone, 0.12, 1.15, 0, 0.5);
  // Vines: strips that wrap over the front and sides, with a few leaves.
  add(new THREE.BoxGeometry(0.09, 0.9, 0.09), vine, 0.28, 0.55, 0.45, 0.2);
  add(new THREE.BoxGeometry(0.97, 0.08, 0.09), vine, 0, 0.42, 0.44, 0.2);
  add(new THREE.BoxGeometry(0.09, 0.7, 0.09), vine, -0.3, 0.75, 0.3, -0.35);
  add(new THREE.BoxGeometry(0.09, 0.09, 0.8), vine, 0.5, 0.5, 0, 0.2);
  add(new THREE.BoxGeometry(0.16, 0.05, 0.16), leaf, 0.38, 0.85, 0.46);
  add(new THREE.BoxGeometry(0.16, 0.05, 0.16), leaf, -0.38, 0.6, 0.34);
  add(new THREE.BoxGeometry(0.14, 0.05, 0.14), leaf, 0.1, 1.25, 0.18);

  // ZzzZz: three small, low-contrast sprites that rise and fade in turn.
  const texs = ['z', 'Z', 'z'].map(zText);
  const zs = texs.map((map) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.set(0.34, 0.17, 1);
    root.add(s);
    return s;
  });

  const animate = (t, sim) => {
    zs.forEach((s, i) => {
      const phase = ((t * 0.35 + i / zs.length) % 1 + 1) % 1;
      s.position.set(0.3 + phase * 0.35, 1.35 + phase * 0.8, 0.1);
      s.material.opacity = Math.sin(phase * Math.PI) * 0.4; // hard to see on purpose
    });
    // Breathing, and a small shiver while somebody is leaning on it.
    const touching = (sim?.contactDamage ?? 0) > (sim?.def?.damage ?? 0) && (sim?.untouched ?? 9) < 0.3;
    const breathe = 1 + 0.015 * Math.sin(t * 1.6);
    root.scale.set(breathe, breathe, breathe);
    root.rotation.z = touching ? Math.sin(t * 50) * 0.03 : 0;
  };

  return { root, head: stub(), hairCap: stub(), body: stub(), armL: stub(), armR: stub(), legL: stub(), legR: stub(), materials, animate };
}
