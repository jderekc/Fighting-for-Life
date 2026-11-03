// The difficulty slider's emblem: the gear gets better as the game gets harder.
//   0 a single wooden sword
//   1 wooden shield + wooden sword
//   2 wooden shield + iron sword
//   3 wooden shield + two crossed iron swords
//   4 iron shield + two flaming swords
// Static SVG strings (no user input), one per step; every item carries data-kit so tests can check what is drawn.

const WOOD = { blade: '#d9a566', edge: '#8a5a2b', guard: '#6b4220', grip: '#4a2c14' };
const IRON = { blade: '#d5dce6', edge: '#8d98a8', guard: '#59616e', grip: '#3b2a1a' };

function sword(kind, x, y, rot, scale = 1) {
  const p = kind === 'wood-sword' ? WOOD : IRON;
  const flame = kind === 'flame-sword';
  // Drawn AFTER the blade so they lick up its sides: a glow, a wide orange tongue on each edge and a bright core up the middle.
  const flames = flame
    ? `<circle cx="0" cy="-12" r="20" fill="#ff9a2a" opacity=".25"/>
       <g class="flame"><path d="M-5,12 Q-14,2 -8,-10 Q-12,-22 -4,-34 Q-4,-24 0,-44 Q3,-26 5,-34 Q12,-22 8,-10 Q14,2 5,12 Z" fill="#ff7a1a" opacity=".92"/>
       <path d="M-2.5,10 Q-6,0 -2,-10 Q-3,-20 0,-32 Q3,-20 2,-10 Q6,0 2.5,10 Z" fill="#ffd23a"/></g>`
    : '';
  return `<g data-kit="${kind}" transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
    <path d="M0,-38 L4.5,-30 L4.5,14 L-4.5,14 L-4.5,-30 Z" fill="${p.blade}" stroke="${p.edge}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M0,-34 L0,12" stroke="${kind === 'wood-sword' ? '#f0c88f' : '#ffffff'}" stroke-width="1.4" opacity=".7"/>
    <rect x="-11" y="14" width="22" height="5" rx="1.5" fill="${p.guard}" stroke="#1d130a" stroke-width="1"/>
    <rect x="-2.6" y="19" width="5.2" height="12" fill="${p.grip}"/>
    <circle cx="0" cy="33" r="3.4" fill="${p.guard}" stroke="#1d130a" stroke-width="1"/>
    ${flames}
  </g>`;
}

function shield(kind, x, y, r) {
  if (kind === 'wood-shield') {
    return `<g data-kit="wood-shield" transform="translate(${x} ${y})">
      <circle r="${r}" fill="#a8763f" stroke="#4a2c14" stroke-width="3"/>
      <path d="M${-r * 0.5},${-r * 0.86} L${-r * 0.5},${r * 0.86} M0,${-r} L0,${r} M${r * 0.5},${-r * 0.86} L${r * 0.5},${r * 0.86}" stroke="#6b4220" stroke-width="1.6"/>
      <circle r="${r * 0.82}" fill="none" stroke="#7a4f26" stroke-width="1.2"/>
      <circle r="${r * 0.28}" fill="#7d5428" stroke="#3a2210" stroke-width="2"/>
    </g>`;
  }
  return `<g data-kit="iron-shield" transform="translate(${x} ${y})">
    <circle r="${r}" fill="#aeb7c3" stroke="#4b535f" stroke-width="3.5"/>
    <circle r="${r * 0.82}" fill="none" stroke="#7d8896" stroke-width="1.4"/>
    <path d="M0,${-r * 0.74} L0,${r * 0.74} M${-r * 0.74},0 L${r * 0.74},0" stroke="#e8edf3" stroke-width="3.2" stroke-linecap="round"/>
    <circle r="${r * 0.26}" fill="#dfe6ee" stroke="#4b535f" stroke-width="2"/>
  </g>`;
}

// The flicker lives INSIDE the SVG: the slider shows the emblem as a CSS background-image (difficultyIconUrl), and page CSS
// never reaches into an SVG image, so a page-level .flame rule would leave the flames still.
const FLICKER = '<style>.flame{transform-box:fill-box;transform-origin:50% 100%;animation:flick .45s ease-in-out infinite alternate}@keyframes flick{from{transform:scaleY(.9) skewX(-4deg)}to{transform:scaleY(1.08) skewX(4deg)}}</style>';

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" class="difficulty-emblem" viewBox="0 0 120 84" width="200" height="140" role="img" aria-hidden="true">${inner.includes('class="flame"') ? FLICKER : ''}${inner}</svg>`;

/** Markup of the emblem for slider step 0..4 (out-of-range steps are clamped). */
export function difficultyIcon(step) {
  switch (Math.max(0, Math.min(4, Math.round(step)))) {
    case 0:
      return frame(sword('wood-sword', 60, 42, 0, 1.05));
    case 1:
      return frame(shield('wood-shield', 44, 46, 27) + sword('wood-sword', 84, 38, 14));
    case 2:
      return frame(shield('wood-shield', 44, 46, 27) + sword('iron-sword', 84, 38, 14));
    case 3:
      return frame(sword('iron-sword', 60, 44, -42, 1.3) + sword('iron-sword', 60, 44, 42, 1.3) + shield('wood-shield', 60, 52, 17));
    default:
      return frame(sword('flame-sword', 60, 44, -42, 1.3) + sword('flame-sword', 60, 44, 42, 1.3) + shield('iron-shield', 60, 52, 17));
  }
}

/** The same emblem as a CSS url() value, so the slider's draggable knob can BE the icon. */
export function difficultyIconUrl(step) {
  return `url("data:image/svg+xml,${encodeURIComponent(difficultyIcon(step))}")`;
}
