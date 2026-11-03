import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { DUEL_SPOTS, FLIGHT_PATH, heightAt, PLATEAU, riverDistance, SHELF } from '../src/render/splashLand.js';

// The title-screen land is pure maths (splashLand.js), so its promises can be checked without a browser.

test('splash land: the cathedral terrace is flat at PLATEAU, the waterfall shelf stands at SHELF.h, rivers are carved low', () => {
  for (const [x, z] of [[0, 0], [10, 10], [-12, -15], [20, -5]]) assert.equal(heightAt(x, z), PLATEAU, `terrace at ${x},${z}`);
  assert.equal(heightAt(SHELF.x, SHELF.z), SHELF.h);
  for (const d of DUEL_SPOTS) {
    assert.equal(heightAt(d.x, d.z), PLATEAU, 'duels stand on the terrace');
    assert.ok(riverDistance(d.x, d.z) > 7, 'duels are off the rivers');
  }
  assert.equal(heightAt(0, 40), 0, 'river1 crosses x = 0 at z 40 (the bridge)');
});

test('splash flight: over the whole loop the camera stays at least 1 block above the ground around it', () => {
  const path = new THREE.CatmullRomCurve3(FLIGHT_PATH.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  let worst = Infinity;
  for (let i = 0; i <= 960; i++) {
    const p = path.getPoint(i / 960);
    let ground = -Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) ground = Math.max(ground, heightAt(p.x + dx, p.z + dz));
    worst = Math.min(worst, p.y - ground);
  }
  assert.ok(worst >= 1, `closest approach ${worst.toFixed(2)} blocks`);
});
