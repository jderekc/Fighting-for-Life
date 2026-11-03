import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash } from './splashLand.js';

// The title-screen cathedral: a Gothic church in the blocky style (twin west towers with spires, a crossing tower, a nave with
// clerestory and aisles, flying buttresses, transepts, an apse, a rose window, lancet windows with stained glass, a stepped
// recessed portal, pinnacles, crockets, gargoyles, corbel tables, string courses). Everything is a box, cone or disc; all
// pieces are merged by material into FOUR meshes (textured stone, plain stone, slate, unlit glass), so the whole building is
// four draw calls however much detail is added. Masonry courses come from a tiny pixel texture whose UVs are fitted per box so
// the courses line up across the building; each box also carries a vertex-colour tint for larger-scale stone variation.
// Coordinates: the group's origin is the terrace (y = 0 = PLATEAU), the west front faces +z at z = 13, the steps run to +z.

const TILE = { w: 4, h: 2 }; // one texture tile covers 4 x 2 world units

const STONE = '#efe9db'; // multiplied by the course texture, so keep these light
const STONE_D = '#c9c2b4';
const STONE_W = '#eae3d2'; // dressed stone: tracery, quoins, string courses
const INK = '#2b2730'; // dark reveals and openings
const SLATE = '#44546b';
const SLATE_D = '#303b4c';
const MOSS = '#6b8a46';
const WOOD = '#4a3320';
const IRON = '#26262b';
const GOLD = '#e6c25a';
const GARG = '#716b62';
// Stained glass: an unlit amber base pane (the glow) with leaded diamond 'jewels' in the palette's colours.
const GLASS = {
  amber: { base: '#ffd27a', gems: ['#ffb44a', '#ffe9a0', '#ff9a3a'] },
  jewel: { base: '#ffdc8a', gems: ['#ff5a4a', '#4a7cf0', '#3fbf6a', '#b57aff'] },
  cool: { base: '#ffe0a0', gems: ['#4a7cf0', '#7ad0ff', '#b57aff'] },
  warm: { base: '#ffcf70', gems: ['#ff5a4a', '#ff9a3a', '#ffe9a0'] },
};

/** A pixel texture of stone courses (running bond). `vertical` lays the courses along v instead of u (for roof slopes). */
function courseTexture({ px = 12, brickW = 1, brickH = 0.5, base = [205, 199, 185], mortar = [150, 144, 132], vertical = false, seed = 1 }) {
  const W = TILE.w * px;
  const H = TILE.h * px;
  const c = document.createElement('canvas');
  c.width = vertical ? H : W;
  c.height = vertical ? W : H;
  const g = c.getContext('2d');
  const rect = (x, y, w, h) => (vertical ? g.fillRect(y, x, h, w) : g.fillRect(x, y, w, h));
  g.fillStyle = `rgb(${mortar.join(',')})`;
  g.fillRect(0, 0, c.width, c.height);
  const rows = Math.round(TILE.h / brickH);
  const cols = Math.round(TILE.w / brickW);
  for (let j = 0; j < rows; j++) {
    const off = ((j % 2) * brickW) / 2;
    for (let i = -1; i <= cols; i++) {
      const k = 0.86 + hash(((i + cols) % cols) + seed, j + seed * 3) * 0.24;
      g.fillStyle = `rgb(${base.map((v) => Math.round(Math.min(255, v * k))).join(',')})`;
      rect((i * brickW + off) * px, j * brickH * px + 1, brickW * px - 1, brickH * px - 1);
      for (let n = 0; n < 3; n++) {
        // a few darker pixels inside each stone
        g.fillStyle = `rgb(${base.map((v) => Math.round(v * k * 0.9)).join(',')})`;
        rect((i * brickW + off) * px + 1 + Math.floor(hash(i + n, j - n) * (brickW * px - 3)), j * brickH * px + 2 + Math.floor(hash(j + n, i + seed) * (brickH * px - 3)), 1, 1);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCathedral() {
  const parts = { stone: [], plain: [], slate: [], glass: [] };
  const tmp = new THREE.Color();
  /** Stone tint: a hex colour with a little per-piece lightness noise. */
  const tint = (hex, a, b, amount = 0.08) => tmp.set(hex).offsetHSL(0, 0, (hash(a * 3.1 + 7, b * 2.7 + 3) - 0.5) * amount).getHex();

  function paint(geo, topHex, bottomHex = topHex) {
    const pos = geo.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    const span = Math.max(1e-6, max.y - min.y);
    const a = new THREE.Color(bottomHex);
    const b = new THREE.Color(topHex);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(a).lerp(b, (pos.getY(i) - min.y) / span);
      arr.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  /** Scale a box's UVs to world units so the course texture keeps its size and courses line up at `bottomY`. */
  function fitBoxUv(geo, w, h, d, bottomY) {
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = dims[f];
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, (uv.getX(i) * fw) / TILE.w + hash(f, bottomY) * 0.5, (uv.getY(i) * fh) / TILE.h + bottomY / TILE.h);
      }
    }
  }
  /** Rotate/translate a geometry into a frame {x,y,z,ry}: local +z is the outward normal of the wall the frame sits on. */
  const place = (geo, fr, lx, ly, lz, { rx = 0, ry = 0, rz = 0 } = {}) => {
    if (rx) geo.rotateX(rx);
    if (rz) geo.rotateZ(rz);
    if (ry) geo.rotateY(ry);
    geo.translate(lx, ly, lz);
    if (fr) {
      if (fr.ry) geo.rotateY(fr.ry);
      geo.translate(fr.x, fr.y, fr.z);
    }
    return geo;
  };
  /** A box whose BOTTOM is at ly (centre at lx, lz). */
  const box = (kind, w, h, d, lx, ly, lz, color, fr = null, rot = {}, bottomColor = color) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (kind === 'stone' || kind === 'slate') fitBoxUv(geo, w, h, d, (fr?.y ?? 0) + ly);
    paint(geo, color, bottomColor);
    parts[kind].push(place(geo, fr, lx, ly + h / 2, lz, rot));
  };
  const cone = (kind, r, h, segs, lx, ly, lz, color, fr = null, rot = {}, thetaStart = 0) => {
    const geo = new THREE.ConeGeometry(r, h, segs, 1, false, thetaStart);
    paint(geo, color);
    parts[kind].push(place(geo, fr, lx, ly + h / 2, lz, rot));
  };
  const stoneBox = (w, h, d, x, y, z, fr = null, rot = {}, base = STONE) => box('stone', w, h, d, x, y, z, tint(base, x + (fr?.x ?? 0), z + (fr?.z ?? 0) + y), fr, rot);

  // ---------- decorative vocabulary ----------
  /** A pointed (stepped) lancet window on a wall frame: dark reveal, stained-glass lights, mullion, transom, jambs, sill, hood. */
  function lancet(fr, lx, ly, w, h, { lights = 2, glow = 'amber', louvred = false, depth = 0.34 } = {}) {
    const rows = [[w, h], [w * 0.7, 0.42], [w * 0.42, 0.36], [w * 0.17, 0.3]];
    const pal = GLASS[glow];
    const pick = Math.floor(hash(lx + fr.x, ly + fr.z) * pal.gems.length);
    let y = ly;
    rows.forEach(([rw, rh], r) => {
      box('plain', rw + 0.44, rh + (r === rows.length - 1 ? 0.26 : 0.02), depth, lx, y, 0, INK, fr);
      if (louvred) {
        if (r === 0) for (let b = 0; b < 4; b++) box('plain', rw - 0.1, 0.16, 0.14, lx, y + 0.3 + b * (rh - 0.6) / 3, depth / 2 + 0.02, STONE_D, fr);
      } else {
        const n = r === 0 ? lights : 1;
        for (let k = 0; k < n; k++) {
          const pw = rw / n;
          const px = lx - rw / 2 + pw * (k + 0.5);
          box('glass', pw - 0.06, rh + 0.02, 0.1, px, y, depth / 2 + 0.02, pal.base, fr);
          if (r === 0) {
            const n = Math.max(1, Math.round(rh / 1.3));
            const gem = Math.min(0.46, pw * 0.5);
            for (let j = 0; j < n; j++) box('glass', gem, gem, 0.08, px, y + 0.45 + (j * (rh - 1.1)) / Math.max(1, n - 1), depth / 2 + 0.05, pal.gems[(j + k + pick) % pal.gems.length], fr, { rz: Math.PI / 4 });
          }
        }
      }
      y += rh;
    });
    if (!louvred) {
      for (let k = 1; k < lights; k++) box('plain', 0.12, h + 0.1, 0.2, lx - w / 2 + (w / lights) * k, ly, depth / 2 + 0.08, STONE_W, fr);
      box('plain', w + 0.1, 0.12, 0.2, lx, ly + h * 0.6, depth / 2 + 0.08, STONE_W, fr);
      if (lights > 1) box('plain', 0.5, 0.5, 0.18, lx, ly + h * 0.84, depth / 2 + 0.09, STONE_W, fr, { rz: Math.PI / 4 }); // a quatrefoil-ish eye
    }
    for (const s of [-1, 1]) box('plain', 0.3, h + 0.5, depth + 0.12, lx + s * (w / 2 + 0.37), ly - 0.1, 0.02, STONE_W, fr);
    box('plain', w + 1.3, 0.3, depth + 0.4, lx, ly - 0.4, 0.06, STONE_W, fr); // sill
    box('plain', w * 0.7 + 0.9, 0.22, depth + 0.1, lx, y + 0.26, 0.04, STONE_W, fr); // hood mould over the point
  }

  /** The great rose: stone ring, radial spokes, inner ring, coloured wedges (vertex colours on a disc). */
  function roseWindow(fr, lx, ly, R) {
    const back = new THREE.CircleGeometry(R + 0.4, 16);
    paint(back, INK);
    parts.plain.push(place(back, fr, lx, ly, 0.08));
    const disc = (r, pal, z, centre) => {
      const d = new THREE.CircleGeometry(r, 16);
      const cols = new Float32Array(d.attributes.position.count * 3);
      for (let i = 0; i < d.attributes.position.count; i++) {
        tmp.set(i === 0 ? centre : pal[i % pal.length]);
        cols.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      d.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      parts.glass.push(place(d, fr, lx, ly, z));
    };
    disc(R, ['#ff5a4a', '#5a8cff', '#ffd27a', '#5ad08a', '#b57aff', '#ff9a3a'], 0.12, '#ffe9a0');
    disc(R * 0.42, ['#ffd27a', '#ff5a4a', '#ffe9a0', '#5a8cff'], 0.16, '#ffffff');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      box('plain', 0.14, R - 0.1, 0.16, lx + Math.cos(a) * (R / 2), ly + Math.sin(a) * (R / 2) - (R - 0.1) / 2, 0.2, STONE_W, fr, { rz: a - Math.PI / 2 });
    }
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      const seg = (2 * Math.PI * (R + 0.15)) / 16 + 0.12;
      box('plain', seg, 0.5, 0.42, lx + Math.cos(a) * (R + 0.15), ly + Math.sin(a) * (R + 0.15) - 0.25, 0.1, i % 2 ? STONE_W : STONE_D, fr, { rz: a + Math.PI / 2 });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box('plain', (2 * Math.PI * R * 0.42) / 8 + 0.06, 0.2, 0.2, lx + Math.cos(a) * R * 0.42, ly + Math.sin(a) * R * 0.42 - 0.1, 0.22, STONE_W, fr, { rz: a + Math.PI / 2 });
    }
    const hub = new THREE.CircleGeometry(0.3, 8);
    paint(hub, INK);
    parts.plain.push(place(hub, fr, lx, ly, 0.3));
  }

  /** The west portal: three stepped orders of a pointed arch, colonnettes, a dark door with iron bands, glowing tympanum, gable hood. */
  function portal(fr, lx, w, h) {
    const steps = [1, 0.78, 0.55, 0.3];
    for (let k = 0; k < 3; k++) {
      const e = (2 - k) * 0.62; // how much wider than the innermost order
      const lz = 0.5 * (2 - k); // the orders step forward out of the wall (a projecting porch), the innermost at the wall
      const Hk = h + (2 - k) * 0.85;
      for (const s of [-1, 1]) box('plain', 0.62, Hk + 0.2, 0.66, lx + s * (w / 2 + e + 0.31), 0, lz, k % 2 ? STONE : STONE_W, fr);
      steps.forEach((f, r) => {
        const hw = (w / 2) * f + e;
        for (const s of [-1, 1]) box('plain', 0.62, 0.46, 0.66, lx + s * (hw + 0.31), Hk + 0.46 * r, lz, (r + k) % 2 ? STONE_W : STONE_D, fr);
      });
      box('plain', (w / 2) * 0.3 * 2 + 2 * e + 0.62, 0.46, 0.66, lx, Hk + 0.46 * 4, lz, STONE_W, fr); // keystone row
      for (const s of [-1, 1]) {
        const cx = lx + s * (w / 2 + e + 0.08);
        const col = new THREE.CylinderGeometry(0.17, 0.17, Hk, 6);
        paint(col, STONE_W);
        parts.plain.push(place(col, fr, cx, Hk / 2, lz + 0.34));
        box('plain', 0.44, 0.3, 0.44, cx, Hk - 0.3, lz + 0.34, STONE_D, fr);
        box('plain', 0.44, 0.24, 0.44, cx, 0, lz + 0.34, STONE_D, fr);
      }
    }
    // The opening: dark, with the stepped point; glowing tympanum; wooden doors.
    const lz = 0.02;
    box('plain', w + 0.2, h, 0.3, lx, 0, lz, INK, fr);
    steps.slice(1).forEach((f, r) => box('plain', w * f + 0.2, 0.46, 0.3, lx, h + 0.46 * r, lz, INK, fr));
    box('glass', w * 0.78 - 0.1, 0.42, 0.1, lx, h + 0.02, lz + 0.18, '#ffd27a', fr);
    box('glass', w * 0.55 - 0.1, 0.42, 0.1, lx, h + 0.48, lz + 0.18, '#ffb85a', fr);
    box('glass', w * 0.3 - 0.1, 0.42, 0.1, lx, h + 0.94, lz + 0.18, '#ffe9a0', fr);
    for (const s of [-1, 1]) box('plain', w / 2 - 0.12, h - 0.1, 0.2, lx + s * (w / 4), 0, lz + 0.14, WOOD, fr);
    box('plain', 0.1, h - 0.1, 0.24, lx, 0, lz + 0.15, IRON, fr);
    for (const yy of [0.9, 2.6, 4.3]) box('plain', w - 0.3, 0.16, 0.26, lx, yy, lz + 0.16, IRON, fr);
    // Gable hood with a finial and crockets.
    const span = w / 2 + 2 * 0.62 + 0.62 + 0.5;
    const top = h + 2 * 0.85 + 0.46 * 5;
    const rise = 2.0;
    const len = Math.hypot(span, rise) + 0.3;
    const ang = Math.atan2(rise, span);
    for (const s of [-1, 1]) {
      box('slate', len, 0.42, 1.1, lx + (s * span) / 2, top + rise / 2 - 0.21, 1.1, SLATE, fr, { rz: -s * ang });
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        box('plain', 0.28, 0.34, 0.3, lx + s * span * (1 - t), top + rise * t + 0.2, 1.2, STONE_W, fr);
      }
    }
    box('plain', 0.26, 1.3, 0.26, lx, top + rise - 0.1, 1.1, STONE_W, fr);
    box('plain', 0.3, 0.3, 0.3, lx, top + rise + 1.2, 1.1, GOLD, fr, { rz: Math.PI / 4 });
    // Lanterns either side of the door.
    for (const s of [-1, 1]) {
      box('plain', 0.12, 0.12, 0.7, lx + s * (w / 2 + 2.5), 4.3, 0.35, IRON, fr);
      box('glass', 0.42, 0.5, 0.42, lx + s * (w / 2 + 2.5), 3.85, 0.66, '#ffd27a', fr);
      box('plain', 0.52, 0.12, 0.52, lx + s * (w / 2 + 2.5), 4.35, 0.66, IRON, fr);
    }
  }

  /** A row of small corbel blocks under an eave or parapet, along the frame's x axis. */
  function corbels(fr, x0, x1, ly, lz = 0.1, step = 0.72) {
    for (let x = x0 + step / 2; x < x1; x += step) box('plain', 0.3, 0.34, 0.4, x, ly, lz + 0.1, STONE_D, fr);
    box('plain', x1 - x0, 0.16, 0.5, (x0 + x1) / 2, ly + 0.34, lz + 0.15, STONE_W, fr);
  }
  /** A gargoyle: a dark beast leaning out of the wall at (lx, ly) on the frame. */
  function gargoyle(fr, lx, ly) {
    box('plain', 0.42, 0.44, 1.3, lx, ly, 0.6, GARG, fr);
    box('plain', 0.52, 0.46, 0.5, lx, ly + 0.1, 1.45, GARG, fr);
    box('plain', 0.14, 0.22, 0.12, lx - 0.18, ly + 0.5, 1.5, GARG, fr);
    box('plain', 0.14, 0.22, 0.12, lx + 0.18, ly + 0.5, 1.5, GARG, fr);
    for (const s of [-1, 1]) box('plain', 0.4, 0.36, 0.12, lx + s * 0.4, ly + 0.3, 0.75, GARG, fr, { rz: s * 0.6 });
  }
  /** A pinnacle: a little shaft, a four-sided spirelet, crockets and a finial. */
  function pinnacle(x, y, z, size = 1) {
    box('plain', 0.9 * size, 1.9 * size, 0.9 * size, x, y, z, STONE_W);
    for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) box('plain', 0.34 * size, 0.5 * size, 0.34 * size, x + sx * 0.45 * size, y + 1.4 * size, z + sz * 0.45 * size, STONE_W);
    cone('plain', 0.62 * size, 2.3 * size, 4, x, y + 1.9 * size, z, STONE_W, null, { ry: Math.PI / 4 });
    box('plain', 0.2 * size, 0.6 * size, 0.2 * size, x, y + 4.0 * size, z, GOLD);
  }
  /** A tall octagonal spire with crockets up the edges and a gilt finial. */
  function spire(x, y, z, r, h, color = SLATE) {
    cone('plain', r, h, 8, x, y, z, color);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      for (let hh = 1.4; hh < h - 2.5; hh += 2.2) {
        const rr = r * (1 - hh / h) + 0.1;
        box('plain', 0.26, 0.3, 0.26, x + Math.sin(a) * rr, y + hh, z + Math.cos(a) * rr, '#7d8798');
      }
    }
    box('plain', 0.24, 1.6, 0.24, x, y + h - 0.2, z, GOLD);
    box('plain', 0.8, 0.2, 0.2, x, y + h + 0.8, z, GOLD);
    box('plain', 0.2, 0.2, 0.8, x, y + h + 0.8, z, GOLD);
  }
  /** A stepped (blocky) gable above a wall: rows shrinking from `w` to a point over `rise`, on a frame (x along the wall). */
  function steppedGable(fr, w, y0, rise, depth) {
    const n = Math.round(rise / 0.75);
    for (let k = 0; k < n; k++) {
      const ww = w - ((w - 0.9) * k) / (n - 1);
      stoneBox(ww, 0.78, depth, 0, y0 + k * 0.75, 0, fr);
      for (const s of [-1, 1]) box('plain', 0.5, 0.3, depth + 0.3, s * (ww / 2 + 0.1), y0 + k * 0.75 + 0.6, 0, STONE_W, fr); // coping
    }
    box('plain', 0.3, 1.4, 0.3, 0, y0 + rise - 0.2, 0, STONE_W, fr);
    box('plain', 0.3, 0.3, 0.3, 0, y0 + rise + 1.2, 0, GOLD, fr, { rz: Math.PI / 4 });
  }
  /** Flat roof slab with slate courses, from a ridge line down a slope: built along local x and rotated into place. */
  function roofSlab(x, yTop, z, halfSpan, rise, length, s, ry = 0) {
    // the slab runs from (x, yTop) down to (x + s*halfSpan, yTop - rise)
    const len = Math.hypot(halfSpan, rise) + 0.5;
    const ang = Math.atan2(rise, halfSpan);
    const geo = new THREE.BoxGeometry(len, 0.5, length);
    fitBoxUv(geo, len, 0.5, length, 0);
    paint(geo, SLATE);
    geo.rotateZ(-s * ang);
    geo.translate((s * halfSpan) / 2, yTop - rise / 2 + 0.1, 0);
    geo.rotateY(ry);
    geo.translate(x, 0, z);
    parts.slate.push(geo);
  }
  function ridge(x, y, z, length, ry = 0) {
    const geo = new THREE.BoxGeometry(0.6, 0.5, length);
    paint(geo, SLATE_D);
    parts.plain.push(place(geo, null, x, y, z, { ry }));
    for (let d = -length / 2 + 1; d < length / 2; d += 2.2) {
      const crest = new THREE.BoxGeometry(0.26, 0.42, 0.26);
      paint(crest, STONE_W);
      parts.plain.push(place(crest, null, x + Math.sin(ry) * d, y + 0.4, z + Math.cos(ry) * d));
    }
  }

  // ---------- the plan ----------
  const NAVE_W = 10; // x +-5
  const NAVE_H = 16;
  const NAVE_RISE = 7;
  const AISLE_X = 8.6;
  const AISLE_H = 7.6;
  const TR_Z = -3; // transept centre
  const TR_D = 8; // transept depth (z)
  const TR_X = 13; // transept half width
  const TR_H = 16;
  const TOWER = { x: 6.6, z: 10.2, w: 5.6, h: 26 };
  const APSE = { z: -13, r: 5.5, h: 12.5 };

  // Steps and plinth.
  for (let i = 0; i < 3; i++) stoneBox(22 - i * 2, 0.4, 8 - i * 1.4, 0, i * 0.4, 13 + (8 - i * 1.4) / 2, null, {}, STONE_D);
  const plinth = (w, d, x, z) => box('plain', w + 0.5, 1.6, d + 0.5, x, 0, z, STONE_D, null, {}, MOSS);
  plinth(NAVE_W, 26, 0, 0);
  plinth(TR_X * 2, TR_D, 0, TR_Z);
  plinth(AISLE_X * 2, 6.4, 0, 4.2);
  plinth(AISLE_X * 2, 6, 0, -10);
  for (const s of [-1, 1]) plinth(TOWER.w, TOWER.w, s * TOWER.x, TOWER.z);

  // Nave (with clerestory), transept, aisles.
  stoneBox(NAVE_W, NAVE_H, 26, 0, 0, 0);
  stoneBox(TR_X * 2, TR_H, TR_D, 0, 0, TR_Z);
  stoneBox(AISLE_X * 2, AISLE_H, 6.4, 0, 0, 4.2); // front aisles: z 1 .. 7.4
  stoneBox(AISLE_X * 2, AISLE_H, 6, 0, 0, -10); // choir aisles: z -13 .. -7
  // Roofs: nave gable, transept gable, aisle lean-tos, ridges.
  for (const s of [-1, 1]) {
    roofSlab(0, NAVE_H + NAVE_RISE, 0, NAVE_W / 2, NAVE_RISE, 26.6, s);
    roofSlab(0, TR_H + 5.5, TR_Z, TR_D / 2, 5.5, 26.6, s, Math.PI / 2);
    for (const [zc, len] of [[4.2, 6.4], [-10, 6]]) roofSlab(s * (NAVE_W / 2 - 0.2), AISLE_H + 3.4, zc, AISLE_X - NAVE_W / 2 + 0.6, 2.9, len + 0.4, s);
  }
  ridge(0, NAVE_H + NAVE_RISE, 0, 26.6);
  ridge(0, TR_H + 5.5, TR_Z, 26.6, Math.PI / 2);
  // Corbel tables under the eaves.
  for (const s of [-1, 1]) {
    corbels({ x: s * (NAVE_W / 2), y: 0, z: 0, ry: s * (Math.PI / 2) }, -13, 13, NAVE_H - 0.6);
    for (const [z0, z1] of [[1, 7.4], [-13, -7]]) corbels({ x: s * AISLE_X, y: 0, z: 0, ry: s * (Math.PI / 2) }, Math.min(-s * z0, -s * z1), Math.max(-s * z0, -s * z1), AISLE_H - 0.5);
    corbels({ x: 0, y: 0, z: TR_Z + s * (TR_D / 2), ry: s > 0 ? 0 : Math.PI }, -TR_X, TR_X, TR_H - 0.6);
  }
  // Dormers on the nave roof.
  for (const s of [-1, 1]) {
    for (const z of [5.2, -10]) {
      const x = s * 3.3;
      const yb = NAVE_H + NAVE_RISE * (1 - 3.3 / 5) - 0.9;
      stoneBox(1.4, 1.6, 1.6, x, yb, z, null, {}, STONE_W);
      const fr = { x: s * 4.0, y: yb, z, ry: s * (Math.PI / 2) };
      box('plain', 0.9, 1.0, 0.2, 0, 0.3, 0, INK, fr);
      box('glass', 0.7, 0.8, 0.1, 0, 0.4, 0.08, '#ffd27a', fr);
      box('glass', 0.4, 0.3, 0.1, 0, 1.2, 0.08, '#ffb85a', fr);
      box('plain', 1.1, 0.32, 0.2, 0, 1.5, 0.04, INK, fr);
      for (const t of [-1, 1]) box('slate', 1.15, 0.26, 2.0, t * 0.42, 1.95, -0.6, SLATE, fr, { rz: -t * 0.64 });
      box('plain', 0.24, 0.3, 2.0, 0, 2.35, -0.6, SLATE_D, fr);
    }
  }

  // The west front: facade frame at z = 13.
  const west = { x: 0, y: 0, z: 13, ry: 0 };
  portal(west, 0, 3.4, 5.4);
  roseWindow(west, 0, 14, 2.6);
  steppedGable({ x: 0, y: 0, z: 13 - 0.75, ry: 0 }, 7.6, NAVE_H, NAVE_RISE, 1.3);
  box('plain', 7.6, 0.3, 0.5, 0, NAVE_H - 0.5, 0.15, STONE_W, west); // string course under the gable
  for (let i = 0; i < 5; i++) {
    // a little gallery of arches in the gable
    const lx = (i - 2) * 1.15;
    box('plain', 0.7, 1.3, 0.3, lx, NAVE_H + 1.0, 0.15, INK, west);
    box('plain', 0.4, 0.4, 0.3, lx, NAVE_H + 2.3, 0.15, INK, west, { rz: Math.PI / 4 });
  }
  // Transept ends (x = +-13): triplet lancets, a small rose in the stepped gable, quoins.
  for (const s of [-1, 1]) {
    const fr = { x: s * TR_X, y: 0, z: TR_Z, ry: s * (Math.PI / 2) };
    lancet(fr, 0, 3, 1.9, 9, { glow: 'jewel' });
    lancet(fr, -2.5, 3, 1.4, 6.5, { glow: 'cool' });
    lancet(fr, 2.5, 3, 1.4, 6.5, { glow: 'cool' });
    roseWindow(fr, 0, TR_H + 2.2, 1.3);
    steppedGable({ x: s * (TR_X - 0.6), y: 0, z: TR_Z, ry: s * (Math.PI / 2) }, TR_D, TR_H, 5.5, 1.3);
    box('plain', TR_D, 0.3, 0.5, 0, TR_H - 0.5, 0.15, STONE_W, fr);
    for (const t of [-1, 1]) for (let k = 0; k < 20; k++) box('plain', k % 2 ? 0.5 : 0.9, 0.7, k % 2 ? 0.9 : 0.5, t * (TR_D / 2 - 0.1), 1.6 + k * 0.75, 0.15, k % 2 ? STONE_W : STONE_D, fr);
    gargoyle(fr, -3.2, TR_H - 1.6);
    gargoyle(fr, 3.2, TR_H - 1.6);
    // Transept side faces: lancets above the aisle roofs and tall ones outboard.
    for (const side of [-1, 1]) {
      const sf = { x: 0, y: 0, z: TR_Z + side * (TR_D / 2), ry: side > 0 ? 0 : Math.PI };
      const sx = s * (side > 0 ? 1 : -1);
      lancet(sf, sx * 10.9, 2.6, 1.5, 8.5, { glow: 'warm' });
      lancet(sf, sx * 6.9, 10.3, 1.3, 3.6, { lights: 1 });
    }
  }
  // Nave side walls: clerestory lancets, aisle lancets, flying buttresses with pinnacled piers, gargoyles.
  for (const s of [-1, 1]) {
    const nf = { x: s * (NAVE_W / 2), y: 0, z: 0, ry: s * (Math.PI / 2) };
    const af = { x: s * AISLE_X, y: 0, z: 0, ry: s * (Math.PI / 2) };
    // in a frame with ry = +-90deg, local x runs along world -+z; keep it simple by mapping z -> local x
    const lx = (z) => -s * z;
    for (const z of [2.6, 5.9, -8.4, -11.6]) {
      lancet(nf, lx(z), 10.2, 1.3, 4.2, { lights: 1, glow: hash(z, s) < 0.5 ? 'amber' : 'cool' });
      lancet(af, lx(z), 2.2, 1.5, 4.0, { glow: hash(s, z) < 0.5 ? 'jewel' : 'amber' });
    }
    for (const z of [4.25, -10, 0.1, -7.6]) {
      const px = s * (AISLE_X + 0.35);
      stoneBox(1.4, 6, 1.4, px, 0, z, null, {}, STONE_D);
      stoneBox(1.1, 4.4, 1.1, px, 6, z);
      box('plain', 1.6, 0.4, 1.6, px, 5.9, z, STONE_W);
      pinnacle(px, 10.4, z, 0.9);
      gargoyle({ x: px, y: 0, z, ry: s * (Math.PI / 2) }, 0, 9.0);
      // the flyer: a slanted bar from the pier top to the clerestory wall, with a thinner arch under it
      const x0 = s * (AISLE_X - 0.1);
      const x1 = s * (NAVE_W / 2 - 0.2);
      const dx = Math.abs(x1 - x0);
      const dy = 3.9;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      box('plain', len + 0.5, 0.55, 0.8, (x0 + x1) / 2, 9.8 + dy / 2 - 0.27, z, STONE_W, null, { rz: -s * ang });
      box('plain', len * 0.6, 0.4, 0.6, (x0 + x1) / 2 + s * 0.3, 9.8 + dy / 2 - 1.2, z, STONE_D, null, { rz: -s * ang });
    }
  }
  // West towers.
  for (const s of [-1, 1]) {
    const tx = s * TOWER.x;
    const { z: tz, w, h } = TOWER;
    stoneBox(w, h, w, tx, 0, tz);
    // corner buttresses in three stages with set-offs
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = tx + cx * (w / 2 + 0.1);
      const bz = tz + cz * (w / 2 + 0.1);
      stoneBox(1.2, 9, 1.2, bx, 0, bz, null, {}, STONE_D);
      box('plain', 1.4, 0.4, 1.4, bx, 8.9, bz, STONE_W);
      stoneBox(1.0, 8, 1.0, bx, 9.3, bz);
      box('plain', 1.2, 0.4, 1.2, bx, 17.2, bz, STONE_W);
      stoneBox(0.8, 7, 0.8, bx, 17.6, bz);
    }
    for (const y of [9, 17]) box('plain', w + 0.5, 0.3, w + 0.5, tx, y, tz, STONE_W);
    // windows: one per stage on the front and the outer side, belfry louvres on all four faces
    const faces = [
      { fr: { x: tx, y: 0, z: tz + w / 2, ry: 0 }, outer: true },
      { fr: { x: tx + s * (w / 2), y: 0, z: tz, ry: s * (Math.PI / 2) }, outer: true },
      { fr: { x: tx, y: 0, z: tz - w / 2, ry: Math.PI }, outer: false },
      { fr: { x: tx - s * (w / 2), y: 0, z: tz, ry: -s * (Math.PI / 2) }, outer: false },
    ];
    for (const { fr, outer } of faces) {
      if (outer) lancet(fr, 0, 2.6, 1.2, 4.2, { lights: 1, glow: 'amber' });
      if (outer) lancet(fr, 0, 10.4, 1.3, 5, { glow: 'jewel' });
      lancet(fr, -1.0, 18.6, 1.1, 5.4, { louvred: true });
      lancet(fr, 1.0, 18.6, 1.1, 5.4, { louvred: true });
      corbels(fr, -w / 2 + 0.3, w / 2 - 0.3, h - 0.9);
      gargoyle(fr, 0, h - 2.2);
    }
    // parapet, pinnacles and the spire
    for (const [dx, dz, ww, dd] of [[0, w / 2, w + 0.6, 0.4], [0, -w / 2, w + 0.6, 0.4], [w / 2, 0, 0.4, w + 0.6], [-w / 2, 0, 0.4, w + 0.6]]) box('plain', ww, 1.0, dd, tx + dx, h, tz + dz, STONE_W);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pinnacle(tx + cx * (w / 2 + 0.1), h, tz + cz * (w / 2 + 0.1), 1.0);
    box('plain', w - 0.6, 0.8, w - 0.6, tx, h, tz, SLATE_D);
    spire(tx, h + 0.8, tz, 2.9, 16);
  }
  // Crossing tower.
  {
    const cw = 8;
    const ch = 27;
    stoneBox(cw, ch, cw, 0, 0, TR_Z);
    box('plain', cw + 0.5, 0.3, cw + 0.5, 0, 22.2, TR_Z, STONE_W);
    const faces = [
      { x: 0, y: 0, z: TR_Z + cw / 2, ry: 0 },
      { x: 0, y: 0, z: TR_Z - cw / 2, ry: Math.PI },
      { x: cw / 2, y: 0, z: TR_Z, ry: Math.PI / 2 },
      { x: -cw / 2, y: 0, z: TR_Z, ry: -Math.PI / 2 },
    ];
    for (const fr of faces) {
      lancet(fr, -1.4, 22.8, 1.1, 3.4, { lights: 1, glow: 'amber' });
      lancet(fr, 1.4, 22.8, 1.1, 3.4, { lights: 1, glow: 'amber' });
      corbels(fr, -cw / 2 + 0.3, cw / 2 - 0.3, ch - 0.9);
    }
    for (const [dx, dz, ww, dd] of [[0, cw / 2, cw + 0.6, 0.4], [0, -cw / 2, cw + 0.6, 0.4], [cw / 2, 0, 0.4, cw + 0.6], [-cw / 2, 0, 0.4, cw + 0.6]]) box('plain', ww, 1.0, dd, dx, ch, TR_Z + dz, STONE_W);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pinnacle(cx * (cw / 2 + 0.1), ch, TR_Z + cz * (cw / 2 + 0.1), 1.1);
    box('plain', cw - 0.8, 0.8, cw - 0.8, 0, ch, TR_Z, SLATE_D);
    spire(0, ch + 0.8, TR_Z, 4.0, 17);
  }
  // Apse: an eight-sided drum behind the choir, with radiating buttresses, tall lancets and a conical roof.
  {
    const { z, r, h } = APSE;
    const drum = new THREE.CylinderGeometry(r, r, h, 8, 1, false, Math.PI / 8);
    const uv = drum.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / TILE.w, (uv.getY(i) * h) / TILE.h);
    paint(drum, tint(STONE, 1, 2));
    drum.translate(0, h / 2, z);
    parts.stone.push(drum);
    const apothem = r * Math.cos(Math.PI / 8);
    for (let i = 2; i <= 4; i++) {
      const a = Math.PI / 8 + ((i + 0.5) * 2 * Math.PI) / 8;
      lancet({ x: Math.sin(a) * apothem, y: 0, z: z + Math.cos(a) * apothem, ry: a }, 0, 2.6, 1.5, 7, { glow: i % 2 ? 'jewel' : 'amber' });
    }
    for (let i = 2; i <= 5; i++) {
      const a = Math.PI / 8 + (i * 2 * Math.PI) / 8;
      const bx = Math.sin(a) * (r + 0.3);
      const bz = z + Math.cos(a) * (r + 0.3);
      stoneBox(1.1, 9.5, 1.1, bx, 0, bz, null, { ry: a }, STONE_D);
      pinnacle(bx, 9.5, bz, 0.7);
    }
    cone('plain', r + 0.9, 6.2, 8, 0, h, z, SLATE, null, {}, Math.PI / 8);
    box('plain', 0.24, 1.4, 0.24, 0, h + 6.0, z, GOLD);
  }

  // ---------- merge by material ----------
  const g = new THREE.Group();
  const mats = {
    stone: new THREE.MeshLambertMaterial({ map: courseTexture({ base: [214, 207, 192], mortar: [170, 162, 148], seed: 1 }), vertexColors: true, flatShading: true }),
    plain: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    slate: new THREE.MeshLambertMaterial({ map: courseTexture({ brickW: 0.5, brickH: 0.5, base: [112, 128, 154], mortar: [86, 98, 120], vertical: true, seed: 5 }), vertexColors: true, flatShading: true }),
    glass: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  for (const kind of Object.keys(parts)) {
    if (!parts[kind].length) continue;
    const merged = mergeGeometries(parts[kind], false);
    for (const p of parts[kind]) p.dispose();
    g.add(new THREE.Mesh(merged, mats[kind]));
  }
  return g;
}
