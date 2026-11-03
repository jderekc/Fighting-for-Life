import * as THREE from 'three';
import { ENEMIES } from '../data/enemies.js';
import { HEROES } from '../data/heroes.js';
import { CharacterView } from './CharacterView.js';
import { Effects } from './Effects.js';
import { buildClutter, buildForest, buildStructures, buildTerrainDetail } from './splashDetail.js';
import { buildCathedral } from './splashCathedral.js';
import { disposeTree, glowTexture, lambertPalette } from './splashKit.js';
import { Wanderers } from './splashLife.js';
import { brookDistance, brookLow, brookTop, DUEL_SPOTS, FALL, fbm, FLIGHT_LOOK, FLIGHT_PATH, hash, heightAt, PLATEAU, river1, river2, riverDistance, SIZE, slopeAt, smoothstep } from './splashLand.js';

// The title-screen flyover: a slow camera glide over a misty mountain valley with a cathedral, glowing rivers,
// swaying pines, blowing leaves, and two heroes fighting mobs on the cathedral's terrace. Purely decorative:
// it never touches the sim. It loops forever: fade in -> glide -> fade out -> restart.

export const SPLASH_SECONDS = 48; // one loop
const FADE = 2.2; // seconds of fade in at the start and fade out at the end
const SKY = '#aebbe3';

function buildTerrain() {
  const seg = 120;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const c2 = new THREE.Color();
  const mix = (a, b, t) => c.set(a).lerp(c2.set(b), Math.min(1, Math.max(0, t)));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = hash(Math.round(x / 2), Math.round(z / 2)); // per-block noise
    const soft = fbm(x * 0.09 + 3, z * 0.09 - 1); // broad patches
    const rd = riverDistance(x, z);
    const slope = slopeAt(x, z);
    const r = Math.hypot(x, z);
    if (h < 0.9 || rd < 4.4 || brookDistance(x, z) < 2.2) mix('#6b6246', '#8f8a7b', n * 0.9); // riverbed and bank: mud and gravel
    else if (rd < 7.5) mix('#6f8f48', '#7a6a46', ((7.5 - rd) / 3.1) * 0.65 + n * 0.1); // muddy banks
    else if (h > 23 + soft * 7) mix('#f1f4fa', '#dfe7f2', slope * 0.6 + n * 0.2); // snow, bluer where steep
    else if (slope > 1.05 && h > 5) mix(['#8a847c', '#6e6860', '#9a938a'][Math.floor(h / 1.5) % 3], '#7a6f62', n * 0.5); // cliff faces: strata bands
    else if (slope > 0.55 && h > 9) mix('#8d8a7d', '#75716a', n); // scree
    else if (h < 9) {
      mix('#5d9a47', '#4f8a3f', n);
      if (soft > 0.6) c.lerp(c2.set('#8ea64a'), (soft - 0.6) * 2.2); // dry, yellower grass
      if (fbm(x * 0.21 + 9, z * 0.21 + 4) > 0.69) c.lerp(c2.set('#7f6a45'), 0.8); // bare dirt
      if (r < 31) c.lerp(c2.set('#7a9a4a'), 0.3); // the worn terrace
    } else if (h < 18) mix('#4c7a45', '#6b6f58', smoothstep(9, 18, h) * 0.8 + (n - 0.5) * 0.15);
    else mix('#80828a', '#9a9ca6', n);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

// ---------- leaves, mist, rivers (forests, clutter and structures live in splashDetail.js) ----------

function buildMist() {
  const tex = glowTexture('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');
  const group = new THREE.Group();
  const planes = [];
  const unit = new THREE.PlaneGeometry(1, 1); // one geometry for every mist plane; each is sized with scale
  for (let i = 0; i < 70; i++) {
    const x = (hash(i, 3) - 0.5) * 190;
    const z = (hash(i, 7) - 0.5) * 190;
    const h = heightAt(x, z);
    if (h > 14) continue;
    const size = 26 + hash(i, 11) * 30;
    const m = new THREE.Mesh(
      unit,
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.32 + hash(i, 5) * 0.2, depthWrite: false, fog: false }),
    );
    m.scale.set(size, size, 1);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, h + 1.4 + hash(i, 13) * 2.2, z);
    m.userData = { x0: x, speed: 0.4 + hash(i, 17) * 0.6, spin: (hash(i, 19) - 0.5) * 0.02 };
    group.add(m);
    planes.push(m);
  }
  group.userData.planes = planes;
  return group;
}

function buildRiverMeshes() {
  const group = new THREE.Group();
  const flowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#4bc7e8';
    g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
      g.fillRect(Math.random() * 60, Math.random() * 120, 2 + Math.random() * 3, 8 + Math.random() * 20);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ribbon = (pts, width, material, lift) => {
    const pos = [];
    const uv = [];
    const idx = [];
    let run = 0;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      if (i > 0) run += p.distanceTo(pts[i - 1]);
      pos.push(p.x + nx * width, p.y + lift, p.z + nz * width, p.x - nx * width, p.y + lift, p.z - nz * width);
      uv.push(0, run / 12, 1, run / 12);
      if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return new THREE.Mesh(geo, material);
  };
  const water = new THREE.MeshBasicMaterial({ map: flowTex, color: '#9ff0ff', side: THREE.DoubleSide, fog: true });
  const aura = new THREE.MeshBasicMaterial({ color: '#5ab4ff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const pts of [river1, river2]) {
    group.add(ribbon(pts, 3.4, water, 0));
    group.add(ribbon(pts, 6.2, aura, 0.08));
  }
  // The brook: a thin stream across the cliff shelf, over the edge as a waterfall, then down the bank into river2.
  for (const pts of [brookTop, brookLow]) {
    group.add(ribbon(pts, 0.9, water, 0));
    group.add(ribbon(pts, 1.8, aura, 0.06));
  }
  const fallTex = flowTex.clone();
  fallTex.repeat.set(1, 2.5);
  const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, color: '#dff8ff', transparent: true, opacity: 0.92, side: THREE.DoubleSide, fog: true });
  const drop = FALL.top - FALL.bottom;
  for (const [dx, w, op] of [[0.55, 2.4, 1], [1.1, 3.2, 0.45]]) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, drop + 0.6), op < 1 ? fallMat.clone() : fallMat);
    if (op < 1) sheet.material.opacity = op;
    sheet.rotation.y = Math.PI / 2;
    sheet.position.set(FALL.x + dx, FALL.bottom + drop / 2 + 0.2, FALL.z);
    group.add(sheet);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 12), new THREE.MeshBasicMaterial({ color: '#bff2ff', transparent: true, opacity: 0.8, fog: true }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(FALL.x + 1.6, FALL.bottom + 0.12, FALL.z);
  group.add(pool);
  // Foam: two white rings around the plunge pool that swell and fade.
  const foam = [0, 1].map((i) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.3, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(FALL.x + 1.6, FALL.bottom + 0.16 + i * 0.01, FALL.z);
    r.userData.phase = i * Math.PI;
    group.add(r);
    return r;
  });
  group.userData.foam = foam;
  const spray = glowTexture('rgba(255,255,255,0.75)', 'rgba(255,255,255,0)');
  const mists = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5 + i * 1.5, 4 + i), new THREE.MeshBasicMaterial({ map: spray, transparent: true, opacity: 0.4 - i * 0.06, depthWrite: false, fog: true, side: THREE.DoubleSide }));
    m.position.set(FALL.x + 1.2 + i * 0.6, FALL.bottom + 1.6 + i * 0.9, FALL.z + (i % 2 ? 1.2 : -1.2));
    m.rotation.y = Math.PI / 2;
    m.userData.phase = i * 1.7;
    m.userData.y0 = m.position.y;
    group.add(m);
    mists.push(m);
  }
  group.userData.flow = flowTex;
  group.userData.fall = fallTex;
  group.userData.spray = mists;
  return group;
}

/** Floating motes along the rivers and a few drifting leaves. */
function buildLeaves() {
  const COUNT = 170;
  const geo = new THREE.PlaneGeometry(0.42, 0.3);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const palette = ['#7fbf4a', '#b6d24a', '#e0a63a', '#d9702e', '#5aa84a'];
  const col = new THREE.Color();
  const leaves = [];
  for (let i = 0; i < COUNT; i++) {
    col.set(palette[i % palette.length]);
    mesh.setColorAt(i, col);
    leaves.push({ x: hash(i, 1) * 80, y: hash(i, 2) * 26, z: hash(i, 3) * 80, speed: 3 + hash(i, 4) * 4, phase: hash(i, 5) * 6.28, spin: 1 + hash(i, 6) * 3 });
  }
  mesh.frustumCulled = false;
  mesh.userData.leaves = leaves;
  return mesh;
}

function buildMotes() {
  const COUNT = 120;
  const pos = new Float32Array(COUNT * 3);
  const base = [];
  for (let i = 0; i < COUNT; i++) {
    const pts = i % 2 ? river1 : river2;
    const p = pts[Math.floor(hash(i, 9) * pts.length)];
    base.push([p.x + (hash(i, 4) - 0.5) * 9, 1 + hash(i, 6) * 5, p.z + (hash(i, 8) - 0.5) * 9, hash(i, 2) * 6.28]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture('rgba(190,255,255,1)', 'rgba(120,220,255,0)'), size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#b8f6ff' }));
  pts.frustumCulled = false;
  pts.userData.base = base;
  return pts;
}

// Scratch objects for updateLeaves (no per-frame allocation).
const LEAF_TMP = {
  m4: new THREE.Matrix4(),
  e: new THREE.Euler(),
  q: new THREE.Quaternion(),
  v: new THREE.Vector3(),
  one: new THREE.Vector3(1, 1, 1),
  zero: new THREE.Vector3(0.0001, 0.0001, 0.0001),
};

// ---------- the duels ----------
class Duel {
  constructor(scene, effects, { heroLook, mobLook, mobOptions, x, z, facing, offset }) {
    this.effects = effects;
    this.offset = offset;
    this.hero = new CharacterView(heroLook, { sword: true });
    this.mob = new CharacterView(mobLook, mobOptions);
    this.hero.addTo(scene);
    this.mob.addTo(scene);
    this.x = x;
    this.z = z;
    const s = Math.sin(facing);
    const c = Math.cos(facing);
    this.dir = { x: s, z: c }; // from the hero toward the mob
    this.heroSim = { x, z, facing, state: 'chase' };
    this.mobSim = { x: x + s * 2.1, z: z + c * 2.1, facing: facing + Math.PI, state: 'chase' };
    this.hero.groundY = heightAt(x, z);
    this.mob.groundY = heightAt(this.mobSim.x, this.mobSim.z);
    this.baseX = this.mobSim.x; // where the mob stands when not shoved back
    this.baseZ = this.mobSim.z;
    this.cycle = 2.6;
    this.prevTT = -Infinity;
    this.reset();
  }

  /** Back to the first round, mob on its feet. Called at the start and whenever the loop time jumps back (the wrap). */
  reset() {
    this.last = -1;
    this.knockedOutUntil = 0;
    this.count = 0;
    this.lastHit = -1; // 2 * round + swing index of the last hero swing
    this.lastAtk = null;
    this.kb = 0;
    if (this.mob.dying) this.revive();
  }

  revive() {
    this.mob.dying = false;
    this.mob.finished = false;
    this.mob.deathT = 0;
    this.mob.root.rotation.x = 0;
    this.mob.root.visible = true;
  }

  /** Hero swing number `idx` of round k lands at `at` seconds into the round; the mob is shoved back a little each time. */
  hit(k, s, at, idx) {
    const id = k * 2 + idx;
    if (this.lastHit === id || s < at) return;
    this.lastHit = id;
    this.hero.startSwing(0.25);
    this.mob.flash();
    this.kb = 0.7;
    this.effects.burst(this.mobSim.x, this.mobSim.z, { color: '#ffe14d', count: 6, up: 3, spread: 2, life: 0.4, y: this.mob.groundY + 1.3 });
  }

  update(t, dt) {
    const tt = t + this.offset;
    // Without this, a mob knocked out just before the 48 s wrap would stay down for most of the next loop
    // (knockedOutUntil is in the old loop's time).
    if (tt < this.prevTT) this.reset();
    this.prevTT = tt;
    const k = Math.floor(tt / this.cycle);
    const s = tt - k * this.cycle;
    const mob = this.mobSim;

    mob.state = s > 0.25 && s < 0.9 ? 'windup' : 'chase'; // the red telegraph
    if (k !== this.last) {
      this.last = k;
      this.count += 1;
    }
    if (s > 0.9 && s < 1.0 && this.lastAtk !== k) {
      this.lastAtk = k;
      this.mob.startSwing(0.2);
    }
    this.hit(k, s, 1.1, 0); // hero swings at 1.1 s and 1.6 s
    this.hit(k, s, 1.6, 1);
    this.kb = Math.max(0, this.kb - dt * 1.6);
    mob.x = this.baseX + this.dir.x * this.kb;
    mob.z = this.baseZ + this.dir.z * this.kb;

    // Every third round the mob is knocked out in a puff of stars, then a new one steps in.
    if (this.count % 3 === 0 && s > 1.7 && !this.mob.dying && tt > this.knockedOutUntil) {
      this.mob.die();
      this.knockedOutUntil = tt + this.cycle * 2;
      this.effects.burst(mob.x, mob.z, { color: '#ffe14d', count: 14, up: 5, spread: 3, y: this.mob.groundY + 1.2 });
    }
    if (this.mob.dying && this.mob.finished && tt > this.knockedOutUntil - this.cycle * 1.1) this.revive();
    this.mob.root.visible = !(this.mob.dying && this.mob.finished);
    this.hero.sync(this.heroSim, dt);
    this.mob.sync(mob, dt);
  }
}

// ---------- the scene ----------
export class Splash {
  /** @param {HTMLElement|null} fadeEl a full-screen black div whose opacity is driven by the loop */
  constructor(fadeEl = null) {
    this.fadeEl = fadeEl;
    this.time = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.FogExp2(SKY, 0.0105);
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.5, 400);

    this.scene.add(new THREE.HemisphereLight('#d6deff', '#586a3e', 1.35));
    const sun = new THREE.DirectionalLight('#ffd9a3', 2.1);
    sun.position.set(-60, 45, 50);
    this.scene.add(sun);

    this.scene.add(buildTerrain());
    const cathedral = buildCathedral();
    cathedral.position.y = PLATEAU;
    this.scene.add(cathedral);
    this.sway = { value: 0 }; // the shared uTime uniform of every swaying material
    const lamb = lambertPalette(); // one Lambert material per colour across all the scenery
    this.scene.add(buildForest(this.sway, lamb), buildClutter(this.sway, lamb));
    this.structures = buildStructures(lamb);
    this.scene.add(this.structures, buildTerrainDetail(lamb));
    this.rivers = buildRiverMeshes();
    this.scene.add(this.rivers);
    this.mist = buildMist();
    this.scene.add(this.mist);
    this.leaves = buildLeaves();
    this.scene.add(this.leaves);
    this.motes = buildMotes();
    this.scene.add(this.motes);

    this.effects = new Effects(this.scene);
    const hero = HEROES.girl.look;
    this.duels = [
      new Duel(this.scene, this.effects, { heroLook: hero, mobLook: ENEMIES.grunt.look, mobOptions: {}, ...DUEL_SPOTS[0], facing: Math.PI / 2.4, offset: 0 }),
      new Duel(this.scene, this.effects, {
        heroLook: { skin: '#e0ac86', shirt: '#c04a7a', pants: '#3a3a5a', hair: '#2a1a12' },
        mobLook: ENEMIES.barchernarcher.look,
        mobOptions: {},
        ...DUEL_SPOTS[1],
        facing: -Math.PI / 2.6,
        offset: 1.3,
      }),
    ];

    this.life = new Wanderers(this.scene); // wandering mobs around the grounds

    // The glide: positions and the points it looks at, as smooth curves over the loop (control points in splashLand.js).
    const curve = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
    this.path = curve(FLIGHT_PATH);
    this.look = curve(FLIGHT_LOOK);
    this.heartY = this.structures.userData.heart.position.y;
    this.update(0);
  }

  /** Fade amount 0 (black) .. 1 (fully visible) for the current time in the loop. */
  get visibility() {
    return Math.max(0, Math.min(1, Math.min(this.time / FADE, (SPLASH_SECONDS - this.time) / FADE)));
  }

  update(dt) {
    // Wrap into [0, SPLASH_SECONDS): at the wrap the screen is already black, so it starts over fading back in. Modulo (not a
    // single subtraction) so a debug jump such as splash.time = 100 still lands inside the loop.
    this.time = (((this.time + dt) % SPLASH_SECONDS) + SPLASH_SECONDS) % SPLASH_SECONDS;
    const t = this.time;
    const u = t / SPLASH_SECONDS;
    this.camera.position.copy(this.path.getPoint(u));
    this.camera.lookAt(this.look.getPoint(u));

    this.sway.value = t;
    const heart = this.structures.userData.heart;
    heart.position.y = this.heartY + Math.sin(t * 1.6) * 0.25;
    heart.rotation.y = t * 0.8;
    this.rivers.userData.flow.offset.y = -t * 0.35;
    for (const f of this.rivers.userData.foam) {
      const k = (Math.sin(t * 1.4 + f.userData.phase) + 1) / 2; // 0..1, the two rings are half a cycle apart
      f.scale.setScalar(0.85 + 0.4 * k);
      f.material.opacity = 0.62 - 0.4 * k;
    }
    for (const sp of this.structures.userData.glows) {
      const flick = 1 + 0.12 * Math.sin(t * 7 + sp.userData.phase) + 0.07 * Math.sin(t * 13.3 + sp.userData.phase * 2);
      sp.scale.setScalar(sp.userData.size * flick);
      sp.material.opacity = 0.75 + 0.25 * Math.sin(t * 5 + sp.userData.phase);
    }
    for (const f of this.structures.userData.flags) {
      f.rotation.y = Math.PI / 2 + Math.sin(t * 2.1 + f.userData.phase * 2) * 0.22;
      f.rotation.z = Math.sin(t * 3.3 + f.userData.phase) * 0.06;
    }
    this.structures.userData.runeMat.color.setHSL(0.5, 0.9, 0.55 + 0.2 * Math.sin(t * 2.2)); // runes pulse
    this.rivers.userData.fall.offset.y = t * 1.1; // + = the pattern slides DOWN the sheet (the river's flow offset is the other way round)
    for (const m of this.rivers.userData.spray) {
      const k = 1 + 0.12 * Math.sin(t * 1.3 + m.userData.phase);
      m.scale.set(k, 1 / k, 1);
      m.position.y = m.userData.y0 + Math.sin(t * 0.9 + m.userData.phase) * 0.25;
    }
    for (const m of this.mist.userData.planes) {
      m.position.x = ((m.userData.x0 + t * m.userData.speed + 110) % 220) - 110;
      m.rotation.z += m.userData.spin * dt;
    }
    this.updateLeaves(t);
    this.updateMotes(t);
    for (const d of this.duels) d.update(t, dt);
    this.life.update(dt);
    this.effects.update(dt);

    if (this.fadeEl) this.fadeEl.style.opacity = String(1 - this.visibility);
  }

  updateLeaves(t) {
    const cam = this.camera.position;
    const { m4, e, q, v, one, zero } = LEAF_TMP;
    const W = 80;
    const leaves = this.leaves.userData.leaves;
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      // Blow along +x with a gentle gust, wrapped in a box around the camera so they are always about.
      const x = ((l.x + t * l.speed - cam.x + W / 2) % W + W) % W - W / 2 + cam.x;
      const z = ((l.z + t * 0.8 - cam.z + W / 2) % W + W) % W - W / 2 + cam.z;
      const y = cam.y - 8 + ((l.y + t * 0.6) % 26) + Math.sin(t * 1.4 + l.phase) * 0.8;
      e.set(t * l.spin + l.phase, t * l.spin * 0.7, l.phase);
      q.setFromEuler(e);
      const near = (x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2 < 36; // never a giant leaf in the lens
      m4.compose(v.set(x, y, z), q, near ? zero : one);
      this.leaves.setMatrixAt(i, m4);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  updateMotes(t) {
    const arr = this.motes.geometry.attributes.position.array;
    const base = this.motes.userData.base;
    for (let i = 0; i < base.length; i++) {
      const [x, y, z, ph] = base[i];
      arr[i * 3] = x + Math.sin(t * 0.4 + ph) * 1.5;
      arr[i * 3 + 1] = y + Math.sin(t * 0.8 + ph * 2) * 0.8 + 0.6;
      arr[i * 3 + 2] = z + Math.cos(t * 0.35 + ph) * 1.5;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    if (this.fadeEl) this.fadeEl.style.opacity = '0';
    for (const d of this.duels) {
      d.hero.dispose();
      d.mob.dispose();
    }
    this.life.dispose();
    this.effects.dispose();
    disposeTree(this.scene);
  }
}
