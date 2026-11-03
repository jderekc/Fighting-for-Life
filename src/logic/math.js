// Small 2D helpers on the ground plane (x, z). Yaw convention: forward = (sin yaw, cos yaw),
// which matches three.js rotation.y for a model that faces +z.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);

export const angleTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a, b) {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Caps a vector's length at 1 (keeps analog stick magnitude, fixes diagonal speed-up). */
export function clampLength1(x, z) {
  const len = Math.hypot(x, z);
  if (len <= 1) return [x, z];
  return [x / len, z / len];
}

export const lerp = (a, b, t) => a + (b - a) * t;
