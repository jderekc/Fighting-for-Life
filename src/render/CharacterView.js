import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';
import { angleDiff, lerp } from '../logic/math.js';
import { createRock, createSunMan } from './mobs.js';
import { createBlocky, createBow, createQuiver, HELD_WEAPONS, setEmissive } from './blocky.js';

const RAISED_ARM = -2.4; // overhead, ready to swing
const IDLE_ARM = -0.35;
const AIM_ARM = -1.45; // arm held straight out to aim a gun

/**
 * Drives one blocky character from a sim object ({x, z, facing, state?}).
 * Everything here is cosmetic: walking, swinging, hit flashes, the death fall.
 */
export class CharacterView {
  /** `weapon` is a weapon id from data/weapons.js (the hero); `bow` is the archer's. */
  constructor(look, { weapon = null, bow = false, healthBar = false, camera = null } = {}) {
    this.model = look.model === 'sun' ? createSunMan(look) : look.model === 'rock' ? createRock() : createBlocky(look);
    this.clock = 0;
    this.root = this.model.root;
    this.camera = camera;
    this.walkPhase = 0;
    this.swingDuration = 0;
    this.swingT = 1; // 1 = not swinging
    this.flashT = 0;
    this.dying = false;
    this.deathT = 0;
    this.finished = false;
    this.lastX = null;
    this.lastZ = null;
    this.weaponId = null;
    this.style = null; // how the body moves with the weapon: swing, stab, slam, shoot
    this.held = []; // the weapon meshes in the hands
    this.hasBow = bow;
    this.scale = look.scale ?? 1;

    if (weapon) this.setWeapon(weapon);
    if (bow) {
      this.model.armL.add(createBow());
      this.model.root.add(createQuiver());
    }

    this.bar = null;
    if (healthBar) this.bar = createHealthBar();
  }

  /** Put a different weapon in the hero's hands (the shop swap). */
  setWeapon(id) {
    for (const mesh of this.held) {
      mesh.removeFromParent();
      disposeTree(mesh);
    }
    this.held = [];
    const made = HELD_WEAPONS[id]();
    if (made.right) this.model.armR.add(made.right);
    if (made.left) this.model.armL.add(made.left);
    this.held = [made.right, made.left].filter(Boolean);
    this.weaponId = id;
    this.style = WEAPONS[id].style;
    this.swingT = 1;
  }

  addTo(parent) {
    parent.add(this.root);
    if (this.bar) parent.add(this.bar.group);
  }

  removeFrom(parent) {
    parent.remove(this.root);
    if (this.bar) parent.remove(this.bar.group);
  }

  startSwing(duration) {
    this.swingDuration = duration;
    this.swingT = 0;
  }

  flash() {
    this.flashT = 0.15;
  }

  die() {
    this.dying = true;
    this.deathT = 0;
  }

  /** @param sim the sim object, @param healthFraction 0..1 for the floating bar */
  sync(sim, dt, healthFraction = 1) {
    const root = this.root;
    this.clock += dt;
    this.model.animate?.(this.clock, sim);
    root.position.x = sim.x;
    root.position.z = sim.z;
    if (!this.dying) root.position.y = this.groundY ?? 0; // set by WorldView (hills)

    // Turn toward facing the short way, quickly but not instantly.
    if (!this.dying) {
      const diff = angleDiff(root.rotation.y, sim.facing);
      root.rotation.y += diff * Math.min(1, 16 * dt);
    }

    // Walk speed from actual movement, so knockback and pushes animate sensibly too.
    let speed = 0;
    if (this.lastX !== null && dt > 0) speed = Math.hypot(sim.x - this.lastX, sim.z - this.lastZ) / dt;
    this.lastX = sim.x;
    this.lastZ = sim.z;
    const move = Math.min(1, speed / 4);
    this.walkPhase += speed * dt * 2.2;

    const { legL, legR, armL, armR } = this.model;
    const swing = Math.sin(this.walkPhase) * 0.8 * move;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    const armed = this.style !== null;
    armR.rotation.x = armed ? IDLE_ARM + swing * 0.3 : swing * 0.8;
    if (this.style === 'shoot') {
      armR.rotation.x = AIM_ARM; // gun arm held out
      if (this.weaponId === 'sniper') armL.rotation.x = AIM_ARM + 0.15; // the rifle takes two hands
    }

    // Attack swing (hero) and telegraph (enemy windup).
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / Math.max(0.01, this.swingDuration));
      const t = this.swingT;
      const eased = 1 - (1 - t) * (1 - t);
      if (this.style === 'slam') {
        // Hammer: heave it overhead for most of the wind-up, then bring it down hard.
        armR.rotation.x = t < 0.8 ? lerp(IDLE_ARM, RAISED_ARM - 0.3, t / 0.8) : lerp(RAISED_ARM - 0.3, 0.1, (t - 0.8) / 0.2);
      } else if (this.style === 'stab') {
        // Daggers: both hands jab, one after the other.
        armR.rotation.x = lerp(-1.7, -0.3, eased);
        armL.rotation.x = lerp(-0.3, -1.7, Math.sin(t * Math.PI));
      } else if (this.style === 'shoot') {
        armR.rotation.x = AIM_ARM + 0.45 * (1 - eased); // recoil kick, then settles
      } else {
        const angle = lerp(RAISED_ARM, -0.2, eased);
        armR.rotation.x = angle;
        if (!armed && !this.hasBow) armL.rotation.x = angle;
      }
    } else if (sim.state === 'windup') {
      armR.rotation.x = RAISED_ARM;
      armL.rotation.x = RAISED_ARM;
    }

    // Archers hold the bow out and draw the string back during the windup.
    if (this.hasBow) {
      armL.rotation.x = -1.45;
      if (sim.state === 'windup') armR.rotation.x = -1.75;
      else if (this.swingT >= 1) armR.rotation.x = swing * 0.5 - 0.3;
    }

    // Flash: red pulse while an enemy winds up, white-hot blink when hit.
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.flashT > 0) setEmissive(this.model, '#ffffff', 0.9);
    else if (sim.state === 'windup') setEmissive(this.model, '#ff2200', 0.35 + 0.25 * Math.sin(performance.now() / 40));
    else setEmissive(this.model, '#000000', 0);

    if (this.dying) this.updateDeath(dt);
    this.updateBar(sim, healthFraction);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.5);
    this.root.rotation.x = -t * (Math.PI / 2); // fall onto its back
    this.root.position.y = (this.groundY ?? 0) - t * 0.15;
    if (this.deathT >= 0.9) this.finished = true;
  }

  updateBar(sim, fraction) {
    if (!this.bar) return;
    const { group, fill } = this.bar;
    group.visible = !this.dying;
    group.position.set(sim.x, 2.5 * this.scale + (this.groundY ?? 0), sim.z);
    group.scale.setScalar(this.scale);
    if (this.camera) group.quaternion.copy(this.camera.quaternion);
    const f = Math.max(0.001, fraction);
    fill.scale.x = f;
    fill.position.x = -(1 - f) * 0.5;
    fill.material.color.set(f > 0.5 ? '#52d65c' : f > 0.25 ? '#f0c040' : '#e04545');
  }

  dispose() {
    // Dispose everything reachable from the model (body parts and the sword), not a hand-kept list.
    this.root.traverse((o) => {
      if (o.isSprite) {
        o.material.map?.dispose();
        o.material.dispose();
        return;
      }
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.map?.dispose();
        m.dispose();
      }
    });
    if (this.bar) {
      this.bar.group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    }
  }
}

function disposeTree(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
}

function createHealthBar() {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.17),
    new THREE.MeshBasicMaterial({ color: '#111111', depthTest: false, transparent: true, opacity: 0.8 }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.11),
    // Transparent so it sorts in the same pass as the background and renderOrder decides who is on top.
    new THREE.MeshBasicMaterial({ color: '#52d65c', depthTest: false, transparent: true }),
  );
  fill.position.z = 0.001;
  bg.renderOrder = 10;
  fill.renderOrder = 11;
  group.add(bg, fill);
  return { group, fill };
}
