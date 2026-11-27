# 전후 그림: 같은 장면(회복 줄기·흡혈·보호막 막음·버프)을 이 PR 전/후 화면에서 찍음. 게임 시계를 손으로 넘겨 같은 순간에 찍음
# 사용: python3 shots.py <url> <outdir> <tag(before|after)> [scenario...]
import sys, time, os, json
sys.path.insert(0, '/workspace/cd-dot/skillfx-qa')
from playwright.sync_api import sync_playwright
from common import open_page, start_gauntlet
url, out, tag = sys.argv[1], sys.argv[2], sys.argv[3]
only = sys.argv[4:]
os.makedirs(out, exist_ok=True)
SC = [
  # 이름, 스테이지, 교전, 준비(JS), 신호(JS: ev → bool), 신호 뒤 ms, 최대 초
  ('heal', 'forest-1', 6, '', "(ev.type === 'echeer' || ev.type === 'eheal') && sc.state.time > 4", 330, 40),
  ('drain', 'forest-1', 2, "TIGER", "ev.type === 'act' && ev.side === 'u' && ev.style === 'skirm' && window.__rose(ev.uid)", 520, 70),
  ('block', 'stage-4', 7, "for (const u of s.field) if (u) { u.stats.hp *= 4; }", "ev.type === 'bossSlam'", 200, 60),
  ('buff', 'forest-1', 3, "WOLF", "ev.type === 'act' && ev.action === 'allyBuff'", 1000, 40),
]
def advance(pg, ms):
    pg.evaluate("""(ms) => { const g = window.__game; let t = window.__t ?? performance.now(); const n = Math.max(1, Math.round(ms / 16.667)); for (let i = 0; i < n; i++) { t += 16.667; g.step(t, 16.667); } window.__t = t; }""", ms)
def shot(pg, path):
    for k in range(3):
        try: pg.screenshot(path=path, type='png', timeout=60000); return
        except Exception as e: print('retry', k, str(e)[:80], flush=True)
res = {}
with sync_playwright() as p:
    for (name, stage, enc, prep, trig, after, maxs) in SC:
        if only and name not in only: continue
        b, pg, logs = open_page(p, url)
        start_gauntlet(pg, stage)
        if prep in ('WOLF', 'TIGER'):
            sp = 'wolf' if prep == 'WOLF' else 'tiger'
            pg.evaluate("""async (sp) => { const G = window.__gauntlet, s = G.state, D = G.data; const st = await import('/src/logic/stats.js');
              const uid = sp === 'wolf' ? 1 : (s.field.find(x => x && x.speciesId === 'fox') ?? s.field.find(x => x && x.uid === 2)).uid;
              const u = s.field.find(x => x && x.uid === uid); Object.assign(u, { kind: 'base', speciesId: sp, stage: 'spirit', parts: null }); if (sp === 'tiger') u.tactic = 'help';
              u.stats = st.unitStats({ kind: 'base', speciesId: sp, stage: 'spirit', parts: null, traits: u.traits ?? [] }, D); u.maxHp = u.stats.hp; u.hp = u.maxHp; G.rigs?.queue?.([sp]); }""", sp)
            time.sleep(1.2)
        elif prep:
            pg.evaluate("() => { const s = window.__gauntlet.state; " + prep + " }")
        pg.evaluate("(n) => window.__gauntlet.jump(n)", enc)
        time.sleep(2.2)
        if name == 'drain':
            print(pg.evaluate("() => { const s = window.__gauntlet.state; if (!(s.relics ?? []).includes('vamp_fang')) s.relics = [...(s.relics ?? []), 'vamp_fang']; for (const u of s.field) if (u) u.hp = u.maxHp * 0.45; return JSON.stringify([s.relics, s.field.filter(Boolean).map((u) => u.speciesId)]); }"), flush=True)
        pg.evaluate("() => { window.__game.loop.sleep(); window.__t = performance.now(); }")
        pg.evaluate("""(trig) => { const sc = window.__gauntlet.scene; window.__hit = null; window.__tapped = false; const f = new Function('ev', 'sc', 'return ' + trig); window.__prev = {}; window.__rose = (uid) => { const u = sc.state.field.find((x) => x && x.uid === uid); return u && window.__prev[uid] !== undefined && u.hp > window.__prev[uid] + 0.5; };
          const od = sc.drain.bind(sc); sc.drain = () => { for (const ev of sc.state.events) { try { if (!window.__hit && f(ev, sc)) window.__hit = { type: ev.type, t: sc.state.time }; } catch {} if (ev.type === 'bossWarn') window.__warn = true; } const r = od(); for (const u of sc.state.field) if (u) window.__prev[u.uid] = u.hp; return r; }; }""", trig)
        hit = None; waited = 0
        while waited < maxs * 1000:
            advance(pg, 50); waited += 50
            if pg.evaluate("() => window.__warn && !window.__tapped"):
                pg.evaluate("""async () => { const g = await import('/src/logic/gauntlet.js'); const s = window.__gauntlet.state; for (const u of s.field) if (u && !u.down && !u.resting) g.tapShield(s, u.uid); window.__tapped = true; }""")
            hit = pg.evaluate("() => window.__hit")
            if hit or pg.evaluate("() => window.__gauntlet.state.phase") != 'fight': break
        if not hit: print(name, 'no trigger', flush=True); b.close(); continue
        advance(pg, after)
        path = f'{out}/{tag}_{name}.png'
        shot(pg, path)
        res[name] = dict(hit=hit, errors=[l for l in logs if 'error' in l][:5])
        print(name, hit, 'errors', len(res[name]['errors']), flush=True)
        b.close()
json.dump(res, open(f'{out}/{tag}_meta.json', 'w'), ensure_ascii=False)
