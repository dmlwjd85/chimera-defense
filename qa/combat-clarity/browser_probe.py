# 실제 게임 화면(머리 없는 브라우저)에서 교전 하나를 돌리며: 화면에 뜬 피해 숫자(dmgNumber·skfx.number)와 회복 표시, 체력바가 바뀐 시각을 기록
# 사용: python3 browser_probe.py <url> <out.json> [stage] [enc] [seconds]
import sys, json, time
sys.path.insert(0, '/workspace/cd-dot/skillfx-qa')
from playwright.sync_api import sync_playwright
from common import open_page, start_gauntlet
url, out = sys.argv[1], sys.argv[2]
stage = sys.argv[3] if len(sys.argv) > 3 else 'forest-1'
enc = int(sys.argv[4]) if len(sys.argv) > 4 else 0
secs = float(sys.argv[5]) if len(sys.argv) > 5 else 30
with sync_playwright() as p:
    b, pg, logs = open_page(p, url)
    start_gauntlet(pg, stage)
    pg.evaluate("(n) => window.__gauntlet.jump(n)", enc)
    time.sleep(2.0)
    pg.evaluate("""() => { const sc = window.__gauntlet.scene; const R = window.__rec = { shown: [], heal: [], hp: [], ev: [] };
      const now = () => sc.state.time;
      const near = (x, y) => { let best = null, bd = 1e9; for (const [id, v] of sc.uViews) { const d = Math.hypot(v.c.x - x, v.c.y - 90 - y); if (d < bd) { bd = d; best = 'u' + id; } } for (const [id, v] of sc.eViews) { const d = Math.hypot(v.c.x - x, v.c.y - 90 - y); if (d < bd) { bd = d; best = 'e' + id; } } return best; };
      const dn = sc.dmgNumber.bind(sc); sc.dmgNumber = (x, y, d, h) => { R.shown.push({ t: now(), who: near(x, y), d: Math.round(d), heavy: !!h, via: 'dmgNumber' }); return dn(x, y, d, h); };
      if (sc.skfx?.number) { const sn = sc.skfx.number.bind(sc.skfx); sc.skfx.number = (x, y, d, plan) => { R.shown.push({ t: now(), who: near(x, y), d: Math.round(d), via: 'skfx' }); return sn(x, y, d, plan); }; }
      if (sc.clar) { const sh = sc.clar.show.bind(sc.clar); R.rows = []; sc.clar.show = (r, o) => { R.rows.push({ t: now(), key: r.side ? r.side + r.id : null, d: r.d, kind: r.kind, blocked: r.blocked ?? 0 }); return sh(r, o); }; const tx = sc.clar.text.bind(sc.clar); R.texts = []; sc.clar.text = (k, txt, c, sz, big, dx) => { R.texts.push({ t: now(), key: k, txt, c }); return tx(k, txt, c, sz, big, dx); }; }
      const fh = sc.fx.heal.bind(sc.fx); sc.fx.heal = (x, y) => { R.heal.push({ t: now(), who: near(x, y + 90) }); return fh(x, y); };
      const od = sc.drain.bind(sc); sc.drain = () => { for (const ev of sc.state.events) R.ev.push({ t: now(), type: ev.type, side: ev.side, uid: ev.uid, eid: ev.eid, dmg: ev.dmg, hits: ev.hits, to: ev.to }); return od(); };
      sc.events.on('postupdate', () => { const s = sc.state; if (s?.phase === 'fight') { const row = { t: now() }; for (const u of s.field) if (u) row['u' + u.uid] = Math.round(u.hp * 10) / 10; for (const e of s.enemies) row['e' + e.eid] = Math.round(e.hp * 10) / 10; R.hp.push(row); } });
    }""")
    t0 = time.time()
    while time.time() - t0 < secs:
        time.sleep(1)
        if pg.evaluate("() => window.__gauntlet.state.phase") != 'fight': break
    rec = pg.evaluate("() => window.__rec")
    rec['names'] = pg.evaluate("() => { const s = window.__gauntlet.state; const o = {}; for (const u of s.field) if (u) o['u' + u.uid] = u.stats.name; for (const e of s.enemies) o['e' + e.eid] = e.name; return o; }")
    rec['errors'] = logs
    json.dump(rec, open(out, 'w'), ensure_ascii=False)
    print('frames', len(rec['hp']), 'shown', len(rec['shown']), 'heal', len(rec['heal']), 'errors', len([l for l in logs if 'error' in l]))
    b.close()
