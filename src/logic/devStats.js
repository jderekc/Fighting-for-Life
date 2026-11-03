// Pure helpers behind the DEV panel: frame-rate meter, de-duplicating error log, damage-calculation text. No DOM, no three.js.

/** Rolling frame statistics over the last `size` frames. push(frameMs) per frame. */
export class FpsMeter {
  constructor(size = 120) {
    this.size = size;
    this.samples = [];
  }

  push(ms) {
    if (!(ms >= 0) || !Number.isFinite(ms)) return;
    this.samples.push(ms);
    if (this.samples.length > this.size) this.samples.shift();
  }

  /** { fps, avgMs, worstMs, frames }: fps from the mean frame time, worst = the slowest recent frame. */
  stats() {
    const n = this.samples.length;
    if (!n) return { fps: 0, avgMs: 0, worstMs: 0, frames: 0 };
    const sum = this.samples.reduce((a, b) => a + b, 0);
    const avgMs = sum / n;
    return { fps: avgMs > 0 ? 1000 / avgMs : 0, avgMs, worstMs: Math.max(...this.samples), frames: n };
  }
}

/** Errors the game survived (caught in the frame loop, window 'error', unhandled rejections, console.error/warn). Repeats are counted, not listed twice. */
export class ErrorLog {
  constructor(cap = 20) {
    this.cap = cap;
    this.entries = [];
    this.total = 0;
  }

  add(message, source = 'error', now = Date.now()) {
    const msg = String(message).slice(0, 300);
    this.total += 1;
    const same = this.entries.find((e) => e.msg === msg && e.source === source);
    if (same) {
      same.count += 1;
      same.last = now;
      return same;
    }
    const entry = { msg, source, count: 1, first: now, last: now };
    this.entries.push(entry);
    if (this.entries.length > this.cap) this.entries.shift();
    return entry;
  }

  clear() {
    this.entries = [];
    this.total = 0;
  }
}

const n = (v, d = 2) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(d).replace(/0+$/, '').replace(/\.$/, ''));

/**
 * One line per damage calculation recorded by World (`world.calcLog`):
 *  hit  (hero -> enemy):  base x damage mult x crit x (1 - armor) = dealt
 *  hurt (enemy -> hero):  raw x difficulty = applied
 */
export function formatCalc(e) {
  if (e.kind === 'hit') {
    const crit = e.crit ? ` x crit ${n(e.critMult)}` : '';
    return `${n(e.t, 1)}s  hero -> ${e.target}: ${n(e.base)} x ${n(e.damageMult)} dmg${crit} x (1 - ${n(e.armor)} armor) = ${n(e.dealt)}  [hp ${n(e.hpAfter, 1)}/${n(e.hpMax)}]`;
  }
  if (e.kind === 'hurt') {
    const god = e.god ? ' (GOD MODE: not applied)' : '';
    return `${n(e.t, 1)}s  ${e.source} -> hero: ${n(e.raw)} x ${n(e.difficulty)} difficulty = ${n(e.applied)}${god}  [hp ${n(e.hpAfter, 1)}/${n(e.hpMax)}]`;
  }
  return JSON.stringify(e);
}
