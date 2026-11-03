import * as THREE from 'three';

/** A blocky apple: red cube, brown stem, green leaf. Bobs and spins so it reads as pickup-able. */
export function createAppleMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), new THREE.MeshLambertMaterial({ color: '#e03030' }));
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), new THREE.MeshLambertMaterial({ color: '#6b4423' }));
  stem.position.y = 0.3;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.12), new THREE.MeshLambertMaterial({ color: '#4cc04c' }));
  leaf.position.set(0.12, 0.34, 0);
  group.add(body, stem, leaf);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return group;
}

export function animateApple(mesh, x, z, timeSeconds, phase = 0) {
  mesh.position.set(x, 0.55 + Math.sin(timeSeconds * 3 + phase) * 0.12, z);
  mesh.rotation.y = timeSeconds * 1.5 + phase;
}

export function disposeApple(mesh) {
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}
