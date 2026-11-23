import Phaser from 'phaser';
import { attachInput } from './BattleInput.js';
import { buildData } from '../logic/data.js';
import { createBattle, step, summon, skipPrep, deploy, moveUnit, recall, sell, merge, buyBait, toggleLock, summonPrice, addCarry, chooseRelic, makeUnit } from '../logic/battle.js';
import { ownedRelics } from '../logic/relics.js';
import { battleOptions, settleRun, writeSave, carryCandidates, setCarry } from '../logic/meta.js';
import { traitView } from '../logic/traits.js';
import { terrainMatch, effRange, effBlock, effDamage, effInterval } from '../logic/mods.js';
import { isResting } from '../logic/combat.js';
import { makeEnemy } from '../logic/waves.js';
import { unitRig, enemyRig } from './rigs.js';
import { FX, ambient, STRIKE } from './fx.js';
import { Globe, HAB_SPOT } from './globe.js';
import { soundOf, ELEM_SOUND } from './onomato.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sfx.js';
import { button, panel, style, unitToken, silhouette, hex, COLORS, chip, showTip, hideTip } from './ui.js';

import { PATH_Y, X0, TILE, PATH_H, BENCH_Y, BENCH_X0, BENCH_GAP, SLOT, tileToX, xToTile, benchSlotX, LANE_Y, LANE_SCALE, laneAt } from './layout.js';
import { gridCol, gridPos, cellUnit, campDelta } from '../logic/battle.js';
export { PATH_Y, X0, TILE, PATH_H, BENCH_Y, BENCH_X0, BENCH_GAP, SLOT, tileToX, xToTile, benchSlotX };
export const ZONE_COLORS = { village: 0x9c8a6b, field: 0x7fb069, forest: 0x3d6b45, plains: 0xc2b280, mountain: 0x8d8d8d, wetland: 0x4f7c6b };
const ZONE_NAME = { village: '마을', field: '들판', forest: '숲', plains: '대평원', mountain: '산', wetland: '습지' };
const CONT_NAME = { eurasia: '유라시아', america: '아메리카', africa: '아프리카' };
const CONT_ICON = { eurasia: '🌏', america: '🌎', africa: '🌍' };
const RARITY_COL = { common: 0x9fb3c8, rare: 0x5fa8ff, epic: 0xc77dff };
const RARITY_NAME = { common: '일반', rare: '희귀', epic: '영웅' };
const SYN_TEXT = { eurasia: '유라시아 시너지: 공격 간격 -10%', america: '아메리카 시너지: 사거리 +1', africa: '아프리카 시너지: 피해 +15%' };
const ROLE_NAME = { bruiser: '브루저', dealer: '딜러', technician: '테크니션', buffer: '버퍼', weak: '약체' };
const TUTORIAL = [
  '🌐 소환 — 버튼 또는 스페이스',
  '⇢ 대기석 → 길로 끌어서 출전',
  '⧉ 같은 동물·같은 단계 겹치기 = 진화',
  '✦ 성체 다른 종 둘 = 키메라 (여우+까마귀?)',
];
const ZONE_TILES = 4;

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create(d) {
    this.T = this.registry.get('T');
    this.data2 = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.stageId = d?.stageId ?? 'forest-1';
    const seedParam = Number(new URLSearchParams(window.location.search).get('seed'));
    const bopts = battleOptions(this.save, this.data2, this.stageId);
    this.state = createBattle(this.data2, this.stageId, seedParam > 0 ? seedParam : Date.now() % 100000, bopts);
    this.carried = addCarry(this.state, this.data2, bopts.carry);
    this.fallbackGold = !bopts.carry && this.data2.stages.findIndex((x) => x.id === this.stageId) > 0 ? this.data2.config.carry.fallbackGold : 0;
    Object.assign(this, { speed: 1, paused: false, leaving: false, unitViews: new Map(), enemyViews: new Map(), hidden: new Set(), designate: { continent: null, habitat: null } });
    this.cameras.main.setBackgroundColor('#141a21');
    this.drawPath();
    this.drawHud();
    this.drawBench();
    this.drawCamp();
    this.drawSummonPanel();
    this.drawBaitShop();
    this.bondGfx = this.add.graphics().setDepth(40);
    this.fx = new FX(this);
    this.bondTexts = [];
    this.toastText = this.add.text(640, 120, '', style(20, '#ffd84d', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(2000).setVisible(false);
    this.tutorialStep = this.stageId === 'forest-1' && !this.save.tutorialDone ? 0 : -1;
    this.tutorialText = this.add.text(560, 160, '', style(17, '#ffe6b0', { backgroundColor: '#101820ee', padding: { x: 14, y: 8 }, stroke: '#000', strokeThickness: 2 })).setOrigin(0.5).setDepth(1900);

    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', () => this.doSummon());
    kb.on('keydown-ONE', () => { this.speed = 1; });
    kb.on('keydown-TWO', () => { this.speed = 2; });
    kb.on('keydown-P', () => { this.paused = !this.paused; });

    window.__battle = { scene: this, get state() { return this.scene.state; }, data: this.data2,
      actions: { summon, deploy, moveUnit, recall, sell, merge, skipPrep, buyBait, toggleLock },
      put: (sp, stage, pos, row) => { const st = this.state; const i = st.bench.indexOf(null); if (i < 0) return null; st.bench[i] = makeUnit(st, this.data2, { kind: 'base', speciesId: sp, stage, parts: null, traits: [] }); return deploy(st, this.data2, i, pos, { row }); },
      spawn: (id, pos = 9) => { const st = this.state; const e = makeEnemy(id, st.wave, st.stage, this.data2, st.nextEid++); e.pos = pos; st.enemies.push(e); return e; } };
    attachInput(this);
    if (this.carried) this.time.delayedCall(400, () => { this.toast(`지난 스테이지에서 데려온 동물: ${this.carried.white ? '흰 ' : ''}${this.carried.stats.name}`, '#9cff6b'); this.fx.burst('rise', benchSlotX(0), BENCH_Y, 14, 0x9cff6b); });
    else if (this.fallbackGold) this.time.delayedCall(400, () => this.toast(`데려온 동물이 없어 시작 골드 +${this.fallbackGold}`, '#ffd84d'));
    this.input.on('pointerdown', unlockAudio);
    this.input.keyboard.on('keydown', unlockAudio);
    this.stanceFx = new Map();
  }

  // ---------- static layout ----------
  drawPath() {
    const st = this.state.stage;
    if (this.textures.exists('bg-' + st.id)) {
      this.add.image(640, 360, 'bg-' + st.id).setDisplaySize(1280, 720).setDepth(-10);
      st.zones.slice(0, 3).forEach((id, i) => this.add.text(tileToX(i * ZONE_TILES + ZONE_TILES / 2), PATH_Y - PATH_H / 2 - 12, ZONE_NAME[id], style(14, '#ffffff', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0.85).setDepth(3));
      this.zoneGlow = this.add.graphics().setDepth(4);
      this.add.text(tileToX(0) - 45, PATH_Y + PATH_H / 2 - 30, '방어선', style(13, '#ff8a80', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(3);
      ambient(this, st);
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x1a2229, 1).fillRect(0, PATH_Y - PATH_H / 2 - 40, 1280, PATH_H + 80);
    st.zones.slice(0, 3).forEach((id, i) => {
      const x = tileToX(i * ZONE_TILES + ZONE_TILES / 2);
      this.add.rectangle(x, PATH_Y, TILE * ZONE_TILES, PATH_H, ZONE_COLORS[id] ?? 0x666666);
      for (let k = 0; k < 12; k++) g.fillStyle(0x000000, 0.08).fillCircle(x - 170 + ((k * 73) % 340), PATH_Y - 50 + ((k * 37) % 100), 5 + (k % 3) * 2);
      this.add.text(x, PATH_Y - PATH_H / 2 - 16, ZONE_NAME[id], style(16)).setOrigin(0.5).setAlpha(0.8);
    });
    this.zoneGlow = this.add.graphics().setDepth(4);
    this.add.rectangle(tileToX(0), PATH_Y, 6, PATH_H + 20, 0xe74c3c);
    this.add.text(tileToX(0), PATH_Y + PATH_H / 2 + 18, '방어선', style(13, '#ff8a80')).setOrigin(0.5);
    this.add.text(tileToX(this.data2.config.pathLength), PATH_Y + PATH_H / 2 + 18, '적 등장', style(13, '#cccccc')).setOrigin(0.5);
  }

  drawHud() {
    const hud = this.add.graphics().setDepth(0);
    hud.fillGradientStyle(0x0b1016, 0x0b1016, 0x0b1016, 0x0b1016, 0.85, 0.85, 0, 0).fillRect(0, 0, 1280, 118);
    hud.lineStyle(1, 0xd4b06a, 0.35).lineBetween(0, 1, 1280, 1);
    panel(this, 12, 10, 118, 34, { r: 17, plain: true, alpha: 0.85, stroke: 0xff8a80 });
    panel(this, 138, 10, 150, 34, { r: 17, plain: true, alpha: 0.85 });
    this.lifeText = this.add.text(30, 27, '', style(19, '#ffb3b3', { stroke: '#000', strokeThickness: 3 })).setOrigin(0, 0.5).setDepth(2);
    this.goldText = this.add.text(154, 27, '', style(19, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setOrigin(0, 0.5).setDepth(2);
    this.waveText = this.add.text(560, 20, '', style(20, '#ffe6b0', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(2);
    this.phaseText = this.add.text(560, 46, '', style(14, '#cfd8dc')).setOrigin(0.5).setDepth(2);
    this.waveBar = this.add.graphics().setDepth(2);
    this.nextText = this.add.text(18, 58, '', style(13, '#aabbcc')).setOrigin(0, 0.5);
    this.nextText.setInteractive({ useHandCursor: true }).on('pointerover', () => this.nextFull && showTip(this, this.nextFull, 200, 70)).on('pointerout', () => hideTip(this));
    this.chipObjs = []; this.chipSig = '';
    this.skipBtn = button(this, 790, 30, 120, 40, '▶ 바로 시작', () => this.doSkip(), { tip: '준비 시간을 건너뛰고 웨이브 시작' });
    this.speedBtn = button(this, 912, 30, 92, 40, '', () => { this.speed = this.speed === 1 ? 2 : 1; }, { tip: '배속 (1 / 2 키)' });
    this.pauseBtn = button(this, 1012, 30, 92, 40, '', () => { this.paused = !this.paused; }, { tip: '일시정지 (P 키)' });
    button(this, 1098, 30, 80, 40, '⎋ 나가기', () => this.confirmLeave(), { fill: 0x4a1a1a, stroke: 0xc0392b, size: 14 });
    this.muteBtn = button(this, 1166, 30, 40, 40, isMuted() ? '🔇' : '🔊', () => { setMuted(!isMuted()); unlockAudio(); this.muteBtn.set(isMuted() ? '🔇' : '🔊'); sfx('click'); }, { size: 16, tip: '소리 켜기/끄기' });
    button(this, 1222, 30, 40, 40, '?', () => this.showHelp(), { size: 18, tip: '도움말 · 기호 설명' });
    this.relicLabel = this.add.text(1262, 70, '', style(12, '#d4b06a')).setOrigin(1, 0.5).setDepth(2);
    this.relicObjs = []; this.relicSig = '';
  }

  /** Symbol chips for synergies + bonds (rebuilt only when they change). */
  refreshChips() {
    const s = this.state;
    const syn = s.view?.synergies ?? [];
    const bonds = s.view?.bonds ?? [];
    const sig = syn.join() + '|' + bonds.map((b) => b.bond.name).join();
    if (sig === this.chipSig) return;
    this.chipSig = sig;
    this.chipObjs.forEach((c) => c.destroy()); this.chipObjs = [];
    let x = 18;
    for (const c of syn) { const o = chip(this, x, 76, `${CONT_ICON[c]} ${CONT_NAME[c]}`, SYN_TEXT[c], { stroke: 0x7fd1ff, size: 12 }); this.chipObjs.push(o); x += o.w + 6; }
    for (const b of bonds) { const clash = b.bond.kind === 'clash', flip = b.bond.kind === 'flip'; const o = chip(this, x, 76, `${flip ? '✨' : clash ? '⚡' : '♥'} ${b.bond.name}`, `${b.bond.name} · ${flip ? '뒤집힌 악연' : clash ? '악연' : '인연'}\n${(flip ? this.data2.tales?.flips : this.data2.tales?.bonds)?.[b.bond.id] ?? ''}\n· ${b.bond.desc}`, { stroke: flip ? 0xffd84d : clash ? 0xf0883e : 0xff9fbf, size: 12 }); this.chipObjs.push(o); x += o.w + 6; if (x > 900) break; }
  }

  /** Owned relics as icon chips at the top right. */
  refreshRelics() {
    const owned = ownedRelics(this.state, this.data2);
    const sig = owned.map((r) => r.id).join();
    if (sig === this.relicSig) return;
    this.relicSig = sig;
    this.relicObjs.forEach((c) => c.destroy()); this.relicObjs = [];
    let x = 1262;
    for (const r of [...owned].reverse()) {
      const tip = `${r.name} · ${RARITY_NAME[r.rarity]}\n${this.data2.tales?.relics?.[r.id] ?? ''}\n· ${r.desc}`;
      const o = chip(this, 0, 0, r.icon, tip, { stroke: RARITY_COL[r.rarity], size: 16 });
      o.destroy();
      x -= o.w + 4;
      this.relicObjs.push(chip(this, x, 60, r.icon, tip, { stroke: RARITY_COL[r.rarity], size: 16 }));
    }
    this.relicLabel.setText(owned.length ? '' : '');
  }

  /** Relic choice: 3 cards; battle waits until one is picked. */
  showRelicOffer() {
    const offer = this.state.relicOffer;
    if (!offer || this.relicModal) return;
    this.hideUnitCard();
    this.modalOpen = true;
    const objs = [];
    const dim = this.add.rectangle(640, 360, 1280, 720, 0x05080c, 0.72).setInteractive().setDepth(4000);
    objs.push(dim);
    const t = this.add.text(640, 150, '💎 유물 선택', style(32, '#ffe6b0', { stroke: '#2a1a08', strokeThickness: 6 })).setOrigin(0.5).setDepth(4002);
    const sub = this.add.text(640, 190, '하나를 골라 이번 판의 빌드를 바꾸세요', style(15, '#cfd8dc')).setOrigin(0.5).setDepth(4002);
    objs.push(t, sub);
    const W = 250, H = 300, gap = 30, x0 = 640 - (offer.length * W + (offer.length - 1) * gap) / 2;
    offer.forEach((id, i) => {
      const r = this.data2.relicById[id];
      const x = x0 + i * (W + gap), y = 230;
      const col = RARITY_COL[r.rarity];
      const g = this.add.graphics().setDepth(4001);
      const draw = (hover) => {
        g.clear();
        g.fillStyle(col, hover ? 0.35 : 0.18).fillRoundedRect(x - 6, y - 6, W + 12, H + 12, 20);
        g.fillGradientStyle(0x1e2c3e, 0x1e2c3e, 0x0c121a, 0x0c121a, 1).fillRoundedRect(x, y, W, H, 16);
        g.lineStyle(hover ? 3 : 2, col, 1).strokeRoundedRect(x, y, W, H, 16);
        g.fillStyle(col, 0.25).fillCircle(x + W / 2, y + 78, 50);
        g.lineStyle(2, col, 0.9).strokeCircle(x + W / 2, y + 78, 50);
      };
      draw(false);
      const icon = this.add.text(x + W / 2, y + 78, r.icon, style(48)).setOrigin(0.5).setDepth(4002);
      const nm = this.add.text(x + W / 2, y + 150, r.name, style(20, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(4002);
      const rr = this.add.text(x + W / 2, y + 176, RARITY_NAME[r.rarity], style(13, '#' + col.toString(16).padStart(6, '0'))).setOrigin(0.5).setDepth(4002);
      const tl = this.data2.tales?.relics?.[r.id] ?? '';
      const ds = this.add.text(x + W / 2, y + 198, tl, style(14, '#efe3c8', { align: 'center', wordWrap: { width: W - 34 }, lineSpacing: 3 })).setOrigin(0.5, 0).setDepth(4002);
      const mech = this.add.text(x + W / 2, y + H - 18, r.desc, style(12, '#9fb3c8', { align: 'center', wordWrap: { width: W - 30 } })).setOrigin(0.5, 1).setDepth(4002);
      objs.push(mech);
      const z = this.add.zone(x + W / 2, y + H / 2, W, H).setInteractive({ useHandCursor: true }).setDepth(4003);
      z.on('pointerover', () => { draw(true); this.tweens.add({ targets: icon, scale: 1.15, duration: 120 }); });
      z.on('pointerout', () => { draw(false); this.tweens.add({ targets: icon, scale: 1, duration: 120 }); });
      z.on('pointerdown', (p, a, b, ev) => { ev?.stopPropagation?.(); this.pickRelic(id); });
      objs.push(g, icon, nm, rr, ds, z);
      this.tweens.add({ targets: [g, icon, nm, rr, ds], alpha: { from: 0, to: 1 }, y: '-=0', duration: 250, delay: 80 * i });
    });
    sfx('evolve');
    this.relicModal = objs;
  }

  pickRelic(id) {
    if (!chooseRelic(this.state, this.data2, id).ok) return;
    this.relicModal?.forEach((o) => o.destroy());
    this.relicModal = null;
    this.modalOpen = false;
  }

  /** Expandable help: symbols first, details on demand. */
  showHelp() {
    if (this.modalOpen) return;
    this.modalOpen = true;
    const objs = [];
    objs.push(this.add.rectangle(640, 360, 1280, 720, 0x05080c, 0.7).setInteractive().setDepth(4000));
    objs.push(panel(this, 300, 110, 680, 500, { depth: 4001 }));
    objs.push(this.add.text(640, 145, '도움말', style(26, '#ffe6b0', { stroke: '#2a1a08', strokeThickness: 5 })).setOrigin(0.5).setDepth(4002));
    const sym = [['♥', '생명 — 적이 방어선을 넘으면 줄어요'], ['●', '골드 — 소환·먹이에 사용'], ['⚔', '피해'], ['⏱', '공격 간격(초)'], ['◎', '사거리'], ['🛡', '막는 적 수'], ['♥ 칩', '인연 — 함께 있으면 강해져요'], ['⚡ 칩', '상극 — 함께 있으면 약해져요'], ['🌏', '대륙 시너지'], ['💎', '유물 — 3·6·9·12 웨이브 뒤 선택'], ['🔒', '특성 고정 — 합쳐도 유지'], ['📜', '설화 능력'], ['Zz', '쉬는 중 (이동 직후)']];
    sym.forEach(([k, v], i) => {
      const x = 340 + (i % 2) * 320, y = 190 + Math.floor(i / 2) * 34;
      objs.push(this.add.text(x, y, k, style(17, '#ffd84d')).setDepth(4002), this.add.text(x + 56, y + 2, v, style(14, '#dfe6ea')).setDepth(4002));
    });
    const more = ['소환: 지구본이 대륙 → 서식지 → 동물 순으로 돌아요. 대륙/서식지를 지정하면 비싸지만 원하는 쪽이 나와요.', '출전: 대기석 동물을 길로 끌어 놓아요. 한 칸에 셋까지, 나는 동물은 하늘 어디든.', '진화: 같은 동물·같은 단계 둘 → 다음 단계. 성체 다른 종 둘 → 키메라.', '전투: 웨이브가 시작되면 전열은 앞으로, 후열은 뒤에서, 공중은 위에서 대형을 유지하며 전장 가운데로 나가요.', '로그라이트: 유물과 데려가는 동료로 판마다 빌드가 달라져요.'];
    let detail = null;
    const toggle = button(this, 640, 440, 180, 34, '자세히 ▾', () => {
      if (detail) { detail.forEach((o) => o.destroy()); detail = null; toggle.set('자세히 ▾'); return; }
      detail = []; let y = 470;
      for (const m of more) { const o = this.add.text(330, y, '· ' + m, style(13, '#cfd8dc', { wordWrap: { width: 620 } })).setDepth(4002); detail.push(o); y += o.height + 4; }
      toggle.set('접기 ▴');
    }, { depth: 4003, size: 14 });
    const close = () => { objs.forEach((o) => o.destroy()); detail?.forEach((o) => o.destroy()); toggle.destroy(); cb.destroy(); this.modalOpen = false; };
    const cb = button(this, 940, 140, 40, 40, '✕', close, { depth: 4003, size: 16 });
  }

  drawBench() {
    const n = this.state.bench.length;
    const cageMax = n + (this.data2.talents?.branches?.find((b) => b.id === 'cage')?.nodes ?? []).filter((c) => !(this.save.talents ?? []).includes(c.id)).length;
    const shown = Math.min(cageMax, n + 1);
    this.add.text(BENCH_X0 - SLOT / 2, BENCH_Y - SLOT / 2 - 16, `🧺 케이지 ${n}칸`, style(15)).setOrigin(0, 0.5);
    panel(this, BENCH_X0 - SLOT / 2 - 10, BENCH_Y - SLOT / 2 - 10, benchSlotX(shown - 1) - BENCH_X0 + SLOT + 20, SLOT + 20, { alpha: 0.55, plain: true });
    this.benchSlots = this.state.bench.map((_, i) => this.add.rectangle(benchSlotX(i), BENCH_Y, SLOT, SLOT, 0x0b1016, 0.5).setStrokeStyle(1.5, 0xd4b06a, 0.6).setDepth(1));
    for (let i = n; i < shown; i++) {
      const r = this.add.rectangle(benchSlotX(i), BENCH_Y, SLOT, SLOT, 0x05080c, 0.55).setStrokeStyle(1.5, 0x3b4b5e, 0.8).setDepth(1).setInteractive();
      this.add.text(benchSlotX(i), BENCH_Y, '🔒', style(22)).setOrigin(0.5).setAlpha(0.6).setDepth(2);
      r.on('pointerover', () => showTip(this, '잠긴 케이지\n· 별자리 나무의 케이지 갈래에서 열 수 있어요', benchSlotX(i), BENCH_Y - 50)).on('pointerout', () => hideTip(this));
    }
    const sx = 765, sy = 505;
    this.sellZone = this.add.rectangle(sx, sy, 150, 70, 0x3a1414, 0.85).setStrokeStyle(2, 0xc0392b, 0.9);
    this.add.text(sx, sy, '🪙 판매\n(끌어다 놓기)', style(13, '#ffcdd2', { align: 'center' })).setOrigin(0.5);
  }

  /** 내 진영 아홉 칸 (3열 × 3줄) and, during prep, a ghost of where the camp will fight. */
  drawCamp() {
    const cfg = this.data2.config, g = cfg.grid;
    if (!g) return;
    const rowH = PATH_H / g.rows, top = PATH_Y - PATH_H / 2;
    this.campGfx = this.add.graphics().setDepth(6);
    this.campGhost = this.add.graphics().setDepth(6);
    this.campHover = this.add.graphics().setDepth(7);
    const cg = this.campGfx;
    for (let c = 0; c < g.cols; c++) for (let r = 0; r < g.rows; r++) {
      const cx = tileToX(gridPos(c, cfg)), x = cx - TILE / 2 + 4, y = top + r * rowH + 3;
      cg.fillStyle(0xfff2d0, 0.1).fillRoundedRect(x, y, TILE - 8, rowH - 6, 10);
      cg.lineStyle(2, 0xffe6b0, 0.55).strokeRoundedRect(x, y, TILE - 8, rowH - 6, 10);
      cg.fillStyle(0xffe6b0, 0.5).fillCircle(cx, y + rowH - 14, 2.5);
    }
    const x0 = tileToX(gridPos(0, cfg)) - TILE / 2, x1 = tileToX(gridPos(g.cols - 1, cfg)) + TILE / 2;
    cg.lineStyle(3, 0xd4b06a, 0.9).strokeRoundedRect(x0, top - 2, x1 - x0, PATH_H + 4, 14);
    this.campLabel = this.add.text((x0 + x1) / 2, top - 14, '🛡 내 진영 · 아홉 칸', style(14, '#ffe6b0', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(7);
    const d = campDelta(cfg), gx0 = tileToX(gridPos(0, cfg) + d) - TILE / 2, gx1 = tileToX(gridPos(g.cols - 1, cfg) + d) + TILE / 2;
    const gh = this.campGhost;
    gh.lineStyle(2, 0xff8a65, 0.6);
    for (let k = gx0; k < gx1; k += 16) { gh.lineBetween(k, top, Math.min(k + 8, gx1), top); gh.lineBetween(k, top + PATH_H, Math.min(k + 8, gx1), top + PATH_H); }
    for (let k = top; k < top + PATH_H; k += 16) { gh.lineBetween(gx0, k, gx0, Math.min(k + 8, top + PATH_H)); gh.lineBetween(gx1, k, gx1, Math.min(k + 8, top + PATH_H)); }
    this.ghostLabel = this.add.text((gx0 + gx1) / 2, top + PATH_H + 12, '⚔ 웨이브가 오면 이 자리에서 싸워요', style(12, '#ffb199', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(7);
  }

  /** Light the cell under the pointer while dragging: green free, purple someone to merge/swap, red outside. */
  hoverCell(px, py, uid) {
    const cfg = this.data2.config, g = cfg.grid, hv = this.campHover;
    if (!g || !hv) return;
    hv.clear();
    if (uid == null) return;
    const c = gridCol(xToTile(px), cfg), onRoad = Math.abs(py - PATH_Y) <= PATH_H / 2;
    const me = [...this.state.field, ...this.state.bench].find((u) => u && u.uid === uid);
    const sky = me?.stats.flyer && py < PATH_Y - PATH_H / 2 && py > 110;
    if (!onRoad && !sky) return;
    if (c < 0) { hv.fillStyle(0xff5252, 0.18).fillRect(tileToX(xToTile(px)) - TILE / 2, PATH_Y - PATH_H / 2, TILE, PATH_H); return; }
    const r = onRoad ? laneAt(py) : g.skyY.reduce((b, v, i) => (Math.abs(v - py) < Math.abs(g.skyY[b] - py) ? i : b), 0);
    const rowH = PATH_H / g.rows, top = PATH_Y - PATH_H / 2;
    const who = cellUnit(this.state, c, r, uid);
    const col = who ? 0xb388ff : 0x7CFC9A;
    const cx = tileToX(gridPos(c, cfg));
    hv.fillStyle(col, 0.3).fillRoundedRect(cx - TILE / 2 + 4, top + r * rowH + 3, TILE - 8, rowH - 6, 10);
    hv.lineStyle(3, col, 1).strokeRoundedRect(cx - TILE / 2 + 4, top + r * rowH + 3, TILE - 8, rowH - 6, 10);
  }

  onPlaced(u) { const v = this.unitViews.get(u.uid); this.time.delayedCall(30, () => { const vv = this.unitViews.get(u.uid); if (!vv) return; this.fx.burst('puff', vv.container.x, vv.container.y + 34, 5, 0xd9c49a); this.fx.ring(vv.container.x, vv.container.y + 32, 0xffe6b0, 0.6, 260); sfx('hold'); }); return v; }

  drawBaitShop() {
    const b = this.data2.config.bait;
    this.baitLabel = this.add.text(24, 470, '🍖 먹이  ⓘ', style(13, '#ffe2b8')).setInteractive({ useHandCursor: true });
    this.baitLabel.on('pointerover', () => showTip(this, '준비 시간에만 · 다음 3회 소환에서 그 역할이 나올 확률 2배', 120, 466)).on('pointerout', () => hideTip(this));
    this.baitBtns = Object.entries(b.types).map(([id, t], i) =>
      button(this, 85 + i * 130, 510, 120, 44, `${t.name} ${b.cost}\n${ROLE_NAME[t.role]}`, () => this.doBait(id), { size: 13, fill: 0x4a3b22 }));
    this.baitState = this.add.text(560, 510, '', style(14, '#ffd84d')).setOrigin(0, 0.5);
  }

  drawSummonPanel() {
    panel(this, 895, 448, 375, 150, { depth: 1 });
    // real globe (Natural Earth outlines), telescope and caption
    this.globe = new Globe(this, 966, 518, 56, this.registry.get('raw').globe);
    this.scopeAt = [1182, 502];
    this.add.circle(...this.scopeAt, 42, 0x6b4a2e).setDepth(4);
    this.scope = this.add.circle(...this.scopeAt, 37, 0x0b0e12).setStrokeStyle(4, 0xd4b06a).setDepth(5);
    this.scopeLayer = this.add.container(0, 0).setDepth(6);
    this.ribbon = this.add.text(1082, 452, '', style(18, '#ffffff', { stroke: '#000', strokeThickness: 4, backgroundColor: '#101820f0', padding: { x: 14, y: 5 }, fontStyle: 'bold' })).setOrigin(0.5).setDepth(20).setVisible(false);
    this.globeText = this.add.text(1090, 460, '지구본을 돌려 보세요', style(12, '#ddeeff', { align: 'center', wordWrap: { width: 150 } })).setOrigin(0.5, 0).setDepth(6);
    const zone = this.add.zone(1082, 523, 375, 150).setInteractive().setDepth(7);
    zone.on('pointerdown', () => this.finishReveal());
    // designation
    this.contBtn = button(this, 990, 622, 185, 36, '', () => this.cycleDesignate('continent'), { size: 13, fill: 0x2b3f55 });
    this.habBtn = button(this, 1180, 622, 175, 36, '', () => this.cycleDesignate('habitat'), { size: 13, fill: 0x2b3f55 });
    this.summonBtn = button(this, 1085, 680, 370, 52, '', () => this.doSummon(), { size: 21, fill: 0x1d4f8c, stroke: 0xf2cf7a });
    this.refreshDesignate();
  }

  // ---------- globe presentation ----------
  continentList() { return [...new Set(this.data2.units.map((u) => u.continent))]; }

  /** Spinning light rays behind a point (지구본·망원경 결과 강조). */
  rays(x, y, r, color, dur = 1600, depth = 2) {
    const g = this.add.graphics().setDepth(depth).setPosition(x, y).setBlendMode('ADD');
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; g.fillStyle(color, i % 2 ? 0.18 : 0.32).fillTriangle(0, 0, Math.cos(a - 0.11) * r, Math.sin(a - 0.11) * r, Math.cos(a + 0.11) * r, Math.sin(a + 0.11) * r); }
    g.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
    this.tweens.add({ targets: g, angle: 90, duration: dur, onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() }) });
    return g;
  }

  showRibbon(text, color = '#ffffff', big = false) {
    this.ribbon.setText(text).setColor(color).setVisible(true).setAlpha(1).setScale(big ? 1.5 : 1.25);
    this.tweens.killTweensOf(this.ribbon);
    this.tweens.add({ targets: this.ribbon, scale: big ? 1.15 : 1, duration: 200, ease: 'Back.out' });
  }

  playGlobe(r) {
    const roll = r.roll, data = this.data2;
    const fast = this.save.settings.fastRoulette;
    const D = fast ? 200 : 600;
    const pct = (v) => Math.round(v * 100);
    this.hidden.add(r.unit.uid);
    this.reveal?.timers?.forEach((t) => t.remove());
    this.scopeLayer.removeAll(true);
    this.reveal = { r, timers: [] };
    const G = this.globe, T = this.reveal.timers;
    this.globeText.setColor('#ddeeff').setText('빙글빙글…\n어디에 멈출까?');
    this.ribbon.setVisible(false);
    // roulette ticks that slow down with the globe, sparks flying off the rim
    for (let i = 1; i <= 9; i++) T.push(this.time.delayedCall(D * (i / 9) ** 2, () => { sfx('click'); const a = Math.random() * Math.PI * 2; this.fx.burst('spark', G.x + Math.cos(a) * G.R, G.y + Math.sin(a) * G.R, 3, 0xcfe8ff); }));
    G.spinTo(roll.continent, HAB_SPOT[`${roll.continent}:${roll.habitat}`], D, { cont: CONT_NAME[roll.continent], hab: ZONE_NAME[roll.habitat] }, {
      onStop: () => {
        if (this.reveal?.r !== r || this.reveal.done) return;
        this.globeText.setText(`${pct(roll.continentChances[roll.continent])}% 확률의 대륙`);
        this.showRibbon(`${CONT_ICON[roll.continent]} ${CONT_NAME[roll.continent]}!`, '#b8f59a');
        this.rays(G.x, G.y, G.R + 46, 0xfff6a0, 1400);
        this.cameras.main.flash(90, 255, 250, 220);
        this.fx.ring(G.x, G.y, 0x9fd8ff, 1.5, 420); this.fx.burst('star', G.x, G.y - G.R, 8, 0xfff6a0); sfx('hold');
        this.tweens.add({ targets: G.g, scale: { from: 1.08, to: 1 }, duration: 260, ease: 'Back.out' });
      },
      onPin: () => {
        if (this.reveal?.r !== r || this.reveal.done) return;
        const [px, py] = G.pinXY();
        this.globeText.setText(`📍 핀이 꽂혔다 (${pct(roll.habitatChances[roll.habitat] ?? 0)}%)`);
        this.showRibbon(`${CONT_ICON[roll.continent]} ${CONT_NAME[roll.continent]} › 📍 ${ZONE_NAME[roll.habitat]}`, '#ffe066');
        this.fx.burst('spark', px, py + 14, 8, 0xffe066); sfx('coin');
      },
    });
    T.push(this.time.delayedCall(D * 2 + 120, () => {
      const [px, py] = G.pinXY();
      this.fx.line(px, py, this.scopeAt[0] - 40, this.scopeAt[1], 0xffe066, 5, 320);
      this.globeText.setText('망원경에 뭔가 잡혔다…!');
      const s = silhouette(this, ...this.scopeAt, 37); s.setScale(0.3);
      this.scopeLayer.add(s);
      this.tweens.add({ targets: s, scale: 1, duration: D, ease: 'Sine.out' });
      this.tweens.add({ targets: s, x: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: Math.floor(D / 120) });
      sfx('tongue');
    }));
    T.push(this.time.delayedCall(D * 3 + 180, () => this.finishReveal()));
  }

  finishReveal() {
    const rv = this.reveal;
    if (!rv || rv.done) return;
    rv.done = true;
    rv.timers.forEach((t) => t.remove());
    const { r } = rv, u = r.unit, data = this.data2;
    this.hidden.delete(u.uid);
    this.scopeLayer.removeAll(true);
    const tok = unitToken(this, u, data); tok.setPosition(...this.scopeAt);
    this.scopeLayer.add(tok);
    this.tweens.add({ targets: tok, scale: { from: 0.3, to: 1 }, duration: 250, ease: 'Back.out' });
    const traits = u.traits.map((t) => { const v = traitView(t, data); return `${v.tone === 'str' ? '＋' : '－'}${v.name}`; }).join('  ');
    this.globeText.setText(`${u.white ? '✨ 흰 ' : ''}${u.stats.name} (${(r.roll.chances[r.roll.unitId] * 100).toFixed(1)}%)\n${traits}`);
    sfx('reveal'); if (u.white) this.fx.burst('rise', ...this.scopeAt, 16, 0xffffff);
    const rar = u.kind === 'base' ? data.unitById[u.speciesId]?.rarity : null;
    const rcol = { common: 0xdfe9f2, rare: 0x7fc8ff, hero: 0xffd84d, epic: 0xc77dff }[rar] ?? 0xffffff;
    this.rays(...this.scopeAt, 74, rcol, 1600, 4);
    this.fx.ring(...this.scopeAt, rcol, 1.4, 420); this.fx.burst('star', ...this.scopeAt, 12, rcol);
    this.showRibbon(`${u.white ? '✨ 흰 ' : '✨ '}${u.stats.name}!`, '#' + rcol.toString(16).padStart(6, '0'), true);
    this.time.delayedCall(2600, () => { if (this.reveal === rv) this.tweens.add({ targets: this.ribbon, alpha: 0, duration: 300 }); });
    this.startEntrance(u.uid);
    this.time.delayedCall(1400, () => { if (this.reveal === rv) { this.globe.reset(); this.refreshDesignate(); } });
    this.globeText.setColor(u.traits.every((t) => t.kind === 'str') ? '#7CFC9A' : u.traits.every((t) => t.kind === 'weak') ? '#ffb27a' : '#ddeeff');
  }

  cycleDesignate(kind) {
    const data = this.data2, d = this.designate;
    if (kind === 'continent') {
      const list = [null, ...this.continentList()];
      d.continent = list[(list.indexOf(d.continent) + 1) % list.length];
      d.habitat = null;
    } else {
      const pool = data.units.filter((u) => !d.continent || u.continent === d.continent);
      const list = [null, ...new Set(pool.map((u) => u.habitat))];
      d.habitat = list[(list.indexOf(d.habitat) + 1) % list.length];
      if (d.habitat) d.continent = data.units.find((u) => u.habitat === d.habitat).continent;
    }
    this.refreshDesignate();
  }

  refreshDesignate() {
    const d = this.designate, c = this.data2.config.designate;
    this.contBtn.set(d.continent ? `대륙: ${CONT_NAME[d.continent]} (+${c.continent})` : '대륙 지정 안 함');
    this.habBtn.set(d.habitat ? `서식: ${ZONE_NAME[d.habitat]} (+${c.habitat})` : '서식환경 지정 안 함');
    const cont = d.continent ?? (d.habitat ? this.data2.units.find((u) => u.habitat === d.habitat)?.continent : null);
    if (this.globe && (!this.reveal || this.reveal.done)) { this.globe.face(cont); if (cont) this.globe.highlight = cont; }
  }

  // ---------- actions ----------
  toast(msg, color = '#ffd84d') {
    this.toastText.setText(msg).setColor(color).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(1800, () => this.toastText.setVisible(false));
  }

  doSummon() {
    if (this.modalOpen) return;
    const opts = this.designate.habitat ? { habitat: this.designate.habitat } : this.designate.continent ? { continent: this.designate.continent } : {};
    const r = summon(this.state, this.data2, opts);
    if (!r.ok) return this.toast(this.T('reason.' + r.reason));
    this.finishReveal();
    this.playGlobe(r);
    if (this.tutorialStep === 0) this.tutorialStep = 1;
  }

  doBait(id) {
    const r = buyBait(this.state, this.data2, id);
    if (!r.ok) return this.toast(r.reason === 'notPrep' ? '먹이는 준비 시간에만 살 수 있어요' : this.T('reason.' + r.reason));
    this.toast(`${this.data2.config.bait.types[id].name}을(를) 놓았어요 — 다음 3회 소환`);
  }

  doSkip() {
    const r = skipPrep(this.state, this.data2);
    if (!r.ok) this.toast(this.T('reason.' + r.reason)); else if (r.gold) this.toast(`바로 시작 +${r.gold} 골드`);
  }

  confirmLeave() {
    if (this.leaveArmed) { this.state.phase = 'ended'; this.state.result = 'lose'; this.leaveArmed = false; return; }
    this.leaveArmed = true; this.toast('한 번 더 누르면 이 판을 포기하고 나가요', '#ff8a80');
    this.time.delayedCall(2500, () => { this.leaveArmed = false; });
  }

  // ---------- unit card ----------
  showUnitCard(uid) {
    const s = this.state, data = this.data2;
    const u = [...s.field, ...s.bench].find((x) => x && x.uid === uid);
    if (!u) { this.hideUnitCard(); return; }
    const m = u.mods;
    const hp = Math.round(u.maxHp ?? u.stats.hp), dmg = m ? effDamage(u) : u.stats.damage, iv = m ? effInterval(u) : u.stats.interval;
    const rng = m ? effRange(u) : u.stats.range, blk = m ? effBlock(u) : u.stats.block;
    const bonds = (s.view?.bonds ?? []).filter((b) => Object.values(b.units).includes(u));
    const sig = [uid, Math.ceil(Math.max(0, u.hp)), hp, dmg.toFixed(1), iv.toFixed(2), rng, blk, u.traits.map((t) => t.id + t.locked).join(), bonds.map((b) => b.bond.name).join(), this.cardExpanded].join('|');
    if (sig === this.cardSig && this.cardObjs) return;
    this.hideUnitCard(true);
    this.cardSig = sig;
    const objs = [];
    const w = 248, x = 0;
    let y = 74;
    const add = (o) => { objs.push(o.setDepth?.(1801) ?? o); return o; };
    const sp = u.kind === 'base' ? data.unitById[u.speciesId] : null;
    add(this.add.text(x + 12, y, `${u.white ? '흰 ' : ''}${u.stats.name}`, style(17, '#ffffff', { stroke: '#000', strokeThickness: 3 })));
    const lv = sp ? ` Lv.${s.levels[sp.id] ?? 1}` : '';
    const sub = u.kind === 'chimera' ? `키메라 · ${ROLE_NAME[u.stats.role] ?? ''}` : u.kind === 'weak' ? (u.reversal ? '역전의 키메라' : '약체 · 판매만') : `${this.T('stage.' + u.stage)} · ${this.T('rarity.' + sp.rarity)} · ${ROLE_NAME[sp.role]}${lv}`;
    y += 24;
    add(this.add.text(x + 12, y, sub, style(12, '#d4b06a')));
    add(this.add.text(x + w - 12, y, `${u.stats.continents.map((c) => CONT_ICON[c]).join('')}`, style(12))).setOrigin(1, 0);
    const ed = u.stats.element ? data.config.elements.defs[u.stats.element] : null;
    if (ed) {
      const ch = u.kind === 'chimera' ? data.config.elements.chance.chimera : data.config.elements.chance[u.stage] ?? 0;
      const et = add(this.add.text(x + w - 34, y, ed.icon, style(13))).setOrigin(1, 0).setInteractive();
      et.on('pointerover', () => showTip(this, `${ed.name} 속성\n${ELEM_TALE[u.stats.element]}\n· ${ch ? `공격의 ${ch}%가 ${ed.name} 속성으로 터짐` : '성장기부터 속성 공격이 나옴'}`, x + w - 40, y)).on('pointerout', () => hideTip(this));
    }
    y += 20;
    const stat = (ix, iy, ic, val, tip) => {
      const t = add(this.add.text(ix, iy, `${ic} ${val}`, style(13, '#ffffff')));
      t.setInteractive().on('pointerover', () => showTip(this, tip, ix + 30, iy)).on('pointerout', () => hideTip(this));
    };
    stat(x + 12, y, '♥', `${Math.ceil(Math.max(0, u.hp))}/${hp}`, '체력');
    stat(x + 110, y, '⚔', dmg.toFixed(1), '피해');
    stat(x + 180, y, '⏱', iv.toFixed(2), '공격 간격(초)');
    y += 20;
    stat(x + 12, y, '◎', rng, '사거리');
    stat(x + 110, y, '🛡', blk, '막는 적 수');
    if (u.stats.canHitFlying) stat(x + 180, y, '🪶', '대공', '나는 적도 공격');
    y += 24;
    // trait chips
    let cx = x + 10;
    u.traits.forEach((t, i) => {
      const v = traitView(t, data);
      const col = v.tone === 'str' ? 0x7CFC9A : v.tone === 'flip' ? 0x7fd1ff : 0xffb27a;
      const c = chip(this, cx, y, `${t.locked ? '🔒' : ''}${v.name}`, `${v.tale || v.name}\n· ${v.desc}\n(누르면 ${t.locked ? '고정 풀기' : '고정'})`, { stroke: col, color: '#' + col.toString(16).padStart(6, '0'), size: 12, depth: 1803, onClick: () => { toggleLock(this.state, uid, i); this.cardSig = ''; this.showUnitCard(uid); } });
      if (cx + c.w > x + w - 10 && cx > x + 10) { c.destroy(); cx = x + 10; y += 26; const c2 = chip(this, cx, y, `${t.locked ? '🔒' : ''}${v.name}`, `${v.tale || v.name}\n· ${v.desc}`, { stroke: col, color: '#' + col.toString(16).padStart(6, '0'), size: 12, depth: 1803, onClick: () => { toggleLock(this.state, uid, i); this.cardSig = ''; this.showUnitCard(uid); } }); objs.push(...c2.objs); cx += c2.w + 5; }
      else { objs.push(...c.objs); cx += c.w + 5; }
    });
    if (u.traits.length) y += 28;
    // skills / passive / bonds as short chips
    cx = x + 10;
    const pas = sp ? data.lore.passives[sp.id] : null;
    const extra = [
      ...(u.stats.skillTales ?? []).map((k) => ['✦ ' + k.name, `${k.tale || k.name}\n· ${k.desc}`, 0xcfd8dc]),
      ...(pas ? [['📜 ' + pas.name, `${data.tales?.passives?.[sp.id] ?? pas.name}\n· ${pas.desc}`, 0xe8c3ff]] : []),
      ...bonds.map((b) => [`${b.bond.kind === 'clash' ? '⚡' : '♥'} ${b.bond.name}`, `${data.tales?.bonds?.[b.bond.id] ?? b.bond.name}\n· ${b.bond.desc}`, b.bond.kind === 'clash' ? 0xf0883e : 0xff9fbf]),
    ];
    for (const [lab, tip, col] of extra) {
      let c = chip(this, cx, y, lab, tip, { stroke: col, size: 12, depth: 1803 });
      if (cx + c.w > x + w - 10 && cx > x + 10) { c.destroy(); cx = x + 10; y += 26; c = chip(this, cx, y, lab, tip, { stroke: col, size: 12, depth: 1803 }); }
      objs.push(...c.objs); cx += c.w + 5;
    }
    if (extra.length) y += 28;
    if (this.cardExpanded) {
      const line = (t, col, size = 12) => { const o = add(this.add.text(x + 12, y, t, style(size, col, { wordWrap: { width: w - 24 } }))); y += o.height + 2; };
      const pair = (head, col, tale, mech) => { line(head, col, 12); if (tale) line(tale, '#efe3c8', 12); line('· ' + mech, '#8fa1b3', 11); y += 3; };
      u.traits.forEach((t) => { const v = traitView(t, data); pair(v.name, v.tone === 'str' ? '#7CFC9A' : v.tone === 'flip' ? '#7fd1ff' : '#ffb27a', v.tale, v.desc); });
      for (const k of u.stats.skillTales ?? []) pair('✦ ' + k.name, '#cfd8dc', k.tale, k.desc);
      if (pas) pair('📜 ' + pas.name, '#e8c3ff', data.tales?.passives?.[sp.id], pas.desc);
      if (sp) line(`"${u.stage === 'spirit' ? sp.spiritCodex : sp.codex}"`, '#8899aa');
    }
    const more = add(this.add.text(x + w / 2, y + 2, this.cardExpanded ? '접기 ▴' : '자세히 ▾', style(12, '#d4b06a'))).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    more.on('pointerdown', (p, a, b, ev) => { ev?.stopPropagation?.(); this.cardExpanded = !this.cardExpanded; this.cardSig = ''; this.showUnitCard(uid); });
    y += 22;
    const bg = panel(this, x, 64, w, y - 60, { depth: 1800, alpha: 0.92 });
    objs.push(bg);
    // anchor: above the bench for caged animals, beside the animal on the road, never over the portal
    const h = y - 60, vv = this.unitViews.get(uid);
    const ux = vv?.container.x ?? 640, uy = vv?.container.y ?? 300;
    const onBench = !this.state.field.includes(u);
    let ax, ay;
    if (onBench) { ax = Phaser.Math.Clamp(ux - w / 2, 8, 880 - w); ay = BENCH_Y - SLOT / 2 - 18 - h; }
    else { ax = ux + 70 + w < 1150 ? ux + 70 : ux - 70 - w; ax = Phaser.Math.Clamp(ax, 8, 1150 - w); ay = Phaser.Math.Clamp(uy - h / 2, 112, 440 - h); }
    for (const o of objs) { o.x += ax; o.y += ay - 64; }
    this.cardObjs = objs; this.cardUid = uid;
  }

  hideUnitCard(keep) { this.cardObjs?.forEach((o) => o.destroy()); this.cardObjs = null; if (!keep) { this.cardUid = null; this.cardSig = ''; } hideTip(this); }

  // ---------- frame ----------
  update(time, delta) {
    const live = !this.paused && !this.modalOpen;
    this.realDt = Math.min(delta / 1000, 0.1);
    const stop = (this.hitStop ?? 0) > 0;
    if (stop) this.hitStop -= this.realDt;
    this.frameDt = live && !stop ? Math.min(delta / 1000, 0.1) * this.speed : 0;
    this.enemyHits = new Set(this.state.events.filter((e) => e.type === 'enemyAttack').map((e) => e.eid));
    if (live && !stop) step(this.state, this.data2, this.frameDt);
    this.enemyHits = new Set([...this.enemyHits, ...this.state.events.filter((e) => e.type === 'enemyAttack').map((e) => e.eid)]);
    this.globe?.update(this.realDt);
    { const want = this.state.phase === 'wave' ? this.data2.config.formation?.squeeze ?? 1 : 1; this.squeezeK = (this.squeezeK ?? 1) + (want - (this.squeezeK ?? 1)) * Math.min(1, this.realDt * 3); }
    this.preAnimate();
    this.syncUnits();
    this.syncEnemies();
    this.drawBonds();
    this.persistentFx();
    this.syncPatches();
    this.tickKicks();
    this.drainEvents();
    this.updateHud();
    this.updateTutorial();
    if (this.cardUid != null && time - (this.cardAt ?? 0) > 250) { this.cardAt = time; this.showUnitCard(this.cardUid); }
    if (this.state.phase === 'ended' && !this.leaving) this.finish();
  }

  finish() {
    this.leaving = true;
    const s = this.state;
    if (s.result === 'clear') { this.fx.confetti(); this.fx.banner('스테이지 클리어!', '#7CFC9A'); sfx('clear'); } else sfx('lose');
    const report = settleRun(this.save, s, this.data2);
    const candidates = s.result === 'clear' ? carryCandidates(s, this.data2) : [];
    if (candidates.length) setCarry(this.save, this.data2, this.stageId, candidates[0]);
    if (this.tutorialStep >= 0) this.save.tutorialDone = true;
    writeSave(this.registry.get('storage'), this.save);
    this.time.delayedCall(s.result === 'clear' ? 2400 : 900, () => this.scene.start('Result', { report, candidates, stageId: this.stageId, wave: s.wave, total: s.stage.waves.length, life: s.life, bossLeaked: s.bossLeaked && s.result === 'clear' }));
  }

  makeUnitView(unit) {
    const c = this.add.container(0, 0);
    const sub = this.add.container(0, 30);
    const rig = unitRig(this, unit, sub, 0.22);
    const tok = rig ? sub : unitToken(this, unit, this.data2);
    const top = rig ? -70 : -38;
    const glow = unit.stage === 'spirit' ? this.add.ellipse(0, 30, 90, 22, COLORS.gold, 0.45) : unit.white ? this.add.ellipse(0, 30, 80, 20, 0xffffff, 0.4) : null;
    const name = this.add.text(0, 40, unit.stats.name, style(12, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    const barBg = this.add.rectangle(0, top, 50, 6, 0x000000).setOrigin(0.5);
    const bar = this.add.rectangle(-25, top, 50, 6, 0x2ecc71).setOrigin(0, 0.5);
    const downText = this.add.text(0, -10, '', style(20, '#ffffff', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    const icon = this.add.text(22, top + 8, '', style(15)).setOrigin(0.5);
    const foot = this.add.circle(0, 34, 4, 0x7CFC9A).setVisible(false);
    const foot2 = this.add.ellipse(0, 34, 58, 14, 0x000000, 0.3);
    const leaf = unit.speciesId === 'grasshopper' ? this.add.graphics() : null;
    if (leaf) { leaf.fillStyle(0x2e7d32, 1).fillEllipse(0, 36, 84, 18); leaf.fillStyle(0x66bb6a, 1).fillEllipse(-2, 33, 78, 13); leaf.lineStyle(2, 0x2e7d32, 1).lineBetween(-36, 34, 36, 34); leaf.lineStyle(3, 0x2e7d32, 1).lineBetween(38, 35, 52, 44); }
    c.add([foot2, leaf, glow, foot, tok, name, barBg, bar, downText, icon].filter(Boolean));
    c.unitUid = unit.uid;
    c.setSize(64, 80).setInteractive({ draggable: true, useHandCursor: true });
    const shadow = unit.stats.flyer ? this.add.ellipse(0, 0, 54, 14, 0x000000, 0.3).setDepth(45).setVisible(false) : null;
    const v = { container: c, tok, rig, shadow, bar, barBg, downText, name, icon, foot, foot2, lastHp: unit.hp, wasDown: unit.down, key: `${unit.kind}:${unit.speciesId}:${unit.stage}` };
    if (rig && this.state.time > 0) {
      const born = this.pendingBirth?.get(unit.uid);
      if (born) rig.inst.play(born);
    }
    return v;
  }

  /** Drive a unit's rig from what happened this frame. */
  animateUnit(u, v, onField, dt) {
    const r = v.rig;
    if (!r) return;
    const m = r.inst.motion;
    const busy = ['attack', 'skill', 'hit', 'merge_in', 'evolve', 'respawn'].includes(m) && !r.inst.finished;
    if (this.state.result === 'clear') { if (m !== 'victory') r.inst.play('victory', { loop: true }); }
    else if (u.down) { if (m !== 'down') r.inst.play('down'); }
    else if (v.wasDown) { r.inst.play('respawn'); this.fx.respawn(v.container.x, v.container.y); sfx('respawn'); }
    else if (onField && (u.moving || v.walking)) { if (m !== 'move') r.inst.play('move', { loop: true }); r.inst.moveVelocity = (u.moving ? Math.sign(u.targetPos - u.pos) : v.walkDir) * 180; }
    else if (!busy && onField && u.stats.flyer) { if (m !== 'move') r.inst.play('move', { loop: true }); }
    else if (!busy && m !== 'idle') r.inst.play('idle', { loop: true });
    if (!u.moving && !v.walking) r.inst.moveVelocity = 0;
    r.inst.setFacing(onField && ((u.moving && u.targetPos < u.pos) || (!u.moving && v.walking && v.walkDir < 0)) ? -1 : 1);
    if (u.hp < v.lastHp - 0.5 && !u.down) { r.inst.hitFlash(0.1); if (!busy && !u.moving) r.inst.play('hit'); }
    v.lastHp = u.hp; v.wasDown = u.down;
    r.view.update(dt);
  }

  syncUnits() {
    const s = this.state;
    const live = [
      ...s.field.map((u) => [u, tileToX(u.pos), u.stats.flyer ? (u.skyY ?? 200) - 30 : this.laneY(u.lane ?? 1), true]),
      ...s.bench.map((u, i) => (u ? [u, benchSlotX(i), BENCH_Y, false] : null)).filter(Boolean),
    ];
    const seen = new Set();
    for (const [u, x, y, onField] of live) {
      seen.add(u.uid);
      let v = this.unitViews.get(u.uid);
      if (!v) this.unitViews.set(u.uid, (v = this.makeUnitView(u)));
      if (this.dragUid !== u.uid) {
        if (onField && u.stats.flyer) {
          v.skyCur ??= y; v.skyCur += (y - v.skyCur) * Math.min(1, this.frameDt * 4 || 0.1);
          let px = x, py = v.skyCur + Math.sin(this.time.now / 380 + u.uid) * 6;
          if (v.dive) {
            v.dive.t += this.realDt || 0.016;
            const k = v.dive.t / 0.42;
            if (k >= 1) v.dive = null;
            else { const e = k < 0.4 ? Phaser.Math.Easing.Quadratic.In(k / 0.4) : 1 - Phaser.Math.Easing.Quadratic.Out((k - 0.4) / 0.6); px = x + (v.dive.tx - x) * e; py = py + (v.dive.ty - py) * e; v.container.setAngle((v.dive.tx > x ? 1 : -1) * 35 * (k < 0.4 ? e : -e * 0.6)); if (Math.random() < 0.5) this.fx.burst('leaf', px, py, 1, 0xffffff); }
            if (!v.dive) v.container.setAngle(0);
          }
          v.container.setPosition(px, py);
        } else if (onField) {
          v.curX ??= x; v.curY ??= y;
          const k = 1 - Math.exp(-5 * (this.realDt || 0.016) * (this.paused ? 0 : this.speed));
          const dx = x - v.curX;
          v.curX = Math.abs(dx) > 600 * (this.realDt || 0.016) * this.speed ? v.curX + Math.sign(dx) * 600 * (this.realDt || 0.016) * this.speed : v.curX + dx * k;
          v.curY += (y - v.curY) * k;
          v.walking = Math.abs(x - v.curX) > 6;
          v.walkDir = Math.sign(dx);
          let lx = 0;
          if (v.lungeT != null) { v.lungeT += this.realDt || 0.016; const k = v.lungeT / 0.3; lx = k < 0.35 ? -10 * (k / 0.35) * v.lungeDir : k < 1 ? (-10 + 40 * Math.sin(((k - 0.35) / 0.65) * Math.PI)) * v.lungeDir * (k < 0.55 ? 1 : 1) : 0; if (k >= 1) v.lungeT = null; }
          if (v.shakeT > 0) { v.shakeT -= this.realDt || 0.016; lx += Math.sin(this.time.now / 18) * 4 * Math.max(0, v.shakeT / 0.18); }
          v.container.setPosition(v.curX + lx, v.curY);
        } else { v.curX = x; v.curY = y; v.walking = false; v.container.setPosition(x, y); if (this.pendingEnt?.has(u.uid) && !this.hidden.has(u.uid)) this.startEntrance(u.uid); if (v.ent) this.tickEntrance(u, v, x, y); }
      } else { v.curX = undefined; v.curY = undefined; }
      v.container.setDepth(onField ? (u.stats.flyer ? 900 + y : 50 + y) : 60);
      if (v.ent && (onField || this.dragUid === u.uid)) this.endEntrance(v);
      if (!v.ent && this.dragUid !== u.uid) { const k = onField ? (u.stats.flyer ? LANE_SCALE[u.cell?.r ?? 1] * 0.96 : LANE_SCALE[u.lane ?? 1]) : 1; if (Math.abs((v.persp ?? 1) - k) > 0.001) { v.persp = k; v.container.setScale(k); } }
      if (v.foot2) v.foot2.setVisible(!u.stats.flyer || !onField);
      if (v.shadow) { v.shadow.setVisible(onField && u.stats.flyer && !u.down); v.shadow.setPosition(v.container.x, this.laneY(u.cell?.r ?? 1) + 34); }
      if (onField && u.hp < (v.hpSeen ?? u.hp) - 0.4 && !u.down) {
        const d = v.hpSeen - u.hp; v.shakeT = 0.18;
        this.floatText(v.container.x + Phaser.Math.Between(-8, 8), v.container.y - 60, `-${Math.round(d)}`, '#ff6b6b', d >= (u.maxHp ?? u.stats.hp) * 0.2 ? 22 : 15);
        this.fx.hit(v.container.x - 6, v.container.y - 10, 'red', false);
        const now = this.time.now;
        if (now - (v.hurtAt ?? -9999) > 2200 && Math.random() < 0.5) { v.hurtAt = now; this.fx.shout(v.container.x - 10, v.container.y - 88, soundOf(u, 'hurt'), 0xffd0d0, { size: 18, hold: 520 }); }
      }
      v.hpSeen = u.hp;
      const max = u.maxHp ?? u.stats.hp;
      v.bar.width = 50 * Math.max(0, u.hp) / max;
      v.bar.setFillStyle(u.hp / max < 0.3 ? 0xe74c3c : 0x2ecc71);
      v.bar.setVisible(onField); v.barBg.setVisible(onField);
      v.container.setAlpha(this.hidden.has(u.uid) ? 0 : u.down && !v.rig ? 0.35 : 1);
      this.animateUnit(u, v, onField, this.frameDt);
      v.downText.setText(u.down ? String(Math.ceil(u.respawnLeft)) : '');
      const clash = onField && (s.view?.bonds ?? []).some((b) => b.bond.kind === 'clash' && Object.values(b.units).includes(u));
      v.icon.setText(onField && !u.down && isResting(u) ? 'Zz' : clash ? '⚡' : '');
      v.foot.setVisible(onField && terrainMatch(u, s, this.data2.config));
      if (!v.rig) { if (onField && !u.down && !u.moving && this.lastAttack?.get(u.uid) > time() - 120) v.tok.setScale(1.12); else v.tok.setScale(1); }
    }
    for (const [uid, v] of this.unitViews) if (!seen.has(uid)) {
      v.ent?.hole?.destroy(); v.rig?.view.destroy(); v.shadow?.destroy(); v.container.destroy(); this.unitViews.delete(uid); }
  }

  /** Effects that last while a state lasts: stance bubbles, all-ally buffs, singing/leader auras, boss charge dust. */
  persistentFx() {
    const s = this.state, now = this.time.now;
    for (const u of s.field) {
      const v = this.unitViews.get(u.uid);
      if (!v) continue;
      const stance = (u.temp ?? []).length > 0 && !u.down;
      let b = this.stanceFx.get(u.uid);
      if (stance && !b) { b = this.fx.bubbleShield(v.container.x, v.container.y); if (b) this.stanceFx.set(u.uid, b); }
      if (b) { if (!stance) { b.destroy(); this.stanceFx.delete(u.uid); } else b.setPosition(v.container.x, v.container.y); }
      if (u.down || (v.auraAt ?? 0) > now) continue;
      v.auraAt = now + 1400 + (u.uid % 5) * 90;
      const types = u.stats.effects.map((e) => e.type);
      if (types.includes('haste')) this.fx.burst('note', v.container.x, v.container.y - 40, 2, 0xfff6a0);
      if (types.includes('aura')) this.fx.ring(v.container.x, v.container.y + 24, 0xff7043, 0.9, 600);
      if (s.allyBuffs?.length) this.fx.burst('rise', v.container.x, v.container.y + 10, 2, s.allyBuffs[0].stat === 'dmg' ? 0xff8a65 : 0xffe066);
      if (u.hundredDone) this.fx.burst('rise', v.container.x, v.container.y, 2, 0xffd84d);
    }
    for (const [uid, b] of this.stanceFx) if (!s.field.some((u) => u.uid === uid)) { b.destroy(); this.stanceFx.delete(uid); }
    for (const e of s.enemies) if (e.chargeLeft > 0 && Math.random() < 0.3) { const v = this.enemyViews.get(e.eid); if (v) this.fx.burst('puff', v.lastX + 20, v.lastY + 20, 1, 0xc9a26a); }
  }

  drawBonds() {
    const g = this.bondGfx; g.clear();
    this.bondTexts.forEach((t) => t.destroy()); this.bondTexts = [];
    for (const { bond, units } of this.state.view?.bonds ?? []) {
      if (bond.kind === 'clash') continue;
      const [a, b] = Object.values(units);
      const va = this.unitViews.get(a.uid), vb = this.unitViews.get(b.uid);
      if (!va || !vb) continue;
      g.lineStyle(2, 0xff8fb1, 0.7).lineBetween(va.container.x, va.container.y - 44, vb.container.x, vb.container.y - 44);
      this.bondTexts.push(this.add.text((va.container.x + vb.container.x) / 2, (va.container.y + vb.container.y) / 2 - 48, '♥', style(14, '#ff8fb1')).setOrigin(0.5).setDepth(41));
    }
  }

  makeEnemyView(e) {
    const def = this.data2.enemyById[e.id];
    const size = e.boss ? 52 : e.id === 'swarm' ? 16 : e.id === 'bat' ? 20 : 28;
    const holder = this.add.container(0, 0).setDepth(70);
    const px = size * 2.2;
    const rig = enemyRig(this, e, holder, px);
    const body = rig ? holder : e.flying ? this.add.triangle(0, 0, 0, size, size / 2, 0, size, size, hex(def.color)).setDepth(70) : this.add.rectangle(0, 0, size, size, hex(def.color)).setDepth(70);
    const barW = e.boss ? 70 : 30;
    const bar = this.add.rectangle(0, 0, barW, 4, 0xff5252).setOrigin(0, 0.5).setDepth(71);
    const label = e.boss ? this.add.text(0, 0, def.name, style(13, '#ffcccc', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(71) : null;
    const shield = e.pattern?.type === 'shield' ? this.add.circle(0, 0, size, 0x9b59b6, 0.25).setStrokeStyle(3, 0xd2b4ff).setDepth(72).setVisible(false) : null;
    return { body, rig, holder, bar, barW, size, px, label, shield, lastHp: e.hp };
  }

  syncEnemies() {
    const seen = new Set();
    for (const e of this.state.enemies) {
      seen.add(e.eid);
      let v = this.enemyViews.get(e.eid);
      if (!v) this.enemyViews.set(e.eid, (v = this.makeEnemyView(e)));
      const x = tileToX(Math.min(e.pos, this.data2.config.pathLength + 0.3));
      const bob = e.flying ? Math.sin((this.time.now / 300) + e.eid) * 5 : 0;
      const blk = e.blockedBy != null ? this.state.field.find((u) => u.uid === e.blockedBy) : null;
      const queue = blk ? this.state.enemies.filter((o) => o.blockedBy === e.blockedBy && !o.flying) : [];
      const qi = Math.max(0, queue.indexOf(e));
      const laneY = this.laneY(blk && !blk.stats.flyer ? blk.lane ?? 1 : e.eid % 3) + 22;
      v.laneY = v.laneY == null ? laneY : v.laneY + (laneY - v.laneY) * Math.min(1, (this.realDt || 0.016) * 6);
      const y = e.flying ? PATH_Y - 110 + bob : v.laneY + (e.boss ? -6 : 0);
      if (v.kb) { v.kb *= Math.pow(0.0005, this.realDt || 0.016); if (Math.abs(v.kb) < 0.3) v.kb = 0; }
      v.qx = (v.qx ?? 0) + (qi * 34 - (v.qx ?? 0)) * Math.min(1, (this.realDt || 0.016) * 8);
      const xk = x + (v.kb ?? 0) + v.qx;
      if (e.hp < v.lastHp - 0.4) { v.dmgAcc = (v.dmgAcc ?? 0) + (v.lastHp - e.hp); }
      if (v.dmgAcc && this.time.now - (v.dmgAt ?? 0) > 110) {
        const d = v.dmgAcc, heavy = d >= e.maxHp * 0.18;
        this.dmgNumber(xk, y - v.size / 2 - 26, d, heavy);
        v.dmgAcc = 0; v.dmgAt = this.time.now;
      }
      if (v.rig) {
        v.holder.setPosition(xk, y + v.px * 0.42);
        const r = v.rig.inst, m = r.motion;
        const still = e.blockedBy !== null || e.holdLeft > 0 || e.stunLeft > 0;
        if (this.enemyHits?.has(e.eid)) r.play('attack');
        else if (!(m === 'attack' && !r.finished) && !(m === 'hit' && !r.finished)) { if (still && m !== 'idle') r.play('idle', { loop: true }); else if (!still && m !== 'move') r.play('move', { loop: true }); }
        if (e.hp < v.lastHp - 0.01) { r.hitFlash(0.14); if (!(m === 'attack' && !r.finished)) r.play('hit'); }
        v.lastHp = e.hp;
        r.setFacing(e.confuseLeft > 0 ? 1 : -1);
        v.rig.view.update(e.stunLeft > 0 || e.holdLeft > 0 ? 0 : this.frameDt);
        v.holder.setDepth(70 + y / 10);
      } else { v.body.setPosition(xk, y); if (e.hp < v.lastHp - 0.01) { v.body.setFillStyle?.(0xffffff); this.time.delayedCall(70, () => v.body.active && v.body.setFillStyle?.(hex(this.data2.enemyById[e.id].color))); } v.lastHp = e.hp; }
      v.bar.setPosition(x - v.barW / 2, y - v.size / 2 - (v.rig ? 22 : 7));
      v.bar.width = v.barW * Math.max(0, e.hp) / e.maxHp;
      v.label?.setPosition(x, y + v.size / 2 + 12);
      v.shield?.setPosition(x, y).setVisible(e.shieldLeft > 0);
      const stroke = e.holdLeft > 0 || e.stunLeft > 0 ? 0xffffff : e.confuseLeft > 0 ? 0xc39bd3 : e.poisonLeft > 0 ? 0x58d68d : e.slowLeft > 0 ? 0x5dade2 : null;
      if (!v.rig && v.body.setStrokeStyle) { if (stroke === null) v.body.setStrokeStyle(); else v.body.setStrokeStyle(3, stroke); }
      if (v.rig) { v.statusTint ??= null; const tint = stroke; if (tint !== v.statusTint) { v.statusTint = tint; for (const o of v.holder.list) if (o.setTint) { if (tint === null) o.clearTint(); else o.setTint(tint === 0xffffff ? 0xbbbbff : tint); } } }
      v.lastX = xk; v.lastY = y;
      this.fx.status(e, x, y);
    }
    for (const [eid, v] of this.enemyViews) {
      if (seen.has(eid)) continue;
      v.bar.destroy(); v.label?.destroy(); v.shield?.destroy();
      this.enemyViews.delete(eid);
      if (v.rig) {
        v.rig.inst.play('down');
        const r = v.rig, h = v.holder, born = time();
        const tick = () => { r.view.update(this.frameDt || 0.016); if (time() - born < 650) this.time.delayedCall(16, tick); else { r.view.destroy(); h.destroy(); } };
        tick();
      } else v.body.destroy();
      (this.goneViews ??= new Map()).set(eid, v);
    }
  }

  /** Terrain patches on the road: a soft coloured field with drifting bits of its element, fading as it runs out. */
  syncPatches() {
    this.patchViews ??= new Map();
    const live = new Set();
    const defs = this.data2.config.patches?.defs ?? {};
    for (const p of this.state.patches ?? []) {
      live.add(p.id);
      let v = this.patchViews.get(p.id);
      const x = tileToX(p.pos), w = p.r * 2 * TILE, sky = p.kind === 'cloud' || p.kind === 'storm' || p.kind === 'sunbeam';
      if (!v) {
        const g = this.add.graphics().setDepth(sky ? 880 : 9);
        const col = PATCH_COL[p.kind];
        if (sky) {
          const cy = PATH_Y - PATH_H / 2 - 70;
          if (p.kind === 'sunbeam') { g.fillStyle(col, 0.16).fillPoints([{ x: x - 30, y: cy - 60 }, { x: x + 30, y: cy - 60 }, { x: x + w / 2, y: PATH_Y + PATH_H / 2 }, { x: x - w / 2, y: PATH_Y + PATH_H / 2 }], true); g.fillStyle(col, 0.22).fillEllipse(x, PATH_Y + 30, w, PATH_H * 0.5); }
          else { g.fillStyle(0x000000, 0.18).fillEllipse(x, PATH_Y + 30, w, PATH_H * 0.55); for (const [dx, dy, r] of [[-50, 6, 30], [-18, -8, 38], [22, -4, 34], [54, 8, 26], [0, 12, 40]]) g.fillStyle(col, 0.92).fillCircle(x + dx, cy + dy, r); for (const [dx, dy, r] of [[-30, 16, 26], [20, 18, 28]]) g.fillStyle(0x000000, p.kind === 'storm' ? 0.25 : 0.08).fillCircle(x + dx, cy + dy, r); }
        } else {
          g.fillStyle(col, 0.3).fillEllipse(x, PATH_Y + 10, w * 1.05, PATH_H * 0.86);
          g.fillStyle(col, 0.34).fillEllipse(x - 8, PATH_Y + 6, w * 0.8, PATH_H * 0.6);
          g.lineStyle(2.5, col, 0.85).strokeEllipse(x, PATH_Y + 10, w * 1.05, PATH_H * 0.86);
          const r = new Phaser.Math.RandomDataGenerator([String(p.id)]);
          for (let i = 0; i < 9; i++) {
            const px = x + r.between(-w * 0.4, w * 0.4), py = PATH_Y + 10 + r.between(-PATH_H * 0.3, PATH_H * 0.3);
            if (p.kind === 'frost') { g.lineStyle(2, 0xffffff, 0.8); for (let a = 0; a < 3; a++) g.lineBetween(px - Math.cos(a * 1.05) * 9, py - Math.sin(a * 1.05) * 5, px + Math.cos(a * 1.05) * 9, py + Math.sin(a * 1.05) * 5); }
            else if (p.kind === 'rock') g.fillStyle(0x6d6258, 0.9).fillTriangle(px - 10, py + 6, px + 10, py + 6, px + r.between(-4, 4), py - 12);
            else if (p.kind === 'thicket') { g.lineStyle(3, 0x2e7d32, 0.9); g.lineBetween(px, py + 6, px - 5, py - 10).lineBetween(px, py + 6, px + 1, py - 13).lineBetween(px, py + 6, px + 6, py - 9); }
            else if (p.kind === 'puddle') g.lineStyle(1.5, 0xffffff, 0.6).strokeEllipse(px, py, 22, 7);
            else if (p.kind === 'sand') { g.lineStyle(2, 0xfff0c0, 0.6); g.beginPath(); g.arc(px, py + 8, 14, -2.6, -0.5); g.strokePath(); }
            else g.fillStyle(0x2a1208, 0.5).fillEllipse(px, py, 16, 6);
          }
        }
        const lab = this.add.text(x, PATH_Y + PATH_H / 2 - 12, defs[p.kind].icon, style(15)).setOrigin(0.5).setDepth(10).setInteractive();
        const d = defs[p.kind];
        lab.on('pointerover', () => showTip(this, `${d.name}\n· ${PATCH_TIP[p.kind]}`, x, PATH_Y + PATH_H / 2 - 24)).on('pointerout', () => hideTip(this));
        g.setAlpha(0); this.tweens.add({ targets: g, alpha: 1, duration: 260 });
        v = { g, lab, at: 0 };
        this.patchViews.set(p.id, v);
      }
      const a = Math.min(1, p.left / 1.2);
      if (a < 1) v.g.setAlpha(a); v.lab.setAlpha(a);
      if (this.time.now > v.at) {
        v.at = this.time.now + 260;
        const px = x + Phaser.Math.Between(-w * 0.4, w * 0.4), py = PATH_Y + Phaser.Math.Between(-PATH_H * 0.3, PATH_H * 0.35);
        const pt = { scorch: ['rise', 0xff7a1a], puddle: ['bubble', 0x9fe4ff], frost: ['snow', 0xffffff], sand: ['puff', 0xe2c078], thicket: ['leaf', 0x9ccc65], sunbeam: ['rise', 0xfff1a8], rock: ['puff', 0xb0a090], cloud: ['snow', 0xffffff], storm: ['orb', 0x9fb8ff] }[p.kind];
        this.fx.burst(pt[0], px, sky && p.kind !== 'sunbeam' ? PATH_Y - PATH_H / 2 - 50 : py, 1, pt[1]);
      }
    }
    for (const [id, v] of this.patchViews) if (!live.has(id)) { v.g.destroy(); v.lab.destroy(); this.patchViews.delete(id); }
  }

  /** 연타 표시: 짧은 시간 안에 이어진 타격 수를 크게 보여 준다. */
  combo() {
    const now = this.time.now;
    this.comboN = now - (this.comboAt ?? 0) < 900 ? (this.comboN ?? 0) + 1 : 1;
    this.comboAt = now;
    if (this.comboN < 3) return;
    this.comboText ??= this.add.text(860, 150, '', style(30, '#ffe066', { stroke: '#7a2a00', strokeThickness: 7, fontStyle: 'bold' })).setOrigin(1, 0.5).setDepth(1700).setAngle(-6);
    this.comboText.setText(`${this.comboN}연타!`).setAlpha(1).setScale(1.5);
    this.tweens.killTweensOf(this.comboText);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 900, duration: 300 });
  }

  /** 신화급 탄생: 컷인과 함께 약점이 하나씩 강점으로 뒤집히는 걸 보여 준다. */
  spiritDrama(uid) {
    const u = [...this.state.field, ...this.state.bench].find((x) => x && x.uid === uid);
    if (!u) return;
    this.lastCutIn = -9999;
    this.fx.cutIn(`${u.stats.name} 강림`, 0xffd84d, '약점이 모두 강점으로 뒤집혔다!');
    this.hitStop = 0.25;
    const flips = (u.traits ?? []).filter((t) => t.kind === 'weak' && t.flipped).map((t) => this.data2.traits?.[t.sp]?.weak.find((d) => d.id === t.id)).filter(Boolean);
    flips.forEach((d, i) => this.time.delayedCall(700 + i * 650, () => {
      const v = this.unitViews.get(uid); if (!v) return;
      const x = v.container.x, y = v.container.y;
      const t = this.add.text(x, y - 70, d.name, style(18, '#ffb27a', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(1760);
      this.tweens.add({ targets: t, scaleX: 0, duration: 180, delay: 250, onComplete: () => { t.setText('✨ ' + d.flip.name).setColor('#7fd1ff'); this.tweens.add({ targets: t, scaleX: 1.25, scaleY: 1.25, duration: 200, ease: 'Back.out' }); this.fx.ring(x, y, 0xffd84d, 1.4, 420); this.fx.burst('star', x, y - 30, 10, 0x7fd1ff); sfx('reveal'); } });
      this.tweens.add({ targets: t, y: y - 120, alpha: 0, delay: 1300, duration: 400, onComplete: () => t.destroy() });
    }));
  }

  /** 먹이사슬·악연 킥: 가끔 벌벌 떨거나 말다툼을 한다. 신화급이 악연을 뒤집으면 크게 알린다. */
  tickKicks() {
    if (this.modalOpen || this.paused) return;
    const now = this.time.now, bonds = this.state.view?.bonds ?? [];
    this.kickAt ??= new Map(); this.flipSeen ??= new Set();
    const pos = (u) => { const v = this.unitViews.get(u.uid); return v ? [v.container.x, v.container.y, v] : null; };
    for (const { bond: b, units } of bonds) {
      const [pa, pb] = b.pair; const A = pos(units[pa]), P = pos(units[b.prey ?? pb]);
      if (!A || !P) continue;
      if (b.kind === 'flip' && !this.flipSeen.has(b.id)) {
        this.flipSeen.add(b.id);
        const base = this.data2.lore.bonds.find((x) => x.id === b.id);
        this.fx.banner(`✨ 악연이 뒤집혔다 · ${base.name} ➜ ${b.name}`, '#ffd84d', this.data2.tales?.flips?.[b.id] ?? b.desc);
        this.fx.hearts(A[0], A[1], P[0], P[1]); this.fx.line(A[0], A[1] - 20, P[0], P[1] - 20, 0xffd84d, 5, 500); this.cameras.main.flash(200, 255, 240, 180); sfx('bond');
        this.kickAt.set(b.id, now + 6000);
        continue;
      }
      if (!b.kick && b.kind !== 'flip') continue;
      if (!this.kickAt.has(b.id)) { this.kickAt.set(b.id, now + 2500 + Math.random() * 2000); continue; }
      if (now < this.kickAt.get(b.id)) continue;
      this.kickAt.set(b.id, now + 7000 + Math.random() * 5000);
      const say = (at, list, col, delay = 0) => this.time.delayedCall(delay, () => this.fx.shout(at[0], at[1] - 86, list[Math.floor(Math.random() * list.length)], col, { size: 17, hold: 600 }));
      if (b.kind === 'flip') { this.fx.burst('heart', (A[0] + P[0]) / 2, Math.min(A[1], P[1]) - 40, 3); continue; }
      const bk = b.barks ?? { pred: ['…'], prey: ['…'] };
      if (b.kick === 'fear') {
        if (Math.random() < 0.5) say(A, bk.pred, 0xffe0b2);
        P[2].shakeT = 0.9; say(P, bk.prey, 0xcfe8ff, 350);
        this.time.delayedCall(350, () => this.floatText(P[0] + 22, P[1] - 46, '💦', '#ffffff', 16));
      } else if (b.kick === 'bicker') {
        say(A, bk.pred, 0xffcdd2); say(P, bk.prey, 0xffe0b2, 450);
        A[2].shakeT = 0.4; this.time.delayedCall(450, () => { P[2].shakeT = 0.4; });
        this.time.delayedCall(700, () => this.floatText((A[0] + P[0]) / 2, Math.min(A[1], P[1]) - 60, '💢', '#ff5252', 22));
      } else { say(A, bk.pred, 0xfff1a8); say(P, bk.prey, 0xd8f5c8, 400); }
    }
  }

  /** Bench entrance: the animal bursts out of its slot as a silhouette, lands, then its colours pop in. */
  startEntrance(uid) {
    const v = this.unitViews.get(uid);
    if (!v) { (this.pendingEnt ??= new Set()).add(uid); return; }
    this.pendingEnt?.delete(uid);
    const x = v.container.x, y = v.container.y;
    v.ent = { t: 0, landed: false };
    if (v.rig) v.rig.inst.silhouette = true;
    v.name.setVisible(false);
    const hole = this.add.ellipse(x, y + 36, 20, 8, 0x05080c, 0.85).setDepth(59);
    this.tweens.add({ targets: hole, scaleX: 3.6, scaleY: 2.2, duration: 140, ease: 'Back.out' });
    v.ent.hole = hole;
    this.fx.burst('puff', x, y + 34, 6, 0xbfae8a); this.fx.burst('shard', x, y + 30, 5, 0x8d7a5a);
    sfx('dodge');
  }

  /** Cut an entrance short (the animal was dragged out of the cage mid-jump). */
  endEntrance(v) {
    const e = v.ent; if (!e) return;
    e.hole?.destroy();
    if (v.rig) v.rig.inst.silhouette = false;
    v.name.setVisible(true).setScale(1);
    v.container.setAngle(0).setScale(v.persp ?? 1);
    v.ent = null;
  }

  tickEntrance(u, v, x, y) {
    const e = v.ent, dt = this.realDt || 0.016;
    e.t += dt;
    const k = Math.min(1, e.t / 0.4);
    if (!e.landed) {
      const yo = 44 * (1 - k) ** 2 - Math.sin(Math.PI * k) * 62;
      v.container.setPosition(x, y + yo).setScale(0.3 + 0.7 * Math.min(1, k * 1.7)).setAngle(Math.sin(k * Math.PI * 2) * 8);
      if (k >= 1) {
        e.landed = true;
        v.container.setAngle(0);
        if (v.rig) { v.rig.inst.silhouette = false; v.rig.inst.hitFlash(0.2); v.rig.inst.play('merge_in'); }
        v.name.setVisible(true).setScale(0.3); this.tweens.add({ targets: v.name, scale: 1, duration: 200, ease: 'Back.out' });
        this.tweens.add({ targets: v.container, scaleX: { from: 1.28, to: 1 }, scaleY: { from: 0.74, to: 1 }, duration: 260, ease: 'Back.out' });
        const col = u.white ? 0xffffff : u.traits?.every((t) => t.kind === 'str') ? 0x7CFC9A : 0xfff6a0;
        this.fx.ring(x, y + 30, col, 1.1, 420); this.fx.burst('star', x, y, 10, col); this.fx.burst('rise', x, y + 10, 10, col); this.fx.burst('puff', x, y + 34, 4, 0xbfae8a);
        const ed = u.stats.element ? this.data2.config.elements.defs[u.stats.element] : null;
        if (ed) this.floatText(x + 30, y - 44, ed.icon, '#ffffff', 18);
        this.tweens.add({ targets: e.hole, alpha: 0, scaleX: 0.5, duration: 300, onComplete: () => e.hole.destroy() });
        sfx('respawn');
      }
    } else if (e.t > 0.7) v.ent = null;
  }

  dmgNumber(x, y, d, heavy) {
    if (heavy) { this.stopFor(0.05); this.cameras.main.shake(80, 0.003); }
    const t = this.add.text(x + Phaser.Math.Between(-10, 10), y, String(Math.round(d)), style(heavy ? 26 : 17, heavy ? '#ffe066' : '#ffffff', { stroke: heavy ? '#7a2a00' : '#000000', strokeThickness: heavy ? 6 : 4, fontStyle: 'bold' })).setOrigin(0.5).setDepth(1700).setScale(heavy ? 1.6 : 1.2);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - (heavy ? 42 : 30), alpha: 0, delay: heavy ? 380 : 220, duration: 420, onComplete: () => t.destroy() });
  }

  kick2(ev, fromX) { this.kick(ev.eids?.length ? ev.eids : [ev.eid], fromX, 9); }

  /** Row height on the road; rows close in a little toward the middle while a wave runs (패싸움 느낌). */
  laneY(r) {
    const mid = LANE_Y[1];
    return mid + (LANE_Y[r] - mid) * (this.squeezeK ?? 1);
  }

  /** Hit-stop: freeze the simulation for a few frames on heavy hits. */
  stopFor(sec) { const now = this.time.now; if (now - (this.lastStopAt ?? 0) < 220) return; this.lastStopAt = now; this.hitStop = Math.max(this.hitStop ?? 0, sec); }

  /** Knock enemy sprites back from x and squash them (visual only). */
  kick(eids, fromX, px) {
    for (const id of eids) {
      const v = this.enemyViews.get(id);
      if (!v) continue;
      v.kb = (Math.sign(v.lastX - fromX) || 1) * px;
      const o = v.rig ? v.holder : v.body;
      this.tweens.add({ targets: o, scaleX: { from: 1.18, to: 1 }, scaleY: { from: 0.84, to: 1 }, duration: 160, ease: 'Back.out' });
    }
  }

  floatText(x, y, msg, color, size = 16) {
    const t = this.add.text(x, y, msg, style(size, color, { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  /** Unit rig reactions to this frame's events (before views sync). */
  preAnimate() {
    this.pendingBirth ??= new Map();
    for (const ev of this.state.events) {
      const v = ev.uid != null ? this.unitViews.get(ev.uid) : null;
      if (ev.type === 'attack' && v?.rig) v.rig.inst.play('attack');
      if (ev.type === 'skill' && v?.rig && ev.name) v.rig.inst.play('skill');
      if (ev.type === 'merge') this.pendingBirth.set(ev.uid, ev.kind === 'evolve' || ev.kind === 'spirit' ? 'evolve' : 'merge_in');
      if (ev.type === 'summon') this.pendingBirth.set(ev.uid, 'merge_in');
      if (ev.type === 'twin') this.hidden.add(ev.uid);
    }
  }

  drainEvents() {
    const data = this.data2;
    const unitPos = (uid) => { const v = this.unitViews.get(uid); return v ? [v.container.x, v.container.y] : [640, 300]; };
    this.lastAttack ??= new Map();
    for (const ev of this.state.events) {
      switch (ev.type) {
        case 'kill': { const v = this.goneViews?.get(ev.eid); if (v) { if (ev.gold) this.floatText(v.lastX, v.lastY - 10, `+${ev.gold}`, '#ffd84d'); this.fx.kill(v.lastX, v.lastY, ev.gold, ev.boss); } sfx(ev.boss ? 'bigKill' : 'kill'); if (ev.gold) sfx('coin'); if (ev.boss) { this.cameras.main.flash(300, 255, 255, 255); this.fx.banner(`${data.enemyById[ev.id].name} 처치!`, '#ffd84d'); } break; }
        case 'leak': this.floatText(tileToX(0) + 30, PATH_Y - 40, `-${ev.leak}`, '#ff5252', 22); this.fx.leak(tileToX(0), PATH_Y); this.cameras.main.shake(100, 0.005); sfx('leak'); break;
        case 'attack': {
          this.lastAttack.set(ev.uid, time());
          this.combo();
          { const uu = this.state.field.find((x) => x.uid === ev.uid), ve0 = this.enemyViews.get(ev.eid); const now = this.time.now; if (uu && ve0 && now - (this.hitWordAt?.get(ev.uid) ?? -9999) > 1600 && Math.random() < 0.45) { (this.hitWordAt ??= new Map()).set(ev.uid, now); this.time.delayedCall(uu.stats.range >= 3 ? 220 : 60, () => this.fx.sfxWord(ve0.lastX + Phaser.Math.Between(-12, 12), ve0.lastY - 44, soundOf(uu, 'hit'), '#fff2a8', ev.aoe ? 28 : 22)); } }
          const u = this.state.field.find((x) => x.uid === ev.uid);
          const ve = this.enemyViews.get(ev.eid) ?? this.goneViews?.get(ev.eid);
          if (!u || !ve) break;
          const [ux, uy] = unitPos(ev.uid);
          const kind = STRIKE[u.speciesId] ?? (u.stats.range >= 3 ? 'shot' : 'swing');
          if (kind === 'dive') {
            const v = this.unitViews.get(ev.uid);
            if (v) v.dive = { t: 0, tx: ve.lastX, ty: ve.lastY - 30 };
            this.time.delayedCall(170, () => { this.fx.gust(ve.lastX, ve.lastY, 1, u.speciesId === 'phoenix' ? 0xffb35c : 0xe0f7ff); this.fx.hit(ve.lastX, ve.lastY, u.speciesId === 'phoenix' ? 'orange' : 'white', true); if (ev.aoe) this.fx.groundAoe(ve.lastX, ve.lastY + 26, 80, u.speciesId === 'thunderbird' ? 0xfff6a0 : u.speciesId === 'phoenix' ? 0xff8a3c : 0xcfefff, { shake: false }); if (u.speciesId === 'thunderbird') this.fx.bolt(ve.lastX, ve.lastY - 150, ve.lastX, ve.lastY); this.kick2(ev, ux); });
            sfx('slash');
          } else if (kind === 'drop') { this.fx.drop(ve.lastX, ve.lastY, 'fx-stone', u.speciesId === 'cheese_thief' ? 0xffe9a8 : 0xffffff); this.time.delayedCall(200, () => this.kick2(ev, ux)); sfx('shoot'); }
          else if (u.stats.range >= 3) { this.fx.projectile(u.speciesId, ux, uy, ve.lastX, ve.lastY, ev.aoe); sfx(SHOT_SFX[u.speciesId] ?? 'shoot'); }
          else {
            const v = this.unitViews.get(ev.uid);
            if (v) { v.lungeT = 0; v.lungeDir = Math.sign(ve.lastX - ux) || 1; }
            const big = ev.aoe || u.stats.role === 'bruiser';
            const dir = Math.sign(ve.lastX - ux) || 1;
            if (kind === 'claw') this.fx.scratch(ve.lastX, ve.lastY - 4, 0xffffff, dir);
            else if (kind === 'bite') this.fx.bite(ve.lastX, ve.lastY - 6);
            else if (kind === 'paw') { this.fx.paw(ve.lastX, ve.lastY); if (u.speciesId === 'bear_tiger') this.fx.scratch(ve.lastX, ve.lastY - 4, 0xffd08a, dir); }
            else if (kind === 'horn') this.fx.horn(ve.lastX, ve.lastY - 4, dir);
            else if (kind === 'kick') this.fx.kick(ve.lastX, ve.lastY, dir);
            if (kind === 'swing' || ev.aoe) this.fx.meleeArc(ux, uy, ve.lastX, ve.lastY, ev.aoe ? 0xffe066 : 0xffffff, big);
            this.fx.hit(ve.lastX, ve.lastY, ev.aoe ? 'gold' : 'white', ev.aoe);
            if (big) this.fx.impact(ve.lastX + 6, ve.lastY - 8, ev.aoe ? 0xffb35c : 0xffe066, ev.aoe ? 1.1 : 0.8);
            if (ev.aoe) { this.fx.groundAoe(ve.lastX, ve.lastY + 26, 75, 0xffd84d, { shake: false }); this.stopFor(0.045); }
            this.kick(ev.eids?.length ? ev.eids : [ev.eid], ux, big ? 12 : 7);
            this.cameras.main.shake(70, big ? 0.0028 : 0.0014);
            sfx('slash'); sfx('hit');
          }
          this.fx.onHitFlavor(u.stats.effects, ve.lastX, ve.lastY);
          break;
        }
        case 'skill': {
          const at = unitPos(ev.uid);
          const targets = (ev.eids ?? []).map((id) => this.enemyViews.get(id)).filter(Boolean).map((v) => [v.lastX, v.lastY]);
          const u = this.state.field.find((x) => x.uid === ev.uid);
          const extra = { color: u?.speciesId === 'wolf' ? 0xff7043 : 0xffd84d, allies: this.state.field.filter((o) => !o.down).map((o) => unitPos(o.uid)), allyAt: ev.ally != null ? unitPos(ev.ally) : null };
          this.fx.skillFx(ev.fx, at, targets, extra);
          if (ev.big && ev.name) { const k = (u?.stats.skillTales ?? []).find((q) => q.name === ev.name) ?? u?.stats.skillTales?.at(-1); if (this.fx.cutIn(ev.name, SHOUT_COL[ev.fx] ?? 0xffe066, k?.tale ?? '')) this.stopFor(0.12); }
          if (ev.name) this.fx.shout(at[0], at[1] - 92, soundOf(u, 'skill'), SHOUT_COL[ev.fx] ?? 0xffe066, { size: 24, label: ev.name });
          if (targets.length && ['damageHeld', 'pushHeld', 'damageAll', 'stunRadius', 'flee'].includes(ev.fx)) { this.stopFor(0.07); this.kick(ev.eids ?? [], at[0], 16); }
          sfx(ev.fx === 'allyBuff' ? (u?.speciesId === 'wolf' ? 'howl' : 'note') : SKILL_SFX[ev.fx] ?? 'magic');
          break;
        }
        case 'hold': { const targets = (ev.eids ?? []).map((id) => this.enemyViews.get(id)).filter(Boolean).map((v) => [v.lastX, v.lastY]); this.fx.skillFx('hold', unitPos(ev.uid), targets, { burst: ev.burst }); sfx(ev.burst ? 'slam' : 'hold'); break; }
        case 'counter': { const v = this.enemyViews.get(ev.eid); if (v) this.fx.skillFx('counter', unitPos(ev.uid), [[v.lastX, v.lastY]]); sfx('slash'); break; }
        case 'shieldUp': { const v = this.enemyViews.get(ev.eid); if (v) this.fx.ring(v.lastX, v.lastY, 'purple', 1.4); sfx('shield'); break; }
        case 'splash': { const v = this.enemyViews.get(ev.eid); if (v) { this.fx.burst('orb', v.lastX, v.lastY, 1); this.fx.hit(v.lastX, v.lastY, 'green'); this.floatText(v.lastX, v.lastY - 30, '배 떨어짐!', '#c5e1a5', 12); } break; }
        case 'bait': sfx('bait'); break;
        case 'patch': { const d = data.config.patches.defs[ev.kind]; this.floatText(tileToX(ev.pos), PATH_Y - PATH_H / 2 - 4, `${d.icon} ${d.name}`, '#ffffff', 15); this.fx.ring(tileToX(ev.pos), PATH_Y, PATCH_COL[ev.kind], 2.2, 500); break; }
        case 'patchBolt': { const v = this.enemyViews.get(ev.eid); if (v) { this.fx.bolt(v.lastX + Phaser.Math.Between(-16, 16), v.lastY - 170, v.lastX, v.lastY); this.fx.hit(v.lastX, v.lastY, 'gold'); sfx('bolt'); } break; }
        case 'element': {
          const targets = (ev.eids ?? []).map((id) => this.enemyViews.get(id) ?? this.goneViews?.get(id)).filter(Boolean).map((v) => [v.lastX, v.lastY]);
          if (!targets.length) break;
          this.fx.element(ev.el, unitPos(ev.uid), targets);
          const d = data.config.elements.defs[ev.el];
          this.fx.sfxWord(targets[0][0] + 10, targets[0][1] - 58, `${d.icon}${ELEM_SOUND[ev.el] ?? ''}`, '#ffffff', 22);
          sfx(ELEM_SFX[ev.el] ?? 'magic');
          break;
        }
        case 'relic': { const r = data.relicById[ev.id]; this.toast(`${r.icon} ${r.name} 획득`, '#e0c3ff'); this.cameras.main.flash(250, 200, 160, 255); sfx('evolve'); break; }
        case 'twin': this.time.delayedCall(this.save.settings.fastRoulette ? 1000 : 2300, () => { this.hidden.delete(ev.uid); this.startEntrance(ev.uid); this.time.delayedCall(450, () => { const [x, y] = unitPos(ev.uid); this.floatText(x, y - 60, '🥚 쌍둥이!', '#fff6a0', 16); }); }); break;
        case 'interest': if (ev.gold > 0) { this.floatText(220, 52, `+${ev.gold} 이자`, '#ffd84d', 15); sfx('coin'); } break;
        case 'knock': { const ve = this.enemyViews.get(ev.eid); if (ve) { this.fx.burst('puff', ve.lastX, ve.lastY + 10, 4, 0xd9c49a); this.fx.hit(ve.lastX, ve.lastY, 'orange'); } break; }
        case 'heal': { const ve = this.enemyViews.get(ev.eid); if (ve) this.fx.heal(ve.lastX, ve.lastY); sfx('heal'); break; }
        case 'down': { const [x, y] = unitPos(ev.uid); this.fx.down(x, y); sfx('down'); break; }
        case 'dodge': { const [x, y] = unitPos(ev.uid); this.floatText(x, y - 30, '회피', '#7fd1ff', 13); this.fx.burst('leaf', x, y, 3, 0x7fd1ff); sfx('dodge'); break; }
        case 'survive': { const [x, y] = unitPos(ev.uid); this.floatText(x, y - 50, '간을 두고 왔다!', '#ffb3c6', 16); this.fx.evolve(x, y, false); sfx('evolve'); break; }
        case 'summon': sfx('summon'); break;
        case 'gold': this.floatText(...unitPos(ev.uid), `+${ev.gold}`, '#ffd84d'); break;
        case 'bondNew': {
          const b = data.lore.bonds.find((x) => x.id === ev.id);
          const pair = (this.state.view?.bonds ?? []).find((x) => x.bond.id === ev.id);
          if (pair) { const [a, c] = Object.values(pair.units).map((u) => unitPos(u.uid)); if (b.kind === 'clash') { this.fx.clash(...a); this.fx.clash(...c); } else this.fx.hearts(...a, ...c); } sfx(b.kind === 'clash' ? 'clash' : 'bond');
          this.toast(`${b.kind === 'clash' ? '⚡ 상극' : '♥ 인연'} 발견: ${b.name} — ${b.desc}`, b.kind === 'clash' ? '#f0883e' : '#ff9fbf'); break; }
        case 'shieldBreak': { this.toast('보호막이 깨졌다!', '#d2b4ff'); const ve = this.enemyViews.get(ev.eid); if (ve) this.fx.shieldBreak(ve.lastX, ve.lastY); sfx('shatter'); break; }
        case 'bossSummon': { this.floatText(640, PATH_Y - 110, '박쥐왕이 졸개를 불렀다', '#aab7b8'); const ve = this.enemyViews.get(ev.eid); if (ve) { this.fx.burst('puff', ve.lastX, ve.lastY, 10, 0x6c5a8a); this.fx.ring(ve.lastX, ve.lastY, 'purple', 1.5); } sfx('bossSummon'); break; }
        case 'merge': {
          const [mx, my] = unitPos(ev.uid);
          if (ev.kind === 'weak') { this.toast('합성 실패… 적들이 멈춰서 구경한다', '#cccccc'); this.fx.weak(mx, my); sfx('weak'); }
          if (ev.kind === 'chimera') { this.cameras.main.flash(250, 180, 120, 255); sfx('chimera'); this.fx.chimera(mx, my); this.fx.banner(`${this.state.field.concat(this.state.bench).find((x) => x && x.uid === ev.uid)?.stats.name ?? '키메라'} 탄생!`, '#d7bde2', '키메라 합성 성공'); }
          if (ev.kind === 'evolve') { this.fx.evolve(mx, my, false); sfx('evolve'); }
          if (ev.kind === 'spirit') { this.spiritDrama(ev.uid); sfx('spirit'); this.fx.evolve(mx, my, true); this.cameras.main.flash(300, 255, 230, 140);  }
          if (this.tutorialStep === 2 && (ev.kind === 'evolve' || ev.kind === 'spirit')) this.tutorialStep = 3;
          if (this.tutorialStep === 3 && (ev.kind === 'chimera' || ev.kind === 'weak')) this.endTutorial();
          break;
        }
        case 'waveStart': {
          const w = this.state.stage.waves[ev.wave - 1];
          const boss = (w?.extra ?? []).map((id) => data.enemyById[id]).find((e) => e && e.boss && e.id !== 'miniboss');
          const mini = (w?.extra ?? []).includes('miniboss');
          sfx(boss ? 'boss' : 'wave');
          if (boss) { this.fx.banner(`보스 등장 · ${boss.name}`, '#ff6b6b', boss.desc); this.cameras.main.shake(400, 0.006); }
          else if (mini) this.fx.banner(`웨이브 ${ev.wave} · 덤불멧돼지`, '#ffb27a', '미니보스가 온다');
          else this.fx.banner(`웨이브 ${ev.wave}`, '#ffffff', Object.keys(w?.mix ?? {}).map((id) => data.enemyById[id].name).join(' · '));
        }
          if (this.tutorialStep === 3 && ev.wave >= 6) this.endTutorial(); break;
        default: break;
      }
    }
    this.state.events.length = 0;
    this.goneViews?.clear();
  }

  updateTutorial() {
    if (this.tutorialStep < 0) { this.tutorialText.setVisible(false); return; }
    if (this.tutorialStep === 1 && this.state.field.length > 0) this.tutorialStep = 2;
    this.tutorialText.setVisible(true).setText(`${this.tutorialStep + 1}/4  ${TUTORIAL[this.tutorialStep]}   ✕`);
    if (!this.tutorialText.input) this.tutorialText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.endTutorial());
  }

  endTutorial() { this.tutorialStep = -1; this.save.tutorialDone = true; writeSave(this.registry.get('storage'), this.save); this.tutorialText.setVisible(false); }

  updateHud() {
    const s = this.state, data = this.data2;
    this.lifeText.setText(`♥ ${s.life}`);
    this.goldText.setText(`● ${s.gold}`);
    this.waveText.setText(`${s.stage.name} · ${s.wave}/${s.stage.waves.length}`);
    this.phaseText.setText(s.relicOffer ? '💎 유물 선택' : s.phase === 'prep' ? `⏳ 준비 ${Math.ceil(s.prepLeft)}초` : s.phase === 'wave' ? '⚔ 전투 중' : '');
    const w = s.stage.waves[s.wave - 1];
    if (w) {
      const ids = [...Object.keys(w.mix), ...(w.extra ?? [])];
      this.nextFull = `이번 웨이브: ${ids.map((id) => data.enemyById[id].name).join(', ')}`;
      this.nextText.setText(`☠ ${ids.slice(0, 3).map((id) => data.enemyById[id].name).join(' · ')}${ids.length > 3 ? ` +${ids.length - 3}` : ''}`);
    }
    this.waveBar.clear();
    const n = s.stage.waves.length;
    for (let i = 0; i < n; i++) { const x = 560 - (n * 14) / 2 + i * 14 + 7; this.waveBar.fillStyle(i < s.wave - 1 ? 0xd4b06a : i === s.wave - 1 ? 0xffe6b0 : 0x3b4b5e, 1).fillCircle(x, 64, i === s.wave - 1 ? 4.5 : 3.5); if ((data.relicCfg?.offerWaves ?? []).includes(i + 1)) this.waveBar.lineStyle(1.5, 0xc77dff, 0.9).strokeCircle(x, 64, 6); }
    this.refreshChips();
    this.refreshRelics();
    if (s.relicOffer && !this.relicModal) this.showRelicOffer();
    const cost = summonPrice(s, data, this.designate.habitat ? { habitat: 1 } : this.designate.continent ? { continent: 1 } : {});
    this.summonBtn.set(`소환 ${cost}골드  (스페이스)`).setEnabled(s.gold >= cost && s.bench.includes(null));
    this.skipBtn.setVisible(s.phase === 'prep');
    if (this.campGhost) { const prep = s.phase === 'prep'; this.campGhost.setVisible(prep); this.ghostLabel.setVisible(prep); this.campGfx.setAlpha(prep ? 1 : 0.45); this.campLabel.setAlpha(prep ? 1 : 0.5); }
    this.speedBtn.set(`▶×${this.speed}`);
    this.pauseBtn.set(this.paused ? '▶ 계속' : '❚❚ 정지');
    const prep = s.phase === 'prep';
    this.baitBtns.forEach((b) => b.setEnabled(prep && s.gold >= data.config.bait.cost));
    this.baitState.setText(s.bait ? `먹이: ${data.config.bait.types[s.bait.type].name} (남은 ${s.bait.left}회)` : '');
    // terrain glow for the selected unit
    this.zoneGlow.clear();
    const sel = s.field.find((u) => u.uid === this.selectedUid) ?? s.bench.find((u) => u && u.uid === this.selectedUid);
    if (sel) s.stage.zones.forEach((z, i) => { if (sel.stats.habitats.includes(z)) this.zoneGlow.lineStyle(4, 0x7CFC9A, 0.9).strokeRect(tileToX(i * ZONE_TILES) + 2, PATH_Y - PATH_H / 2 + 2, TILE * ZONE_TILES - 4, PATH_H - 4); });
  }
}

const time = () => performance.now();
const SHOT_SFX = { monkey: 'shoot', crow: 'shoot', eagle: 'slash', fox: 'magic', rooster: 'note', grasshopper: 'note', frog: 'magic', cheese_thief: 'magic', thunderbird: 'bolt', phoenix: 'fire', bullfrog: 'magic' };
const PATCH_TIP = { scorch: '밟은 적이 불에 덴다', puddle: '적이 느려지고 번개에 더 아파한다', cloud: '나는 적이 느려지고 우리 편은 잘 피한다', rock: '적이 느려지고 우리 편은 덜 다친다', sand: '적의 공격이 굼떠진다', storm: '번개가 적을 때린다', frost: '적이 크게 느려진다', thicket: '우리 편이 잘 피하고 기운을 차린다', sunbeam: '우리 편 손발이 빨라진다' };
const PATCH_COL = { scorch: 0xff6a2a, puddle: 0x4fc3ff, cloud: 0xdfe9f2, rock: 0x9a8a78, sand: 0xe2c078, storm: 0x6b6fa8, frost: 0xbfeaff, thicket: 0x5fbf5a, sunbeam: 0xfff1a8 };
const ELEM_TALE = {
  fire: '여우불이 옮겨붙으면 한동안 타올랐대요.',
  water: '물벼락을 맞은 녀석들은 발이 무거워졌지요.',
  wind: '휙 부는 바람에 적들이 뒤로 밀려났대요.',
  earth: '땅이 쿵 울리면 둘레가 다 비틀거렸지요.',
  thunder: '번개는 한 번에 그치지 않고 옆으로 튀었대요.',
  moon: '달빛 낙인이 찍힌 녀석은 더 아프게 맞았지요.',
  grass: '땅에서 덩굴이 솟아 발목을 휘감았대요.',
  light: '새벽빛에 눈이 부셔 적이 손을 멈칫했지요.',
};
const ELEM_SFX = { fire: 'fire', water: 'heal', wind: 'dodge', earth: 'slam', thunder: 'bolt', moon: 'magic', grass: 'note', light: 'evolve' };
const SHOUT_COL = { damageHeld: 0xffb35c, pushHeld: 0xffd08a, damageAll: 0xffb35c, flee: 0xff8a65, stunRadius: 0xb8ff8a, allyBuff: 0xffe066, stance: 0xa8e1ff, charm: 0xffb3d1, tongue: 0xffb3d1, hundred: 0xffe066, crowCall: 0xfff1a8, roosterFlee: 0xfff1a8, halveRespawn: 0xfff1a8 };
const SKILL_SFX = { damageHeld: 'slash', flee: 'roar', pushHeld: 'slam', damageAll: 'stampede', stunRadius: 'slam', halveRespawn: 'crow', stance: 'stance', charm: 'charm', tongue: 'tongue', hundred: 'hundred', crowCall: 'crow', roosterFlee: 'crow' };
