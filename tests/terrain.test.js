import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES, GROUND_KINDS, ROCK_SHAPES, ROCK_TEXTURES, TREE_SPECIES } from '../src/data/biomes.js';
import { LEVELS } from '../src/data/levels.js';
import { groundKind, pickWeighted, rockLook, treeSpecies, unit, valueNoise, windStrength } from '../src/logic/terrain.js';

const meadow = BIOMES.meadow;

test('biome data only names things the renderer knows', () => {
  for (const [name, b] of Object.entries(BIOMES)) {
    assert.ok(GROUND_KINDS.includes(b.ground.base), `${name} base`);
    for (const p of b.ground.patches) assert.ok(GROUND_KINDS.includes(p.kind));
    assert.ok(GROUND_KINDS.includes(b.ground.speckle.kind));
    for (const t of b.trees) assert.ok(TREE_SPECIES[t.id], `${name} tree ${t.id}`);
    for (const r of b.rocks.textures) assert.ok(ROCK_TEXTURES.includes(r.id));
    for (const r of b.rocks.shapes) assert.ok(ROCK_SHAPES.includes(r.id));
  }
});

test('noise is deterministic, bounded and smooth', () => {
  assert.equal(unit(3, 4, 5), unit(3, 4, 5));
  assert.notEqual(unit(3, 4, 5), unit(4, 3, 5));
  let maxStep = 0;
  for (let i = 0; i < 200; i++) {
    const v = valueNoise(i * 0.25, 7, 9, 5);
    assert.ok(v >= 0 && v <= 1);
    maxStep = Math.max(maxStep, Math.abs(v - valueNoise((i + 1) * 0.25, 7, 9, 5)));
  }
  assert.ok(maxStep < 0.25, `neighbouring samples are close (max step ${maxStep.toFixed(3)})`);
});

test('ground has a mostly-grass base with several patch kinds, and is stable per seed', () => {
  const counts = {};
  for (let iz = 0; iz < 26; iz++) {
    for (let ix = 0; ix < 36; ix++) {
      const k = groundKind(ix, iz, meadow.ground, 5);
      assert.equal(k, groundKind(ix, iz, meadow.ground, 5));
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  assert.ok(Object.keys(counts).length >= 4, `kinds: ${JSON.stringify(counts)}`);
  assert.ok(counts.grass > 936 * 0.4, `grass is still the main ground: ${JSON.stringify(counts)}`);
});

test('pickWeighted respects weights and bounds', () => {
  const list = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
  assert.equal(pickWeighted(list, 0), 'a');
  assert.equal(pickWeighted(list, 0.26), 'b');
  assert.equal(pickWeighted(list, 0.999999), 'b');
});

test('level 1 uses several tree species and several rock looks', () => {
  const level = LEVELS[0];
  const biome = BIOMES[level.biome];
  assert.ok(biome, 'level names a known biome');
  const species = new Set(level.scenery.trees.map(([x, z]) => treeSpecies(biome, x, z, level.id)));
  assert.ok(species.size >= 3, `species: ${[...species]}`);
  const looks = level.scenery.rocks.map(([x, z]) => rockLook(biome, x, z, level.id));
  assert.ok(new Set(looks.map((l) => l.texture)).size >= 3, 'rock textures vary');
  assert.ok(new Set(looks.map((l) => l.shape)).size >= 3, 'rock shapes vary');
});

test('wind stays in [0, 1], has calm and gusty stretches', () => {
  let min = 1;
  let max = 0;
  for (let t = 0; t < 600; t += 0.5) {
    const w = windStrength(t);
    assert.ok(w >= 0 && w <= 1);
    min = Math.min(min, w);
    max = Math.max(max, w);
  }
  assert.ok(min < 0.1 && max > 0.6, `range ${min.toFixed(2)}..${max.toFixed(2)}`);
});

test('the renderer has a builder for every tree species and rock shape the biomes name', async () => {
  const { TREE_BUILDER_IDS, ROCK_BUILDER_IDS } = await import('../src/render/scenery/plants.js');
  for (const b of Object.values(BIOMES)) {
    for (const t of b.trees) assert.ok(TREE_BUILDER_IDS.includes(t.id), `tree ${t.id}`);
    for (const r of b.rocks.shapes) assert.ok(ROCK_BUILDER_IDS.includes(r.id), `rock shape ${r.id}`);
  }
  assert.deepEqual([...TREE_BUILDER_IDS].sort(), Object.keys(TREE_SPECIES).sort());
});
