"""Real-browser smoke test: title -> level 1 (key + gate) -> level 2 (portrait, health carried) -> level 3 (mountain, elite) -> oasis shop (healed, buy an upgrade, open gate) -> win screen -> restart (full health, upgrades and coins kept) -> lose -> retry, with screenshots.

Needs: python playwright and google-chrome. Build first (npm run build).
Usage: python3 -I tools/e2e_check.py [screenshot_dir]
Software WebGL is slow, so the script fast-forwards the sim through window.__ffl instead of
waiting in real time. It checks state transitions and console errors, not frame-rate or feel.
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "fighting-for-life.html").as_uri()
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "e2e"
OUT.mkdir(parents=True, exist_ok=True)

FAST_FORWARD = """(mode) => {
  const w = window.__ffl.world;
  const steer = (h, t) => { const d = w.nav.steer(h, t, 1 / 60); return { moveX: d.x, moveZ: d.z }; };
  for (let i = 0; i < 60 * 240 && w.state === 'playing'; i++) {
    let input = { moveX: 0, moveZ: 0, attack: false };
    if (mode === 'win') {
      const h = w.hero;
      const goal = w.key ?? (w.objective === 'gate' || w.objective === 'shop' ? w.gate : null);   // after the last enemy: key, then gate
      // Like a sensible player: walk around the sleeping rocks (optional enemies), never into them.
      const around = (m) => {
        let { moveX: x, moveZ: z } = m;
        for (const r of w.activeEnemies()) {
          if (!r.def.optional) continue;
          const dx = r.x - h.x, dz = r.z - h.z, d = Math.hypot(dx, dz) || 1;
          const ahead = (x * dx + z * dz) / d;
          if (d > 2.2 || ahead < 0.3) continue;
          let px = -dz / d, pz = dx / d;
          if (x * px + z * pz < 0) { px = -px; pz = -pz; }
          x += px * ahead * 1.5; z += pz * ahead * 1.5;
        }
        const l = Math.hypot(x, z) || 1;
        return { moveX: x / l, moveZ: z / l };
      };
      if (goal) input = { ...around(steer(h, goal)), attack: false };
      else {
        let best = null, bd = Infinity;
        for (const e of w.activeEnemies()) { if (e.def.optional) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { best = e; bd = d; } }
        if (best) input = { ...(bd > 1.6 ? around(steer(h, best)) : { moveX: 0, moveZ: 0 }), attack: true };
        else {
          const rock = w.activeEnemies().find((e) => e.def.optional && Math.hypot(e.x - h.x, e.z - h.z) < 2.5);
          if (rock) { const d = Math.hypot(h.x - rock.x, h.z - rock.z) || 1; input = { moveX: (h.x - rock.x) / d, moveZ: (h.z - rock.z) / d, attack: false }; }
        }
      }
    }
    w.step(1 / 60, input);
  }
  return w.state;
}"""

async def play(page, mode, tag):
    final = await page.evaluate(FAST_FORWARD, mode)
    await page.wait_for_timeout(1200)
    info = await page.evaluate("""() => ({ gameState: window.__ffl.state,
      level: window.__ffl.world.level.id,
      arena: window.__ffl.world.level.arena,
      heading: document.querySelector('#screen h1')?.textContent,
      hp: window.__ffl.world.hero.health.current,
      hasKey: window.__ffl.world.hasKey })""")
    await page.screenshot(path=str(OUT / f"{tag}.png"))
    return {"world": final, **info}

async def confirm(page):
    await page.wait_for_timeout(1000)   # past the end-screen lockout
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = await browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(URL)
        await page.wait_for_timeout(1200)
        await page.keyboard.press("Enter")                       # title -> level 1
        # Wait for the fight, do not guess: a software-rendered title frame takes ~1 s, and the old fixed 600 ms only worked
        # while renderer.render() happened to block the main thread until the GPU process caught up.
        await page.wait_for_function("() => window.__ffl.state === 'playing' && window.__ffl.world", timeout=30000)
        await page.wait_for_timeout(600)
        result = {"level1": await play(page, "win", "level1_cleared")}
        # Health carries over and is never reset: pretend the hero finished level 1 with 60 HP and check level 2 starts with exactly that.
        await page.evaluate("() => { window.__ffl.world.hero.health.current = 60; }")
        await confirm(page)                                      # level 1 cleared -> level 2 (different shape)
        result["level2_started"] = await page.evaluate("() => ({ level: window.__ffl.world.level.id, arena: window.__ffl.world.level.arena, state: window.__ffl.state, hp: window.__ffl.world.hero.health.current })")
        await page.screenshot(path=str(OUT / "level2_start.png"))
        result["level2"] = await play(page, "win", "level2_cleared")
        await confirm(page)                                      # level 2 cleared -> level 3 (mountain)
        result["level3_started"] = await page.evaluate("() => ({ level: window.__ffl.world.level.id, arena: window.__ffl.world.level.arena, state: window.__ffl.state, hp: window.__ffl.world.hero.health.current })")
        await page.screenshot(path=str(OUT / "level3_start.png"))
        await page.evaluate("() => { const h = window.__ffl.world.hero.health; h.max = 5000; h.current = 5000; }")   # this scripted bot never dodges and fights the rocks' neighbours badly; the e2e proves the level FLOW, balance is measured by tests/sim bots
        result["level3"] = await play(page, "win", "level3_cleared")
        result["coins_after_level3"] = await page.evaluate("() => ({ wallet: window.__ffl.world.coins, profile: window.__ffl.profile.coins })")
        await page.evaluate("() => { window.__ffl.world.hero.health.current = 30; }")   # the oasis must NOT heal this: health is never reset
        await confirm(page)                                      # level 3 cleared -> the oasis shop
        result["level4_started"] = await page.evaluate("() => ({ level: window.__ffl.world.level.id, kind: window.__ffl.world.level.kind, arena: window.__ffl.world.level.arena, state: window.__ffl.state, hp: window.__ffl.world.hero.health.current, coins: window.__ffl.world.coins })")
        await page.evaluate("() => { const w = window.__ffl.world; w.hero.x = 0; w.hero.z = -4; }")   # stand at the desk
        await page.wait_for_function("() => !document.getElementById('shop').hidden && window.__ffl.world.nearShop", timeout=45000)   # software rendering is slow: wait for the panel, do not guess
        await page.wait_for_timeout(300)
        result["shop_open"] = await page.evaluate("() => ({ visible: !document.getElementById('shop').hidden, near: window.__ffl.world.nearShop })")
        await page.screenshot(path=str(OUT / "shop_open.png"))
        await page.keyboard.press("2")                           # buy Lucky Charm tier 1 (150 coins)
        await page.wait_for_timeout(300)
        result["shop_bought"] = await page.evaluate("() => ({ coins: window.__ffl.world.coins, tiers: window.__ffl.profile.tiers, crit: window.__ffl.world.perks.critChance })")
        await page.screenshot(path=str(OUT / "shop_bought.png"))
        result["level4"] = await play(page, "win", "level4_cleared")   # walk out through the open gate
        await confirm(page)                                      # last level cleared -> back to level 1, full health, upgrades kept
        result["restart"] = await page.evaluate("() => ({ level: window.__ffl.world.level.id, state: window.__ffl.state, hp: window.__ffl.world.hero.health.current, crit: window.__ffl.world.perks.critChance, coins: window.__ffl.world.coins })")
        result["lose"] = await play(page, "idle", "lose")
        await confirm(page)                                      # lost -> retry the same level from the health it was entered with
        result["retry"] = await page.evaluate("() => ({ level: window.__ffl.world.level.id, state: window.__ffl.state, hp: window.__ffl.world.hero.health.current })")
        # DEV menu: ` opens it, it shows FPS + GPU + calculations, a level button jumps there at full health, cheats work.
        await page.keyboard.press("Backquote")
        await page.wait_for_timeout(700)
        await page.click("#dev .dev-row button:text-is('3')")
        await page.wait_for_timeout(900)
        await page.evaluate("() => { const w = window.__ffl.world; let e = null; for (let i = 0; i < 60 * 30 && !e; i++) { w.step(1 / 60, { moveX: 0, moveZ: 0, attack: false }); e = w.activeEnemies().find((x) => !x.def.optional); } if (e) w.damageEnemy(e, 20, 0); }")
        await page.wait_for_function("() => document.getElementById('dev').innerText.includes('hero -> ')", timeout=45000)   # the panel refreshes at most every 0.25 s of game time, and software rendering is slow
        result["dev"] = await page.evaluate("""() => ({ visible: !document.getElementById('dev').hidden, level: window.__ffl.world.level.id, hp: window.__ffl.world.hero.health.current,
          text: document.getElementById('dev').innerText })""")
        await page.screenshot(path=str(OUT / "dev_menu.png"))
        await browser.close()
    r = result
    c3 = r["coins_after_level3"]
    ok = (r["level1"]["gameState"] == "won" and r["level1"]["heading"] == "LEVEL CLEAR!" and r["level1"]["hasKey"]
          and r["level2_started"] == {"level": 2, "arena": {"width": 24, "depth": 36}, "state": "playing", "hp": 60}
          and r["level2"]["gameState"] == "won" and r["level2"]["heading"] == "LEVEL CLEAR!"
          and r["level3_started"]["level"] == 3 and r["level3_started"]["arena"] == {"width": 40, "depth": 32}
          and r["level3_started"]["hp"] == r["level2"]["hp"]
          and r["level3"]["gameState"] == "won" and r["level3"]["heading"] == "LEVEL CLEAR!"
          and c3["wallet"] > 1000 and c3["wallet"] == c3["profile"]
          and r["level4_started"]["kind"] == "shop" and r["level4_started"]["arena"] == {"width": 18, "depth": 24}
          and r["level4_started"]["hp"] == 30 and r["level4_started"]["coins"] == c3["wallet"]
          and r["shop_open"] == {"visible": True, "near": True}
          and r["shop_bought"]["coins"] == c3["wallet"] - 150 and r["shop_bought"]["tiers"] == {"luck": 1}
          and abs(r["shop_bought"]["crit"] - 0.05) < 1e-9
          and r["level4"]["gameState"] == "won" and r["level4"]["heading"] == "YOU WIN!"
          and r["restart"]["level"] == 1 and r["restart"]["state"] == "playing" and r["restart"]["hp"] == 100
          and abs(r["restart"]["crit"] - 0.05) < 1e-9 and r["restart"]["coins"] == c3["wallet"] - 150
          and r["lose"]["gameState"] == "lost"
          and r["retry"]["level"] == 1 and r["retry"]["state"] == "playing" and r["retry"]["hp"] >= 1
          and r["dev"]["visible"] and r["dev"]["level"] == 3 and r["dev"]["hp"] == 100
          and "FPS" in r["dev"]["text"] and "GPU" in r["dev"]["text"] and "hero -> " in r["dev"]["text"]
          and not errors)
    print(json.dumps({**result, "errors": errors, "ok": ok}, indent=1))
    sys.exit(0 if ok else 1)

asyncio.run(main())
