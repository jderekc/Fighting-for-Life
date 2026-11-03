import * as THREE from 'three';

const gold = new THREE.MeshLambertMaterial({ color: '#ffd23a', emissive: '#8a6200', emissiveIntensity: 0.6 });
const coinGeometry = new THREE.BoxGeometry(0.34, 0.07, 0.34);

/** A little stack of gold coins: more coins in the pile for a bigger payout (1 to 6). The shared geometry/material are never disposed per-pile. */
export function createCoinMesh(value) {
  const group = new THREE.Group();
  const n = Math.max(1, Math.min(6, Math.ceil(value / 25)));
  for (let i = 0; i < n; i++) {
    const coin = new THREE.Mesh(coinGeometry, gold);
    const a = (i / n) * Math.PI * 2;
    const r = n === 1 ? 0 : 0.22;
    coin.position.set(Math.cos(a) * r, 0.04 + (i % 2) * 0.08, Math.sin(a) * r);
    coin.rotation.y = i * 0.7;
    coin.castShadow = true;
    group.add(coin);
  }
  return group;
}

export function animateCoin(mesh, x, y, z, time, phase = 0) {
  mesh.position.set(x, y + 0.35 + Math.sin(time * 4 + phase) * 0.08, z);
  mesh.rotation.y = time * 2.2 + phase;
}
