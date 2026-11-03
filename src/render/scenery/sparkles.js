import * as THREE from 'three';
import { cellRng } from '../../logic/terrain.js';

/** Glowing motes drifting upward over the whole arena: the "mystical" part of the oasis. Cosmetic only. */
export class Sparkles {
  constructor(parent, arena, { count = 30, color = '#b9f6ff' } = {}, seed = 1) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const rnd = cellRng(seed, 17, 3);
    this.motes = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      this.group.add(mesh);
      this.motes.push({
        mesh,
        x: (rnd() - 0.5) * arena.width,
        z: (rnd() - 0.5) * arena.depth,
        y: rnd() * 3.5,
        speed: 0.25 + rnd() * 0.4,
        phase: rnd() * Math.PI * 2,
      });
    }
  }

  update(dt, time) {
    for (const m of this.motes) {
      m.y += m.speed * dt;
      if (m.y > 3.8) m.y = 0;
      m.mesh.position.set(m.x + Math.sin(time * 0.8 + m.phase) * 0.4, m.y, m.z + Math.cos(time * 0.6 + m.phase) * 0.4);
      m.mesh.scale.setScalar(0.5 + 0.5 * Math.abs(Math.sin(time * 2 + m.phase)));
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
