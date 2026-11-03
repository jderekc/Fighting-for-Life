import { difficultyIconUrl } from './difficultyIcons.js';
import { weaponIconUrl } from './weaponIcons.js';
import { WEAPON_IDS, WEAPONS } from '../data/weapons.js';
import { clampStep, STEPS } from '../logic/difficulty.js';

const SCREENS = {
  title: {
    heading: 'Fighting for Life', // mixed case on purpose: the logo font is unicase (lowercase renders as small capitals)
    sub: 'Defeat every enemy. Eat apples to heal!',
    button: 'Start',
    hint: 'Move: WASD or arrow keys, or right-click a spot · Attack: SPACE or left mouse button (hold it)',
  },
  cleared: {
    heading: 'LEVEL CLEAR!',
    sub: 'The gate is open. On to the next level!',
    button: 'Next level',
    hint: 'Press ENTER or SPACE',
  },
  won: {
    heading: 'YOU WIN!',
    sub: 'You cleared every level.',
    button: 'Play again',
    hint: 'Press ENTER or SPACE',
  },
  lost: {
    heading: 'Knocked out!',
    sub: 'Shake it off. Try again!',
    button: 'Try again',
    hint: 'Press ENTER or SPACE',
  },
};

/** Full-screen overlays for title, win and lose. The button works with mouse/touch too. */
export class Screens {
  constructor(root = document, onConfirm = () => {}, difficulty = null, weapons = null) {
    this.difficulty = difficulty; // { get(), set(step) } or null
    this.weapons = weapons; // { get(), set(id) } or null: the free first-weapon pick on the title screen
    this.root = root;
    this.el = root.getElementById('screen');
    this.onConfirm = onConfirm;
    this.current = null;
  }

  /** `sub` optionally replaces the screen's default sub-heading (e.g. to announce the next level). */
  show(name, sub = null) {
    const s = SCREENS[name];
    if (!s) throw new Error(`Unknown screen: ${name}`);
    this.current = name;
    this.el.className = `screen ${name}`;
    this.el.hidden = false;
    this.el.replaceChildren();

    const make = (tag, cls, text) => {
      const e = this.root.createElement(tag);
      if (cls) e.className = cls;
      e.textContent = text;
      return e;
    };
    const button = make('button', 'big-button', s.button);
    button.addEventListener('click', () => this.onConfirm());
    this.el.append(make('h1', '', s.heading), make('p', 'sub', sub ?? s.sub));
    if (this.weapons && name === 'title') this.el.append(this.weaponPicker(make));
    this.el.append(button);
    if (this.difficulty && (name === 'title' || name === 'lost')) this.el.append(this.difficultySlider(make));
    this.el.append(make('p', 'hint', s.hint));
  }

  /** "Pick your weapon": one card per weapon; the chosen one is lit. Choosing is free here; later swaps are trade-ins at the shop. */
  weaponPicker(make) {
    const wrap = make('div', 'weapon-picker', '');
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'Choose your weapon');
    const cards = [];
    const mark = () => cards.forEach(([id, card]) => card.setAttribute('aria-checked', String(id === this.weapons.get())));
    for (const id of WEAPON_IDS) {
      const card = make('button', 'weapon-card', '');
      card.type = 'button';
      card.setAttribute('role', 'radio');
      const icon = make('span', 'weapon-icon', '');
      icon.style?.setProperty('background-image', weaponIconUrl(id));
      card.append(icon, make('span', 'weapon-name', WEAPONS[id].name), make('span', 'weapon-blurb', WEAPONS[id].blurb));
      card.addEventListener('click', () => {
        this.weapons.set(id);
        mark();
      });
      card.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') e.stopPropagation(); // pressing a card chooses it; it must not also start the game
      });
      cards.push([id, card]);
      wrap.append(card);
    }
    mark();
    return wrap;
  }

  /** "How hard?" slider: steps from stats.json difficulty.steps. The label shows the chosen step's name. */
  difficultySlider(make) {
    const wrap = make('label', 'difficulty', '');
    const label = make('span', 'difficulty-name', '');
    const input = this.root.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(STEPS.length - 1);
    input.step = '1';
    input.value = String(clampStep(this.difficulty.get()));
    const show = () => {
      const step = clampStep(input.value);
      label.textContent = `Difficulty: ${STEPS[step].name}`;
      // The knob is the emblem (CSS variable), and the bar warms from dull steel to flaming red as the step rises.
      wrap.style?.setProperty('--knob', difficultyIconUrl(step));
      wrap.style?.setProperty('--p', `${8 + (step / (STEPS.length - 1)) * 92}%`);
      if (wrap.dataset) wrap.dataset.step = String(step);
    };
    input.addEventListener('input', () => {
      this.difficulty.set(Number(input.value));
      show();
    });
    input.addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow')) e.stopPropagation(); // arrows move the slider, not the hero; Enter/Space still start the game
    });
    show();
    wrap.append(label, input);
    return wrap;
  }

  hide() {
    this.current = null;
    this.el.hidden = true;
    this.el.replaceChildren();
  }
}
