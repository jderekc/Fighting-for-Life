// Health between levels (owner's rule): it carries over and is NEVER reset by the game, at any difficulty. Only apples raise it.
// A fresh run (title screen, or after the last level) starts at full health. Pure rules, no game objects.

/** Health to start the next level with after a win: exactly what the hero has left. */
export function healthAfterWin(current) {
  return current;
}

/** Health to start a retry with after a knock-out: what the level was entered with, never below 1 (`entryHealth` may be Infinity = "was full"). */
export function healthForRetry(entryHealth) {
  return Math.max(1, entryHealth);
}
