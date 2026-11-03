// Icons for the weapon picker on the title screen: small static SVGs (no user input), one per weapon id.
// Each is shown as a CSS background-image, so the page CSS cannot reach into it (same approach as difficultyIcons.js).

const INK = '#1d130a';

const SHAPES = {
  sword: `<g transform="rotate(35 40 40)"><rect x="36" y="6" width="8" height="46" fill="#d5dbe3" stroke="${INK}" stroke-width="2"/>
    <rect x="26" y="52" width="28" height="6" fill="#e0b030" stroke="${INK}" stroke-width="2"/><rect x="37" y="58" width="6" height="14" fill="#6b4423" stroke="${INK}" stroke-width="2"/></g>`,
  dagger: `<g transform="rotate(-30 40 40)"><rect x="25" y="14" width="8" height="30" fill="#e9f2f7" stroke="${INK}" stroke-width="2"/><rect x="20" y="44" width="18" height="5" fill="#2bb3c0" stroke="${INK}" stroke-width="2"/><rect x="26" y="49" width="6" height="12" fill="#1f6f78" stroke="${INK}" stroke-width="2"/></g>
    <g transform="rotate(30 40 40)"><rect x="47" y="14" width="8" height="30" fill="#e9f2f7" stroke="${INK}" stroke-width="2"/><rect x="42" y="44" width="18" height="5" fill="#2bb3c0" stroke="${INK}" stroke-width="2"/><rect x="48" y="49" width="6" height="12" fill="#1f6f78" stroke="${INK}" stroke-width="2"/></g>`,
  hammer: `<g transform="rotate(30 40 40)"><rect x="36" y="22" width="8" height="52" fill="#7a4a22" stroke="${INK}" stroke-width="2"/>
    <rect x="18" y="6" width="44" height="26" fill="#8d97a6" stroke="${INK}" stroke-width="2.5"/><rect x="18" y="16" width="44" height="6" fill="#e0b030"/></g>`,
  gun: `<rect x="12" y="26" width="46" height="18" fill="#ff8a2a" stroke="${INK}" stroke-width="2.5"/><rect x="58" y="31" width="14" height="8" fill="#2bb3c0" stroke="${INK}" stroke-width="2"/>
    <rect x="68" y="29" width="6" height="12" fill="#ffe14d" stroke="${INK}" stroke-width="2"/><rect x="18" y="44" width="12" height="20" fill="#3b3b4a" stroke="${INK}" stroke-width="2.5"/>`,
  sniper: `<rect x="4" y="32" width="68" height="10" fill="#3a4a5a" stroke="${INK}" stroke-width="2.5"/><rect x="26" y="22" width="22" height="10" fill="#2bb3c0" stroke="${INK}" stroke-width="2"/>
    <rect x="4" y="28" width="16" height="22" fill="#ff8a2a" stroke="${INK}" stroke-width="2.5"/><rect x="70" y="34" width="6" height="6" fill="#ffe14d" stroke="${INK}" stroke-width="1.5"/>`,
};

/** SVG markup for a weapon id (a plain "?" box for an unknown id, so a missing icon never breaks the screen). */
export function weaponIcon(id) {
  const inner = SHAPES[id] ?? `<rect x="20" y="20" width="40" height="40" fill="#888" stroke="${INK}" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80" role="img" aria-hidden="true" data-weapon="${id}">${inner}</svg>`;
}

export const weaponIconUrl = (id) => `url("data:image/svg+xml,${encodeURIComponent(weaponIcon(id))}")`;
export const WEAPON_ICON_IDS = Object.freeze(Object.keys(SHAPES));
