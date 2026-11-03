import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { BIOMES, TREE_SPECIES } from '../src/data/biomes.js';
import { LEVELS, validateLevel } from '../src/data/levels.js';
import { Health } from '../src/logic/health.js';
import { buildLevelGrid, NO_SCENERY, ruinPieces, ruinSolidCells, terrainClass } from '../src/logic/levelGrid.js';
import { groundKind, treeSpecies, windStrength } from '../src/logic/terrain.js';
import { healthAfterWin, healthForRetry } from '../src/logic/progress.js';
import { World } from '../src/sim/World.js';

const L3 = LEVELS.find((l) => l.id === 3);
const bare = { ...LEVELS[0], scenery: NO_SCENERY };

test('health carries over and is never reset: a win keeps what is left, a retry starts from the entry health (min 1)', () => {
  assert.equal(healthAfterWin(37), 37);
  assert.equal(healthForRetry(10), 10);
  assert.equal(healthForRetry(0), 1);
  assert.equal(healthForRetry(Infinity), Infinity, 'entered at full health -> retry at full');
});

test('World honours a start health', () => {
  const w = new World(LEVELS[1], 'sword', { startHealth: 42 });
  assert.equal(w.hero.health.current, 42);
  assert.equal(w.hero.health.max, CONFIG.hero.maxHealth);
  assert.equal(new World(LEVELS[1], 'sword').hero.health.current, CONFIG.hero.maxHealth, 'default is full');
});

test('Health: a start value is clamped to 1..max (never begins knocked out)', () => {
  assert.equal(new Health(100, 0).current, 1);
  assert.equal(new Health(100, 500).current, 100);
  assert.equal(new Health(100, 30).current, 30);
});

test('level 2 has no buildings at all; level 3 has temple ruins, a pond, no buildings and no stream', () => {
  const l2 = LEVELS.find((l) => l.id === 2);
  assert.equal((l2.scenery.buildings ?? []).length, 0);
  assert.equal((L3.scenery.buildings ?? []).length, 0);
  assert.equal((L3.scenery.streams ?? []).length, 0);
  assert.ok(L3.scenery.ponds.length > 0 && L3.scenery.ruins.length > 0);
  assert.equal(L3.biome, 'mountain');
});

test('ponds block walking like streams', () => {
  const g = buildLevelGrid(L3);
  const p = L3.scenery.ponds[0];
  assert.ok(g.blockedForPlanning(p.ix, p.iz));
});

test('wind: the mountain is windier and its trees sway more; gain scales the gusts', () => {
  assert.ok(BIOMES.mountain.wind.gain > BIOMES.meadow.wind.gain);
  assert.ok(BIOMES.mountain.wind.treeSway > BIOMES.meadow.wind.treeSway);
  for (let t = 0; t < 60; t += 0.7) assert.ok(Math.abs(windStrength(t, 2) - 2 * windStrength(t, 1)) < 1e-12);
});

test('mountain biome: mostly pine and bare trees, with snow somewhere on level 3', () => {
  const ids = BIOMES.mountain.trees.map((t) => t.id);
  assert.ok(ids.includes('pine') && ids.includes('dead'));
  assert.ok(TREE_SPECIES.dead);
  const kinds = new Set();
  for (let x = 0; x < 40; x++) for (let z = 0; z < 32; z++) kinds.add(groundKind(x, z, BIOMES.mountain.ground, 3));
  assert.ok(kinds.has('snow') && kinds.has('alpine'));
  const species = new Set(L3.scenery.trees.map(([x, z]) => treeSpecies(BIOMES.mountain, x, z, 3)));
  assert.ok(species.has('pine') && species.has('dead'));
});

test('ruinPieces: corner pillars, an entrance gap in the middle of each side, solid walls', () => {
  const r = { ix: 0, iz: 0, w: 9, d: 9, seed: 1 };
  const pieces = ruinPieces(r);
  const at = (x, z) => pieces.find((p) => p.ix === x && p.iz === z);
  for (const [x, z] of [[0, 0], [8, 0], [0, 8], [8, 8]]) assert.equal(at(x, z).kind, 'pillar');
  for (const [x, z] of [[4, 0], [4, 8], [0, 4], [8, 4]]) assert.equal(at(x, z), undefined, `gap at ${x},${z}`);
  assert.ok(pieces.some((p) => p.kind === 'wall'));
  assert.deepEqual(ruinPieces(r), pieces, 'deterministic');
  assert.ok(ruinSolidCells(r).length < pieces.length + 1);
});

test('ruins block walking but you can walk in through the gaps', () => {
  const r = { ix: 3, iz: 3, w: 9, d: 9, seed: 2 };
  const lvl = { ...bare, scenery: { ...NO_SCENERY, ruins: [r] } };
  const g = buildLevelGrid(lvl);
  for (const [x, z] of ruinSolidCells(r)) assert.ok(g.blockedForPlanning(x, z));
  assert.ok(!g.blockedForPlanning(7, 3), 'entrance on the north side is open');
});

test('validateLevel rejects ruins on a slope, beside trees, and overlapping a pond', () => {
  const base = { ...L3 };
  const withScenery = (patch) => ({ ...base, scenery: { ...base.scenery, ...patch } });
  const bad = (lvl, text) => assert.ok(validateLevel(lvl).some((p) => p.includes(text)), `expected "${text}" in ${JSON.stringify(validateLevel(lvl))}`);
  bad(withScenery({ ruins: [{ ix: 2, iz: 14, w: 9, d: 9, seed: 1 }] }), 'flat ground');
  bad(withScenery({ ruins: [{ ix: 4, iz: 1, w: 7, d: 7, seed: 1 }] }), 'overlaps water');
  bad(withScenery({ ruins: [{ ix: 11, iz: 10, w: 4, d: 9, seed: 1 }] }), 'at least 5x5');
  const treeBeside = withScenery({ trees: [...base.scenery.trees, [10, 14]] });
  bad(treeBeside, 'too close to a ruin');
});

test('level 3: the temple sits on flat high ground and everything is reachable', () => {
  assert.deepEqual(validateLevel(L3), []);
  const g = buildLevelGrid(L3);
  const r = L3.scenery.ruins[0];
  const h = g.heightAtCell(r.ix, r.iz);
  assert.ok(h >= 1.5);
  assert.notEqual(terrainClass(g, r.ix + 4, r.iz + 4), 'ledge');
});
