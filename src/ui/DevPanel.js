// The DEV overlay: plain DOM, no game logic. DevTools (src/core) decides what to show and what the buttons do.

const el = (root, tag, cls, text) => {
  const e = root.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export class DevPanel {
  /** actions: { jump(i), restart(), heal(), coins(), killAll(), toggleGod(), setDifficulty(step), clearErrors() } */
  constructor(root, levels, difficultyNames, actions) {
    this.root = root;
    this.el = el(root, 'div', 'dev-panel');
    this.el.id = 'dev';
    this.el.hidden = true;
    // While typing or clicking in here the game must not see the keys (Space/Enter would also press the focused button).
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.addEventListener('keyup', (e) => e.stopPropagation());

    this.el.append(el(root, 'div', 'dev-title', 'DEV   (` or F2 to hide)'));

    const jump = el(root, 'div', 'dev-row');
    jump.append(el(root, 'span', 'dev-label', 'Jump to'));
    levels.forEach((l, i) => {
      const b = el(root, 'button', '', `${l.id}`);
      b.title = l.name;
      b.addEventListener('click', () => actions.jump(i));
      jump.append(b);
    });
    this.el.append(jump);

    const row = el(root, 'div', 'dev-row');
    for (const [label, fn] of [['Restart', actions.restart], ['Full heal', actions.heal], ['+500 coins', actions.coins], ['Kill all', actions.killAll]]) {
      const b = el(root, 'button', '', label);
      b.addEventListener('click', fn);
      row.append(b);
    }
    this.god = el(root, 'button', '', 'God: off');
    this.god.addEventListener('click', actions.toggleGod);
    row.append(this.god);
    this.el.append(row);

    const diff = el(root, 'div', 'dev-row');
    diff.append(el(root, 'span', 'dev-label', 'Difficulty'));
    difficultyNames.forEach((name, i) => {
      const b = el(root, 'button', '', name);
      b.addEventListener('click', () => actions.setDifficulty(i));
      diff.append(b);
    });
    this.el.append(diff);

    this.blocks = {};
    for (const [key, title] of [['perf', 'Rendering'], ['sim', 'Simulation'], ['calc', 'Damage calculations (newest last)'], ['errors', 'Errors survived']]) {
      const h = el(root, 'div', 'dev-head', title);
      if (key === 'errors') {
        const c = el(root, 'button', 'dev-small', 'clear');
        c.addEventListener('click', actions.clearErrors);
        h.append(c);
      }
      const pre = el(root, 'pre', 'dev-pre', '');
      this.blocks[key] = pre;
      this.el.append(h, pre);
    }
    root.body.append(this.el);
  }

  get visible() {
    return !this.el.hidden;
  }

  set visible(v) {
    this.el.hidden = !v;
  }

  /** text: { perf, sim, calc, errors } strings; god: boolean. */
  render(text, god) {
    for (const k of Object.keys(this.blocks)) this.blocks[k].textContent = text[k] ?? '';
    this.god.textContent = `God: ${god ? 'ON' : 'off'}`;
    this.god.classList.toggle('on', god);
  }
}
