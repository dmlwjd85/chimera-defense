import Phaser from 'phaser';
import { speciesImage, button, title, style, panel } from './ui.js';
import { buildData } from '../logic/data.js';
import { rosterPool, favorState, buyFavor, writeSave } from '../logic/meta.js';
import { deckOf, soulGaps, soulSig } from '../logic/soul.js';
import { speciesFit, stageProfile } from '../logic/matchup.js';
import { previewStats, BUILDS, BUILD_SETS } from '../logic/gauntlet.js';
import { levelsOf } from '../logic/meta.js';

const ROLE = { bruiser: '🛡 막기', dealer: '⚔ 딜러', technician: '🎯 기술', buffer: '🎺 응원' };

/** 덱 짜기: 소울펫 하나를 주인공으로 세우고, 그 약점을 메울 동료로 여섯 자리를 채운다. */
export default class DeckScene extends Phaser.Scene {
  constructor() { super('Deck'); }

  create(d) {
    this.D = buildData(this.registry.get('raw'));
    this.S = this.registry.get('save');
    this.stageId = d?.stageId ?? null;
    this.cameras.main.setBackgroundColor('#101820');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.3);
    title(this, 640, 40, '소울펫과 덱', 34);
    this.layer = this.add.container(0, 0);
    this.btns = [];
    this.sel = d?.sel ?? this.S.soulPet ?? this.D.config.roster.starter[0];
    button(this, 120, 676, 180, 44, '← 지도', () => this.scene.start('StageSelect'));
    this.paint();
  }

  save() { writeSave(this.registry.get('storage'), this.S); }

  paint() {
    const { D, S } = this, cfg = D.config, sc = cfg.soul, E = cfg.elements.defs;
    this.layer.removeAll(true); this.btns.forEach((b) => b.destroy()); this.btns = [];
    const add = (o) => { this.layer.add(o); return o; };
    const unlocked = rosterPool(S, D) ?? D.units.map((u) => u.id);
    const deck = deckOf(S, D, unlocked);
    const order = [...cfg.roster.starter, ...cfg.roster.unlocks.map((u) => u.id)];
    const stage = this.stageId ? D.stageById[this.stageId] : null;

    // ---- left: the selected animal ----
    const g = add(this.add.graphics());
    g.fillStyle(0x0d141d, 0.92).fillRoundedRect(30, 76, 430, 572, 16).lineStyle(2, 0xd4b06a, 0.8).strokeRoundedRect(30, 76, 430, 572, 16);
    const u = D.unitById[this.sel], sig = soulSig(D, u.id), isSoul = S.soulPet === u.id, open = unlocked.includes(u.id);
    const lv = S.favor?.[u.id] ?? 0;
    { const im0 = speciesImage(this, u.id, 'adult', 110, 150, 120); if (im0) { const im = add(im0); if (!open) im.setTint(0x000000).setAlpha(0.5); } }
    add(this.add.text(180, 96, `${isSoul ? '👑 ' : ''}${open ? u.name : '???'}`, style(26, isSoul ? '#ffd84d' : '#ffffff')));
    add(this.add.text(180, 132, `${ROLE[u.role]}   ${E[u.element]?.icon ?? ''} ${E[u.element]?.name ?? ''}   사거리 ${u.range}`, style(14, '#cfe8ff')));
    add(this.add.text(180, 156, open ? u.baseSkillDesc : '🔒 해금 게이지가 차면 고를 수 있음', style(12, '#aabbcc', { wordWrap: { width: 265 } })));
    // 수치 한 줄(출전 단계 기준, 고급 모드면 고른 빌드 반영): ❤ 체력 ⚔ 공격 ⚡ 빠르기 🛡 막기 💨 피하기
    { const lvl = levelsOf(S, D)[u.id] ?? 1, gl = cfg.gauntlet?.growLv ?? { teen: 3, adult: 6 };
      const stg = lvl >= gl.adult ? 'adult' : lvl >= gl.teen ? 'teen' : 'young';
      const b = S.advanced ? S.builds?.[u.id] ?? null : null, p = previewStats(D, u.id, stg, b);
      add(this.add.text(50, 204, `❤${p.hp}  ⚔${p.atk}  ⚡${p.spd}/초${p.def ? `  🛡${p.def}%` : ''}${p.dodge ? `  💨${p.dodge}%` : ''}   Lv${lvl}`, style(15, '#ffffff', { stroke: '#000', strokeThickness: 3 }))); }
    let y = 232;
    add(this.add.text(50, y, `🔥 소울 기술 · ${sig.name}`, style(18, '#ffb27a'))); y += 28;
    add(this.add.text(50, y, `· ${sig.desc}`, style(14, '#ffffff', { wordWrap: { width: 390 } }))); y += 40;
    add(this.add.text(50, y, `▶ ${sig.feel}`, style(14, '#9cff6b'))); y += 26;
    const aw = sc.awaken.defs[u.element];
    add(this.add.text(50, y, `✨ 각성기 · ${aw.name} ${E[u.element]?.icon ?? ''}`, style(16, lv >= sc.awakenAt ? '#ffd84d' : '#8a8f96'))); y += 24;
    add(this.add.text(50, y, `영물이 되면 ${sc.awaken.every}초마다 화면의 적 전부를 휩쓺 (정 ${sc.awakenAt}단계부터)`, style(12, '#aabbcc', { wordWrap: { width: 390 } }))); y += 22;
    add(this.add.text(50, y, '⚠ 혼자서는 힘든 것', style(14, '#ff9f9f'))); y += 21;
    for (const gp of soulGaps(D, u.id, stage).slice(0, 3)) { add(this.add.text(58, y, `· ${gp.text}  →  ${gp.need}`, style(12, '#ffd0c0', { wordWrap: { width: 385 } }))); y += 19; }
    // 갈림길: 정 2단계부터 둘 중 하나
    const forkOpen = lv >= sc.pathAt && open, cur = S.soulPath?.[u.id] ?? null;
    add(this.add.text(50, 486, `🔀 갈림길${forkOpen ? '' : `  (정 ${sc.pathAt}단계에 열림)`}`, style(14, forkOpen ? '#7fd1ff' : '#667788')));
    ['a', 'b'].forEach((k, i) => {
      const p = sig.paths[k], on = cur === k;
      const pb = button(this, 145 + i * 200, 524, 192, 36, `${on ? '✔ ' : ''}${p.name}`, () => { (S.soulPath ??= {})[u.id] = k; this.save(); this.paint(); }, { size: 14, fill: on ? 0x1f4d6b : 0x1a2636, stroke: on ? 0x7fd1ff : 0x55657a, tip: p.desc });
      pb.setEnabled(forkOpen);
      this.btns.push(pb);
      add(this.add.text(145 + i * 200, 552, p.desc, style(10, on ? '#cfe8ff' : '#8899aa', { wordWrap: { width: 190 }, align: 'center' })).setOrigin(0.5, 0));
    });
    add(this.add.text(50, 584, `💗 정 ${'♥'.repeat(lv)}${'♡'.repeat(cfg.favor.max - lv)}   소울펫일 때 단계마다 피해·체력 +${sc.favorDmg}%, 소울 기술 +${sc.favorSig}%`, style(11, '#ff9fbf', { wordWrap: { width: 395 } })));
    const st = favorState(S, D, u.id);
    const fb = button(this, 135, 624, 180, 34, st.reason === 'max' ? '정 가득 참' : `정 붙이기 · 💠${st.cost ?? cfg.favor.costs[lv] ?? '-'}`, () => { if (buyFavor(S, D, u.id).ok) { this.save(); this.paint(); } }, { size: 14, fill: 0x5a2a4a, stroke: 0xff9fbf, tip: `가진 에센스 ${S.essence}` });
    fb.setEnabled(st.ok && open);
    const sb = button(this, 345, 624, 200, 34, isSoul ? '👑 소울펫' : '👑 지정', () => { S.soulPet = u.id; if (!deck.includes(u.id)) S.deck = [u.id, ...deck.filter((x) => x !== u.id)].slice(0, sc.deckSize); else S.deck = deck; this.save(); this.paint(); }, { size: 15, fill: isSoul ? 0x6b5a1a : 0x2e5a3a, stroke: 0xffd84d });
    sb.setEnabled(open && !isSoul);
    this.btns.push(fb, sb);

    // ---- right: roster grid ----
    g.fillStyle(0x0d141d, 0.92).fillRoundedRect(476, 76, 774, 572, 16).lineStyle(2, 0xd4b06a, 0.8).strokeRoundedRect(476, 76, 774, 572, 16);
    add(this.add.text(496, 88, `덱 ${deck.length}/${sc.deckSize}${S.legend ? `   ⭐ 전설 ${S.legend.name} (한 칸 차지, 성체로 출전)` : ''}`, style(14, '#ffe2b8')));
    if (S.legend) this.btns.push(button(this, 1180, 96, 110, 26, '⭐ 내리기', () => { S.legend = null; this.save(); this.paint(); }, { size: 12, fill: 0x4a3d14 }));
    order.forEach((id, i) => {
      const a = D.unitById[id]; if (!a) return;
      const cx = 496 + (i % 5) * 150, cy = 116 + Math.floor(i / 5) * 138, has = unlocked.includes(id), inDeck = deck.includes(id), soul = S.soulPet === id;
      g.fillStyle(inDeck ? 0x1d3346 : 0x141b24, 1).fillRoundedRect(cx, cy, 140, 128, 10);
      g.lineStyle(this.sel === id ? 4 : 2, soul ? 0xffd84d : this.sel === id ? 0xffffff : inDeck ? 0x7fd1ff : 0x3b4b5e, 1).strokeRoundedRect(cx, cy, 140, 128, 10);
      { const im0 = speciesImage(this, id, 'adult', cx + 70, cy + 46, 72); if (im0) { const im = add(im0); if (!has) im.setTint(0x000000).setAlpha(0.45); else if (!inDeck) im.setAlpha(0.55); } }
      add(this.add.text(cx + 70, cy + 92, has ? `${soul ? '👑 ' : ''}${a.name}` : '🔒 해금 게이지', style(14, soul ? '#ffd84d' : has ? '#ffffff' : '#8899aa')).setOrigin(0.5));
      add(this.add.text(cx + 70, cy + 112, has ? `${ROLE[a.role].split(' ')[0]}${E[a.element]?.icon ?? ''} ${soulSig(D, id).name}` : '', style(11, '#aabbcc')).setOrigin(0.5));
      if (inDeck) add(this.add.text(cx + 8, cy + 6, '✔', style(14, '#7CFC9A')));
      if (S.advanced && S.builds?.[id]) add(this.add.text(cx + 8, cy + 26, BUILDS[S.builds[id]].icon, style(14)));
      if (stage && has) { const f = speciesFit(id, stage, D); if (f.label !== 'mid') add(this.add.text(cx + 132, cy + 8, f.label === 'good' ? '▲좋음' : '▼별로', style(12, f.label === 'good' ? '#7CFC9A' : '#ff8a80', { stroke: '#000', strokeThickness: 3 })).setOrigin(1, 0)); }
      const z = add(this.add.zone(cx + 70, cy + 64, 140, 128).setInteractive({ useHandCursor: true }));
      z.on('pointerdown', () => { this.sel = id; this.paint(); });
    });
    // coverage of the deck
    const du = deck.map((id) => D.unitById[id]);
    const cover = [['🛡 막기', du.some((a) => a.block >= 2)], ['🏹 대공', du.some((a) => a.range >= cfg.flyingMinRange)], ['💥 광역', du.some((a) => a.aoeRadius > 0)], ['🧊 둔화·제어', du.some((a) => a.role === 'technician')], ['🎺 응원', du.some((a) => a.role === 'buffer')], ['⚔ 근접', du.some((a) => a.range <= 1)]];
    add(this.add.text(496, 540, '덱 점검', style(14, '#ffe2b8')));
    cover.forEach(([name, ok], i) => add(this.add.text(566 + i * 112, 540, `${ok ? '✔' : '✘'} ${name}`, style(13, ok ? '#7CFC9A' : '#ff8a80'))));
    const rec = D.recipes.filter((r) => r.parts.every((p) => deck.includes(p)));
    add(this.add.text(496, 566, `만들 수 있는 키메라: ${rec.length ? rec.map((r) => (S.codex.recipes.includes(r.id) ? r.name : '???')).join(', ') : '없음'}`, style(13, '#d7bde2')));
    if (stage) {
      const c = cfg.climates[stage.climate];
      add(this.add.text(496, 590, `${stage.name} · ${c.icon} ${c.name} · ${stageProfile(stage, D).tags.join('  ')}`, style(13, '#cfe8ff')));
      const f = speciesFit(u.id, stage, D);
      add(this.add.text(496, 612, `${u.name}: ${f.label === 'good' ? '▲ 이 판에 좋음' : f.label === 'bad' ? '▼ 이 판엔 별로' : '보통'}${f.why.length ? '  · ' + f.why.slice(0, 3).join('  · ') : ''}`, style(12, f.label === 'good' ? '#7CFC9A' : f.label === 'bad' ? '#ff8a80' : '#aabbcc', { wordWrap: { width: 520 } })));
    }
    const inDeck = deck.includes(u.id), full = deck.length >= sc.deckSize;
    const tb = button(this, 1130, 604, 200, 40, isSoul ? '👑 소울펫' : inDeck ? '➖ 빼기' : full ? '가득 참' : '➕ 넣기', () => {
      S.deck = inDeck ? deck.filter((x) => x !== u.id) : [...deck, u.id];
      this.save(); this.paint();
    }, { size: 15, fill: inDeck ? 0x4a2a2a : 0x2a4a6a });
    tb.setEnabled(open && !isSoul && (inDeck ? deck.length > 3 : !full));
    this.btns.push(tb);
    // 고급: 역할을 내 취향대로(추천 → 탱커·탱딜·회피탱·딜탱·딜러 / 원딜·저격·응원·전투응원)
    this.btns.push(button(this, 1190, 40, 120, 36, S.advanced ? '⚙ 고급 켜짐' : '⚙ 고급', () => { S.advanced = !S.advanced; this.save(); this.paint(); }, { size: 14, fill: S.advanced ? 0x5a3a8a : 0x24303f, tip: '역할을 내 마음대로 바꾸기(고급자용)' }));
    if (S.advanced && open) {
      const set = u.range > 1 || u.role === 'buffer' ? 'ranged' : 'melee', cur = S.builds?.[u.id] ?? null, B = cur ? BUILDS[cur] : null;
      this.btns.push(button(this, 990, 40, 250, 36, `🔧 ${B ? `${B.icon} ${B.name}` : '추천(기본)'}`, () => {
        const list = [null, ...BUILD_SETS[set]], nx = list[(list.indexOf(cur) + 1) % list.length];
        S.builds ??= {}; if (nx) S.builds[u.id] = nx; else delete S.builds[u.id];
        this.save(); this.paint();
      }, { size: 15, fill: 0x3a2a5a, stroke: 0xc4a6ff, tip: B ? B.tip : '이 동물에게 맞는 역할' }));
      if (B) add(this.add.text(990, 64, B.tip, style(12, '#c4a6ff')).setOrigin(0.5, 0));
    }
    if (this.stageId) this.btns.push(button(this, 1140, 676, 200, 44, '▶ 출발', () => this.scene.start('Gauntlet', { stageId: this.stageId }), { size: 17, fill: 0x3a7bd5 }));
  }
}
