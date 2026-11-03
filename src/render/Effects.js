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
    this.flats = []; // rings and tracers: { mesh, life, maxLife, grow }
    this.ringGeometry = new THREE.RingGeometry(0.8, 1, 40);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.lineGeometry = new THREE.BoxGeometry(1, 1, 1);
  }

  /** An expanding shockwave ring on the ground (the hammer). */
  ring(x, z, radius, { color = '#ffe14d', y = 0.12, life = 0.4 } = {}) {
    const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(Math.max(0.1, radius * 0.25));
    this.group.add(mesh);
    this.flats.push({ mesh, life, maxLife: life, from: radius * 0.25, to: radius, kind: 'ring' });
  }

  /** A quick bright streak between two points (the sniper's shot). */
  tracer(x0, z0, x1, z1, { color = '#ff5a5a', y = 1.1, life = 0.18, width = 0.09 } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) return;
    const mesh = new THREE.Mesh(this.lineGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.scale.set(width, width, len);
    mesh.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    this.group.add(mesh);
    this.flats.push({ mesh, life, maxLife: life, kind: 'tracer' });
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
    for (let i = this.flats.length - 1; i >= 0; i--) {
      const f = this.flats[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        f.mesh.material.dispose();
        this.flats.splice(i, 1);
        continue;
      }
      const k = f.life / f.maxLife;
      f.mesh.material.opacity = 0.95 * k;
      if (f.kind === 'ring') f.mesh.scale.setScalar(f.from + (f.to - f.from) * (1 - k * k));
      else f.mesh.scale.x = f.mesh.scale.y = 0.09 * (0.3 + 0.7 * k);
    }
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
    for (const f of this.flats) f.mesh.material.dispose();
    this.ringGeometry.dispose();
    this.lineGeometry.dispose();
    this.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
  }
}
