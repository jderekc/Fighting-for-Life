// A biome is the "flavor" of a level's scenery: which ground patches, tree species and rock looks it uses.
// Data only. The renderer knows how to draw each species / texture / shape id named here.

/** Per-species facts. `leaf` is the color of the leaves that fall; `sway` scales wind sway; `drop` scales how often leaves fall. */
export const TREE_SPECIES = Object.freeze({
  oak: Object.freeze({ leaf: '#3f9a3a', sway: 1.0, drop: 1.0 }),
  birch: Object.freeze({ leaf: '#79b848', sway: 1.2, drop: 1.2 }),
  pine: Object.freeze({ leaf: '#2f6d3c', sway: 0.55, drop: 0.35 }),
  maple: Object.freeze({ leaf: '#d6732a', sway: 1.0, drop: 2.0 }),
  palm: Object.freeze({ leaf: '#38b866', sway: 1.5, drop: 0.5 }),
  dead: Object.freeze({ leaf: '#6f6a5c', sway: 0.8, drop: 0 }), // bare mountain tree: no leaves to lose
});

export const ROCK_TEXTURES = Object.freeze(['granite', 'mossy', 'sandstone', 'slate', 'crystal']);
export const ROCK_SHAPES = Object.freeze(['boulder', 'slab', 'spire', 'pile']);
export const GROUND_KINDS = Object.freeze(['grass', 'lush', 'dry', 'clover', 'dirt', 'alpine', 'gravel', 'snow', 'sand', 'oasis']);

export const BIOMES = Object.freeze({
  meadow: Object.freeze({
    name: 'Meadow',
    wind: Object.freeze({ gain: 1, treeSway: 1 }), // gain scales gust strength; treeSway scales how far trees lean
    // Ground is `base` grass with soft patches (smooth noise) and a sprinkle of single-cell speckles. First match wins.
    ground: Object.freeze({
      base: 'grass',
      patches: Object.freeze([
        Object.freeze({ kind: 'dirt', noise: 1, min: 0.8 }),
        Object.freeze({ kind: 'dry', noise: 0, min: 0.74 }),
        Object.freeze({ kind: 'lush', noise: 0, max: 0.3 }),
      ]),
      speckle: Object.freeze({ kind: 'clover', chance: 0.12 }),
    }),
    trees: Object.freeze([
      Object.freeze({ id: 'oak', weight: 5 }),
      Object.freeze({ id: 'birch', weight: 3 }),
      Object.freeze({ id: 'pine', weight: 3 }),
      Object.freeze({ id: 'maple', weight: 1 }),
    ]),
    rocks: Object.freeze({
      textures: Object.freeze([
        Object.freeze({ id: 'granite', weight: 4 }),
        Object.freeze({ id: 'mossy', weight: 3 }),
        Object.freeze({ id: 'sandstone', weight: 2 }),
        Object.freeze({ id: 'slate', weight: 1 }),
      ]),
      shapes: Object.freeze([
        Object.freeze({ id: 'boulder', weight: 3 }),
        Object.freeze({ id: 'slab', weight: 2 }),
        Object.freeze({ id: 'spire', weight: 1 }),
        Object.freeze({ id: 'pile', weight: 2 }),
      ]),
    }),
  }),
  // High up the mountain: thin grass, gravel and snow patches, mostly pines and bare trees, rocky, and very windy.
  mountain: Object.freeze({
    name: 'Mountain',
    wind: Object.freeze({ gain: 2.4, treeSway: 2.6 }),
    ground: Object.freeze({
      base: 'alpine',
      patches: Object.freeze([
        Object.freeze({ kind: 'snow', noise: 1, min: 0.72 }),
        Object.freeze({ kind: 'gravel', noise: 0, min: 0.5 }),
        Object.freeze({ kind: 'dry', noise: 1, max: 0.2 }),
      ]),
      speckle: Object.freeze({ kind: 'gravel', chance: 0.1 }),
    }),
    trees: Object.freeze([
      Object.freeze({ id: 'pine', weight: 6 }),
      Object.freeze({ id: 'dead', weight: 3 }),
      Object.freeze({ id: 'birch', weight: 1 }),
    ]),
    rocks: Object.freeze({
      textures: Object.freeze([
        Object.freeze({ id: 'slate', weight: 4 }),
        Object.freeze({ id: 'granite', weight: 4 }),
        Object.freeze({ id: 'mossy', weight: 1 }),
      ]),
      shapes: Object.freeze([
        Object.freeze({ id: 'boulder', weight: 3 }),
        Object.freeze({ id: 'slab', weight: 2 }),
        Object.freeze({ id: 'spire', weight: 3 }),
        Object.freeze({ id: 'pile', weight: 2 }),
      ]),
    }),
  }),
  // A small mystical oasis: warm sand, a ring of lush glowing grass, palms, glowing crystals, and drifting sparkles.
  oasis: Object.freeze({
    name: 'Mystic Oasis',
    wind: Object.freeze({ gain: 1.2, treeSway: 1.6 }),
    sparkles: Object.freeze({ count: 36, color: '#b9f6ff' }),
    ground: Object.freeze({
      base: 'sand',
      patches: Object.freeze([
        Object.freeze({ kind: 'oasis', noise: 1, min: 0.62 }),
        Object.freeze({ kind: 'dry', noise: 0, min: 0.72 }),
      ]),
      speckle: Object.freeze({ kind: 'oasis', chance: 0.06 }),
    }),
    trees: Object.freeze([Object.freeze({ id: 'palm', weight: 1 })]),
    rocks: Object.freeze({
      textures: Object.freeze([
        Object.freeze({ id: 'crystal', weight: 4 }),
        Object.freeze({ id: 'sandstone', weight: 3 }),
        Object.freeze({ id: 'mossy', weight: 1 }),
      ]),
      shapes: Object.freeze([
        Object.freeze({ id: 'spire', weight: 4 }),
        Object.freeze({ id: 'pile', weight: 2 }),
        Object.freeze({ id: 'boulder', weight: 1 }),
      ]),
    }),
  }),
});
