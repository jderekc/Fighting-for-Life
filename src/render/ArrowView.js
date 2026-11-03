import * as THREE from 'three';

const wood = new THREE.MeshLambertMaterial({ color: '#8a5a2b' });
const steel = new THREE.MeshLambertMaterial({ color: '#cfd6de' });
const feather = new THREE.MeshLambertMaterial({ color: '#d9483b' });
const shaft = new THREE.BoxGeometry(0.06, 0.06, 0.9);
const tip = new THREE.BoxGeometry(0.13, 0.1, 0.18);
const fletch = new THREE.BoxGeometry(0.16, 0.02, 0.22);

/** An arrow pointing along +z (the caller turns it to face its flight). Geometry and materials are shared, never disposed per arrow. */
export function createArrowMesh() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(shaft, wood);
  const t = new THREE.Mesh(tip, steel);
  t.position.z = 0.5;
  const f = new THREE.Mesh(fletch, feather);
  f.position.z = -0.38;
  g.add(s, t, f);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

const dartBody = new THREE.MeshBasicMaterial({ color: '#ffcf3a' });
const dartTip = new THREE.MeshBasicMaterial({ color: '#ff5fa2' });
const dartShaft = new THREE.BoxGeometry(0.13, 0.13, 0.4);
const dartNose = new THREE.BoxGeometry(0.17, 0.17, 0.12);

/** A bright toy dart for the hero's gun, pointing along +z. Shared geometry and materials, never disposed per dart. */
export function createDartMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(dartShaft, dartBody);
  const nose = new THREE.Mesh(dartNose, dartTip);
  nose.position.z = 0.24;
  g.add(body, nose);
  return g;
}
