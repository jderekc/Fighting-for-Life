import * as THREE from 'three';

const GRAVITY = -14;

/** Small cube particles: star-puffs when enemies fall, sparkles when apples are eaten. */
export class Effects {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.geometry = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.materials = new Map();
    this.particles = [];
  }

  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshBasicMaterial({ color }));
    return this.materials.get(color);
  }

  burst(x, z, { color = '#ffe14d', count = 10, up = 5, spread = 3, life = 0.6, y = 1.2 } = {}) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.material(color));
      mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spread;
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.sin(a) * s,
        vy: up * (0.6 + Math.random() * 0.6),
        vz: Math.cos(a) * s,
        life,
        maxLife: life,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += GRAVITY * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 8;
      p.mesh.scale.setScalar(Math.max(0.05, p.life / p.maxLife));
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
