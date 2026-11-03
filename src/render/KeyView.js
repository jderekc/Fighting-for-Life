import * as THREE from 'three';

/** A blocky golden key that spins and bobs, with a tall light beam so it can be spotted from across the map. */
export function createKeyMesh() {
  const gold = new THREE.MeshLambertMaterial({ color: '#ffd23a', emissive: '#8a6200', emissiveIntensity: 0.8 });
  const g = new THREE.Group();
  const add = (w, h, d, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), gold);
    m.position.set(x, y, 0);
    m.castShadow = true;
    g.add(m);
  };
  // Head: a square ring made of four bars. Shaft with two teeth.
  add(0.5, 0.12, 0.12, 0, 0.62);
  add(0.5, 0.12, 0.12, 0, 0.18);
  add(0.12, 0.5, 0.12, -0.19, 0.4);
  add(0.12, 0.5, 0.12, 0.19, 0.4);
  add(0.12, 0.7, 0.12, 0, -0.18);
  add(0.22, 0.1, 0.12, 0.11, -0.4);
  add(0.16, 0.1, 0.12, 0.09, -0.22);

  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffe27a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 9, 0.22), beamMat);
  beam.position.y = 3.2;
  g.add(beam);
  g.userData = { gold, beam, beamMat };
  return g;
}

export function animateKey(mesh, x, z, groundY, time) {
  mesh.position.set(x, groundY + 0.95 + Math.sin(time * 3) * 0.12, z);
  mesh.rotation.y = time * 2;
  mesh.userData.beam.rotation.y = -time * 2; // keep the beam from visibly spinning with the key
  mesh.userData.beam.position.y = 3.2 - (0.95 + Math.sin(time * 3) * 0.12) + 0.95;
  mesh.userData.beamMat.opacity = 0.2 + 0.08 * Math.sin(time * 4);
}

export function disposeKey(mesh) {
  mesh.traverse((o) => o.isMesh && o.geometry.dispose());
  mesh.userData.gold.dispose();
  mesh.userData.beamMat.dispose();
}
