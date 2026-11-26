import Phaser from 'phaser';
import { button, title, style, panel, unitToken, speciesImage } from './ui.js';
import { ULTS, tuneOf, gcfg } from '../logic/gauntlet.js';
import { buildData, pairKey } from '../logic/data.js';
import { levelInfo, favorState, buyFavor, writeSave } from '../logic/meta.js';

const TABS = [['units', '동물'], ['spirits', '신화급'], ['chimeras', '키메라'], ['flops', '흑역사'], ['bonds', '인연'], ['enemies', '적']];
const CONT = { eurasia: '유라시아', america: '아메리카', africa: '아프리카' };

export default class CodexScene extends Phaser.Scene {
  constructor() { super('Codex'); }

  create(d) {
    this.data2 = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.tab = d?.tab ?? 'units';
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.45);
    title(this, 640, 45, '도감', 36);
    TABS.forEach(([id, label], i) => button(this, 640 - (TABS.length - 1) * 80 + i * 160, 100, 145, 40, label, () => this.scene.restart({ tab: id }), { fill: id === this.tab ? 0xb8742a : 0x2f4f6f }));
    panel(this, 40, 130, 1200, 520);
    // 탭 내용은 한 판(page)에 모아 가림막을 씌우고 휠·끌기로 스크롤(인연·흑역사가 넘쳐서)
    const before = new Set(this.children.list);
    this[this.tab]();
    this.makeScroll(before);
    if (d?.open && this.data2.unitById[d.open]) this.showDetail(this.data2.unitById[d.open]);
    button(this, 120, 685, 160, 44, '← 타이틀', () => this.scene.start('Title'));
  }

  makeScroll(before) {
    const fresh = this.children.list.filter((o) => !before.has(o) && (o.depth ?? 0) < 3000);
    const page = this.add.container(0, 0);
    let bottom = 0;
    for (const o of fresh) { page.add(o); const b = o.getBounds?.(); if (b) bottom = Math.max(bottom, b.bottom); }
    const top = 136, viewH = 506, maxScroll = Math.max(0, bottom - (top + viewH) + 20);
    const shape = this.make.graphics({ add: false }); shape.fillStyle(0xffffff).fillRect(40, 132, 1200, 516);
    page.setMask(shape.createGeometryMask());
    if (!maxScroll) return;
    let sy = 0;
    const set = (v) => { sy = Math.max(-maxScroll, Math.min(0, v)); page.y = sy; bar.y = 140 + (-sy / maxScroll) * (viewH - 80); };
    const bar = this.add.rectangle(1232, 140, 8, 80, 0xd4b06a, 0.8).setOrigin(0.5, 0);
    this.add.text(1232, 652, '⇕', style(14, '#d4b06a')).setOrigin(0.5, 0);
    this.input.on('wheel', (p, objs, dx, dy) => set(sy - dy * 0.6));
    let drag = null;
    this.input.on('pointerdown', (p) => { if (p.y > 130 && p.y < 650) drag = { y: p.y, s: sy, moved: false }; });
    this.input.on('pointermove', (p) => { if (drag && p.isDown) { if (Math.abs(p.y - drag.y) > 6) drag.moved = true; set(drag.s + (p.y - drag.y)); } });
    this.input.on('pointerup', () => { drag = null; });
  }

  cell(i, cols = 4, w = 290, h = 120) { return { x: 60 + (i % cols) * (w + 5), y: 145 + Math.floor(i / cols) * (h + 6), w, h }; }

  units() {
    const D = this.data2, S = this.save;
    D.units.forEach((u, i) => {
      const c = this.cell(i, 4, 290, 120), seen = S.codex.units.includes(u.id);
      const lv = levelInfo(S.speciesXp[u.id] ?? 0, D.config);
      const tok = unitToken(this, { kind: 'base', speciesId: u.id, stage: lv.level >= 10 ? 'spirit' : 'adult', stats: { color: u.color } }, D);
      tok.setPosition(c.x + 40, c.y + 45).setAlpha(seen ? 1 : 0.5);
      if (!seen) tok.list.forEach((o) => o.setTint?.(0x000000));
      this.add.text(c.x + 80, c.y + 8, seen ? `${u.name}  Lv.${lv.level}${S.favor?.[u.id] ? '  ' + '♥'.repeat(S.favor[u.id]) : ''}` : '???', style(17, lv.level >= 10 ? '#ffd84d' : '#ffffff'));
      if (seen) { const z = this.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h).setInteractive({ useHandCursor: true }); z.on('pointerdown', () => this.showDetail(u)); this.add.text(c.x + c.w - 8, c.y + c.h - 18, '자세히 ▸', style(11, '#d4b06a')).setOrigin(1, 0); }
      this.add.text(c.x + 80, c.y + 32, `${CONT[u.continent]} · 영물 ${seen ? u.stageNames.spirit : '???'}`, style(12, '#aabbcc'));
      if (seen) {
        this.add.text(c.x + 80, c.y + 52, `"${u.codex}"`, style(12, '#dddddd', { wordWrap: { width: 200 } }));
        if (u.nickname && u.nickname !== '없음') this.add.text(c.x + 10, c.y + 100, `별명: ${u.nickname}`, style(11, '#8899aa'));
      }
    });
  }

  /** 동물 한 마리의 도감 쪽: 사는 곳·먹이·천적, 먹이사슬 인연, 신화급 모습, 에센스로 정 붙이기. */
  showDetail(u) {
    this.detail?.forEach((o) => o.destroy());
    const D = this.data2, S = this.save, T = D.tales ?? {}, objs = [];
    const add = (o) => { objs.push(o.setDepth?.(3002) ?? o); return o; };
    objs.push(this.add.rectangle(640, 360, 1280, 720, 0x05080c, 0.72).setInteractive().setDepth(3000));
    objs.push(panel(this, 190, 70, 900, 580, { depth: 3001, alpha: 0.98 }));
    const tok = unitToken(this, { kind: 'base', speciesId: u.id, stage: 'adult', stats: { color: u.color } }, D); tok.setPosition(270, 150).setScale(1.5); add(tok);
    const sp = unitToken(this, { kind: 'base', speciesId: u.id, stage: 'spirit', stats: { color: u.color } }, D); sp.setPosition(1000, 150).setScale(1.3); add(sp);
    const gotSp = (S.codex.spirits ?? []).includes(u.id);
    if (!gotSp) sp.list.forEach((o) => o.setTint?.(0x000000));
    add(this.add.text(350, 100, u.name, style(30, '#ffe6b0', { stroke: '#2a1a08', strokeThickness: 5 })));
    add(this.add.text(350, 142, `${CONT[u.continent]} · ${{ bruiser: '브루저', dealer: '딜러', technician: '테크니션', buffer: '버퍼' }[u.role]} · ${D.config.elements.defs[u.element]?.icon ?? ''} ${D.config.elements.defs[u.element]?.name ?? ''} 속성`, style(14, '#d4b06a')));
    add(this.add.text(350, 166, `"${u.codex}"`, style(13, '#cfd8dc', { wordWrap: { width: 520 } })));
    add(this.add.text(1000, 210, gotSp ? `🌟 ${u.stageNames.spirit}` : '🌟 ???', style(15, '#ffd84d')).setOrigin(0.5));
    add(this.add.text(1000, 232, T.myth?.[u.id] ? `${T.myth[u.id].flag} ${T.myth[u.id].source}` : '', style(12, '#cfd8dc')).setOrigin(0.5));
    let y = 228;
    const row = (icon, label, text, col = '#efe3c8') => { add(this.add.text(230, y, `${icon} ${label}`, style(14, '#9fd8ff'))); const o = add(this.add.text(340, y, text, style(14, col, { wordWrap: { width: 540 } }))); y += Math.max(24, o.height + 6); };
    row('🏡', '사는 곳', u.eco.home); row('🍽', '먹이', u.eco.diet); row('⚠', '천적', u.eco.foes); row('💡', '한마디', u.eco.fact);
    y += 6; add(this.add.text(230, y, '🔗 먹이사슬과 인연', style(15, '#ffe6b0'))); y += 26;
    const rel = D.lore.bonds.filter((b) => b.pair.includes(u.id));
    if (!rel.length) { add(this.add.text(240, y, '아직 알려진 인연 없음.', style(13, '#8fa1b3'))); y += 22; }
    for (const b of rel.slice(0, 5)) {
      const other = D.unitById[b.pair.find((p) => p !== u.id)]?.name ?? '';
      const clash = b.kind === 'clash';
      add(this.add.text(240, y, `${clash ? '⚡' : '♥'} ${b.name} — ${other}와(과)  ·  ${T.bonds?.[b.id] ?? b.desc}`, style(13, clash ? '#ffb27a' : '#ff9fbf', { wordWrap: { width: 800 } }))); y += 20;
      if (b.flip && (b.flip.by ?? b.pair).includes(u.id)) { add(this.add.text(262, y, `✨ 신화급이 되면 → ${b.flip.name}: ${T.flips?.[b.id] ?? ''}`, style(12, '#ffd84d', { wordWrap: { width: 780 } }))); y += 20; }
    }
    y += 6; add(this.add.text(230, y, '🧬 타고나는 특성 (둘을 갖고 태어나요)', style(15, '#ffe6b0'))); y += 24;
    const tr = D.traits[u.id];
    if (tr) {
      add(this.add.text(240, y, '강점  ' + tr.str.map((d) => d.name).join(' · '), style(13, '#7CFC9A'))); y += 20;
      add(this.add.text(240, y, '약점  ' + tr.weak.map((d) => `${d.name} ➜ ${d.flip.name}`).join(' · '), style(12, '#ffb27a', { wordWrap: { width: 820 } }))); y += 38;
    }
    const f = D.config.favor, st = favorState(S, D, u.id);
    const lv = st.level ?? 0;
    add(this.add.text(230, 596, `💗 정 붙이기 ${'♥'.repeat(lv)}${'♡'.repeat(f.max - lv)}  — ${u.name} 소환 확률 무게 +${lv * f.perLevel}%`, style(14, '#ff9fbf')));
    const close = () => { objs.forEach((o) => o.destroy()); fb.destroy(); cb.destroy(); this.detail = null; };
    const fb = button(this, 880, 606, 230, 40, st.reason === 'max' ? '가득 참' : `정 붙이기 · 에센스 ${st.cost ?? f.costs[lv]}`, () => {
      const r = buyFavor(S, D, u.id);
      if (!r.ok) return;
      writeSave(this.registry.get('storage'), S); close(); this.scene.restart({ tab: 'units', open: u.id });
    }, { depth: 3003, size: 14, fill: 0x5a2a4a, stroke: 0xff9fbf });
    fb.setEnabled(st.ok);
    add(this.add.text(650, 628, `가진 에센스 ${S.essence}`, style(12, '#ffd84d')));
    const cb = button(this, 1050, 100, 44, 44, '✕', close, { depth: 3003, size: 18 });
    this.detail = [...objs, { destroy: () => { fb.destroy(); cb.destroy(); } }];
  }

  /** 신화급(영물) 도감: 만든 적 있으면 이름·고향·기술·설화, 아니면 실루엣과 '성체 둘을 합치면' 힌트. */
  spirits() {
    const D = this.data2, S = this.save, T = D.tales ?? {};
    const made = new Set([...(S.codex.spirits ?? []), ...D.units.filter((u) => levelInfo(S.speciesXp[u.id] ?? 0, D.config).level >= 10).map((u) => u.id)]);
    D.units.forEach((u, i) => {
      const c = this.cell(i, 3, 385, 122), got = made.has(u.id), m = T.myth?.[u.id];
      const g = this.add.graphics();
      g.fillStyle(got ? 0x3a2a10 : 0x10161e, got ? 0.55 : 0.6).fillRoundedRect(c.x, c.y, c.w, c.h, 12);
      g.lineStyle(2, got ? 0xffd84d : 0x3b4b5e, got ? 0.9 : 0.6).strokeRoundedRect(c.x, c.y, c.w, c.h, 12);
      if (got) g.fillStyle(0xffd84d, 0.18).fillCircle(c.x + 48, c.y + 52, 40);
      const tok = unitToken(this, { kind: 'base', speciesId: u.id, stage: 'spirit', stats: { color: u.color } }, D);
      tok.setPosition(c.x + 48, c.y + 52);
      if (!got) tok.list.forEach((o) => o.setTint?.(0x000000));
      this.add.text(c.x + 96, c.y + 8, got ? `🌟 ${u.stageNames.spirit}` : '🌟 ???', style(19, got ? '#ffd84d' : '#7f8c99', { stroke: '#000', strokeThickness: 3 }));
      this.add.text(c.x + c.w - 10, c.y + 10, m ? `${m.flag} ${got ? m.land : '???'}` : '', style(12, '#cfd8dc')).setOrigin(1, 0);
      if (got) {
        const z = this.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h).setInteractive({ useHandCursor: true }); z.on('pointerup', () => this.showMyth(u));
        this.add.text(c.x + c.w - 8, c.y + c.h - 18, '그림으로 보기 ▸', style(11, '#ffd84d')).setOrigin(1, 0);
        this.add.text(c.x + 96, c.y + 36, `${m?.source ?? ''} · ✦ ${u.spiritSkill.name}`, style(12, '#e8c3ff'));
        this.add.text(c.x + 96, c.y + 56, T.skills?.[`${u.id}_spirit`]?.[1] ?? u.spiritSkill.desc, style(12, '#efe3c8', { wordWrap: { width: 275 } }));
        this.add.text(c.x + 96, c.y + 94, `"${u.spiritCodex}"`, style(11, '#aab4be', { wordWrap: { width: 275 } }));
      } else {
        this.add.text(c.x + 96, c.y + 40, `성체 ${S.codex.units.includes(u.id) ? u.name : '???'} 둘을 겹치면 깨어난대요.`, style(12, '#8fa1b3', { wordWrap: { width: 275 } }));
        this.add.text(c.x + 96, c.y + 64, m ? `${m.flag} 어느 ${m.source.endsWith('신화') ? '신화' : '이야기'} 속 짐승…` : '', style(12, '#6f7f8f'));
      }
    });
    this.add.text(640, 632, `깨운 신화급 ${made.size} / ${D.units.length}`, style(15, '#ffd84d')).setOrigin(0.5);
  }

  /** 신화급 자세히(7살도 알게): 큰 그림 · 성체 둘 → 신화급 그림식 · 나라 · 짧은 옛이야기 · 필살기(무엇을 도와주나) · 좋은 점/약한 점 */
  showMyth(u) {
    this.detail?.forEach((o) => o.destroy());
    const D = this.data2, T = D.tales ?? {}, objs = [];
    const add = (o) => { o.setDepth?.(3002); objs.push(o); return o; };
    objs.push(this.add.rectangle(640, 360, 1280, 720, 0x05080c, 0.8).setInteractive().setDepth(3000));
    objs.push(panel(this, 110, 60, 1060, 600, { depth: 3001, alpha: 0.98 }));
    const m = T.myth?.[u.id] ?? {};
    // 왼쪽: 큰 신화급 그림 + 빛
    const glow = add(this.add.circle(330, 300, 150, 0xffd84d, 0.18).setStrokeStyle(4, 0xffd84d, 0.8));
    this.tweens.add({ targets: glow, scale: { from: 0.95, to: 1.05 }, yoyo: true, repeat: -1, duration: 900 });
    const big = speciesImage(this, u.id, 'spirit', 330, 250, 240); if (big) add(big);
    // 그림식: 성체 + 성체 → 신화급
    const a1 = speciesImage(this, u.id, 'adult', 220, 500, 80), a2 = speciesImage(this, u.id, 'adult', 330, 500, 80), sp = speciesImage(this, u.id, 'spirit', 450, 500, 90);
    [a1, a2, sp].forEach((o) => o && add(o));
    add(this.add.text(275, 520, '+', style(34, '#ffffff')).setOrigin(0.5));
    add(this.add.text(388, 520, '→', style(34, '#ffd84d')).setOrigin(0.5));
    add(this.add.text(330, 600, `어른 ${u.name} 둘을 겹치면!`, style(16, '#ffe9a8')).setOrigin(0.5));
    // 오른쪽: 이름·나라·이야기·필살기·장단점
    add(this.add.text(560, 90, `🌟 ${u.stageNames.spirit}`, style(36, '#ffd84d', { stroke: '#2a1a08', strokeThickness: 6 })));
    add(this.add.text(560, 144, `${m.flag ?? ''} ${m.land ?? ''}  ·  📜 ${m.source ?? ''}`, style(18, '#cfe8ff')));
    add(this.add.text(560, 186, '📖 옛이야기', style(18, '#ffe6b0')));
    add(this.add.text(560, 214, T.mythStory?.[u.id] ?? u.spiritCodex, style(17, '#f4f1e8', { wordWrap: { width: 560 }, lineSpacing: 6 })));
    const ult = ULTS[u.id];
    if (ult) { add(this.add.text(560, 360, '✨ 필살기', style(18, '#ffe6b0'))); add(this.add.text(560, 388, `${ult.name}`, style(22, '#ffd84d'))); add(this.add.text(560, 420, `👉 ${ult.desc}`, style(16, '#9cff6b', { wordWrap: { width: 560 } }))); }
    const tn = tuneOf({ kind: 'base', speciesId: u.id }, gcfg(D));
    if (tn) { add(this.add.text(560, 480, `👍 잘하는 것  ${tn.pro}`, style(16, '#7CFC9A', { wordWrap: { width: 560 } }))); add(this.add.text(560, 514, `👎 약한 것  ${tn.con}`, style(16, '#ffb27a', { wordWrap: { width: 560 } }))); }
    const ROLE = { bruiser: '🛡 막는 친구', dealer: '⚔ 때리는 친구', technician: '🎯 재주꾼', buffer: '📣 응원하는 친구' };
    add(this.add.text(560, 560, `${ROLE[u.role] ?? ''}  ·  ${D.config.elements.defs[u.element]?.icon ?? ''} ${D.config.elements.defs[u.element]?.name ?? ''}`, style(16, '#d4b06a')));
    const close = () => { objs.forEach((o) => o.destroy()); cb.destroy(); this.detail = null; };
    const cb = button(this, 1130, 90, 48, 48, '✕', close, { depth: 3003, size: 20 });
    this.detail = [...objs, { destroy: () => cb.destroy() }];
  }

  chimeras() {
    const D = this.data2, S = this.save;
    D.recipes.forEach((r, i) => {
      const c = this.cell(i, 3, 385, 120), known = S.codex.recipes.includes(r.id);
      const hint = S.hints[r.id] ?? [];
      const tok = unitToken(this, { kind: 'chimera', speciesId: r.id, stage: 'adult', parts: r.parts, stats: {} }, D);
      tok.setPosition(c.x + 40, c.y + 45).setAlpha(known ? 1 : 0.5);
      if (!known) tok.list.forEach((o) => o.setTint?.(0x000000));
      const parts = r.parts.map((p) => (known || hint.includes(p) ? D.unitById[p].name : `?(${CONT[D.unitById[p].continent]})`)).join(' + ');
      this.add.text(c.x + 85, c.y + 8, known ? r.name : '???', style(18, known ? '#d7bde2' : '#888888'));
      this.add.text(c.x + 85, c.y + 34, parts, style(13, '#aabbcc'));
      this.add.text(c.x + 85, c.y + 56, known ? r.desc : `출처: ${r.source}`, style(11, '#dddddd', { wordWrap: { width: 290 } }));
      if (known && r.codex) this.add.text(c.x + 85, c.y + 96, `"${r.codex}"`, style(11, '#c0c0c0', { wordWrap: { width: 290 } }));
    });
    this.add.text(640, 632, `힌트 조각 ${S.hintShards}/${D.config.hintShardsPerReveal} — 흑역사를 만들 때마다 1개`, style(14, '#ffd84d')).setOrigin(0.5);
  }

  flops() {
    const D = this.data2, S = this.save;
    if (!S.codex.failedPairs.length) this.add.text(640, 380, '아직 실패한 합성 없음. 언젠가는 생김.', style(18, '#888888')).setOrigin(0.5);
    S.codex.failedPairs.forEach((k, i) => {
      const [a, b] = k.split('+');
      const c = this.cell(i, 4, 290, 80);
      this.add.text(c.x + 10, c.y + 8, `어설픈 ${D.unitById[a]?.name ?? a}${D.unitById[b]?.name ?? b}`, style(17, '#bbbbbb'));
      this.add.text(c.x + 10, c.y + 36, '단점만 모였다. 적들이 구경했다.', style(12, '#888888'));
    });
    const total = D.units.length * (D.units.length - 1) / 2 - D.recipes.filter((r) => r.parts.every((p) => D.unitById[p])).length;
    this.add.text(640, 632, `흑역사 ${S.codex.failedPairs.length}/${total}`, style(14, '#aaaaaa')).setOrigin(0.5);
  }

  bonds() {
    const D = this.data2, S = this.save;
    D.lore.bonds.forEach((b, i) => {
      const c = this.cell(i, 3, 385, 62), seen = S.codex.bonds.includes(b.id);
      const names = b.pair.map((p) => D.unitById[p]?.name ?? p).join(' + ');
      this.add.text(c.x + 10, c.y + 4, `${b.kind === 'clash' ? '⚡' : '♥'} ${seen ? b.name : '???'}${seen && b.flip ? '  ✨' + b.flip.name : ''}`, style(15, b.kind === 'clash' ? '#f0883e' : '#ff8fb1'));
      this.add.text(c.x + 10, c.y + 26, `${names} · ${b.sameTeam ? '함께 출전' : b.tiles + '타일 안'}`, style(12, '#aabbcc'));
      this.add.text(c.x + 10, c.y + 42, seen ? b.desc : `출처: ${b.source}`, style(11, '#dddddd'));
    });
  }

  enemies() {
    const D = this.data2, S = this.save;
    D.enemies.forEach((e, i) => {
      const c = this.cell(i, 4, 290, 100), seen = S.codex.enemies.includes(e.id);
      if (this.textures.exists('enemy-' + e.id)) { const im = this.add.image(c.x + 30, c.y + 40, 'enemy-' + e.id).setDisplaySize(e.boss ? 58 : 46, e.boss ? 58 : 46); if (!seen) im.setTint(0x000000).setAlpha(0.4); }
      else this.add.rectangle(c.x + 30, c.y + 40, e.boss ? 44 : 30, e.boss ? 44 : 30, Phaser.Display.Color.HexStringToColor(e.color).color).setAlpha(seen ? 1 : 0.15);
      this.add.text(c.x + 65, c.y + 8, seen ? e.name : '???', style(17));
      if (seen) {
        this.add.text(c.x + 65, c.y + 32, e.desc, style(11, '#aabbcc', { wordWrap: { width: 215 } }));
        this.add.text(c.x + 65, c.y + 66, `"${e.codex}"`, style(11, '#dddddd', { wordWrap: { width: 215 } }));
      }
    });
  }
}
