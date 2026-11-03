// Player characters. Purely cosmetic (identical stats; see stats.json `hero`).
// Character selection is not built yet: for now the game always uses the default girl, named Nicky.
// When selection arrives, the chosen kind and typed name go into the profile (`profile.hero`, see logic/profile.js).

export const HEROES = Object.freeze({
  girl: Object.freeze({
    id: 'girl',
    defaultName: 'Nicky',
    nameTag: true, // a faint floating name above the head; the default for the girl character
    look: Object.freeze({ skin: '#e0ac86', shirt: '#3b82f6', pants: '#334155', hair: '#4b2e1a' }),
  }),
  // boy / animal types come with character selection (M3).
});

export const DEFAULT_HERO_ID = 'girl';
export const MAX_NAME_LENGTH = 12;

/** Trim and shorten a typed name; an empty name falls back to the hero type's default. Never returns markup-sensitive junk (control chars). */
export function cleanHeroName(name, kind = DEFAULT_HERO_ID) {
  const text = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return text || HEROES[kind].defaultName;
}
