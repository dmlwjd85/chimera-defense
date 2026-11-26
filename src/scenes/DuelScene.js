// 덱 대결(1안): 내 대표 덱 코드 만들기 · 친구 덱 코드 넣기 · 전적. 서버 없이 코드만 주고받음.
// 덱은 싱글 스토리에서 해금한 동물만(레벨 단계, 성장기까지). 대결에서는 마법·유물·금화 없음, 3판 2선승.
import Phaser from 'phaser';
import { button, title, style, panel, speciesImage } from './ui.js';
import { buildData } from '../logic/data.js';
import { writeSave } from '../logic/meta.js';
import { myDuelDeck, encodeDeck, decodeDeck, PLANS, PLAN_LABEL, foeLabel } from '../logic/duel.js';
import { sfx } from './sfx.js';

export default class DuelScene extends Phaser.Scene {
  constructor() { super('Duel'); }

  create(d) {
    this.D = buildData(this.registry.get('raw'));
    this.S = this.registry.get('save');
    this.S.duel ??= { wins: 0, losses: 0, foes: {}, plan: 'front' };
    this.cameras.main.setBackgroundColor('#101820');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.3);
    title(this, 640, 40, '⚔ 덱 대결', 34);
    this.add.text(640, 78, '내 덱을 코드로 친구에게 주고, 친구 코드를 넣어 그 덱과 3판 2선승으로 싸워요', style(15, '#d8d2c2')).setOrigin(0.5);
    this.layer = [];
    this.paint(d?.last ?? null);
    button(this, 120, 676, 180, 44, '← 지도', () => this.scene.start('StageSelect'));
  }

  save() { writeSave(this.registry.get('storage'), this.S); }
  toast(msg, color = '#ffd84d') {
    const t = this.add.text(640, 620, msg, style(18, color, { backgroundColor: '#0d1222dd', padding: { x: 14, y: 6 } })).setOrigin(0.5).setDepth(50);
    this.time.delayedCall(1800, () => t.destroy());
  }

  paint(last) {
    this.layer.forEach((o) => o.destroy()); this.layer = [];
    const add = (o) => { this.layer.push(o); return o; };
    const { D, S } = this;
    // ---- 왼쪽: 내 대표 덱 ----
    add(panel(this, 40, 100, 590, 560));
    add(this.add.text(64, 116, '🐾 내 대표 덱 (해금한 동물만)', style(20, '#ffe6b0')));
    const deck = myDuelDeck(S, D);
    deck.forEach((u, i) => {
      const x = 110 + (i % 3) * 180, y = 210 + Math.floor(i / 3) * 150;
      const im = speciesImage(this, u.id, u.stage, x, y - 10, 90); if (im) add(im);
      add(this.add.text(x, y + 46, `${D.unitById[u.id].name}${u.stage === 'teen' ? ' (성장기)' : ' (어린)'}`, style(14, '#ffffff')).setOrigin(0.5));
    });
    add(this.add.text(64, 470, '친구가 내 덱과 싸울 때 내 덱의 작전', style(14, '#d8d2c2')));
    PLANS.forEach((p, i) => add(button(this, 140 + i * 160, 510, 150, 40, (S.duel.plan === p ? '✔ ' : '') + PLAN_LABEL[p], () => { S.duel.plan = p; this.save(); this.paint(last); }, { size: 15, fill: S.duel.plan === p ? 0x5a4a14 : 0x24303f })));
    const code = encodeDeck(deck, S.duel.plan ?? 'front', D);
    add(this.add.text(335, 570, code, style(26, '#9cff6b', { backgroundColor: '#0d1222', padding: { x: 12, y: 6 } })).setOrigin(0.5));
    add(button(this, 335, 625, 200, 38, '📋 코드 복사', async () => { try { await navigator.clipboard.writeText(code); this.toast('복사했어요! 친구에게 알려 주세요'); } catch { this.toast('복사가 안 되면 칠판에 적어 주세요'); } sfx('click'); }, { size: 15, fill: 0x2e5a3a }));
    // ---- 오른쪽: 친구 덱과 싸우기 ----
    add(panel(this, 650, 100, 590, 560));
    add(this.add.text(674, 116, `⚔ 친구 덱과 싸우기   전적 ${S.duel.wins}승 ${S.duel.losses}패`, style(20, '#ffe6b0')));
    if (last) add(this.add.text(674, 150, last.win ? `🎉 방금 대결 승리! (${last.wins}:${last.losses})` : `😣 방금 대결 패배 (${last.wins}:${last.losses}) — 작전을 바꿔 다시!`, style(16, last.win ? '#ffd84d' : '#ff8a7a')));
    add(button(this, 945, 200, 280, 46, '➕ 친구 코드 넣기', () => this.addFoe(), { size: 18, fill: 0x3a7bd5 }));
    const foes = Object.entries(S.duel.foes ?? {}).slice(-6).reverse();
    if (!foes.length) add(this.add.text(945, 300, '아직 넣은 친구 코드가 없어요', style(15, '#8899aa')).setOrigin(0.5));
    foes.forEach(([c, f], i) => {
      const y = 270 + i * 62, dec = decodeDeck(c, D);
      add(this.add.text(674, y, f.name ?? foeLabel(c), style(16, '#ffffff')));
      if (!dec.error) dec.deck.forEach((u, k) => { const im = speciesImage(this, u.id, u.stage, 690 + k * 34, y + 30, 30); if (im) add(im); });
      add(this.add.text(900, y + 6, `${f.w}승 ${f.l}패 · ${PLAN_LABEL[dec.plan] ?? ''}`, style(13, '#cfe8ff')));
      add(button(this, 1150, y + 20, 130, 40, '▶ 대결', () => this.fight(c), { size: 16, fill: 0x8a6a1a, stroke: 0xffd84d }));
    });
  }

  addFoe() {
    const raw = window.prompt('친구 덱 코드를 넣어 주세요 (예: K110-1011-...)');
    if (!raw) return;
    const r = decodeDeck(raw, this.D);
    if (r.error) { this.toast(r.error, '#ff8a7a'); return; }
    const code = encodeDeck(r.deck, r.plan, this.D);
    const name = (window.prompt('친구 이름(별명)을 적어 주세요 (안 적어도 돼요)') ?? '').trim().slice(0, 8) || null;
    this.S.duel.foes[code] ??= { w: 0, l: 0, name };
    this.save(); this.paint(null);
    this.toast('친구 덱을 넣었어요! ▶ 대결');
  }

  fight(code) {
    const r = decodeDeck(code, this.D);
    if (r.error) { this.toast(r.error, '#ff8a7a'); return; }
    this.scene.start('Gauntlet', { duel: { code, foe: r, name: this.S.duel.foes[code]?.name ?? null } });
  }
}
