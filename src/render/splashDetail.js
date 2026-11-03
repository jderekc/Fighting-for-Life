import * as THREE from 'three';
import { boxMaker, glowTexture, instanced, lambertPalette, mergeStatic, scatter, swayMaterial } from './splashKit.js';
import { brookDistance, hash, heightAt, river1, river2, riverDistance, SHELF, slopeAt, smoothstep } from './splashLand.js';

// Everything that is scattered or built on the title-screen land: forests (four kinds of tree), ground clutter (bushes, rocks,
// flowers, grass, mushrooms, logs) and structures (path and lanterns, a stone bridge, cottages, a ruined watchtower, standing
// stones, a fence). All instanced or tiny, deterministic (hash-based), and placed using the same heightAt() as the terrain mesh.

const dirtOrRiver = (x, z, margin) => riverDistance(x, z) < margin || brookDistance(x, z) < margin * 0.5;
const FAR = 42; // keep the cathedral terrace and the camera's low pass open

// ---------- forests ----------
export function buildForest(uTime, lamb = lambertPalette()) {
  const group = new THREE.Group();
  const pines = [];
  const oaks = [];
  const birches = [];
  const dead = [];
  scatter(104, 3.0, (x, z, h) => {
    if (h < 1.2 || h > 21 || Math.hypot(x, z) < FAR || dirtOrRiver(x, z, 6)) return null;
    const dens = hash(x * 0.7, z * 0.7);
    if (dens < 0.38 + 0.25 * smoothstep(0, 17, h)) return null; // clumps and clearings
    const s = 0.8 + hash(x, z + 1) * 0.9;
    const kind = hash(x + 3, z - 5);
    const item = { x, y: h, z, s, ry: hash(z, x) * 6.28 };
    if (h > 14) (kind < 0.88 ? pines : dead).push(item);
    else if (h < 7 && kind < 0.42) oaks.push(item);
    else if (h < 10 && kind < 0.55) birches.push(item);
    else if (kind > 0.96) dead.push(item);
    else pines.push(item);
    return null;
  });

  // Pines: trunk + three stacked cones (the upper two sway more).
  const bark = lamb('#6b4a2b');
  group.add(instanced(new THREE.BoxGeometry(0.5, 2.4, 0.5), bark, pines.map((p) => ({ ...p, y: p.y + 1.2 * p.s }))));
  const cones = [
    [new THREE.ConeGeometry(2.3, 3.6, 6), 2.8],
    [new THREE.ConeGeometry(1.8, 3.2, 6), 4.6],
    [new THREE.ConeGeometry(1.2, 2.8, 6), 6.2],
  ];
  const pineColors = (p) => (p.y > 10 ? '#2f5d3e' : p.y > 5 ? '#386b3c' : '#417a3a');
  for (const [geo, lift] of cones) {
    group.add(instanced(geo, swayMaterial(uTime), pines.map((p) => ({ ...p, y: p.y + lift * p.s, color: new THREE.Color(pineColors(p)).offsetHSL((hash(p.x, p.z) - 0.5) * 0.04, 0, (hash(p.z, p.x) - 0.5) * 0.08) })), 2));
  }
  // Snow caps on the highest pines.
  const snowy = pines.filter((p) => p.y > 15);
  group.add(instanced(new THREE.ConeGeometry(0.9, 1.4, 6), lamb('#f1f4fa'), snowy.map((p) => ({ ...p, y: p.y + 7.2 * p.s }))));

  // Oaks: thick trunk, a crown of three chunky blobs in autumn-ish greens.
  group.add(instanced(new THREE.BoxGeometry(0.8, 2.6, 0.8), bark, oaks.map((p) => ({ ...p, y: p.y + 1.3 * p.s }))));
  const blob = new THREE.IcosahedronGeometry(1.7, 0);
  const crown = [[0, 3.6, 0, 1.15], [-1.1, 3.0, 0.5, 0.85], [1.0, 3.2, -0.6, 0.9]];
  const oakPalette = ['#5aa044', '#6fae4a', '#8fb84a', '#c79a34', '#4d8f3e'];
  for (const [dx, dy, dz, sc] of crown) {
    group.add(
      instanced(blob, swayMaterial(uTime, 0.05, true, 0.5), oaks.map((p) => ({ x: p.x + dx * p.s, y: p.y + dy * p.s, z: p.z + dz * p.s, s: sc * p.s, ry: p.ry, color: oakPalette[Math.floor(hash(p.x, p.z) * oakPalette.length)] }))),
    );
  }
  // Birches: white trunks with dark bands, small yellow-green puffs.
  group.add(instanced(new THREE.BoxGeometry(0.34, 4.2, 0.34), lamb('#e8e4d8'), birches.map((p) => ({ ...p, y: p.y + 2.1 * p.s }))));
  group.add(instanced(new THREE.BoxGeometry(0.36, 0.12, 0.36), lamb('#2a2a2a'), birches.map((p) => ({ ...p, y: p.y + 1.4 * p.s }))));
  group.add(instanced(new THREE.BoxGeometry(0.36, 0.12, 0.36), lamb('#2a2a2a'), birches.map((p) => ({ ...p, y: p.y + 2.7 * p.s }))));
  for (const [dx, dy, dz, sc] of [[0, 4.7, 0, 1.0], [0.7, 3.8, 0.3, 0.7], [-0.6, 4.0, -0.4, 0.75]]) {
    group.add(
      instanced(new THREE.IcosahedronGeometry(1.1, 0), swayMaterial(uTime, 0.06, true, 0.5), birches.map((p) => ({ x: p.x + dx * p.s, y: p.y + dy * p.s, z: p.z + dz * p.s, s: sc * p.s, color: hash(p.z, p.x) < 0.4 ? '#d9c24a' : '#9ccf5a' }))),
    );
  }
  // Dead trees: a bare trunk and two crooked branches.
  const deadBark = lamb('#4a3a30');
  group.add(instanced(new THREE.BoxGeometry(0.45, 4.6, 0.45), deadBark, dead.map((p) => ({ ...p, y: p.y + 2.3 * p.s }))));
  group.add(instanced(new THREE.BoxGeometry(0.2, 2, 0.2), deadBark, dead.map((p) => ({ ...p, y: p.y + 3.8 * p.s, rz: 0.9, sy: p.s }))));
  group.add(instanced(new THREE.BoxGeometry(0.2, 1.7, 0.2), deadBark, dead.map((p) => ({ ...p, y: p.y + 3.1 * p.s, rz: -0.8, ry: p.ry + 1.6, sy: p.s }))));
  return group;
}

// ---------- ground clutter ----------
export function buildClutter(uTime, lamb = lambertPalette()) {
  const group = new THREE.Group();
  const open = (x, z, h, margin = 3) => h > 0.9 && h < 22 && !dirtOrRiver(x, z, margin) && Math.hypot(x, z) > 12;

  // Grass tufts: three thin cones per tuft, swaying.
  const tufts = scatter(100, 1.5, (x, z, h) => (open(x, z, h, 4.4) && hash(x * 1.3, z * 1.1) > 0.35 && h < 14 ? { x, y: h, z, s: 0.7 + hash(z, x) * 0.7, ry: hash(x, z) * 6.28, color: hash(x, z + 9) < 0.3 ? '#8cc15a' : '#5fa04a' } : null), 5);
  const blade = new THREE.ConeGeometry(0.12, 0.9, 3, 1, true); // open-ended: the base cap is buried, so skip its triangles
  for (const [dx, rz] of [[-0.12, 0.25], [0, 0], [0.12, -0.25]]) {
    group.add(instanced(blade, swayMaterial(uTime, 0.25, true, 0.2), tufts.map((t) => ({ ...t, x: t.x + dx, y: t.y + 0.4 * t.s, rz })), 2));
  }

  // Flowers: a stem and a bright head, in drifts.
  const palette = ['#ff6b8b', '#ffd23f', '#ffffff', '#b58cff', '#ff9a3c', '#6bd0ff'];
  const flowers = scatter(96, 1.8, (x, z, h) => {
    if (!open(x, z, h, 5) || h > 9 || hash(x * 0.45, z * 0.45) < 0.52) return null; // drifts of colour
    return { x, y: h, z, s: 0.8 + hash(x, z) * 0.6, color: palette[Math.floor(hash(x + 2, z + 2) * palette.length)] };
  }, 11);
  group.add(instanced(new THREE.BoxGeometry(0.05, 0.5, 0.05), lamb('#3f8a3a'), flowers.map((f) => ({ ...f, y: f.y + 0.25 * f.s, color: undefined }))));
  group.add(instanced(new THREE.BoxGeometry(0.2, 0.14, 0.2), new THREE.MeshLambertMaterial({ color: '#ffffff' }), flowers.map((f) => ({ ...f, y: f.y + 0.55 * f.s }))));

  // Bushes: squashed green blobs (some with berries).
  const bushes = scatter(100, 4.2, (x, z, h) => (open(x, z, h, 5) && h < 12 && hash(x * 0.9, z * 0.9) > 0.4 ? { x, y: h + 0.3, z, sx: 0.9 + hash(x, z) * 0.8, sy: 0.55 + hash(z, x) * 0.4, sz: 0.9 + hash(z + 1, x) * 0.8, ry: hash(x, z) * 6, color: hash(x, z + 4) < 0.5 ? '#3f8a3a' : '#4f9a42' } : null), 17);
  group.add(instanced(new THREE.IcosahedronGeometry(0.9, 0), swayMaterial(uTime, 0.04, true, 0.2), bushes));
  const berries = bushes.filter((b) => hash(b.z, b.x) > 0.7);
  group.add(instanced(new THREE.BoxGeometry(0.14, 0.14, 0.14), lamb('#d7263d'), berries.flatMap((b) => [{ ...b, x: b.x + 0.5, y: b.y + 0.45, z: b.z + 0.3 }, { ...b, x: b.x - 0.3, y: b.y + 0.5, z: b.z - 0.4 }, { ...b, x: b.x + 0.1, y: b.y + 0.7, z: b.z + 0.5 }])));

  // Rocks and boulders: grey dodecahedra, mossy on top; more of them beside the rivers and up the slopes.
  const rocks = scatter(104, 3.6, (x, z, h) => {
    const nearRiver = riverDistance(x, z) < 9 && riverDistance(x, z) > 4.2;
    const chance = (nearRiver ? 0.62 : 0.8) - 0.2 * smoothstep(8, 20, h);
    if (h < 0.5 || Math.hypot(x, z) < 31 || hash(x * 1.7, z * 1.3) < chance) return null;
    const s = 0.5 + hash(x, z) * (nearRiver ? 1.0 : 1.7);
    return { x, y: h + s * 0.3, z, sx: s * 1.2, sy: s * 0.8, sz: s, ry: hash(z, x) * 6.28, rz: (hash(x, z) - 0.5) * 0.4, color: hash(z, x + 3) < 0.5 ? '#7c7f88' : '#8c8e96' };
  }, 23);
  group.add(instanced(new THREE.DodecahedronGeometry(1, 0), lamb('#ffffff'), rocks, 2));
  group.add(instanced(new THREE.IcosahedronGeometry(1, 0), lamb('#5f9a45'), rocks.filter((r) => hash(r.x, r.z) > 0.5).map((r) => ({ ...r, y: r.y + r.sy * 0.55, sx: r.sx * 0.7, sy: r.sy * 0.35, sz: r.sz * 0.7, color: undefined }))));

  // Mushrooms in little rings under the trees.
  const shrooms = scatter(100, 5, (x, z, h) => (open(x, z, h, 5) && h < 10 && hash(x * 2.1, z * 2.3) > 0.8 ? { x, y: h, z, s: 0.6 + hash(x, z) * 0.7 } : null), 29);
  const ring = shrooms.flatMap((m) => [0, 1, 2, 3].map((k) => ({ ...m, x: m.x + Math.cos(k * 1.7) * 0.7 * m.s, z: m.z + Math.sin(k * 1.7) * 0.7 * m.s, s: m.s * (0.7 + 0.2 * k % 0.6) })));
  group.add(instanced(new THREE.CylinderGeometry(0.06, 0.08, 0.35, 5), lamb('#efe7d2'), ring.map((m) => ({ ...m, y: m.y + 0.17 * m.s }))));
  group.add(instanced(new THREE.ConeGeometry(0.3, 0.22, 6), lamb('#d6403a'), ring.map((m) => ({ ...m, y: m.y + 0.42 * m.s }))));
  group.add(instanced(new THREE.BoxGeometry(0.07, 0.03, 0.07), lamb('#ffffff'), ring.map((m) => ({ ...m, y: m.y + 0.52 * m.s, x: m.x + 0.06 }))));

  // Fallen logs and stumps.
  const logs = scatter(100, 9, (x, z, h) => (open(x, z, h, 5) && h < 12 && hash(x * 0.31, z * 0.77) > 0.55 ? { x, y: h + 0.25, z, s: 0.8 + hash(x, z) * 0.6, ry: hash(z, x) * 6.28 } : null), 31);
  group.add(instanced(new THREE.CylinderGeometry(0.28, 0.3, 3, 6), lamb('#6b4a2b'), logs.map((l) => ({ ...l, rz: Math.PI / 2, sx: l.s, sz: l.s }))));
  group.add(instanced(new THREE.CylinderGeometry(0.3, 0.34, 0.6, 6), lamb('#7a5632'), logs.map((l) => ({ ...l, x: l.x + Math.sin(l.ry) * 3, z: l.z + Math.cos(l.ry) * 3, y: l.y + 0.05 }))));

  // Reeds along the riverbanks.
  const reeds = [];
  for (const pts of [river1, river2]) {
    pts.forEach((p, i) => {
      if (i % 2) return;
      for (const side of [-1, 1]) {
        const x = p.x + side * (4.2 + hash(i, side) * 1.2);
        const z = p.z + (hash(side, i) - 0.5) * 2;
        const h = heightAt(x, z);
        if (h > 0.2 && h < 6 && Math.hypot(x, z) > 24) reeds.push({ x, y: h + 0.9, z, sy: 0.8 + hash(i, 4) * 0.6, color: '#8fae4a' });
      }
    });
  }
  group.add(instanced(new THREE.BoxGeometry(0.07, 1.8, 0.07), swayMaterial(uTime, 0.2, true, 0.9), reeds));
  // The heads sway with the stalk tops (stalk top: local y 0.9 + baseY 0.9 = lift 1.8; head centre: 0 + 1.8), so they stay on.
  group.add(instanced(new THREE.BoxGeometry(0.16, 0.34, 0.16), swayMaterial(uTime, 0.2, true, 1.8), reeds.map((r) => ({ ...r, y: r.y + 0.9 * r.sy, color: '#6a4a2a' }))));
  return group;
}

// ---------- structures ----------
export function buildStructures(lamb = lambertPalette()) {
  const g = new THREE.Group();
  const stone = lamb('#b9b3a4');
  const stoneDark = lamb('#8f897d');
  const wood = lamb('#7a5632');
  const roof = lamb('#8c3b2f');
  const plaster = lamb('#e6dcc4');
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  const runeMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff' });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a' });
  const box = boxMaker(g);

  // The stone path from the cathedral steps toward the bridge, with lantern posts.
  const pathZ0 = 21;
  const pathZ1 = 41;
  for (let z = pathZ0; z <= pathZ1; z += 1.4) {
    const x = Math.sin(z * 0.25) * 0.9;
    const h = heightAt(x, z);
    box(2.6 + hash(z, 1) * 0.5, 0.18, 1.5, x, h + 0.02, z, hash(z, 2) < 0.5 ? stone : stoneDark, (hash(z, 3) - 0.5) * 0.2);
  }
  const glows = []; // soft light halos on the lanterns and braziers (sprites, added after the static merge)
  const flags = []; // banners that wave (kept out of the merge)
  for (let z = 24; z <= 38; z += 4.6) {
    for (const side of [-1, 1]) {
      const x = Math.sin(z * 0.25) * 0.9 + side * 2.5;
      const h = heightAt(x, z);
      box(0.18, 2.6, 0.18, x, h, z, wood);
      box(0.5, 0.5, 0.5, x, h + 2.6, z, glowMat);
      glows.push({ x, y: h + 2.85, z, size: 2.6, color: '255,205,120' });
      box(0.7, 0.12, 0.7, x, h + 3.1, z, stoneDark);
    }
  }

  // The stone bridge where the path crosses the river.
  const bz = 40 + 14 * Math.sin(0) + 6 * Math.sin(0); // river1 crosses x = 0 here
  const bridge = new THREE.Group();
  box(5, 0.6, 12, 0, 0.35, 0, stone, 0, bridge);
  for (const s of [-1, 1]) {
    box(0.5, 1.1, 12, s * 2.4, 0.95, 0, stoneDark, 0, bridge);
    for (const zz of [-5.5, -2.7, 0, 2.7, 5.5]) box(0.7, 1.5, 0.7, s * 2.4, 0.95, zz, stone, 0, bridge);
  }
  for (const s of [-1, 1]) box(4, 1.6, 0.8, 0, 0.1, s * 5.4, stoneDark, 0, bridge); // approach ramps
  bridge.position.set(0, 1.0, bz);
  g.add(bridge);

  // Standing stones around a glowing heart, west of the cathedral.
  const ringCx = -26;
  const ringCz = 8;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const x = ringCx + Math.cos(a) * 6;
    const z = ringCz + Math.sin(a) * 6;
    const h = heightAt(x, z);
    const stone1 = box(1.2, 4 + hash(i, 5) * 1.6, 1, x, h, z, stoneDark, -a);
    stone1.rotation.z = (hash(i, 6) - 0.5) * 0.12;
    box(0.5, 0.25, 0.12, x, h + 2.2, z, runeMat, -a); // a rune
  }
  g.userData.runeMat = runeMat; // pulsed in Splash.update (the merged rune mesh keeps this very material)
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: '#9ff0ff' }));
  heart.position.set(ringCx, heightAt(ringCx, ringCz) + 2.2, ringCz);
  g.add(heart);
  g.userData.heart = heart;
  box(2.4, 0.5, 2.4, ringCx, heightAt(ringCx, ringCz), ringCz, stoneDark);

  // A little village across the river: cottages with pitched roofs, chimneys and lit windows.
  const cottage = (x, z, ry, w = 5, d = 4) => {
    const h = heightAt(x, z);
    const c = new THREE.Group();
    box(w, 2.8, d, 0, 0, 0, plaster, 0, c);
    box(w + 0.2, 0.3, d + 0.2, 0, 0, 0, stoneDark, 0, c);
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62 + 0.6, 0.35, d + 0.8), roof);
      slab.position.set((s * w) / 4.2, 3.3, 0);
      slab.rotation.z = -s * 0.62;
      c.add(slab);
    }
    box(0.7, 2, 0.7, w * 0.28, 3.2, d * 0.2, stoneDark, 0, c);
    box(1, 1.8, 0.2, 0, 0, d / 2 + 0.01, wood, 0, c);
    for (const s of [-1, 1]) box(0.8, 0.8, 0.2, s * w * 0.3, 1.4, d / 2 + 0.01, glowMat, 0, c);
    box(w * 0.9, 0.15, 0.15, 0, 2.2, d / 2 + 0.05, wood, 0, c);
    c.position.set(x, h, z);
    c.rotation.y = ry;
    g.add(c);
  };
  for (const [x, z, ry] of [[31, -12, -0.5], [39, -17, -0.9], [30, -25, 0.2], [41, -7, -1.2], [37, -29, -0.4], [44, -24, -1.4]]) cottage(x, z, ry);
  // Fences along the village green.
  for (let i = 0; i < 14; i++) {
    const x = 26 + i * 2;
    const z = -36;
    const h = heightAt(x, z);
    box(0.15, 1.2, 0.15, x, h, z, wood);
    if (i < 13) box(2, 0.12, 0.1, x + 1, h + 0.9, z, wood);
  }

  // A ruined watchtower on the western hillside.
  const tx = -46;
  const tz = -42;
  const th = heightAt(tx, tz);
  const tower = new THREE.Group();
  box(6, 0.8, 6, 0, 0, 0, stoneDark, 0, tower);
  for (let y = 0; y < 5; y++) {
    for (let k = 0; k < 8; k++) {
      if (y > 2 && hash(k, y + 1) < 0.35) continue; // crumbled
      const a = (k / 8) * Math.PI * 2;
      box(2.2, 1.4, 1.1, Math.cos(a) * 2.3, 0.8 + y * 1.4, Math.sin(a) * 2.3, y % 2 ? stone : stoneDark, -a, tower);
    }
  }
  tower.position.set(tx, th, tz);
  g.add(tower);

  // A tall banner mast and lit braziers flanking the cathedral steps.
  for (const s of [-1, 1]) {
    const x = s * 11;
    const z = 21;
    const h = heightAt(x, z);
    box(0.35, 6, 0.35, x, h, z, wood);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshLambertMaterial({ color: s < 0 ? '#2c4f9a' : '#9a2c3b', side: THREE.DoubleSide }));
    flag.position.set(x + s * 0.9, h + 4.5, z);
    flag.rotation.y = Math.PI / 2;
    g.add(flag);
    flag.userData.phase = s + 1;
    flags.push(flag);
    box(1.2, 0.9, 1.2, x + s * 2.4, h, z + 1, stoneDark);
    box(0.7, 0.5, 0.7, x + s * 2.4, h + 0.9, z + 1, fireMat);
    glows.push({ x: x + s * 2.4, y: h + 1.5, z: z + 1, size: 4, color: '255,140,50' });
  }
  // ~250 little static meshes -> one merged mesh per material (about 10 draw calls). The heart bobs, so it stays separate.
  const out = mergeStatic(g, (o) => o === heart || flags.includes(o));
  out.userData.flags = flags;
  out.userData.glows = glows.map((gl, i) => {
    const tex = glowTexture(`rgba(${gl.color},0.85)`, `rgba(${gl.color},0)`);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(gl.x, gl.y, gl.z);
    sp.scale.setScalar(gl.size);
    sp.userData = { size: gl.size, phase: i * 1.9 };
    out.add(sp);
    return sp;
  });
  return out;
}

// ---------- ground detail: scree, outcrops, stepping stones, a field wall, a ruined chapel ----------
export function buildTerrainDetail(lamb = lambertPalette()) {
  const g = new THREE.Group();
  const stone = lamb('#b9b3a4');
  const stoneDark = lamb('#8f897d');
  const box = boxMaker(g);

  // Scree: small dark stones strewn down the steeper slopes (and the cliff shelf), denser where it is steep.
  const scree = scatter(104, 1.7, (x, z, h) => {
    const slope = slopeAt(x, z);
    if (h < 6 || Math.hypot(x, z) < FAR || slope < 0.45 || h > 30 || dirtOrRiver(x, z, 4)) return null;
    if (hash(x * 1.9, z * 1.7) > 0.08 + slope * 0.3) return null;
    const s = 0.25 + hash(x, z) * 0.5;
    return { x, y: h + s * 0.2, z, sx: s * 1.4, sy: s * 0.6, sz: s, ry: hash(z, x) * 6.28, color: hash(x + 1, z) < 0.5 ? '#6f6a62' : '#88837a' };
  }, 41);
  g.add(instanced(new THREE.OctahedronGeometry(1, 0), lamb('#ffffff'), scree, 2)); // 8 triangles each: cheap by the thousand

  // Outcrops: big angular slabs of rock jutting from cliff faces, banded like the strata in the terrain colours.
  const outcrops = scatter(104, 4.5, (x, z, h) => {
    const slope = slopeAt(x, z);
    if (h < 7 || Math.hypot(x, z) < FAR || slope < 0.9 || dirtOrRiver(x, z, 5) || hash(x * 0.7, z * 0.9) < 0.55) return null;
    const s = 1.4 + hash(x, z) * 2.6;
    return { x, y: h - s * 0.3, z, sx: s * 1.4, sy: s * 0.9, sz: s * 0.8, ry: hash(z, x) * 6.28, rz: (hash(x, z + 2) - 0.5) * 0.5, rx: (hash(z + 2, x) - 0.5) * 0.3, color: hash(x, z + 7) < 0.5 ? '#8a847c' : '#6e6860' };
  }, 43);
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), lamb('#ffffff'), outcrops));
  g.add(instanced(new THREE.BoxGeometry(1, 0.18, 1), lamb('#9a938a'), outcrops.map((o) => ({ ...o, y: o.y + o.sy * 0.55, sy: 1, color: undefined }))));
  // Boulders tumbled around the foot of the waterfall shelf.
  const foot = [];
  for (let i = 0; i < 14; i++) {
    const a = -0.9 + hash(i, 1) * 1.8;
    const x = SHELF.x + Math.cos(a) * (SHELF.r + 1.5 + hash(i, 2) * 3);
    const z = SHELF.z + Math.sin(a) * (SHELF.r + 1.5 + hash(i, 2) * 3);
    if (brookDistance(x, z) < 1.6) continue;
    const s = 0.6 + hash(i, 3) * 1.4;
    foot.push({ x, y: heightAt(x, z) + s * 0.3, z, sx: s * 1.2, sy: s * 0.8, sz: s, ry: hash(i, 4) * 6.28, color: '#7c7f88' });
  }
  g.add(instanced(new THREE.DodecahedronGeometry(1, 0), lamb('#ffffff'), foot));

  // Stepping stones across river2 south-west of the terrace.
  const sz0 = 24;
  const sx0 = -52 + 16 * Math.sin(sz0 * 0.045);
  for (let i = -3; i <= 3; i++) box(1.1 + hash(i, 9) * 0.5, 0.5, 1.0 + hash(9, i) * 0.4, sx0 + i * 1.5, 0.35, sz0 + (hash(i, 2) - 0.5) * 0.8, i % 2 ? stone : stoneDark, hash(i, 3) * 0.6);

  // A tumbledown dry-stone field wall west of the path, with gaps where it has fallen.
  for (let i = 0; i < 22; i++) {
    const x = -13 - i * 1.5;
    const z = 31 + Math.sin(i * 0.5) * 0.6;
    if (hash(i, 5) < 0.15) continue;
    const h = heightAt(x, z);
    const rows = hash(i, 6) < 0.3 ? 1 : 2;
    for (let r = 0; r < rows; r++) box(1.5, 0.5, 0.7 - r * 0.1, x + (r % 2) * 0.3, h + r * 0.5, z, r % 2 ? stone : stoneDark, (hash(i, r) - 0.5) * 0.15);
  }

  // A ruined chapel on the rise south-east of the terrace: two broken walls, a pointed arch, a fallen column.
  const cx = 36;
  const cz = 30;
  const ch = heightAt(cx, cz);
  const chapel = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const hh = 1.6 + Math.abs(Math.sin(i * 1.3)) * 3.2;
    box(1.4, hh, 0.9, -4 + i * 1.4, 0, -3, i % 2 ? stone : stoneDark, 0, chapel);
  }
  for (let i = 0; i < 4; i++) box(0.9, 1.4 + i * 1.1, 1.4, -4.4, 0, -1.6 + i * 1.4, i % 2 ? stone : stoneDark, 0, chapel);
  for (const s of [-1, 1]) box(0.9, 4.2, 0.9, s * 1.4, 0, 2.2, stone, 0, chapel); // the arch: two piers and stepped voussoirs
  for (const [w, y, k] of [[3.7, 4.2, 0], [2.6, 4.7, 1], [1.5, 5.2, 0], [0.7, 5.7, 1]]) box(w, 0.5, 0.9, 0, y, 2.2, k ? stoneDark : stone, 0, chapel);
  const column = box(0.7, 3.6, 0.7, 2.2, 0.3, -0.5, stoneDark, 0, chapel);
  column.rotation.z = Math.PI / 2 - 0.08;
  column.position.y = 0.4;
  chapel.position.set(cx, ch, cz);
  chapel.rotation.y = -0.6;
  g.add(chapel);
  return mergeStatic(g); // the stepping stones, field wall and chapel boxes -> one mesh per material
}
