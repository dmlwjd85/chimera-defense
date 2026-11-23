import Phaser from 'phaser';
import { attachInput } from './BattleInput.js';
import { buildData } from '../logic/data.js';
import { createBattle, step, summon, skipPrep, deploy, moveUnit, recall, sell, merge, buyBait, toggleLock, summonPrice, addCarry, chooseRelic } from '../logic/battle.js';
import { ownedRelics } from '../logic/relics.js';
import { battleOptions, settleRun, writeSave, carryCandidates, setCarry } from '../logic/meta.js';
import { traitView } from '../logic/traits.js';
import { terrainMatch, effRange, effBlock, effDamage, effInterval } from '../logic/mods.js';
import { isResting } from '../logic/combat.js';
import { makeEnemy } from '../logic/waves.js';
import { unitRig, enemyRig } from './rigs.js';
import { FX, ambient } from './fx.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sfx.js';
import { button, panel, style, unitToken, silhouette, hex, COLORS, chip, showTip, hideTip } from './ui.js';

import { PATH_Y, X0, TILE, PATH_H, BENCH_Y, BENCH_X0, BENCH_GAP, SLOT, tileToX, xToTile, benchSlotX, LANE_Y } from './layout.js';
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
    for (const b of bonds) { const clash = b.bond.kind === 'clash'; const o = chip(this, x, 76, `${clash ? '⚡' : '♥'} ${b.bond.name}`, `${clash ? '상극' : '인연'} · ${b.bond.desc}`, { stroke: clash ? 0xf0883e : 0xff9fbf, size: 12 }); this.chipObjs.push(o); x += o.w + 6; if (x > 900) break; }
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
      const o = chip(this, 0, 0, r.icon, `${r.name} (${RARITY_NAME[r.rarity]})\n${r.desc}`, { stroke: RARITY_COL[r.rarity], size: 16 });
      o.destroy();
      x -= o.w + 4;
      this.relicObjs.push(chip(this, x, 60, r.icon, `${r.name} (${RARITY_NAME[r.rarity]})\n${r.desc}`, { stroke: RARITY_COL[r.rarity], size: 16 }));
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
      const ds = this.add.text(x + W / 2, y + 200, r.desc, style(14, '#dfe6ea', { align: 'center', wordWrap: { width: W - 30 } })).setOrigin(0.5, 0).setDepth(4002);
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
    this.add.text(BENCH_X0 - SLOT / 2, BENCH_Y - SLOT / 2 - 16, '대기석', style(15)).setOrigin(0, 0.5);
    panel(this, BENCH_X0 - SLOT / 2 - 10, BENCH_Y - SLOT / 2 - 10, benchSlotX(this.state.bench.length - 1) - BENCH_X0 + SLOT + 20, SLOT + 20, { alpha: 0.55, plain: true });
    this.benchSlots = this.state.bench.map((_, i) => this.add.rectangle(benchSlotX(i), BENCH_Y, SLOT, SLOT, 0x0b1016, 0.5).setStrokeStyle(1.5, 0xd4b06a, 0.6).setDepth(1));
    const sx = Math.max(760, benchSlotX(this.state.bench.length - 1) + 130);
    this.sellZone = this.add.rectangle(sx, BENCH_Y, 110, SLOT, 0x3a1414, 0.85).setStrokeStyle(2, 0xc0392b, 0.9);
    this.add.text(sx, BENCH_Y, '🪙\n판매', style(15, '#ffcdd2', { align: 'center' })).setOrigin(0.5);
  }

  drawBaitShop() {
    const b = this.data2.config.bait;
    this.baitLabel = this.add.text(24, 470, '🍖 먹이  ⓘ', style(13, '#ffe2b8')).setInteractive({ useHandCursor: true });
    this.baitLabel.on('pointerover', () => showTip(this, '준비 시간에만 · 다음 3회 소환에서 그 역할이 나올 확률 2배', 120, 466)).on('pointerout', () => hideTip(this));
    this.baitBtns = Object.entries(b.types).map(([id, t], i) =>
      button(this, 85 + i * 130, 510, 120, 44, `${t.name} ${b.cost}\n${ROLE_NAME[t.role]}`, () => this.doBait(id), { size: 13, fill: 0x4a3b22 }));
    this.baitState = this.add.text(560, 510, '', style(14, '#ffd84d')).setOrigin(0, 0.5);
  }

  drawSummonPanel() {
    panel(this, 895, 395, 375, 185, { depth: 1 });
    // globe
    const gx = 960, gy = 462, R = 56;
    this.globe = { x: gx, y: gy, R };
    this.add.circle(gx, gy, R + 4, 0x0c1a2b).setDepth(2);
    this.globeLayer = this.add.container(0, 0).setDepth(3);
    const maskG = this.make.graphics({}, false); maskG.fillStyle(0xffffff).fillCircle(gx, gy, R);
    this.globeLayer.setMask(maskG.createGeometryMask());
    this.globeRing = this.add.circle(gx, gy, R).setStrokeStyle(3, 0x86c5ff).setDepth(5);
    this.scanLine = this.add.rectangle(gx, gy, R * 2, 3, 0xffe066).setDepth(6).setVisible(false);
    this.scope = this.add.circle(1170, 462, 44, 0x0b0e12).setStrokeStyle(4, 0xb0bec5).setDepth(5);
    this.scopeLayer = this.add.container(0, 0).setDepth(6);
    this.globeText = this.add.text(1082, 526, '지구본 소환', style(13, '#ddeeff', { align: 'center', wordWrap: { width: 360 } })).setOrigin(0.5, 0).setDepth(6);
    this.paintGlobe(0);
    const zone = this.add.zone(1082, 487, 375, 185).setInteractive().setDepth(7);
    zone.on('pointerdown', () => this.finishReveal());
    // designation
    this.contBtn = button(this, 990, 607, 185, 40, '', () => this.cycleDesignate('continent'), { size: 13, fill: 0x2b3f55 });
    this.habBtn = button(this, 1180, 607, 175, 40, '', () => this.cycleDesignate('habitat'), { size: 13, fill: 0x2b3f55 });
    this.summonBtn = button(this, 1085, 672, 370, 58, '', () => this.doSummon(), { size: 22, fill: 0x1d4f8c, stroke: 0xf2cf7a });
    this.refreshDesignate();
  }

  // ---------- globe presentation ----------
  continentList() { return [...new Set(this.data2.units.map((u) => u.continent))]; }

  paintGlobe(offset) {
    const { x, y, R } = this.globe;
    this.globeLayer.removeAll(true);
    const conts = this.continentList();
    const colors = { eurasia: 0x6aa84f, america: 0xc9a227, africa: 0xb85c38 };
    const w = R * 1.4;
    for (let k = -2; k <= conts.length + 1; k++) {
      const c = conts[((k % conts.length) + conts.length) % conts.length];
      const cx = x + k * w - offset;
      const r = this.add.rectangle(cx, y, w - 6, R * 2, colors[c] ?? 0x777777, 0.85);
      const t = this.add.text(cx, y, CONT_NAME[c], style(14, '#0b0e12', { fontStyle: 'bold' })).setOrigin(0.5);
      this.globeLayer.add([r, t]);
    }
    for (let i = 1; i < 3; i++) this.globeLayer.add(this.add.rectangle(x, y - R + (i * 2 * R) / 3, R * 2, 1, 0x0c1a2b, 0.6));
  }

  playGlobe(r) {
    const roll = r.roll, conts = this.continentList(), R = this.globe.R, w = R * 1.4, data = this.data2;
    const target = conts.indexOf(roll.continent) * w;
    const habs = [...new Set(data.units.filter((u) => u.continent === roll.continent).map((u) => u.habitat))];
    const hi = habs.indexOf(roll.habitat);
    const fast = this.save.settings.fastRoulette;
    const D = fast ? 200 : 600;
    this.hidden.add(r.unit.uid);
    this.reveal?.timers?.forEach((t) => t.remove());
    this.scopeLayer.removeAll(true);
    this.scanLine.setVisible(false);
    const pct = (v) => Math.round(v * 100);
    this.reveal = { r, timers: [] };
    const spin = { v: 0 };
    this.tweens.add({ targets: spin, v: target + w * conts.length * 2, duration: D, ease: 'Cubic.out', onUpdate: () => this.paintGlobe(spin.v % (w * conts.length)) });
    this.globeText.setText(`경도 → ${CONT_NAME[roll.continent]} ${pct(roll.continentChances[roll.continent])}%`);
    this.reveal.timers.push(this.time.delayedCall(D + 60, () => {
      this.scanLine.setVisible(true).setY(this.globe.y - R);
      const lbl = habs.map((h) => `${ZONE_NAME[h] ?? h} ${pct(roll.habitatChances[h] ?? 0)}%`).join(' · ');
      this.globeText.setText(`위도 스캔: ${lbl}`);
      this.tweens.add({ targets: this.scanLine, y: this.globe.y - R + (2 * R) * (hi + 0.5) / habs.length, duration: D, ease: 'Back.out' });
    }));
    this.reveal.timers.push(this.time.delayedCall(D * 2 + 120, () => {
      this.globeText.setText(`${CONT_NAME[roll.continent]} · ${ZONE_NAME[roll.habitat]} — 망원경으로 보는 중…`);
      const s = silhouette(this, 1170, 462, 44); s.setScale(0.4);
      this.scopeLayer.add(s);
      this.tweens.add({ targets: s, scale: 1, duration: D, ease: 'Sine.out' });
    }));
    this.reveal.timers.push(this.time.delayedCall(D * 3 + 180, () => this.finishReveal()));
  }

  finishReveal() {
    const rv = this.reveal;
    if (!rv || rv.done) return;
    rv.done = true;
    rv.timers.forEach((t) => t.remove());
    const { r } = rv, u = r.unit, data = this.data2;
    this.hidden.delete(u.uid);
    this.scopeLayer.removeAll(true);
    const tok = unitToken(this, u, data); tok.setPosition(1170, 462);
    this.scopeLayer.add(tok);
    this.tweens.add({ targets: tok, scale: { from: 0.3, to: 1 }, duration: 250, ease: 'Back.out' });
    const traits = u.traits.map((t) => { const v = traitView(t, data); return `${v.tone === 'str' ? '＋' : '－'}${v.name}`; }).join('  ');
    this.globeText.setText(`${u.white ? '✨ 흰 ' : ''}${u.stats.name} (${(r.roll.chances[r.roll.unitId] * 100).toFixed(1)}%)\n${traits}`);
    sfx('reveal'); if (u.white) this.fx.burst('rise', 1170, 462, 16, 0xffffff);
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
    const x = 1022, w = 248;
    let y = 74;
    const add = (o) => { objs.push(o.setDepth?.(1801) ?? o); return o; };
    const sp = u.kind === 'base' ? data.unitById[u.speciesId] : null;
    add(this.add.text(x + 12, y, `${u.white ? '흰 ' : ''}${u.stats.name}`, style(17, '#ffffff', { stroke: '#000', strokeThickness: 3 })));
    const lv = sp ? ` Lv.${s.levels[sp.id] ?? 1}` : '';
    const sub = u.kind === 'chimera' ? `키메라 · ${ROLE_NAME[u.stats.role] ?? ''}` : u.kind === 'weak' ? (u.reversal ? '역전의 키메라' : '약체 · 판매만') : `${this.T('stage.' + u.stage)} · ${this.T('rarity.' + sp.rarity)} · ${ROLE_NAME[sp.role]}${lv}`;
    y += 24;
    add(this.add.text(x + 12, y, sub, style(12, '#d4b06a')));
    add(this.add.text(x + w - 12, y, `${u.stats.continents.map((c) => CONT_ICON[c]).join('')}`, style(12))).setOrigin(1, 0);
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
      const c = chip(this, cx, y, `${t.locked ? '🔒' : ''}${v.name}`, `${v.name}: ${v.desc}\n(누르면 ${t.locked ? '고정 해제' : '고정'})`, { stroke: col, color: '#' + col.toString(16).padStart(6, '0'), size: 12, depth: 1803, onClick: () => { toggleLock(this.state, uid, i); this.cardSig = ''; this.showUnitCard(uid); } });
      if (cx + c.w > x + w - 10 && cx > x + 10) { c.destroy(); cx = x + 10; y += 26; const c2 = chip(this, cx, y, `${t.locked ? '🔒' : ''}${v.name}`, `${v.name}: ${v.desc}`, { stroke: col, color: '#' + col.toString(16).padStart(6, '0'), size: 12, depth: 1803, onClick: () => { toggleLock(this.state, uid, i); this.cardSig = ''; this.showUnitCard(uid); } }); objs.push(...c2.objs); cx += c2.w + 5; }
      else { objs.push(...c.objs); cx += c.w + 5; }
    });
    if (u.traits.length) y += 28;
    // skills / passive / bonds as short chips
    cx = x + 10;
    const pas = sp ? data.lore.passives[sp.id] : null;
    const extra = [
      ...u.stats.skills.map((sk) => ['✦ ' + sk.split(/[:：(]/)[0].trim(), sk, 0xcfd8dc]),
      ...(pas ? [['📜 ' + pas.name, `설화: ${pas.name} — ${pas.desc}`, 0xe8c3ff]] : []),
      ...bonds.map((b) => [`${b.bond.kind === 'clash' ? '⚡' : '♥'} ${b.bond.name}`, b.bond.desc, b.bond.kind === 'clash' ? 0xf0883e : 0xff9fbf]),
    ];
    for (const [lab, tip, col] of extra) {
      let c = chip(this, cx, y, lab, tip, { stroke: col, size: 12, depth: 1803 });
      if (cx + c.w > x + w - 10 && cx > x + 10) { c.destroy(); cx = x + 10; y += 26; c = chip(this, cx, y, lab, tip, { stroke: col, size: 12, depth: 1803 }); }
      objs.push(...c.objs); cx += c.w + 5;
    }
    if (extra.length) y += 28;
    if (this.cardExpanded) {
      const line = (t, col) => { const o = add(this.add.text(x + 12, y, t, style(12, col, { wordWrap: { width: w - 24 } }))); y += o.height + 3; };
      u.traits.forEach((t) => { const v = traitView(t, data); line(`${v.name}: ${v.desc}`, v.tone === 'str' ? '#7CFC9A' : v.tone === 'flip' ? '#7fd1ff' : '#ffb27a'); });
      for (const sk of u.stats.skills) line('✦ ' + sk, '#cfd8dc');
      if (pas) line(`📜 ${pas.name} — ${pas.desc}`, '#e8c3ff');
      if (sp) line(`"${u.stage === 'spirit' ? sp.spiritCodex : sp.codex}"`, '#8899aa');
    }
    const more = add(this.add.text(x + w / 2, y + 2, this.cardExpanded ? '접기 ▴' : '자세히 ▾', style(12, '#d4b06a'))).setOrigin(0.5, 0).setInteractive({ useHandCursor: true });
    more.on('pointerdown', (p, a, b, ev) => { ev?.stopPropagation?.(); this.cardExpanded = !this.cardExpanded; this.cardSig = ''; this.showUnitCard(uid); });
    y += 22;
    const bg = panel(this, x, 64, w, y - 60, { depth: 1800, alpha: 0.92 });
    objs.push(bg);
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
    this.preAnimate();
    this.syncUnits();
    this.syncEnemies();
    this.drawBonds();
    this.persistentFx();
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
    c.add([glow, foot, tok, name, barBg, bar, downText, icon].filter(Boolean));
    c.unitUid = unit.uid;
    c.setSize(64, 80).setInteractive({ draggable: true, useHandCursor: true });
    const shadow = unit.stats.flyer ? this.add.ellipse(0, 0, 54, 14, 0x000000, 0.3).setDepth(45).setVisible(false) : null;
    const v = { container: c, tok, rig, shadow, bar, barBg, downText, name, icon, foot, lastHp: unit.hp, wasDown: unit.down, key: `${unit.kind}:${unit.speciesId}:${unit.stage}` };
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
      ...s.field.map((u) => [u, tileToX(u.pos) + (u.stats.flyer ? 0 : [-16, 0, 16][u.lane ?? 1]), u.stats.flyer ? (u.skyY ?? 200) - 30 : LANE_Y[u.lane ?? 1], true]),
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
          v.container.setPosition(x, v.skyCur + Math.sin(this.time.now / 380 + u.uid) * 6);
        } else if (onField) {
          v.curX ??= x; v.curY ??= y;
          const k = 1 - Math.exp(-5 * (this.realDt || 0.016) * (this.paused ? 0 : this.speed));
          const dx = x - v.curX;
          v.curX = Math.abs(dx) > 600 * (this.realDt || 0.016) * this.speed ? v.curX + Math.sign(dx) * 600 * (this.realDt || 0.016) * this.speed : v.curX + dx * k;
          v.curY += (y - v.curY) * k;
          v.walking = Math.abs(x - v.curX) > 6;
          v.walkDir = Math.sign(dx);
          let lx = 0;
          if (v.lungeT != null) { v.lungeT += this.realDt || 0.016; const k = v.lungeT / 0.2; lx = k < 1 ? Math.sin(k * Math.PI) * 26 * v.lungeDir : 0; if (k >= 1) v.lungeT = null; }
          if (v.shakeT > 0) { v.shakeT -= this.realDt || 0.016; lx += Math.sin(this.time.now / 18) * 4 * Math.max(0, v.shakeT / 0.18); }
          v.container.setPosition(v.curX + lx, v.curY);
        } else { v.curX = x; v.curY = y; v.walking = false; v.container.setPosition(x, y); }
      } else { v.curX = undefined; v.curY = undefined; }
      v.container.setDepth(onField ? (u.stats.flyer ? 900 + y : 50 + y) : 60);
      if (v.shadow) { v.shadow.setVisible(onField && u.stats.flyer && !u.down); v.shadow.setPosition(x, LANE_Y[1] + 34); }
      if (onField && u.hp < (v.hpSeen ?? u.hp) - 0.4 && !u.down) {
        const d = v.hpSeen - u.hp; v.shakeT = 0.18;
        this.floatText(v.container.x + Phaser.Math.Between(-8, 8), v.container.y - 60, `-${Math.round(d)}`, '#ff6b6b', d >= (u.maxHp ?? u.stats.hp) * 0.2 ? 22 : 15);
        this.fx.hit(v.container.x - 6, v.container.y - 10, 'red', false);
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
    for (const [uid, v] of this.unitViews) if (!seen.has(uid)) { v.rig?.view.destroy(); v.shadow?.destroy(); v.container.destroy(); this.unitViews.delete(uid); }
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
      const laneY = LANE_Y[blk && !blk.stats.flyer ? blk.lane ?? 1 : e.eid % 3] + 22;
      v.laneY = v.laneY == null ? laneY : v.laneY + (laneY - v.laneY) * Math.min(1, (this.realDt || 0.016) * 6);
      const y = e.flying ? PATH_Y - 110 + bob : v.laneY + (e.boss ? -6 : 0);
      if (v.kb) { v.kb *= Math.pow(0.0005, this.realDt || 0.016); if (Math.abs(v.kb) < 0.3) v.kb = 0; }
      const xk = x + (v.kb ?? 0);
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

  dmgNumber(x, y, d, heavy) {
    const t = this.add.text(x + Phaser.Math.Between(-10, 10), y, String(Math.round(d)), style(heavy ? 26 : 17, heavy ? '#ffe066' : '#ffffff', { stroke: heavy ? '#7a2a00' : '#000000', strokeThickness: heavy ? 6 : 4, fontStyle: 'bold' })).setOrigin(0.5).setDepth(1700).setScale(heavy ? 1.6 : 1.2);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - (heavy ? 42 : 30), alpha: 0, delay: heavy ? 380 : 220, duration: 420, onComplete: () => t.destroy() });
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
          const u = this.state.field.find((x) => x.uid === ev.uid);
          const ve = this.enemyViews.get(ev.eid) ?? this.goneViews?.get(ev.eid);
          if (!u || !ve) break;
          const [ux, uy] = unitPos(ev.uid);
          if (u.stats.range >= 3) { this.fx.projectile(u.speciesId, ux, uy, ve.lastX, ve.lastY, ev.aoe); sfx(SHOT_SFX[u.speciesId] ?? 'shoot'); }
          else {
            const v = this.unitViews.get(ev.uid);
            if (v) { v.lungeT = 0; v.lungeDir = Math.sign(ve.lastX - ux) || 1; }
            const big = ev.aoe || u.stats.role === 'bruiser';
            this.fx.meleeArc(ux, uy, ve.lastX, ve.lastY, ev.aoe ? 0xffe066 : 0xffffff, big);
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
          if (ev.name) this.fx.shout(at[0], at[1] - 92, ev.name, SHOUT_COL[ev.fx] ?? 0xffe066);
          if (targets.length && ['damageHeld', 'pushHeld', 'damageAll', 'stunRadius', 'flee'].includes(ev.fx)) { this.stopFor(0.07); this.kick(ev.eids ?? [], at[0], 16); }
          sfx(ev.fx === 'allyBuff' ? (u?.speciesId === 'wolf' ? 'howl' : 'note') : SKILL_SFX[ev.fx] ?? 'magic');
          break;
        }
        case 'hold': { const targets = (ev.eids ?? []).map((id) => this.enemyViews.get(id)).filter(Boolean).map((v) => [v.lastX, v.lastY]); this.fx.skillFx('hold', unitPos(ev.uid), targets, { burst: ev.burst }); sfx(ev.burst ? 'slam' : 'hold'); break; }
        case 'counter': { const v = this.enemyViews.get(ev.eid); if (v) this.fx.skillFx('counter', unitPos(ev.uid), [[v.lastX, v.lastY]]); sfx('slash'); break; }
        case 'shieldUp': { const v = this.enemyViews.get(ev.eid); if (v) this.fx.ring(v.lastX, v.lastY, 'purple', 1.4); sfx('shield'); break; }
        case 'splash': { const v = this.enemyViews.get(ev.eid); if (v) { this.fx.burst('orb', v.lastX, v.lastY, 1); this.fx.hit(v.lastX, v.lastY, 'green'); this.floatText(v.lastX, v.lastY - 30, '배 떨어짐!', '#c5e1a5', 12); } break; }
        case 'bait': sfx('bait'); break;
        case 'relic': { const r = data.relicById[ev.id]; this.toast(`${r.icon} ${r.name} 획득`, '#e0c3ff'); this.cameras.main.flash(250, 200, 160, 255); sfx('evolve'); break; }
        case 'twin': this.time.delayedCall(this.save.settings.fastRoulette ? 700 : 1950, () => { const [x, y] = unitPos(ev.uid); this.floatText(x, y - 40, '🥚 쌍둥이!', '#fff6a0', 16); this.fx.burst('rise', x, y, 10, 0xfff6a0); }); break;
        case 'interest': if (ev.gold > 0) { this.floatText(220, 52, `+${ev.gold} 이자`, '#ffd84d', 15); sfx('coin'); } break;
        case 'knock': { const ve = this.enemyViews.get(ev.eid); if (ve) { this.fx.burst('puff', ve.lastX, ve.lastY + 10, 4, 0xd9c49a); this.fx.hit(ve.lastX, ve.lastY, 'orange'); } break; }
        case 'heal': { const ve = this.enemyViews.get(ev.eid); if (ve) this.fx.heal(ve.lastX, ve.lastY); sfx('heal'); break; }
        case 'down': { const [x, y] = unitPos(ev.uid); this.fx.down(x, y); sfx('down'); break; }
        case 'dodge': { const [x, y] = unitPos(ev.uid); this.floatText(x, y - 30, '회피', '#7fd1ff', 13); this.fx.burst('leaf', x, y, 3, 0x7fd1ff); sfx('dodge'); break; }
        case 'survive': { const [x, y] = unitPos(ev.uid); this.floatText(x, y - 50, '간을 두고 왔다!', '#ffb3c6', 16); this.fx.evolve(x, y, false); sfx('evolve'); break; }
        case 'summon': sfx('summon'); this.time.delayedCall(this.save.settings.fastRoulette ? 700 : 1950, () => { const [x, y] = unitPos(ev.uid); this.fx.burst('rise', x, y, 12, 0xfff6a0); this.fx.ring(x, y + 20, 'gold', 0.8); }); break;
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
          if (ev.kind === 'spirit') { sfx('spirit'); this.fx.evolve(mx, my, true); this.cameras.main.flash(300, 255, 230, 140); this.fx.banner(`${this.state.field.concat(this.state.bench).find((x) => x && x.uid === ev.uid)?.stats.name ?? '영물'}`, '#ffd84d', '영물 각성'); }
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
const SHOT_SFX = { crow: 'shoot', eagle: 'slash', fox: 'magic', rooster: 'note', grasshopper: 'note', frog: 'magic', cheese_thief: 'magic', thunderbird: 'bolt', phoenix: 'fire', bullfrog: 'magic' };
const SHOUT_COL = { damageHeld: 0xffb35c, pushHeld: 0xffd08a, damageAll: 0xffb35c, flee: 0xff8a65, stunRadius: 0xb8ff8a, allyBuff: 0xffe066, stance: 0xa8e1ff, charm: 0xffb3d1, tongue: 0xffb3d1, hundred: 0xffe066, crowCall: 0xfff1a8, roosterFlee: 0xfff1a8, halveRespawn: 0xfff1a8 };
const SKILL_SFX = { damageHeld: 'slash', flee: 'roar', pushHeld: 'slam', damageAll: 'stampede', stunRadius: 'slam', halveRespawn: 'crow', stance: 'stance', charm: 'charm', tongue: 'tongue', hundred: 'hundred', crowCall: 'crow', roosterFlee: 'crow' };
