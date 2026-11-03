import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash, heightAt } from './splashLand.js';

// Shared building blocks for the title-screen flyover (Splash.js, splashDetail.js): instancing, the swaying-foliage material,
// a memoised Lambert palette, jittered scatter, a box helper, radial glow textures, static-mesh merging and scene disposal.

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** One InstancedMesh from a list of {x,y,z, s | sx,sy,sz, rx,ry,rz, color}. Per-instance colours only if any item has one. */
export function instanced(geo, mat, items, split = 1) {
  // split > 1: several InstancedMeshes over a split x split grid of the land (sharing geometry and material), so the camera can
  // frustum-cull the quarters it is not looking at. Only worth it for the big scatters; it costs a few extra draw calls.
  if (split > 1) {
    const cell = (v) => Math.min(split - 1, Math.max(0, Math.floor(((v + 110) / 220) * split)));
    const buckets = new Map();
    for (const it of items) {
      const key = cell(it.x) * split + cell(it.z);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    const group = new THREE.Group();
    for (const list of buckets.values()) group.add(instanced(geo, mat, list));
    return group;
  }
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    _e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
    mesh.setMatrixAt(i, _m);
    if (it.color) mesh.setColorAt(i, _c.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * Lambert material whose vertices lean with a gust (per-instance phase from the instance position), driven by the shared
 * `uTime` uniform. `strength` is the lean per unit of height; `baseY` lifts the pivot so a geometry centred on its origin
 * bends from its foot (lift = local y + baseY, clamped at 0).
 * strength/baseY are uniforms, not baked into the GLSL: three caches programs by onBeforeCompile.toString(), so baked
 * values made every sway material reuse the FIRST compiled one's numbers (all foliage swayed like pine cones).
 */
export function swayMaterial(uTime, strength = 0.09, flat = true, baseY = 2.1) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: flat });
  const uSway = { value: new THREE.Vector2(strength, baseY) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uSway = uSway;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uSway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float gust = sin(uTime * 1.1 + phase) + 0.5 * sin(uTime * 2.3 + phase * 1.7);
        float lift = max(position.y + uSway.y, 0.0);
        transformed.x += gust * uSway.x * lift;
        transformed.z += gust * uSway.x * 0.55 * lift;`,
      );
  };
  m.customProgramCacheKey = () => 'splash-sway'; // one program for every sway material
  return m;
}

/** A memoised flat-shaded Lambert palette: lamb('#8f897d') returns the same material every time it is asked for that colour. */
export function lambertPalette() {
  const cache = new Map();
  return (color, extra = null) => {
    const key = extra ? `${color}|${JSON.stringify(extra)}` : color;
    if (!cache.has(key)) cache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
    return cache.get(key);
  };
}

/** Jittered grid scatter over [-range, range]^2: calls accept(x, z, h, i) -> item|null for each cell; returns the items. */
export function scatter(range, step, accept, salt = 0) {
  const out = [];
  let i = 0;
  for (let x = -range; x <= range; x += step) {
    for (let z = -range; z <= range; z += step) {
      const px = x + (hash(x + salt, z) - 0.5) * step * 0.9;
      const pz = z + (hash(z, x + salt) - 0.5) * step * 0.9;
      const item = accept(px, pz, heightAt(px, pz), i++);
      if (item) out.push(item);
    }
  }
  return out;
}

/** box(w, h, d, x, y, z, mat, ry = 0, parent = root): a Mesh whose BOTTOM sits at y, added to parent. */
export const boxMaker = (root) => (w, h, d, x, y, z, mat, ry = 0, parent = root) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
};

/** A soft radial gradient sprite (mist, spray, motes). */
export function glowTexture(inner, outer, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Bake every plain (non-instanced) Mesh under `group` into one merged Mesh per material, so a scene of hundreds of little
 * static boxes costs a handful of draw calls. Meshes for which keep(mesh) is true stay as they are (e.g. animated ones).
 * Only use on meshes that never move afterwards; geometries must share attributes (Box/Plane/Cylinder do).
 */
export function mergeStatic(group, keep = () => false) {
  group.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const merged = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || keep(o)) return;
    const geo = o.geometry.index ? o.geometry.clone() : null;
    if (!geo) return; // non-indexed geometry cannot merge with indexed boxes; leave it alone
    geo.applyMatrix4(_m.multiplyMatrices(toLocal, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
    merged.push(o);
  });
  for (const o of merged) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  // Drop the now-empty sub-groups (cottages, tower, bridge...).
  const empty = [];
  group.traverse((o) => o !== group && !o.isMesh && o.children.length === 0 && empty.push(o));
  for (const o of empty) o.removeFromParent();
  for (const [mat, geos] of buckets) {
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

/** Free every geometry, material, texture and instance buffer under `root` (safe to call on shared resources twice). */
export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.isInstancedMesh) o.dispose(); // frees the instanceMatrix/instanceColor buffers, which geometry.dispose() does not
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      m.map?.dispose?.();
      m.dispose();
    }
  });
}
