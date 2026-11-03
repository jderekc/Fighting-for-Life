import * as THREE from 'three';
import { scatterFlowers, sceneryOf, waterRects } from '../../logic/levelGrid.js';
import { Buildings } from './buildings.js';
import { Gate } from './gate.js';
import { SceneryMaterials } from './materials.js';
import { BIOMES } from '../../data/biomes.js';
import { FallingLeaves, Plants } from './plants.js';
import { Ruins } from './ruins.js';
import { ShopView } from './shop.js';
import { Sparkles } from './sparkles.js';
import { Bridges, Water } from './water.js';

/** Everything decorative-but-solid in a level: plants, stream, bridges, cottages. Built from level data. */
export class Scenery {
  constructor(parent, level, world) {
    const s = sceneryOf(level);
    this.group = new THREE.Group();
    parent.add(this.group);
    this.time = 0;
    this.materials = new SceneryMaterials();
    const flowers = scatterFlowers(world.grid, s.flowers);
    this.water = new Water(this.group, this.materials, world.grid, waterRects(s));
    this.bridges = new Bridges(this.group, this.materials, world.grid, s.bridges);
    const biome = BIOMES[level.biome ?? 'meadow'];
    this.plants = new Plants(this.group, this.materials, world.grid, s, flowers, { biome, seed: level.id });
    this.leaves = new FallingLeaves(this.group, world.grid, this.plants.trees, level.id, biome.wind?.gain ?? 1);
    this.buildings = new Buildings(this.group, this.materials, world.grid, s.buildings);
    this.ruins = new Ruins(this.group, this.materials, world.grid, s.ruins, { gain: biome.wind?.gain ?? 1, seed: level.id });
    this.shop = s.shop ? new ShopView(this.group, this.materials, world.grid, s.shop, s.buildings) : null;
    this.sparkles = biome.sparkles ? new Sparkles(this.group, level.arena, biome.sparkles, level.id) : null;
    this.gate = s.gate ? new Gate(this.group, this.materials, world.grid, s.gate) : null;
  }

  update(dt, world) {
    this.time += dt;
    this.water.update(this.time);
    this.plants.update(this.time);
    this.leaves.update(dt, this.time);
    this.ruins.update(this.time);
    this.shop?.update(this.time, world.nearShop);
    this.sparkles?.update(dt, this.time);
    this.buildings.update(dt, world);
    this.gate?.update(dt, world, this.time);
  }

  dispose() {
    this.water.dispose();
    this.bridges.dispose();
    this.leaves.dispose();
    this.plants.dispose();
    this.buildings.dispose();
    this.ruins.dispose();
    this.shop?.dispose();
    this.sparkles?.dispose();
    this.gate?.dispose();
    this.materials.dispose();
    this.group.removeFromParent();
  }
}
