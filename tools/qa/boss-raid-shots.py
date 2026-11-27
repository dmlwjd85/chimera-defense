import json, sys, time, os
sys.path.insert(0, '/workspace/cd-dot/skillfx-qa')
from playwright.sync_api import sync_playwright
from common import open_page
def start_gauntlet(pg, stage):
    pg.evaluate("""(stage) => { const g = window.__game; const s = g.registry.get('save'); s.tutorialDone = true;
      g.scene.getScenes(true).forEach(x => g.scene.stop(x.scene.key)); g.scene.start('Gauntlet', { stageId: stage, hard: false }); }""", stage)
    pg.wait_for_function("window.__gauntlet && window.__gauntlet.state && typeof window.__gauntlet.jump === 'function'", timeout=180000)
    time.sleep(2)
OUT = '/workspace/cd-dot/wt-boss-raid/docs/pr-shots/boss-raid'
os.makedirs(OUT, exist_ok=True)
raid = json.load(open('/workspace/cd-dot/wt-boss-raid/public/data/raid.json'))
stages = {s['boss']: s['id'] for s in json.load(open('/workspace/cd-dot/wt-boss-raid/public/data/stages.json'))['stages'] if s.get('boss')} if isinstance(json.load(open('/workspace/cd-dot/wt-boss-raid/public/data/stages.json')), dict) else {s['boss']: s['id'] for s in json.load(open('/workspace/cd-dot/wt-boss-raid/public/data/stages.json')) if s.get('boss')}
only = sys.argv[1:]
FORCE = """(pid) => { const sc = window.__game.scene.getScene('Gauntlet'); const s = sc.state;
  const e = s.enemies.find(x => x.raid && !x.raid.minion && x.hp > 0 && x.id === s.stage.boss); if (!e) return 'noboss';
  const p = e.raid.def.patterns.find(q => q.id === pid);
  e.raid.phase = Math.max(e.raid.phase, (p.phase ?? 1) - 1); e.raid.cast = null; e.raid.shield = null; e.raid.armor = null; e.raid.hide = 0;
  s.raidMarks = []; s.raidBusyUntil = 0; s.bossWarn = null; e.stunLeft = 0; s.raidZones = []; s.raidBlizzard = null;
  for (const k in e.raid.pats) e.raid.pats[k].t = 99; e.raid.pats[pid].t = 0;
  e.hp = Math.max(e.hp, e.maxHp * 0.3); for (const u of s.field) { if (!u.down) u.hp = u.maxHp; }
  return 'ok'; }"""
KEEP = """() => { const s = window.__game.scene.getScene('Gauntlet').state; for (const u of s.field) if (!u.down) u.hp = u.maxHp; const e = s.enemies.find(x => x.id === s.stage.boss); if (e) e.hp = Math.max(e.hp, e.maxHp * 0.3); }"""
with sync_playwright() as p:
    b, pg, logs = open_page(p, 'http://localhost:4180/')
    pg.set_default_timeout(180000)
    for boss, R in raid['bosses'].items():
        if boss not in stages or (only and boss not in only): continue
        st = stages[boss]
        start_gauntlet(pg, st)
        n = pg.evaluate("() => window.__gauntlet.state.plan.length - 1")
        pg.evaluate(f"() => window.__gauntlet.jump({n})")
        time.sleep(2.5)
        pg.evaluate("""() => { const sc = window.__game.scene.getScene('Gauntlet'); const s = sc.state; const t0 = s.time; let g = 0;
          while (s.time - t0 < 3.5 && g++ < 600) { for (const u of s.field) if (!u.down) u.hp = u.maxHp; try { sc.update(performance.now(), 100); } catch (err) { s.time += 0.06; } } }""")
        for pat in R.get('patterns', []):
            pid = pat['id']
            r = pg.evaluate(FORCE, pid)
            # 렌더가 느려서 로직 시계를 직접 앞으로(장면 update를 0.1초씩 불러 줌) — 예고가 뜬 순간까지
            target = {'cast': 0.9, 'mark': 0.9, 'zone': 0.6, 'summon': 0.6}.get(pat['kind'], 0.5)
            pg.evaluate("""(target) => { const sc = window.__game.scene.getScene('Gauntlet'); const s = sc.state; const t0 = s.time; let g = 0;
              while (s.time - t0 < target && g++ < 400) { for (const u of s.field) if (!u.down) u.hp = u.maxHp; try { sc.update(performance.now(), 100); } catch (err) { s.time += 0.06; } } return s.time - t0; }""", target)
            time.sleep(2.5)
            path = f"{OUT}/{st}_{boss}_{pid}.png"
            pg.screenshot(path=path)
            print(st, boss, pid, pat['kind'], r, path, flush=True)
    print('\n'.join(logs[:20]))
    b.close()
