# Fighting for Life

A blocky (Minecraft-style) 3D arena brawler built for one player: the owner's 7-year-old daughter.
Single player, one PC, no online, no accounts. Provisional title; she can rename it.

## Commands

```
npm install
npm test          # node:test, runs tests/**/*.test.js (pure logic + headless simulation)
npm run build     # -> dist/fighting-for-life.html, one self-contained file, double-click to play
npm run dev       # rebuild on change (reload the page manually)
python3 -I tools/e2e_check.py   # real-browser smoke test (needs python playwright + google-chrome)
node tools/balance.mjs difficulty|sensitivity   # bot balance reports (see Difficulty and balance)
npm run stats                   # print every tuning number (npm run stats -- enemies.grunt  for one section/value)
```

**The hero is Nicky** (the owner's daughter): the default female character, with a faint semi-transparent floating name tag. The name is
`profile.hero.name` (default 'Nicky'); players will choose their own once character selection exists (see *Hero and name tag* below).

Four levels: 1 is 36x26 landscape (meadow), 2 is 24x36 portrait (meadow, no buildings), 3 is 40x32 landscape (mountain: terraces, a pond,
vine-covered temple ruins, strong wind, ends with the first elite, who now appears in the middle of the temple ruins), 4 is the 18x24 Mystic Oasis (`kind: 'shop'`: no enemies, a 6x8 shop,
open gate). Levels can be any shape from 12x12 to 128x128 blocks.
Verified toolchain at handoff: Node 22, three 0.187.0, esbuild 0.28.2. No framework, no bundler plugins.

## Architecture (keep these layers separate)

```
src/config.js        global tunables (camera, doors...; hero/coins/apples numbers are pulled in from stats.json)
src/data/stats.json  **THE numbers: HP, armor, damage, speed, prices, coins, apples.** Edit here; read with stat('enemies.grunt.maxHealth') from src/data/stats.js
src/data/            weapons, enemies, upgrades, heroes, levels, biomes: names/looks/behaviors/layout. Numbers come from stats.json.
src/logic/           pure helpers (math, health, targeting, combat geometry, input mapping, rng, grid/collide/pathfind/levelGrid/terrain). No three.js, no DOM.
src/sim/             the game rules: World.step(dt, input), enemy AI, apples, weapon behaviors. No three.js, no DOM.
src/render/          three.js: Stage (renderer/camera/lights), WorldView, CharacterView, blocky models, Arena, Effects.
src/render/scenery/  trees (species), rocks (shapes), flowers, falling leaves, stream, bridges, cottages (door + roof fade). Built from level.scenery.
src/ui/              DOM overlay: Hud (health bar, floating numbers), Screens (title/win/lose).
src/core/            Game (state machine + loop), Input (keyboard, mouse, gamepad).
tests/               node:test. sim tests run whole fights headlessly with scripted bots.
tools/               e2e_check.py (browser flow), stats.mjs (print stats.json), balance.mjs + bot.mjs (bot-based balance reports)
```

Rules of the road:

- **The sim never imports three.js or touches the DOM.** `World` is a pure state machine; the view reads it and
  drains `world.drainEvents()` (heroAttack, enemyHit, enemyDied, heroHurt, applePicked, ...). Views never mutate the sim.
  This is what makes the fights unit-testable and the balance measurable without a browser.
- **Data over code.** A new weapon/enemy/level is a data entry. New *kinds* of behavior are registered
  (`src/sim/weaponBehaviors.js`), not special-cased in `World`.
- **Conventions:** ground plane is (x, z), y is up. 1 unit = 1 block. Yaw: forward = (sin yaw, cos yaw), models face +z.
  Input is screen-relative: up = -z. Distances for reach/attackRange are edge-to-edge (subtract radii).
- Frozen config/data objects; no globals except `window.__ffl` (debug handle to the Game).
- Add a test with every logic/sim change. Run `npm test` before finishing. For visual changes, run the build and look at it.

### Stats: one place for the numbers

- `src/data/stats.json` has sections `hero`, `weapons`, `enemies`, `upgrades` (add + three tier prices), `coins`, `apples`. `src/data/stats.js`
  deep-freezes it and exports `STATS`, `stat('a.b.c')` (throws on a typo) and `statRows(prefix)`. `enemies.js`, `weapons.js`, `upgrades.js` and
  `config.js` spread their rows from it and add only non-numeric things (names, looks, behaviors, the swing arc). `tests/stats.test.js` checks
  that nothing drifts, that every enemy/weapon/upgrade has a row, and that armor/radius/price rules hold. `npm run stats` prints it.
- To add an enemy: a row in stats.json + an entry in enemies.js (`...S.<id>`). Armor is the fraction of each hit absorbed (0..<1); `hero.armor`
  exists in the JSON for later but the sim does not use it yet.
- Not in the JSON on purpose: level layout, spawn lists and timings (`levels.js`), camera/door/key behavior (`config.js`).

### Hero and name tag

- `src/data/heroes.js`: `HEROES.girl` (default; `defaultName: 'Nicky'`, `nameTag: true`, the look), `cleanHeroName(name, kind)` (trim, strip control
  characters, max 12 chars, empty -> the default name). Boy/animal types are not built.
- The profile carries `hero: { kind, name }` (`createProfile()`, `withHeroName(profile, name)`; `buyUpgrade` preserves it). `Game` passes
  `profile.hero` to `WorldView`, which shows `render/NameTag.js` (a camera-facing sprite, opacity 0.6, drawn on top) above the hero.
- **Character selection (M3) still has to:** let the player type a name (call `withHeroName`), pick a kind, and persist `profile.hero`.
  Nothing renames the hero yet, so the tag always says Nicky.

### Mouse

- Left button on the canvas = attack, held like Space (`Input.mouseAttack`). Right button = walk to that spot: `Input.takeMoveClick()` ->
  `Stage.groundPoint()` (ray onto the ground plane at the hero's height) -> `logic/clickMove.js` `ClickMover` (uses the sim's A* `nav.steer`,
  eases in, gives up when stuck for 0.6 s). Keys or the stick cancel it; dragging with the right button re-aims. Clicks on menus, the shop
  and the HUD are ignored (only `event.target === canvas`). Right-click walking over a hill uses the hero's current ground height, so a far
  click on much higher ground can land a little off. Unverified with a real mouse (tests use fake events).

### Mobs: Barchernarcher and Neelysomnaly

- **Barchernarcher** (`behavior: 'flare'`, sun-box head with spinning rays, legs of light; `render/mobs.js createSunMan`): 120 HP, 25 melee
  damage (grunt 10), poise 2 (the sword cannot interrupt its 0.8 s windup, so you step back instead), plus a spark burst: when the hero is
  within `nova.range` (2 blocks, edge to edge) but out of melee reach it winds up 0.5 s, then one 50% roll for 10 damage, all directions, can
  be dodged by leaving range. `enemyNova` event, `announce: true` shows its name banner on arrival. Level 2: one, a `finale` spawn that drops
  the key. Level 3: one `random: { spots: [...], delay: [10, 40] }` spawn (spot and time picked from the world seed, so a replay of the same seed repeats).
- **Neelysomnaly** (`behavior: 'sleeper'`, `optional`, `immovable`; `createRock`: blackish rock, green vines, faint "ZzzZz" sprites): never moves,
  never attacks. Touching it (gap <= `touchMargin`) hurts: first hit 5 (half a grunt), each further hit x1.15 (hits come at the hero's 0.6 s grace
  rhythm) **for the first 4 hits only** (`rampHits`: 5, 5.75, 6.6, 7.6), then it plateaus at 7.6; the ramp resets after 1.5 s apart. 200 HP, normal coin rule (damage dealt, no special case). It is solid for the hero
  (`World` pushes the hero out), not pushed by knockback, and does **not** count toward clearing a level or the HUD's enemies-left.
  Placement: level 1 x1, level 2 x2, level 3 x2. `validateLevel` requires 2 free cells all round a rock (a hero wedged between scenery
  and a rock could not step away).
- **Rocks are path obstacles:** while a rock lives its cell is MOVE-blocked in the grid (`World`, `Grid.flagsOf/setFlags`; SIGHT is not, so shots pass), so A* routes walkers around it and the cell is given back when it dies. Before this, mobs lined up behind a rock pinned themselves on it.
- **Archer shots:** an archer only starts (and only releases) a shot when a fat ray (r 0.12, sampled every 0.06) is clear, because arrows are tested every ~0.17 blocks in flight and the old coarse check let him wind up (red flash) and shoot into pillar corners. If the hero ducks behind cover mid-windup he skips the shot and re-aims after 0.3 s. `Grid.lineClear` takes a `spacing` argument.
- Auto-aim prefers real enemies over a rock (`heroAttack`); grunts slide sideways when pinned against a rock; Ctrl+click is not an attack (Mac right-click).
- Test bots skip optional enemies and steer around rocks (`avoidRocks` in tests/sim.test.js, similar code in tools/e2e_check.py).
- After the plateau a hero who stays against a rock still loses 7.6 HP per 0.6 s (~13 HP/s), so a full-health hero is knocked out in about 8 s; only the ramp
  stopped growing. Consider a knock-back if she keeps walking into rocks.

### Difficulty and balance

- **Slider** (title and "Knocked out" screens): `profile.difficulty` is an index into `stats.json difficulty.steps` (Very easy .. Very hard; default Normal = x1/x1).
  Each step scales `enemyDamage` (everything that hurts the hero, applied in `World.damageHero`) and `enemyHealth` (enemy max HP at spawn).
  The hero's stats, shop prices and the retry floor do not change. Because coins follow damage dealt, tougher enemies pay more coins
  (Hard/Very hard roughly +25%/+45% on level 2): intentional-by-consequence, not a decision; revisit if it makes the shop too easy.
  The slider takes effect when the next fight starts. `src/logic/difficulty.js` is pure (`difficultyOf`, `withDifficulty`, `clampStep`).
- `World` option `enemyDefs` overrides enemy definitions (used by the balance tool and tests); `tools/balance.mjs` has
  `difficulty` (win rate / HP lost / time per level per step) and `sensitivity` (each stat x0.5 and x1.5 on level 3, ranked by HP lost). `tools/bot.mjs` is the
  scripted player (same logic as `botInput` in tests/sim.test.js; keep them in step).
- **Findings (20 seeds, bot that never dodges):** after the archer/rock fixes, Normal costs the bot ~7 HP on L1, ~13 on L2, ~33 on L3 (win 100%); Hard 85% and
  Very hard 60% on L3. (Before the fixes L3 read ~79 HP lost: many boss arrows were being wasted on pillars, so those numbers understated how
  hard a *clear* shot is; so ignore the earlier numbers.) New sensitivity ranking on L3: grunt max HP x1.5 is by far the biggest lever (+38 HP lost: longer
  fights against 12 grunts), then Bowmaster damage/cooldown and the Barchernarcher's burst damage/accuracy/HP at about +-8 each; grunt damage and the Barchernarcher's
  melee barely register (the bot's sword knockback keeps it out of melee reach).
  A stationary child will eat the 25-damage melee; the bot understates it.
- The boss's 320 HP is also what pays the coins (damage dealt), so lowering it trades safety against the economy. Safer first levers: bowmaster
  damage 8 or cooldown 1.8 (affect safety, not coins).

### Title screen: splash flyover, fonts, difficulty emblem
- `src/render/Splash.js` (class `Splash`, `SPLASH_SECONDS=48`) is a separate THREE.Scene drawn behind the **title** screen only via `Stage.renderOther` (later screens show the frozen arena); the `#fade` overlay fades out/in at the loop point. It is created in `Game.boot()` and disposed (`disposeTree`) in the first `start()`. While the window is unfocused (`Game.paused`) it neither advances nor redraws, except once after a resize (`Stage.takeResized`). Time wraps with a modulo, so any debug value works: `window.__ffl.splash.time = 22`. The duels `reset()` when the loop time jumps back, so a mob knocked out just before the wrap is back on its feet.
- `src/render/splashLand.js`: noise, `heightAt`, `slopeAt`, rivers, `riverDistance` (shared so terrain and scatter agree), the camera glide's control points (`FLIGHT_PATH`, `FLIGHT_LOOK`) and `DUEL_SPOTS`. `tests/splash.test.js` checks the terrace/shelf heights and that the glide stays >= 1 block above the ground (closest: ~1.04 at t~1.75 s, during the fade-in, over the far mountains). The land is a bowl: a flat plateau (h=3, r<30) around the cathedral, mountains outside r~34-105, rivers carved in, plus `SHELF` (a sharp-edged cliff shelf on the west bank of river2 at (-63, 14), h 13.5) with a brook (`brookTop` over the shelf, `FALL` at its east edge, `brookLow` carved down to the river) = the waterfall. Flat low ground exists only near the plateau; check `heightAt` before placing structures.
- `src/render/splashCathedral.js`: `buildCathedral()`, the Gothic church (twin west towers with spires, crossing tower, nave with clerestory and aisles, flying buttresses, transepts, apse, rose windows, stepped lancets with stained glass, projecting stepped portal, pinnacles, crockets, gargoyles, corbel tables, string courses, stepped gables, dormers). Every piece is a box/cone/disc pushed into one of four lists (`stone` textured, `plain`, `slate`, `glass` unlit) and merged by material (`mergeGeometries`), so the building is 4 draw calls (29k triangles measured). Masonry courses are a 48x24 pixel `courseTexture` with per-box UV fitting (`fitBoxUv`) so courses line up; vertex colours add per-piece tint and moss on the plinth. Wall `frame`s ({x,y,z,ry}, local +z = outward) place windows on any face. The west front faces +z at z=13; the group sits at `PLATEAU`.
- `src/render/splashKit.js`: the shared helpers: `instanced` (InstancedMesh from item lists), `swayMaterial` (foliage lean; strength/pivot are **uniforms** with one `customProgramCacheKey`, because three caches programs by `onBeforeCompile.toString()` and baked-in numbers made every sway material reuse the first one's values), `lambertPalette` (memoised flat Lambert per colour, shared by all builders), `scatter`, `boxMaker`, `glowTexture`, `mergeStatic` (bake static meshes into one mesh per material) and `disposeTree` (also frees InstancedMesh instance buffers).
- `src/render/splashDetail.js`: `buildForest` (pine/oak/birch/dead trees, instanced, swaying via a shared `uTime` uniform), `buildClutter` (grass, flowers, bushes, boulders, mushrooms, logs, reeds), `buildStructures` (stone path + lanterns, a stone bridge, cottages, a ruined watchtower, standing stones, a fence, banners, braziers), `buildTerrainDetail` (scree octahedra on steep slopes, strata outcrops on cliffs, boulders at the waterfall foot, stepping stones across river2, a tumbledown field wall west of the path, a ruined chapel at (36, 30)). All deterministic (`hash`), instanced for speed; `buildStructures`/`buildTerrainDetail` end with `mergeStatic` (the heart stays separate because it bobs), so ~250 little boxes cost ~12 draw calls. Grass blades are open-ended cones (the buried base cap is skipped). `FAR = 42` keeps the terrace and the camera's low pass clear.
- `buildTerrain` (Splash.js) colours vertices by height, `slopeAt`, river/brook distance and noise: riverbed mud/gravel, muddy banks, grass with dry patches and bare dirt, a worn terrace, alpine, scree, strata-banded cliffs, noisy snow line. `buildRiverMeshes` also draws the brook, two waterfall sheets (own scrolling texture), a plunge pool and breathing spray planes.
- `src/render/splashLife.js`: `Wanderers`, seven seeded mobs reusing the in-game looks through `CharacterView` (a grunt patrolling the lantern path, two grunts and the sun brute wandering home circles, the bowmaster patrolling east of the transept, two sleeping rocks behind the apse). They walk at 1-1.5 u/s, pause 1-3 s at each stop, face their walk direction, and only pick targets that pass `openGround` (plateau height, outside the cathedral footprint, >7 from rivers, >5.5 from the two duels). Hooked into `Splash.update/dispose`. Scene cost as of the review pass (software WebGL, 1280x720, `renderer.info`): ~300 draw calls, ~260k triangles (was ~546 / ~290k before the static merge and open-ended grass). JS-side `renderer.render` submission ~4 ms (was ~67 ms); `Splash.update` ~0.5 ms. In swiftshader the frame is raster-bound: ~0.55-0.6 s per frame with a pixel readback and a ~0.7-0.95 s rAF interval, unchanged by this pass. Real-GPU cost unmeasured.
- Splash extras (from the Opus review's recommendations): `instanced(geo, mat, items, split)` can split a big scatter into split x split cells so the camera culls the off-screen ones (used for pines, grass, rocks, scree); the mist planes share one geometry (sized by `scale`); the flyover runs at pixel ratio <= 1.5 (`Stage.setPixelRatioCap`, back to 2 in `Game.start`); lantern/brazier glow sprites flicker, standing-stone runes pulse (`structures.userData.runeMat`), banners wave (`userData.flags`, kept out of the merge), and foam rings breathe at the waterfall pool. The waterfall texture offset is **+** t (pattern slides down the sheet); the rivers use the opposite sign. The bow (`blocky.js createBow`): tips and string curve toward the archer, so the limb tilts must lean to the string's side (they were reversed before).
- Fonts are embedded as base64 woff2 by `build.mjs` (`FONTS` list, `/*FONTS*/` placeholder in index.template.html); licences sit beside the files in `assets/fonts/` (SIL OFL). Logo/headings use the logo font, body uses the body font.
- `src/ui/difficultyIcons.js` builds the slider emblem as SVG per step: wood sword; wood shield + wood sword; wood shield + iron sword; wood shield + two crossed iron swords; iron shield + two crossed flame swords. The flame flicker is a `<style>` inside the SVG (`FLICKER`): the knob is a CSS background-image, which page CSS cannot reach. Tested in tests/difficulty.test.js.
- `tools/e2e_check.py` waits for `state === 'playing'` after the title Enter (a software-rendered title frame takes ~1 s; the old fixed 600 ms passed only while `renderer.render()` happened to block the main thread).

### DEV menu (press ` or F2)
- `src/core/DevTools.js` + `src/ui/DevPanel.js` (DOM, styles in index.template.html) + pure `src/logic/devStats.js` (`FpsMeter`, `ErrorLog`, `formatCalc`; tests/devstats.test.js). Created by `Game`; it reads the Game and calls its public methods only.
- Shows: FPS (mean of the last 120 frames, worst frame), WebGL version, the GPU string (flags SwiftShader/llvmpipe as software rendering), pixel ratio, draw calls/triangles of the last render, scene (title flyover or game), simulation state (level, objective, hero HP/position, enemies alive/pending, perks, difficulty multipliers), the last 8 damage calculations, and the errors the game survived.
- Buttons: jump to level 1-4 (`Game.jumpToLevel`, full health), restart, full heal, +500 coins, kill all, god mode (sticky across levels: `world.godMode`, hits are still calculated and logged but not applied), and the difficulty step (restarts the level).
- Damage maths: `World.logCalc` keeps the last 40 calculations in `world.calcLog`, plain data (`hit`: base x damage mult x crit x (1 - armor) = dealt; `hurt`: raw x difficulty = applied). Cheap enough to be always on.
- Errors: `Game.frame` calls `tick` inside try/catch, so an exception in one frame is logged (console + panel) and the next frame still runs. DevTools also records `window` errors, unhandled rejections and `console.error/warn`; repeats are counted. The panel refreshes at most 4x a second.
- The panel stops key events so typing/clicking in it never moves or attacks the hero. It is not shown on any screen unless opened; there is no on-screen hint for the child.

### Winning: key and gate

- Defeat every enemy -> the **last enemy drops a golden key** where it fell (`keyDropped`) -> walk over it (`keyPicked`) -> the
  level's **locked gate** (`scenery.gate = {ix, iz, side}`, on the arena edge, two stone pillars either side) opens for a hero
  who holds the key -> walking into the gate cell wins (`levelCleared`). `world.objective` is 'fight' | 'key' | 'gate' | 'done'
  and drives the HUD text. A level with no gate is won the moment the last enemy falls (several tests rely on that).
- The gate is a door flagged `locked`: enemies never open it, a hero without the key never does either.
- **Health carries over and the game never resets it** (owner's rule, any difficulty; a first reading as "no carry-over" was wrong and has been undone). `Game.entryHealth` is the HP a level was entered with: a win passes the hero's current HP to the next level (`healthAfterWin`), **including the oasis (no free heal)**, a retry after a knock-out starts from the same entry health, never below 1 (`healthForRetry`, `src/logic/progress.js`), and only a fresh run (title, or the restart after the last level) starts full. Apples are the way back up. Risk to watch: a child who enters a level with very low HP and loses gets the same low HP on every retry; if that happens in play-testing, a retry floor is the obvious kindness rule (the earlier build had 50%, which the owner did not want). The DEV menu's jump/restart buttons start at full health (a testing shortcut).
- `Game`: a win goes to the next level (`LEVELS[levelIndex + 1]`, screen 'cleared'), or back to level 1 after the last
  (screen 'won'); a loss retries the same level. Levels differ in size freely (`MIN_ARENA`..`MAX_ARENA` in levels.js).
- Test bots must now walk to `world.key` then `world.gate` after the last kill (see `botInput` in tests, `FAST_FORWARD` in e2e).

### Economy: crits, coins, upgrades, shop

- **Hero hits** go through `World.damageEnemy(enemy, base, knockback)`: `base x perks.damageMult x (crit ? perks.critMult : 1) x (1 - enemy.armor)`.
  Base crit is `CONFIG.hero.crit` = 1% chance, 1.5x. The full amount counts even past the enemy's last hit point (`enemy.damageTaken`).
- **Coins:** a dying enemy drops one pile worth `round(damageTaken x (1 +- CONFIG.coins.spread))` (100 damage -> 90..110). Piles drift
  toward a nearby hero, are taken on contact, and anything left is swept into the wallet when the level is won. `world.coins` is the
  wallet; `Game.profile.coins` is copied from it when a level ends (**coins picked up are kept even after a knock-out**, our choice).
  Total payout levels 1-3 is about 1,700 coins by bot.
- **Upgrades** (`src/data/upgrades.js`, three tiers each, data only): sharper sword (+20% dmg), lucky charm (+4% crit chance),
  mighty crits (+0.25x), hearty soup (+20 max HP), juicy apples (+10% heal). `src/logic/profile.js` is pure and immutable:
  `buyUpgrade(profile, id)`, `perksOf(profile, config)` -> the numbers `World` uses (`options.perks`, `options.startCoins`).
  Prices (150..700) were set against the ~1,700 coins; you cannot afford everything on the first pass.
- **Profile persists** across levels, restarts and losses within a session (no save file yet).
- **Elite / boss:** `ENEMIES.bowmaster` (`elite: true`, `behavior: 'archer'`, armor 0.25, 320 HP, speed 1.9, `poise: 3` = hits it can
  take in one windup before it flinches, `look.scale` 1.45 but `radius` 0.48 because A* ignores body size). Archers stop at
  `attackRange`, telegraph, then `world.fireArrow()`; arrows (`world.projectiles`) fly straight, stop at SIGHT blockers, hurt the hero on
  contact (and pass through during the post-hit grace). A spawn entry with `finale: true` appears only `delay` seconds after every
  other enemy is dead, so the elite is always the last kill and drops the key.
- **Shop level** (`kind: 'shop'`): `scenery.shop = {desk, keeper}` inside a building; the desk blocks walking, the keeper is pure scenery
  (not an enemy, so invulnerable). `world.nearShop` (hero in `shopZone`) makes `Game` open `ui/ShopPanel` (click Buy or keys 1-5, Esc closes
  until you walk away and back). `scenery.gate.unlocked: true` = open gate, no key. `world.objective` is 'shop'. Entering the oasis
  does NOT restore health (health is never reset). The shop is the last level, so winning it shows the end screen and restarts at level 1 keeping coins/upgrades.

### Scenery, collision and doors

- `level.scenery` (all optional; `NO_SCENERY` is the empty default) = `{streams, bridges, buildings, trees, rocks, flowers}`.
  **Scenery is in CELL coordinates (ix, iz); enemies, apples and heroStart are in WORLD coordinates.** For the 26x18 arena:
  cell center x = ix - W/2 + 0.5, z = iz - D/2 + 0.5 (36x26 for level 1: x = ix - 17.5, z = iz - 12.5; cell ix spans world x [ix-18, ix-17)).
  Easy mistake: world x = 6 is the *edge* between cells, not a cell center. Put spawns at cell centers (…​.5).
- `Grid` has two flags per cell: MOVE (can't walk) and SIGHT (blocks attacks). Water blocks MOVE only (you can swing across a
  stream); trees, rocks and walls block both; closed doors block both; doors count as passable for path planning.
- Actors are circles resolved against cells (`resolveCircle`). Enemies steer with `world.nav.steer` (straight if the line is
  clear, else A* re-planned every 0.35 s), so they cross streams only on bridges. Enemy windups and hero swings require SIGHT.
- Doors open automatically within `CONFIG.doors.openRadius`, close `closeDelay` after nobody is near/inside. Put a door on the
  **south** wall: the west/east/north doors are hidden behind the roof from the fixed camera.
- A* ignores body size, so every actor radius must stay < 0.5 (1-cell gaps/doors); a test enforces it for enemies.
- **Terrain** (`scenery.terrain`, a list of `{ix, iz, w, d, h}` painted in order; h is a multiple of `STEP_HEIGHT` 0.75, max 3).
  Ledges and stairs are *derived* from the heights (`terrainClass`): a cell with a 4-neighbor lower by >= `LEDGE_DROP` (1.5) is
  a stone ledge (blocks walking, not attacks); a cell with both lower and higher neighbors is a stair; the rest is walkable top.
  So a 0.75 strip beside a 1.5 plateau is a stair, 1.5 -> 2.25 -> 3.0 strips climb a tier, and low 0.75/1.5 mounds are walkable
  all round. Gotcha: a stair cell whose side neighbor is meadow and which is 1.5+ high becomes a ledge; flank it with equal height.
  `Grid.heightAt(x, z)` is the ground height; the sim is 2D and ignores it. Views stand characters on `maxHeightNear` (the highest
  ground the body touches) so feet never sink into a step: up is instant, down glides.
- **Ponds and ruins** (level 3). `scenery.ponds` are rectangles of water treated exactly like streams everywhere (`waterRects`).
  `scenery.ruins = [{ix, iz, w, d, seed}]` is a broken temple generated by the pure `ruinPieces()`: corner pillars, a ring of
  1-2 block walls with some cells collapsed to walkable rubble, a gap in the middle of each side, four inner pillars when
  w,d >= 7. Walls/pillars block MOVE|SIGHT (`ruinSolidCells`). validateLevel: ruin >= 5x5, flat ground, off water/plants,
  open cells reachable, no tree 8-adjacent to the footprint. Rendered by `render/scenery/ruins.js` with swaying vines.
  The exit gate must still stand on level (height 0) ground, so level 3's gate is on the low ground north of the mountain.
- **Trees keep clear:** canopies spill ~0.4 into neighbor cells, so `validateLevel` keeps trees one empty cell from cottages and
  off cells next to ground more than one stair higher. Don't hand-place a tree beside a cottage or cliff.
- **Biomes** (`src/data/biomes.js`, level.biome): ground patch rules, tree species with weights, rock textures/shapes. Variant
  choice is a pure function of (cell, seed) in `src/logic/terrain.js`, so it is stable and testable. The renderer must have a
  builder for every id (a test checks). Wind (`windStrength(t, gain)`) drives flower sway (big), tree sway (small, gusts only) and falling leaves; each biome has
  `wind: {gain, treeSway}` (meadow 1/1, mountain 2.4/2.6 = gustier and trees lean much more). Mountain trees: pine, bare 'dead' tree, a little birch.
- `validateLevel()` checks arena size, reachability from heroStart (and of every walkable high-ground cell), door and gate
  placement, terrain heights, overlaps (tree/rock vs water/bridge/building/ledge) and bounds;
  it runs in a test for every level.
- The cottage roof and south wall fade to ~14% opacity while the hero is inside.

### Adding things

- **Weapon:** entry in `src/data/weapons.js` (+ a `behavior` in `weaponBehaviors.js` if it's a new kind). The sim test
  `data: every level validates, every weapon has a known behavior...` checks it automatically. Add a CharacterView mesh
  for it (see `createSword` in `src/render/blocky.js`).
- **Enemy:** numbers in `src/data/stats.json` (`enemies.<id>`), entry in `src/data/enemies.js` (`look` colors drive the model; `look.model` 'sun'/'rock' picks a special model in `render/mobs.js`). State machine lives in `src/sim/enemyAI.js` (`behavior`: chase default, 'archer', 'flare', 'sleeper').
- **Level:** entry in `src/data/levels.js`; `validateLevel()` catches out-of-bounds spawns and unknown enemy types. A spawn may be `{random: {spots, delay:[min,max]}}`.

## Design decisions (from the design conversation; don't relitigate without asking the owner)

- **Audience:** a 7-year-old. No punishing failure (losing costs nothing permanent), short fights, simple controls,
  readable feedback. Cartoon tone: defeated enemies get "knocked out" with a puff of stars, no blood.
- **Controls:** one move input + one attack button (hold to repeat). Gamepad should feel as good as keyboard. Mouse: left click = attack, right click = walk there (added at the owner's request).
- **One weapon per fight, chosen in the shop beforehand. No in-fight weapon switching.**
- **Auto-target:** attacks aim at the nearest enemy in reach (+ `autoAimExtra`). No manual aiming.
- **Camera:** fixed tilt (~54 deg), follows the hero, player cannot rotate it.
- **Apples:** pickups that heal 25% of max health, walked over (no button), spawn on a timer at fixed spots and sometimes drop
  from enemies. Only the hero can take them. An apple at full health stays on the ground. A shop upgrade can improve them (M3).
- **Hero customization (M3):** girl / boy / animal types, color tint, outfits and hats. Purely cosmetic, identical stats.
- **Art:** placeholder boxes + procedural 16x16 pixel textures now; her own drawings/pixel art swapped in during M5.
  Not a voxel engine: no destructible terrain.

## Milestones

- **M1 (DONE): playable fight.** One arena, blocky hero + sword with auto-target, grunt enemies with a telegraphed attack
  (windup, stagger when hit during windup), health bars, apples, HUD, title/win/lose screens, 3 spawn waves.
- **M2: remaining weapons** (selected before the fight; data resources):

  | Weapon | Feel |
  |---|---|
  | Sword (done) | Balanced, short arc, quick |
  | Shin-kai daggers (her name) | Very fast, double hit, low damage per hit |
  | Mjolnir-style hammer (her name) | Slow wind-up, big area slam, knockback, shockwave ring + screen shake |
  | Toy gun | Medium range, straight shots, steady damage |
  | Toy sniper | Long range, slow fire rate, high damage, visible aim line |

  Guns need a projectile system in the sim (new behavior + entity list in `World`, `projectileHit` events). The toy guns fire
  foam darts / bright bolts, nothing lethal-looking.
- **M3: shop + character creator + save.** (Started: upgrade shop + coins are in; weapon choice, cosmetics and save are not.) Walkable 3D shop room with a shopkeeper; weapon choice and upgrade tiers (3 per
  weapon), apple upgrades, cosmetics, coins. Save file in `localStorage` (wrap every access in try/catch; works reliably from a
  downloaded local copy, less so from a shared link). Introduce a `Save` module in `src/core/`; keep it pure + testable.
- **M4: five levels**, each with its own layout, enemy mix and boss; levels favor different weapons (fast rushers -> daggers,
  tough stationary boss -> sniper, crowd of weak enemies -> hammer) with an icon hint on a level-select screen. Enemy types:
  fast, tanky, ranged. Keep AI a simple state machine.
- **M5: polish.** Textures/her artwork, hit flashes, sound, music, title screen, difficulty tuning from watching her play.

Scope guard: five levels, five weapons, three upgrade tiers until the whole thing is finished. New stuff goes in a "version 2" list.

## Known gaps and honest caveats

- **Difficulty is untuned against a real child.** Headless bots say level 1 is easy: a perfect bot takes ~0 damage
  (hitting an enemy staggers it; stagger 0.4 s < windup 0.45 s), and a 60-seed sweep of a "distracted" bot (re-decides every
  150-500 ms, wanders 10-60% of the time) won 60/60 at every skill level, finishing with 80-97 HP in ~33-35 s. Those bots are
  throwaway scripts, not a model of a 7-year-old. Expect to tune after watching her play. Apples barely matter at level 1.
- Hero reach and enemy attack range are both edge-to-edge (both radii counted; covered by a boundary test). Auto-aim target
  selection (`nearestTarget`) is center-to-center by design.
- The fight auto-pauses when the window loses focus or is hidden (`Game.paused`). There is no pause key.
- After a win/lose, "confirm" is ignored for 800 ms so mashing Space (attack AND confirm) can't skip the screen.
- The camera clamp in `Stage.setArena` is tuned for a wide window; at a portrait/near-square aspect the hero near the arena
  edge may leave the screen. Unverified.
- Playwright e2e (`tools/e2e_check.py`) fast-forwards the sim via `window.__ffl`; it proves state transitions and zero console
  errors, not rendering quality or real-time feel. `dist/` and the screenshots it writes are build artifacts.
- Visuals were checked via headless Chrome with software WebGL (low FPS, so animation timing was not judged). Real GPU
  look/feel, shadows and performance are unverified.
- Gamepad support is written against the standard mapping and has not been tried on real hardware.
- No audio yet. No save file (coins/upgrades last for the session). Only the sword exists, so there is no weapon choice in the shop yet.
- The elite fight and the whole economy are tuned only against scripted bots (a bot that never dodges loses ~55 HP to the elite;
  coins per level ~400-900). Real-player feel, price balance and the shop UX with a child are untested. Software-WebGL screenshots only.
- The shop is mouse/keyboard only (click Buy or keys 1-5); a gamepad cannot use it yet. `validateLevel` does not check that `shopZone` lies inside the shop building.
- The elite's hit circle (radius 0.48) is smaller than his 1.45x model, so you must stand partly inside his drawing to hit him.
- Path planning is A* with a binary heap (fine at 128x128 in tests), re-planned every 0.35 s per detouring enemy; a 128x128 level
  with dozens of enemies has not been run in a real browser.
- Scenery was checked by screenshots in software WebGL only (~470 draw calls, ~33k triangles on level 1; real GPU perf unverified).
  Hills are 1.5 high with the camera at ~54 deg, so a hill hides about one block of ground north of it.
  Tree canopies can briefly hide the hero from the camera; no see-through fade for trees yet.
- Level 3 was only checked by a scripted bot (wins, validator clean) and by screenshots in software WebGL; wind/vine motion and how it
  feels were not judged in real time. Ground texture 'alpine/gravel/snow' colors are by eye.
- Level 1 difficulty numbers above predate the scenery AND the 36x26 map (bot now: 100 HP left, ~36 s, 25/25 wins; that is only a bot).
- Window-blur resets held keys (and pauses); the Input/Game/view layer has no unit tests, only the e2e script.
- Test coverage gaps: simultaneous hero death + last-enemy kill, `damageHero` after the fight ends, view-layer disposal on
  repeated restarts.
- The camera clamp (`Stage.setArena`) assumes arenas at least ~18x10; smaller arenas need the clamp revisited.

- Barchernarcher/Neelysomnaly balance was tuned only by bots: a never-dodging bot starting level 3 at full health wins 20/20 at Normal and ends
  with ~28 HP (the boss alone costs it ~56). Each level now starts at full health, so the L3 number is for a fresh hero.
- The Barchernarcher spark burst, the sun-head model and the ZzzZz sprites were only seen in software-WebGL screenshots (no animation timing judged).
- A rock is a finite one-time coin source (about 5 x 200 HP worth, by the owner's "regular mechanics" rule) and can be killed from the sword's
  2-block reach without ever touching it.
- Character selection, name editing, boy/animal heroes, cosmetics and saving are not built (name tag + `profile.hero` are the hooks).

## Handoff checklist (Claude Code)

1. `npm install && npm test` (expect ~139 passing), `npm run build`, open `dist/fighting-for-life.html`.
2. `python3 -I tools/e2e_check.py` (needs Playwright + Chrome) for the browser flow: 4 levels, shop buy, restart, retry.
3. Tune numbers in `src/data/stats.json` only; run `npm run stats` to see them all.
4. Next on the roadmap: M2 weapons (dagger/hammer/toy gun/sniper), M3 character selection (name entry -> `withHeroName`) + save file, M4 levels 4-5 content, M5 polish.
5. Keep this file current: update it in the same change as any rule/architecture change.

## Working with the owner (Derek)

- Wants claims verified against source (run it, show real numbers) rather than asserted. He prefers exact before/after diffs
  for edits and layered review of work before it ships. Do not pad with reassurance; be direct about what is unverified.
- He is technical (SQL-strong, working familiarity with C/C#/HTML/JS), so explain decisions briefly and let him edit data files.
- Git: the repo was not initialized at handoff. If you commit, `dist/` and `node_modules/` are already in `.gitignore`.
