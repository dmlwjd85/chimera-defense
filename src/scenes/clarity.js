// 전투 알아보기 쉽게(2026-11-27 선생님 "데미지가 들어가는게 직관적이지가 않은데… 막 회복도 되는데 이해가 안돼.
//  전투 흐름에 누가 어떤 공격 서포트 회복 마법을 해서 그렇게 되는건지 이펙트로 직관적으로 연결시켜줘").
// 규칙(logic/gauntlet.js)의 체력 장부(state.hpLog)만 보고 그림:
//  ① 숫자 = 실제 줄어든·찬 체력. 막힌 양은 파란 '막음', 회복은 초록 '+', 치명·상성 유리는 따로. 독·불·재생은 묶어서
//  ② 체력바: 줄어든 만큼 흰→빨간 잔상이 천천히 빠짐, 회복은 초록으로 차오름, 보호막은 바 위에 파란 줄.
//     한 동작(공격·기술)의 변화는 '맞는 순간'(release)까지 바에도 숫자에도 안 보임 → 바와 숫자가 같이 움직임
//  ③ 연결: 회복 초록 · 버프 금빛 · 디버프/마법 보라 · 흡혈 빨강(대상 → 시전자) 빛줄기. 시전자는 잠깐 빛나고 작은 이름 말풍선
//  ④ 머리 위 작은 아이콘 + 남은 초(보호막·버프·독·불·둔화·저주)
// 값은 public/data/combatfx.json, 글자는 text.json clarity.*
import { FONT, makeT } from '../text.js';

const num = (v, d) => (typeof v === 'string' ? parseInt(v, 16) : v ?? d);
const STATUS_KINDS = new Set(['buff', 'debuff']);

export class CombatClarity {
  constructor(scene, cfg, dict) {
    this.sc = scene; this.cfg = cfg ?? {}; this.T = makeT(dict ?? {});
    this.lastN = 0; this.holds = new Map(); this.merge = new Map(); this.nums = []; this.stack = new Map();
    this.beams = []; this.g = scene.add.graphics().setDepth(1650); this.bubbleAt = new Map(); this.lastPos = new Map();
    this.iconT = 0;
  }
  C(k, d) { return this.cfg.colors?.[k] ?? d; }
  N(k, d) { return this.cfg.number?.[k] ?? d; }

  /** 새 교전: 장부 읽은 곳을 지금으로, 묶어 둔 것 비움 */
  reset() {
    const s = this.sc.state; this.lastN = s?.hpN ?? 0; this.holds.clear(); this.merge.clear(); this.stack.clear();
  }

  // ---------- 동작 묶기: 이벤트가 오면 그 동작 번호(seq)의 변화를 잡아 둠 ----------
  onEvent(ev) {
    if (ev?.seq == null) return;
    const H = this.cfg.hold ?? {};
    const ms = ev.type === 'act' ? H.act ?? 3000 : H[ev.type];
    if (!ms) return;
    const h = this.holds.get(ev.seq) ?? { rows: [], opts: null };
    h.until = Math.max(h.until ?? 0, this.sc.time.now + ms);
    if (ev.type !== 'act') h.auto = true;   // 정해진 시간 뒤 저절로(막아서기·지형 등)
    this.holds.set(ev.seq, h);
  }
  /** 맞는 순간: 묶어 둔 변화(숫자·바·연결)를 한꺼번에. opts.plan이면 신화급·키메라 숫자 모양 */
  release(seq, opts = null) {
    if (seq == null) return;
    const h = this.holds.get(seq);
    if (!h) return;
    this.holds.delete(seq);
    for (const r of h.rows) this.show(r, opts);
  }
  /** 장부에서 새 줄 읽기(이벤트 처리 뒤에 부름) */
  pull() {
    const s = this.sc.state; if (!s?.hpLog) return;
    for (const r of s.hpLog) {
      if (r.n <= this.lastN) continue;
      this.lastN = r.n;
      const h = r.seq != null ? this.holds.get(r.seq) : null;
      if (h) h.rows.push(r); else this.show(r, null);
    }
  }
  /** 아직 화면에 안 보인(묶인) 체력 변화 합: 바는 실제 체력 − 이 값 */
  pending(key) {
    let p = 0;
    for (const h of this.holds.values()) for (const r of h.rows) if (r.side && r.side + r.id === key) p += r.d;
    return p;
  }
  update() {
    const now = this.sc.time.now;
    for (const [seq, h] of this.holds) if (now >= h.until) this.release(seq);
    for (const [k, m] of this.merge) if (now >= m.until && !m.pendingOnly) this.merge.delete(k);
    this.drawBeams(now);
  }

  // ---------- 한 줄 보여 주기 ----------
  viewOf(side, id) { return side === 'u' ? this.sc.uViews.get(id) : side === 'e' ? this.sc.eViews.get(id) : null; }
  posOf(key) { const v = this.viewOf(key[0], +key.slice(1)); if (v?.c?.scene) { const p = [v.c.x, v.c.y]; this.lastPos.set(key, p); return p; } return this.lastPos.get(key) ?? null; }
  show(r, opts) {
    // 도움 효과(#97 차분한 전투의 aid 사건: 빛 구슬·+숫자·그림 글자)가 이미 그리는 회복·버프·보호막·부활은 겹쳐 그리지 않음(바는 그대로 따라감)
    if (r.aid) return;
    if (STATUS_KINDS.has(r.kind)) { this.link(r); return; }
    const key = r.side + r.id;
    const n = Math.round(Math.abs(r.d)), nb = Math.round(r.blocked ?? 0);
    if (r.kind === 'scale') return;   // 최대 체력이 바뀐 비율 조정: 바 비율은 그대로라 숫자 없음
    if (r.d < 0) {
      // 차분한 전투(#97 gauntlet.calm): 피해 숫자는 체력 dmgPct 이상·약점·큰 기술·치명·쓰러뜨림만. 작은 것은 체력바 잔상으로만
      const C = this.sc.calm?.();
      if (C && !(r.big || r.crit || r.kill || r.eff === 'strong' || r.eff === 'prey' || (opts?.plan && r.big))) {
        const x = r.side === 'u' ? this.sc.state?.field?.find((y) => y?.uid === r.id) : this.sc.state?.enemies?.find((y) => y.eid === r.id);
        const lim = (x?.maxHp ?? 0) * (C.dmgPct ?? 0.08);
        if (-r.d < lim) { if (nb >= lim && nb >= 1) this.text(key, this.T('clarity.blocked', { n: nb }), this.C('blocked', '#8fd3ff'), this.N('blocked', 14), false, 26); return; }
      }
      if (r.kind === 'dot') return this.mergeAdd(key + ':dot:' + r.cause, key, -r.d, this.C(r.cause === 'burn' ? 'dotBurn' : 'dotPoison', '#b07cff'), this.N('small', 15), this.N('dotMs', 700), (v) => String(Math.round(v)));
      const big = !!(r.big || r.crit || r.kill);
      if (n >= 1) {
        if (!big && r.side === 'e' && !r.eff) this.mergeAdd(key + ':hit', key, -r.d, this.C('hitEnemy', '#ffffff'), this.N('small', 15), this.N('mergeMs', 260), (v) => String(Math.round(v)));
        else if (opts?.plan && r.side === 'e' && this.sc.skfx?.number && r.big) { const p = this.posOf(key); if (p) this.sc.skfx.number(p[0], p[1] - 96, n, opts.plan); }
        else {
          // 우리 편이 맞은 숫자는 늘 빨강 계열(적이 상성 유리면 진한 빨강 ▲), 적이 맞은 숫자: 치명 주황 · 상성 유리 노랑 ▲ · 불리 회색 ▼
          const col = r.side === 'u' ? (r.eff === 'strong' || r.crit ? this.C('hitAllyStrong', '#ff3b3b') : r.eff === 'weak' ? this.C('hitAllyWeak', '#ffb0a8') : this.C('hitAlly', '#ff6b5a'))
            : r.crit ? this.C('crit', '#ff9f43') : r.eff === 'strong' || r.eff === 'prey' ? this.C('strong', '#ffe066') : r.eff === 'weak' ? this.C('weak', '#9aa7b8') : r.kind === 'env' ? this.C('env', '#ffd27a') : big ? this.C('big', '#ffe066') : this.C('hitEnemy', '#ffffff');
          const txt = r.crit ? this.T('clarity.crit', { n }) : r.eff === 'strong' || r.eff === 'prey' ? this.T('clarity.strong', { n }) : r.eff === 'weak' ? this.T('clarity.weak', { n }) : String(n);
          this.text(key, txt, col, big ? this.N('big', 28) : this.N('normal', 19), big);
        }
      }
      if (nb >= 1) this.text(key, this.T('clarity.blocked', { n: nb }), this.C('blocked', '#8fd3ff'), this.N('blocked', 14), false, 26);
      if (r.by && (r.big || r.crit) && r.kind !== 'env') this.strike(r);
      return;
    }
    if (r.d > 0) {
      if (r.kind === 'regen') { this.mergeAdd(key + ':regen', key, r.d, this.C('heal', '#6dff8a'), this.N('small', 15), this.N('regenMs', 900), (v) => this.T('clarity.heal', { n: Math.round(v) })); this.link(r); return; }
      if (n >= 1) this.text(key, r.kind === 'revive' ? this.T('clarity.revive', { n }) : this.T('clarity.heal', { n }), this.C(r.kind === 'revive' ? 'revive' : 'heal', '#6dff8a'), this.N('heal', 18), r.kind === 'revive');
      this.link(r);
    } else if (nb >= 1) this.text(key, this.T('clarity.blocked', { n: nb }), this.C('blocked', '#8fd3ff'), this.N('blocked', 14), false, 26);
  }
  /** 잇단 작은 변화(평타 여러 방·독·불·재생)는 숫자 하나로 묶음: 첫 변화에 바로 뜨고, ms 안에 오는 건 그 숫자에 더함(합 = 실제) */
  mergeAdd(k, key, v, color, size, ms, txt) {
    const now = this.sc.time.now, m = this.merge.get(k);
    if (m?.pendingOnly) { m.sum += v; this.carry(k); if (!m.pendingOnly) m.until = now + ms; return; }
    if (m && m.obj?.scene && now < m.until) {
      m.sum += v; const t = txt(m.sum);
      if (t !== m.obj.text) { m.obj.setText(t); this.sc.tweens.add({ targets: m.obj, scale: { from: 1.25, to: 1 }, duration: 110 }); }
      return;
    }
    if (Math.round(v) < 1 && txt(v) === txt(0)) { this.merge.set(k, { sum: v, until: now + ms, pendingOnly: true, obj: null, key, color, size, txt }); this.carry(k); return; }
    this.merge.set(k, { sum: v, until: now + ms, obj: this.text(key, txt(v), color, size, false) });
  }
  /** 1보다 작은 조각(독 한 틱 등)은 모았다가 1이 넘으면 띄움 */
  carry(k) {
    const m = this.merge.get(k); if (!m?.pendingOnly) return;
    if (Math.round(m.sum) >= 1) { m.pendingOnly = false; m.obj = this.text(m.key, m.txt(m.sum), m.color, m.size, false); }
  }
  /** 숫자 하나: 같은 대상 위에 잇달아 뜨면 위로 쌓고 좌우로 살짝 흩음(겹치지 않게). 동시에 max개 넘으면 가장 오래된 것부터 지움 */
  text(key, txt, color, size, big = false, dx = 0) {
    const p = this.posOf(key); if (!p) return;
    // 차분한 전투(#97)의 글자 예산을 함께 씀: 큰 숫자는 늘, 보통 숫자는 자리 있을 때만
    if (this.sc.textGate && !this.sc.textGate(big ? 2 : 1, this.N('hold', 380) + this.N('fade', 380))) return;
    const now = this.sc.time.now, st = (this.stack.get(key) ?? []).filter((t) => now - t < this.N('stackMs', 520));
    const k = st.length; st.push(now); this.stack.set(key, st);
    const x = p[0] + dx + (k % 2 ? 1 : -1) * Math.min(3, k) * 9, y = p[1] - 96 - k * this.N('stackPx', 19);
    const t = this.sc.add.text(x, y, txt, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: big ? 6 : 4 }).setOrigin(0.5).setDepth(1702).setScale(big ? 1.6 : 1.2);
    this.nums = this.nums.filter((o) => o.scene);
    this.nums.push(t);
    while (this.nums.length > this.N('max', 30)) this.nums.shift().destroy();
    this.sc.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.sc.tweens.add({ targets: t, y: y - this.N('rise', 34), alpha: 0, delay: this.N('hold', 380) + (big ? 160 : 0), duration: this.N('fade', 380), onComplete: () => t.destroy() });
    return t;
  }

  // ---------- 연결 이펙트 ----------
  /** 누가(by) → 누구(대상)에게: 회복·버프·디버프·흡혈·마법. 시전자는 잠깐 빛나고 이름 말풍선 */
  link(r) {
    const B = this.cfg.beam ?? {};
    const kind = r.kind === 'drain' ? 'drain' : r.kind === 'revive' ? 'revive' : r.kind === 'regen' || r.kind === 'heal' ? 'heal' : r.kind;
    const color = num(B[kind], 0xffffff);
    const tos = r.to ?? [{ side: r.side, id: r.id }];
    const from = r.by ? this.posOf(r.by.side + r.by.id) : null;
    let drew = 0;
    for (const to of tos) {
      const tp = this.posOf(to.side + to.id); if (!tp) continue;
      const self = r.by && r.by.side === to.side && r.by.id === to.id;
      if (self || !from) { this.ringAt(tp, color, !from && !self); continue; }
      // 흡혈은 대상 → 시전자로 빨간 줄기가 흘러감
      if (kind === 'drain') this.beam(tp, from, color); else this.beam(from, tp, color);
      drew++;
    }
    if (from && (drew || r.by)) this.caster(r.by.side + r.by.id, from, color, r.cause);
  }
  beam(a, b, color) {
    const B = this.cfg.beam ?? {};
    if (this.beams.length >= (B.max ?? 12)) this.beams.shift();
    this.beams.push({ a: [a[0], a[1] - 40], b: [b[0], b[1] - 40], color, t0: this.sc.time.now, ms: B.ms ?? 520, w: B.width ?? 4, arc: B.arc ?? 46 });
  }
  /** 시전자 없음(마법·함성·누른 보호막) = 하늘에서 내려오는 빛, 자기 자신(재생·각성) = 발밑 고리 */
  ringAt(p, color, sky) {
    if (sky) { this.beam([p[0], (this.cfg.beam?.skyY ?? 120) + 40], p, color); return; }
    this.sc.fx?.ring?.(p[0], p[1] + 24, color, 0.9, 420);
  }
  caster(key, p, color, cause) {
    this.sc.fx?.ring?.(p[0], p[1] + 24, color, 1.1, 380);
    const label = cause ? this.T('clarity.cause.' + cause) : null;
    if (!label || label === 'clarity.cause.' + cause) return;   // 이름 없는(이미 화면이 외치는) 기술은 말풍선 생략
    const now = this.sc.time.now;
    if (now - (this.bubbleAt.get(key) ?? -1e9) < (this.cfg.bubbleGap ?? 900)) return;
    this.bubbleAt.set(key, now);
    const hx = '#' + (color >>> 0).toString(16).padStart(6, '0');
    const t = this.sc.add.text(p[0], p[1] - 128, label, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: hx, stroke: '#000', strokeThickness: 4, backgroundColor: '#0b0d12aa', padding: { x: 5, y: 2 } }).setOrigin(0.5).setDepth(1690).setAlpha(0);
    this.sc.tweens.add({ targets: t, alpha: 1, y: p[1] - 138, duration: 140 });
    this.sc.tweens.add({ targets: t, alpha: 0, delay: 650, duration: 260, onComplete: () => t.destroy() });
  }
  /** 큰 공격·치명타: 공격자 → 표적으로 속성 색 타격 선(평타는 가볍게, 이건 안 그림) */
  strike(r) {
    const a = this.posOf(r.by.side + r.by.id), b = this.posOf(r.side + r.id); if (!a || !b) return;
    const S = this.cfg.strike ?? {};
    const el = r.by.side === 'u' ? this.sc.state?.field?.find((x) => x?.uid === r.by.id)?.stats?.element : this.sc.state?.enemies?.find((x) => x.eid === r.by.id)?.element;
    const color = num(this.cfg.elementColors?.[el], r.crit ? 0xff9f43 : 0xffe066);
    if (this.beams.length >= (this.cfg.beam?.max ?? 12)) this.beams.shift();
    this.beams.push({ a: [a[0], a[1] - 30], b: [b[0], b[1] - 30], color, t0: this.sc.time.now, ms: S.ms ?? 140, w: S.width ?? 3, arc: 0, flash: true });
  }
  drawBeams(now) {
    const g = this.g; g.clear();
    this.beams = this.beams.filter((b) => now - b.t0 < b.ms);
    for (const b of this.beams) {
      const k = (now - b.t0) / b.ms, head = Math.min(1, k * 1.6), tail = Math.max(0, k * 1.6 - 0.6);
      const P = (t) => { const mx = (b.a[0] + b.b[0]) / 2, my = (b.a[1] + b.b[1]) / 2 - b.arc; const u = 1 - t; return [u * u * b.a[0] + 2 * u * t * mx + t * t * b.b[0], u * u * b.a[1] + 2 * u * t * my + t * t * b.b[1]]; };
      const steps = 14, alpha = b.flash ? 1 - k : 1 - Math.max(0, k - 0.7) / 0.3;
      g.lineStyle(b.w + 4, b.color, 0.22 * alpha); g.beginPath();
      for (let i = 0; i <= steps; i++) { const t = tail + (head - tail) * (i / steps), q = P(t); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.strokePath();
      g.lineStyle(b.w, b.color, 0.95 * alpha); g.beginPath();
      for (let i = 0; i <= steps; i++) { const t = tail + (head - tail) * (i / steps), q = P(t); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.strokePath();
      if (!b.flash) { const q = P(head); g.fillStyle(0xffffff, 0.9 * alpha).fillCircle(q[0], q[1], b.w * 0.9); g.fillStyle(b.color, 0.5 * alpha).fillCircle(q[0], q[1], b.w * 2.2); }
    }
  }

  // ---------- 체력바 ----------
  /** 바에 쓸 체력 비율(아직 맞는 순간이 안 온 변화는 빼고) */
  frac(key, x) { return Math.max(0, Math.min(1, (x.hp - this.pending(key)) / Math.max(1, x.maxHp))); }
  /** 잔상(흰→빨강)·회복(초록)·보호막(파란 줄). v.bar 위치·크기를 그대로 따라감. 반환 = 진짜 바에 줄 비율 */
  decorate(v, frac, shield, dt) {
    const B = this.cfg.bar ?? {}, bar = v.bar; if (!bar) return frac;
    const now = this.sc.time.now;
    if (!v.clGhost) {
      v.clGhost = this.sc.add.rectangle(bar.x, bar.y, bar.width, bar.height, num(B.ghostWhite, 0xffffff)).setOrigin(0, 0.5);
      v.clHeal = this.sc.add.rectangle(bar.x, bar.y, bar.width, bar.height, num(B.healColor, 0x6dff8a)).setOrigin(0, 0.5);
      v.clShield = this.sc.add.rectangle(bar.x, bar.y - bar.height / 2 - 2, bar.width, 3, num(B.shieldColor, 0x8fd3ff)).setOrigin(0, 0.5);
      const i = v.c.list.indexOf(bar); v.c.addAt(v.clGhost, Math.max(0, i)); v.c.addAt(v.clHeal, Math.max(0, i + 2)); v.c.add(v.clShield);
      v.clTrail = frac; v.clDropAt = -1e9;
    }
    const w = bar.width, h = bar.height, vis = bar.visible;
    if (frac < v.clTrail - 1e-4 && (v.clLast ?? frac) > frac + 1e-4) v.clDropAt = now;   // 막 깎임
    v.clLast = frac;
    let shown = frac;
    if (frac < v.clTrail) {   // 깎임: 잠깐 멈췄다가 천천히 빠지는 잔상
      if (now - v.clDropAt > (B.ghostDelay ?? 240)) v.clTrail = Math.max(frac, v.clTrail - (B.ghostSpeed ?? 0.55) * dt);
    } else if (frac > v.clTrail) {   // 회복: 초록이 먼저 보이고 바가 따라 차오름
      v.clTrail = Math.min(frac, v.clTrail + (B.healSpeed ?? 0.7) * dt);
      shown = v.clTrail;
    }
    const ghostOn = vis && v.clTrail > frac + 1e-3, healOn = vis && frac > shown + 1e-3;
    v.clGhost.setVisible(ghostOn).setPosition(bar.x + w * frac, bar.y).setSize(Math.max(0, w * (v.clTrail - frac)), h)
      .setFillStyle(now - v.clDropAt < 180 ? num(B.ghostWhite, 0xffffff) : num(B.ghostRed, 0xff5a5a), 0.9);
    v.clHeal.setVisible(healOn).setPosition(bar.x + w * shown, bar.y).setSize(Math.max(0, w * (frac - shown)), h).setAlpha(0.65 + 0.35 * Math.sin(now / 90));
    v.clShield.setVisible(vis && !!shield).setPosition(bar.x, bar.y - h / 2 - 2).setSize(w, 3).setAlpha(0.75 + 0.25 * Math.sin(now / 140));
    return shown;
  }

  // ---------- 머리 위 아이콘 + 남은 초 ----------
  icons(v, list, top) {
    if (!v.clIcons) { v.clIcons = this.sc.add.text(0, top, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1); v.c.add(v.clIcons); }
    const I = this.cfg.icons ?? {};
    const txt = list.filter((x) => x.left > 0.05).slice(0, 4).map((x) => `${I[x.k] ?? '•'}${x.left >= 1 ? Math.ceil(x.left) : ''}`).join(' ');
    if (v.clIcons.text !== txt) v.clIcons.setText(txt);
    v.clIcons.y = top;
  }
  unitStatus(u, s) {
    const out = [], now = s.time;
    if ((u.shieldT ?? 0) > now) out.push({ k: 'shield', left: u.shieldT - now });
    const best = (stat, sign) => (s.allyBuffs ?? []).filter((b) => b.stat === stat && Math.sign(b.percent) === sign).reduce((m, b) => Math.max(m, b.left), 0);
    const sh = best('taken', -1); if (sh > 0 && !out.length) out.push({ k: 'shield', left: sh });
    const at = best('dmg', 1); if (at > 0) out.push({ k: 'atk', left: at });
    const hs = best('interval', -1); if (hs > 0) out.push({ k: 'haste', left: hs });
    if (u.awake) out.push({ k: 'awake', left: 0.5 });
    return out;
  }
  enemyStatus(e) {
    const out = [];
    if (e.shieldLeft > 0) out.push({ k: 'shield', left: e.shieldLeft });
    if (e.poisonLeft > 0) out.push({ k: 'poison', left: e.poisonLeft });
    if (e.burnLeft > 0) out.push({ k: 'burn', left: e.burnLeft });
    if (e.slowLeft > 0) out.push({ k: 'slow', left: e.slowLeft });
    if (e.curseLeft > 0) out.push({ k: 'curse', left: e.curseLeft });
    return out;
  }
}

/** 교전 요약(누가 얼마나 때리고·막고·고쳤나): state.clBook → 줄 목록(많이 한 순) */
export function summaryRows(state) {
  const B = state?.clBook ?? {};
  return Object.entries(B).map(([uid, b]) => ({ uid: +uid, name: state.field.find((u) => u?.uid === +uid)?.stats?.name ?? '?', ...b }))
    .filter((r) => r.dmg + r.block + r.heal > 0.5)
    .sort((a, b) => (b.dmg + b.block + b.heal) - (a.dmg + a.block + a.heal));
}
