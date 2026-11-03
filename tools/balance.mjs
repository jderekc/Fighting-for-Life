// Balance report from scripted bots.
//   node tools/balance.mjs difficulty        win rate / HP left / time per level at each difficulty step
//   node tools/balance.mjs sensitivity [N]   which numbers move the outcome most (each varied x0.5 and x1.5), level 3 (and 2 for the Barchernarcher)
// Bots are not children: read this as "which knob matters", not as a prediction of how she will do.
import { ENEMIES } from '../src/data/enemies.js';
import { LEVELS } from '../src/data/levels.js';
import { STEPS } from '../src/logic/difficulty.js';
import { World } from '../src/sim/World.js';
import { botInput } from './bot.mjs';

const SEEDS = Number(process.argv[3]) || 20;
const DT = 1 / 60;

function trial(level, seed, { difficulty, enemyDefs } = {}) {
  const w = new World(level, 'sword', { seed, difficulty, enemyDefs });
  let hpLost = 0;
  let prev = w.hero.health.current;
  for (let i = 0; i < 60 * 240 && w.state === 'playing'; i++) {
    w.step(DT, botInput(w));
    const now = w.hero.health.current;
    if (now < prev) hpLost += prev - now;
    prev = now;
  }
  return { won: w.state === 'won', hpLost, time: w.time, coins: w.coins };
}

function summarize(level, opts) {
  let wins = 0, lost = 0, time = 0, coins = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const r = trial(level, s, opts);
    wins += r.won ? 1 : 0;
    lost += r.hpLost;
    time += r.time;
    coins += r.coins;
  }
  return { win: wins / SEEDS, hpLost: lost / SEEDS, time: time / SEEDS, coins: coins / SEEDS };
}

const fmt = (r) => `win ${(r.win * 100).toFixed(0).padStart(3)}%  HP lost ${r.hpLost.toFixed(0).padStart(4)}  time ${r.time.toFixed(0).padStart(3)}s  coins ${r.coins.toFixed(0).padStart(5)}`;

const mode = process.argv[2] ?? 'difficulty';
if (mode === 'difficulty') {
  for (const [i, step] of STEPS.entries()) {
    console.log(`\n${step.name} (damage x${step.enemyDamage}, health x${step.enemyHealth})`);
    for (const level of LEVELS.slice(0, 3)) console.log(`  L${level.id}  ${fmt(summarize(level, { difficulty: step }))}`);
  }
} else {
  const knobs = [
    ['grunt', 'damage'], ['grunt', 'maxHealth'],
    ['barchernarcher', 'damage'], ['barchernarcher', 'maxHealth'], ['barchernarcher', 'cooldown'], ['barchernarcher', ['nova', 'accuracy']], ['barchernarcher', ['nova', 'damage']],
    ['bowmaster', 'damage'], ['bowmaster', 'maxHealth'], ['bowmaster', 'cooldown'], ['bowmaster', 'attackRange'],
    ['neelysomnaly', 'damage'],
  ];
  const vary = (id, key, k) => {
    const def = { ...ENEMIES[id] };
    if (Array.isArray(key)) def[key[0]] = { ...def[key[0]], [key[1]]: def[key[0]][key[1]] * k };
    else def[key] = def[key] * k;
    return { [id]: def };
  };
  const level = LEVELS[2];
  const base = summarize(level, {});
  console.log(`Level 3 baseline: ${fmt(base)}   (${SEEDS} seeds; "HP lost" is damage taken, the fairer measure than HP left)\n`);
  const rows = [];
  for (const [id, key] of knobs) {
    for (const k of [0.5, 1.5]) {
      const r = summarize(level, { enemyDefs: vary(id, key, k) });
      rows.push({ name: `${id}.${Array.isArray(key) ? key.join('.') : key} x${k}`, delta: r.hpLost - base.hpLost, r });
    }
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  for (const row of rows) console.log(`${row.name.padEnd(36)} ${fmt(row.r)}   dHP lost ${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(0)}`);
}
