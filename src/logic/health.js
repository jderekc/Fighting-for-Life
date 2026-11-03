export class Health {
  /** `start` is optional (defaults to full); it is clamped to 1..max so nobody begins a fight already knocked out. */
  constructor(max, start = max) {
    if (!(max > 0)) throw new RangeError('Health max must be positive');
    this.max = max;
    this.current = Math.min(max, Math.max(1, start));
  }

  get fraction() {
    return this.current / this.max;
  }

  get isDead() {
    return this.current <= 0;
  }

  get isFull() {
    return this.current >= this.max;
  }

  /** Color band for UI: green above half, yellow above a quarter, red below. */
  get band() {
    const f = this.fraction;
    if (f > 0.5) return 'green';
    if (f > 0.25) return 'yellow';
    return 'red';
  }

  /** Returns the amount actually removed (never below zero health). */
  damage(amount) {
    const applied = Math.min(this.current, Math.max(0, amount));
    this.current -= applied;
    return applied;
  }

  /** Returns the amount actually restored (never above max). */
  heal(amount) {
    const applied = Math.min(this.max - this.current, Math.max(0, amount));
    this.current += applied;
    return applied;
  }
}
