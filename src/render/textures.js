import * as THREE from 'three';
import { mulberry32 } from '../logic/rng.js';

// Procedural 16x16 pixel-art textures, so there are no image assets to manage yet.
// Nearest-neighbor filtering is what gives the blocky Minecraft look.

function pixelTexture(size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Fill with a base color, then speckle pixels slightly lighter/darker. */
function speckled(base, lighten, seed) {
  return (g, size) => {
    const rnd = mulberry32(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = rnd();
        if (r < 0.22) {
          g.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.1})`;
          g.fillRect(x, y, 1, 1);
        } else if (r > 0.86) {
          g.fillStyle = `rgba(255,255,255,${0.06 + rnd() * lighten})`;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
  };
}

/** Sprinkle `count` small rectangles of a color over a texture. */
function sprinkle(g, rnd, size, color, count, w = 1, h = 1) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) g.fillRect(Math.floor(rnd() * (size - w + 1)), Math.floor(rnd() * (size - h + 1)), w, h);
}

const withExtras = (base, lighten, seed, extras) => (g, size) => {
  speckled(base, lighten, seed)(g, size);
  extras?.(g, mulberry32(seed + 1000), size);
};

// Ground variants. The meadow floor mixes these in soft patches, so it never looks like one tiled block.
const GROUND = {
  grass: withExtras('#5fae48', 0.1, 11),
  lush: withExtras('#469a3a', 0.1, 12, (g, r, n) => sprinkle(g, r, n, 'rgba(20,70,30,0.35)', 10, 2, 1)),
  dry: withExtras('#a1ae4e', 0.14, 13, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(214,190,110,0.5)', 12, 2, 1);
    sprinkle(g, r, n, 'rgba(120,100,50,0.25)', 6);
  }),
  clover: withExtras('#5fae48', 0.1, 14, (g, r, n) => {
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(r() * (n - 3));
      const y = 1 + Math.floor(r() * (n - 3));
      g.fillStyle = 'rgba(150,224,110,0.85)';
      g.fillRect(x + 1, y, 1, 1);
      g.fillRect(x, y + 1, 3, 1);
      g.fillRect(x + 1, y + 2, 1, 1);
    }
    sprinkle(g, r, n, 'rgba(255,255,255,0.8)', 2);
  }),
  alpine: withExtras('#8a9470', 0.12, 16, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(150,150,120,0.45)', 8, 2, 1);
    sprinkle(g, r, n, 'rgba(70,95,50,0.35)', 8);
  }),
  gravel: withExtras('#8d8a82', 0.16, 17, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(60,58,55,0.4)', 14, 2, 2);
    sprinkle(g, r, n, 'rgba(200,196,186,0.5)', 8, 2, 1);
  }),
  snow: withExtras('#eef3f8', 0.05, 18, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(170,195,225,0.5)', 10, 2, 1);
    sprinkle(g, r, n, 'rgba(120,120,120,0.35)', 3);
  }),
  sand: withExtras('#e2cf95', 0.1, 19, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(190,160,100,0.4)', 10, 2, 1);
    sprinkle(g, r, n, 'rgba(255,245,210,0.5)', 6);
  }),
  oasis: withExtras('#3fc29a', 0.12, 20, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(120,255,220,0.45)', 8, 2, 1);
    sprinkle(g, r, n, 'rgba(20,110,100,0.35)', 8);
    sprinkle(g, r, n, 'rgba(255,255,255,0.6)', 2);
  }),
  dirt: withExtras('#8b6b47', 0.1, 15, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(60,40,25,0.35)', 12, 2, 1);
    sprinkle(g, r, n, 'rgba(170,165,155,0.7)', 5, 2, 2);
  }),
};
export const makeGroundTexture = (kind) => pixelTexture(16, GROUND[kind]);
export const makeGrassTexture = () => makeGroundTexture('grass');

// Stone / rock variants.
const STONE = {
  granite: speckled('#8a8d91', 0.14, 23),
  mossy: withExtras('#838a85', 0.12, 24, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(78,150,70,0.75)', 14, 2, 2);
    sprinkle(g, r, n, 'rgba(60,120,60,0.6)', 8, 3, 1);
  }),
  sandstone: withExtras('#c4a877', 0.12, 25, (g, r, n) => {
    g.fillStyle = 'rgba(150,110,60,0.3)';
    for (let y = 2; y < n; y += 5) g.fillRect(0, y, n, 1);
    sprinkle(g, r, n, 'rgba(255,240,200,0.3)', 8);
  }),
  crystal: withExtras('#8f7cf2', 0.22, 27, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(210,250,255,0.7)', 8, 1, 3);
    sprinkle(g, r, n, 'rgba(255,255,255,0.8)', 3);
  }),
  slate: withExtras('#5b6471', 0.1, 26, (g, r, n) => {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = -n; i < n; i += 6) for (let k = 0; k < n; k++) g.fillRect(i + k, k, 1, 1);
    sprinkle(g, r, n, 'rgba(160,175,200,0.3)', 6);
  }),
};
export const makeStoneVariantTexture = (kind) => pixelTexture(16, STONE[kind]);
export const makeStoneTexture = () => makeStoneVariantTexture('granite');

// Leaves and bark per tree species.
const LEAF = {
  oak: speckled('#3f9a3a', 0.12, 31),
  birch: withExtras('#79b848', 0.16, 32, (g, r, n) => sprinkle(g, r, n, 'rgba(210,235,120,0.45)', 12)),
  pine: withExtras('#2f6d3c', 0.1, 33, (g, r, n) => {
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(10,45,25,0.5)';
      g.fillRect(Math.floor(r() * n), Math.floor(r() * (n - 3)), 1, 3);
    }
  }),
  maple: withExtras('#d6732a', 0.14, 34, (g, r, n) => {
    sprinkle(g, r, n, 'rgba(190,40,30,0.55)', 12, 2, 1);
    sprinkle(g, r, n, 'rgba(250,200,60,0.55)', 10);
  }),
};
const BARK = {
  oak: speckled('#7a5232', 0.08, 37),
  birch: withExtras('#e6e2d6', 0.05, 38, (g, r, n) => sprinkle(g, r, n, 'rgba(30,30,30,0.7)', 7, 3, 1)),
  pine: withExtras('#5b3d27', 0.08, 39, (g, r, n) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 1; x < n; x += 4) g.fillRect(x, 0, 1, n);
  }),
  maple: speckled('#6b4a3a', 0.08, 40),
};
LEAF.palm = withExtras('#38b866', 0.14, 45, (g, r, n) => sprinkle(g, r, n, 'rgba(10,90,50,0.45)', 10, 1, 3));
BARK.palm = withExtras('#a8794a', 0.08, 46, (g, r, n) => {
  g.fillStyle = 'rgba(70,40,20,0.35)';
  for (let y = 1; y < n; y += 3) g.fillRect(0, y, n, 1);
});
LEAF.vine = withExtras('#3a7436', 0.14, 42, (g, r, n) => sprinkle(g, r, n, 'rgba(20,70,30,0.5)', 14, 1, 2));
BARK.vine = speckled('#4b6b34', 0.08, 44);
LEAF.dead = speckled('#6f6a5c', 0.1, 35);
BARK.dead = withExtras('#4f4a44', 0.08, 36, (g, r, n) => sprinkle(g, r, n, 'rgba(190,185,170,0.4)', 6, 1, 3));
export const makeLeafVariantTexture = (species) => pixelTexture(16, LEAF[species]);
export const makeBarkVariantTexture = (species) => pixelTexture(16, BARK[species]);
export const makeLeafTexture = () => makeLeafVariantTexture('oak');
export const makeBarkTexture = () => makeBarkVariantTexture('oak');
export const makeRoofTexture = () => pixelTexture(16, speckled('#b0493a', 0.1, 41));

/** Horizontal wooden planks: darker seams every 4 pixels over a speckled base. */
export function makePlankTexture(base = '#a8763f', seed = 43) {
  return pixelTexture(16, (g, size) => {
    speckled(base, 0.08, seed)(g, size);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 3; y < size; y += 4) g.fillRect(0, y, size, 1);
  });
}

/** Blue water with a few light ripples. Scrolled in the view to make it flow. */
export function makeWaterTexture() {
  return pixelTexture(16, (g, size) => {
    const rnd = mulberry32(47);
    g.fillStyle = '#3a7fd5';
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.18})`;
      g.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 2 + Math.floor(rnd() * 3), 1);
    }
  });
}

/** An 8x8 face: skin color, two eyes, a mouth. Painted at pixel scale. */
export function makeFaceTexture(skin = '#e0ac86') {
  return pixelTexture(8, (g) => {
    g.fillStyle = skin;
    g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#ffffff';
    g.fillRect(1, 3, 2, 1);
    g.fillRect(5, 3, 2, 1);
    g.fillStyle = '#2b2b3a';
    g.fillRect(2, 3, 1, 1);
    g.fillRect(5, 3, 1, 1);
    g.fillStyle = 'rgba(120,50,40,0.9)';
    g.fillRect(3, 6, 2, 1);
  });
}
