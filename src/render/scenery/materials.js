import * as THREE from 'three';
import {
  makeBarkVariantTexture,
  makeLeafVariantTexture,
  makePlankTexture,
  makeRoofTexture,
  makeStoneVariantTexture,
  makeWaterTexture,
} from '../textures.js';

const lambert = (map, color = '#ffffff') => new THREE.MeshLambertMaterial({ map, color });

/** One shared set of materials for all scenery, disposed together. */
export class SceneryMaterials {
  constructor() {
    this.barks = new Map(); // species -> material (made on first use)
    this.leafMats = new Map();
    this.rocks = new Map(); // rock texture id -> material
    this.waterMap = makeWaterTexture();
    this.waterMap.wrapS = this.waterMap.wrapT = THREE.RepeatWrapping;
    this.water = new THREE.MeshLambertMaterial({ map: this.waterMap });
    this.planks = lambert(makePlankTexture('#a8763f', 43));
    this.floor = lambert(makePlankTexture('#8a6236', 53));
    this.deck = lambert(makePlankTexture('#b98a4e', 59));
    this.door = lambert(makePlankTexture('#6e4524', 61));
    this.stem = new THREE.MeshLambertMaterial({ color: '#3f9a3a' });
    this.flowerCenter = new THREE.MeshLambertMaterial({ color: '#ffe07a' });
    this.petals = new Map();
    this.iron = lambert(makePlankTexture('#4a4f58', 71));
    this.gold = new THREE.MeshLambertMaterial({ color: '#f2c230', emissive: '#7a5500', emissiveIntensity: 0.6 });
    this.portal = new THREE.MeshBasicMaterial({
      color: '#ffe9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.owned = [this.iron, this.gold, this.portal, this.water, this.planks, this.floor, this.deck, this.door, this.stem, this.flowerCenter];
  }

  cached(map, key, make) {
    if (!map.has(key)) {
      const m = make();
      map.set(key, m);
      this.owned.push(m);
    }
    return map.get(key);
  }

  bark(species) {
    return this.cached(this.barks, species, () => lambert(makeBarkVariantTexture(species)));
  }

  leaves(species) {
    return this.cached(this.leafMats, species, () => lambert(makeLeafVariantTexture(species)));
  }

  rock(texture) {
    return this.cached(this.rocks, texture, () => {
      const m = lambert(makeStoneVariantTexture(texture), texture === 'crystal' ? '#ffffff' : '#dcdcdc');
      if (texture === 'crystal') {
        m.emissive.set('#6a4cff'); // crystals glow
        m.emissiveIntensity = 0.55;
      }
      return m;
    });
  }

  petal(color) {
    if (!this.petals.has(color)) this.petals.set(color, new THREE.MeshLambertMaterial({ color }));
    return this.petals.get(color);
  }

  /** A transparent copy that fades the roof and front wall when the hero steps inside. */
  cutaway(source) {
    const m = source.clone();
    m.transparent = true;
    this.owned.push(m);
    return m;
  }

  roof() {
    const m = new THREE.MeshLambertMaterial({ map: makeRoofTexture(), transparent: true });
    this.owned.push(m);
    return m;
  }

  dispose() {
    for (const m of [...this.owned, ...this.petals.values()]) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
