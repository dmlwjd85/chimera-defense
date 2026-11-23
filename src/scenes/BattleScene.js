import Phaser from 'phaser';
import { attachInput } from './BattleInput.js';
import { buildData } from '../logic/data.js';
import { createBattle, step, summon, skipPrep, deploy, moveUnit, recall, sell, merge, buyBait, toggleLock, summonPrice, addCarry } from '../logic/battle.js';
import { battleOptions, settleRun, writeSave, carryCandidates, setCarry } from '../logic/meta.js';
import { traitView } from '../logic/traits.js';
import { terrainMatch, effRange, effBlock, effDamage, effInterval } from '../logic/mods.js';
import { isResting } from '../logic/combat.js';
import { makeEnemy } from '../logic/waves.js';
import { unitRig, enemyRig } from './rigs.js';
import { FX, ambient } from './fx.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sfx.js';
import { button, panel, style, unitToken, silhouette, hex, COLORS } from './ui.js';

import { PATH_Y, X0, TILE, PATH_H, BENCH_Y, BENCH_X0, BENCH_GAP, SLOT, tileToX, xToTile, benchSlotX, LANE_Y } from './layout.js';
export { PATH_Y, X0, TILE, PATH_H, BENCH_Y, BENCH_X0, BENCH_GAP, SLOT, tileToX, xToTile, benchSlotX };
export const ZONE_COLORS = { village: 0x9c8a6b, field: 0x7fb069, forest: 0x3d6b45, plains: 0xc2b280, mountain: 0x8d8d8d, wetland: 0x4f7c6b };
const ZONE_NAME = { village: '마을', field: '들판', forest: '숲', plains: '대평원', mountain: '산', wetland: '습지' };
const CONT_NAME = { eurasia: '유라시아', america: '아메리카', africa: '아프리카' };
const SYN_TEXT = { eurasia: '유라시아 시너지: 공격 간격 -10%', america: '아메리카 시너지: 사거리 +1', africa: '아프리카 시너지: 피해 +15%' };
const ROLE_NAME = { bruiser: '브루저', dealer: '딜러', technician: '테크니션', buffer: '버퍼', weak: '약체' };
const TUTORIAL = [
  '① 소환 버튼(스페이스)을 눌러 동물을 뽑아 보세요. 지구본이 대륙 → 서식환경 → 동물 순서로 정해요.',
  '② 대기석 동물을 길 위로 끌어다 놓으면 출전해요. 누르고 길을 누르면 걸어가요.',
  '③ 같은 동물·같은 단계 둘을 겹치면 진화해요. 어린 → 성장기 → 성체.',
  '④ 성체가 된 다른 종 둘을 합치면 키메라! 아는 이야기를 떠올려 보세요. 여우와 까마귀라면?',
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
    this.tutorialText = this.add.text(560, 160, '', style(17, '#ffffff', { backgroundColor: '#3a2a10', padding: { x: 12, y: 8 }, wordWrap: { width: 560 } })).setOrigin(0.5).setDepth(1900);

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
      this.add.text(tileToX(0) - 40, PATH_Y + PATH_H / 2 + 40, '방어선', style(13, '#ff8a80', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(3);
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
    hud.fillGradientStyle(0x0b1016, 0x0b1016, 0x0b1016, 0x0b1016, 0.75, 0.75, 0, 0).fillRect(0, 0, 1280, 110);
    this.lifeText = this.add.text(24, 26, '', style(22)).setOrigin(0, 0.5);
    this.goldText = this.add.text(150, 26, '', style(22, '#ffd84d')).setOrigin(0, 0.5);
    this.waveText = this.add.text(560, 22, '', style(22)).setOrigin(0.5);
    this.phaseText = this.add.text(560, 50, '', style(15, '#cccccc')).setOrigin(0.5);
    this.nextText = this.add.text(24, 58, '', style(13, '#aabbcc')).setOrigin(0, 0.5);
    this.synText = this.add.text(24, 86, '', style(13, '#7fd1ff'));
    this.bondText = this.add.text(24, 418, '', style(13, '#ff9fbf', { wordWrap: { width: 840 } }));
    this.skipBtn = button(this, 790, 30, 120, 40, '바로 시작', () => this.doSkip());
    this.speedBtn = button(this, 920, 30, 100, 40, '', () => { this.speed = this.speed === 1 ? 2 : 1; });
    this.pauseBtn = button(this, 1030, 30, 100, 40, '', () => { this.paused = !this.paused; });
    button(this, 1175, 30, 90, 40, '나가기', () => this.confirmLeave(), { fill: 0x5c1f1f, size: 14 });
    this.muteBtn = button(this, 1150, 78, 140, 30, isMuted() ? '🔇 소리 꺼짐' : '🔊 소리 켜짐', () => { setMuted(!isMuted()); unlockAudio(); this.muteBtn.set(isMuted() ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'); sfx('click'); }, { size: 12, fill: 0x2b3f55 });
  }

  drawBench() {
    this.add.text(BENCH_X0 - SLOT / 2, BENCH_Y - SLOT / 2 - 16, '대기석', style(15)).setOrigin(0, 0.5);
    this.benchSlots = this.state.bench.map((_, i) => this.add.rectangle(benchSlotX(i), BENCH_Y, SLOT, SLOT, 0x0b1016, 0.45).setStrokeStyle(2, 0xc9d6ea, 0.8));
    const sx = Math.max(760, benchSlotX(this.state.bench.length - 1) + 130);
    this.sellZone = this.add.rectangle(sx, BENCH_Y, 120, SLOT, 0x5c1f1f).setStrokeStyle(2, 0xc0392b);
    this.add.text(sx, BENCH_Y, '판매\n(끌어 놓기)', style(14, '#ffffff', { align: 'center' })).setOrigin(0.5);
  }

  drawBaitShop() {
    const b = this.data2.config.bait;
    this.baitLabel = this.add.text(24, 470, '먹이 (준비 시간에만, 다음 3회 소환에서 그 역할 2배)', style(13, '#ffe2b8'));
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
    this.summonBtn = button(this, 1085, 672, 370, 58, '', () => this.doSummon(), { size: 22, fill: 0x3a7bd5 });
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
    this.hideUnitCard();
    const s = this.state, data = this.data2;
    const u = [...s.field, ...s.bench].find((x) => x && x.uid === uid);
    if (!u) return;
    const objs = [];
    const x = 1003, w = 270;
    let y = 72;
    const add = (o) => { objs.push(o.setDepth(1801)); return o; };
    const line = (t, col = '#dddddd', size = 12) => { const o = add(this.add.text(x + 12, y, t, style(size, col, { wordWrap: { width: w - 24 } }))); y += o.height + 3; return o; };
    const sp = u.kind === 'base' ? data.unitById[u.speciesId] : null;
    line(`${u.white ? '흰 ' : ''}${u.stats.name}`, '#ffffff', 18);
    const lv = sp ? ` · Lv.${s.levels[sp.id] ?? 1}` : '';
    line(u.kind === 'chimera' ? `키메라 · ${ROLE_NAME[u.stats.role] ?? ''}` : u.kind === 'weak' ? (u.reversal ? '역전의 키메라 (약점이 모두 뒤집힘)' : '약체 키메라 · 판매만 가능') : `${this.T('stage.' + u.stage)} · ${this.T('rarity.' + sp.rarity)} · ${ROLE_NAME[sp.role]}${lv}`, '#ffd84d', 13);
    line(`${u.stats.continents.map((c) => CONT_NAME[c]).join('/')} · ${u.stats.habitats.map((h) => ZONE_NAME[h]).join('/')}`, '#aabbcc');
    y += 2;
    u.traits.forEach((t, i) => {
      const v = traitView(t, data);
      const col = v.tone === 'str' ? '#7CFC9A' : v.tone === 'flip' ? '#7fd1ff' : '#ffb27a';
      const lock = add(this.add.text(x + 12, y, t.locked ? '🔒' : '🔓', style(13)).setInteractive({ useHandCursor: true }));
      lock.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); toggleLock(this.state, uid, i); this.showUnitCard(uid); });
      const o = add(this.add.text(x + 34, y, `${v.name}: ${v.desc}`, style(12, col, { wordWrap: { width: w - 46 } })));
      y += o.height + 3;
    });
    y += 2;
    const m = u.mods;
    const hp = Math.round(u.maxHp ?? u.stats.hp), dmg = m ? effDamage(u) : u.stats.damage, iv = m ? effInterval(u) : u.stats.interval;
    line(`체력 ${Math.ceil(Math.max(0, u.hp))}/${hp}  피해 ${dmg.toFixed(1)}  간격 ${iv.toFixed(2)}초`, '#ffffff');
    line(`사거리 ${m ? effRange(u) : u.stats.range}  막기 ${m ? effBlock(u) : u.stats.block}${u.stats.canHitFlying ? '  대공 가능' : ''}`, '#ffffff');
    for (const sk of u.stats.skills) line('· ' + sk, '#cfd8dc');
    const pas = sp ? data.lore.passives[sp.id] : null;
    if (pas) line(`설화: ${pas.name} — ${pas.desc}`, '#e8c3ff');
    const bonds = (s.view?.bonds ?? []).filter((b) => Object.values(b.units).includes(u));
    for (const b of bonds) line(`${b.bond.kind === 'clash' ? '⚡ 상극' : '♥ 인연'} ${b.bond.name}: ${b.bond.desc}`, b.bond.kind === 'clash' ? '#f0883e' : '#ff9fbf');
    if (sp) line(`"${u.stage === 'spirit' ? sp.spiritCodex : sp.codex}"`, '#8899aa');
    const bg = panel(this, x, 64, w, y - 58, { depth: 1800, alpha: 0.9 });
    objs.push(bg);
    this.cardObjs = objs; this.cardUid = uid;
  }

  hideUnitCard() { this.cardObjs?.forEach((o) => o.destroy()); this.cardObjs = null; this.cardUid = null; }

  // ---------- frame ----------
  update(time, delta) {
    const live = !this.paused && !this.modalOpen;
    this.frameDt = live ? Math.min(delta / 1000, 0.1) * this.speed : 0;
    this.enemyHits = new Set(this.state.events.filter((e) => e.type === 'enemyAttack').map((e) => e.eid));
    if (live) step(this.state, this.data2, this.frameDt);
    this.enemyHits = new Set([...this.enemyHits, ...this.state.events.filter((e) => e.type === 'enemyAttack').map((e) => e.eid)]);
    this.preAnimate();
    this.syncUnits();
    this.syncEnemies();
    this.drawBonds();
    this.persistentFx();
    this.drainEvents();
    this.updateHud();
    this.updateTutorial();
    if (this.cardUid != null && time - (this.cardAt ?? 0) > 400) { this.cardAt = time; this.showUnitCard(this.cardUid); }
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
    else if (onField && u.moving) { if (m !== 'move') r.inst.play('move', { loop: true }); r.inst.moveVelocity = Math.sign(u.targetPos - u.pos) * 180; }
    else if (!busy && onField && u.stats.flyer) { if (m !== 'move') r.inst.play('move', { loop: true }); }
    else if (!busy && m !== 'idle') r.inst.play('idle', { loop: true });
    if (!u.moving) r.inst.moveVelocity = 0;
    r.inst.setFacing(onField && u.moving && u.targetPos < u.pos ? -1 : 1);
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
        } else v.container.setPosition(x, y);
      }
      v.container.setDepth(onField ? (u.stats.flyer ? 900 + y : 50 + y) : 60);
      if (v.shadow) { v.shadow.setVisible(onField && u.stats.flyer && !u.down); v.shadow.setPosition(x, LANE_Y[1] + 34); }
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
      const y = e.flying ? PATH_Y - 72 + bob : PATH_Y + ((e.eid % 3) - 1) * 16 + (e.boss ? -6 : 0);
      if (v.rig) {
        v.holder.setPosition(x, y + v.px * 0.42);
        const r = v.rig.inst, m = r.motion;
        const still = e.blockedBy !== null || e.holdLeft > 0 || e.stunLeft > 0;
        if (this.enemyHits?.has(e.eid)) r.play('attack');
        else if (!(m === 'attack' && !r.finished) && !(m === 'hit' && !r.finished)) { if (still && m !== 'idle') r.play('idle', { loop: true }); else if (!still && m !== 'move') r.play('move', { loop: true }); }
        if (e.hp < v.lastHp - 0.01) r.hitFlash(0.08);
        v.lastHp = e.hp;
        r.setFacing(e.confuseLeft > 0 ? 1 : -1);
        v.rig.view.update(e.stunLeft > 0 || e.holdLeft > 0 ? 0 : this.frameDt);
        v.holder.setDepth(70 + y / 10);
      } else v.body.setPosition(x, y);
      v.bar.setPosition(x - v.barW / 2, y - v.size / 2 - (v.rig ? 22 : 7));
      v.bar.width = v.barW * Math.max(0, e.hp) / e.maxHp;
      v.label?.setPosition(x, y + v.size / 2 + 12);
      v.shield?.setPosition(x, y).setVisible(e.shieldLeft > 0);
      const stroke = e.holdLeft > 0 || e.stunLeft > 0 ? 0xffffff : e.confuseLeft > 0 ? 0xc39bd3 : e.poisonLeft > 0 ? 0x58d68d : e.slowLeft > 0 ? 0x5dade2 : null;
      if (!v.rig && v.body.setStrokeStyle) { if (stroke === null) v.body.setStrokeStyle(); else v.body.setStrokeStyle(3, stroke); }
      if (v.rig) { v.statusTint ??= null; const tint = stroke; if (tint !== v.statusTint) { v.statusTint = tint; for (const o of v.holder.list) if (o.setTint) { if (tint === null) o.clearTint(); else o.setTint(tint === 0xffffff ? 0xbbbbff : tint); } } }
      v.lastX = x; v.lastY = y;
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
          else { this.fx.slash(ve.lastX, ve.lastY, ev.aoe ? 0xffe066 : 0xffffff); this.fx.hit(ve.lastX, ve.lastY, ev.aoe ? 'gold' : 'white', ev.aoe); if (ev.aoe) this.fx.ring(ve.lastX, ve.lastY + 10, 'gold', 1); sfx('slash'); sfx('hit'); }
          this.fx.onHitFlavor(u.stats.effects, ve.lastX, ve.lastY);
          break;
        }
        case 'skill': {
          const at = unitPos(ev.uid);
          const targets = (ev.eids ?? []).map((id) => this.enemyViews.get(id)).filter(Boolean).map((v) => [v.lastX, v.lastY]);
          const u = this.state.field.find((x) => x.uid === ev.uid);
          const extra = { color: u?.speciesId === 'wolf' ? 0xff7043 : 0xffd84d, allies: this.state.field.filter((o) => !o.down).map((o) => unitPos(o.uid)), allyAt: ev.ally != null ? unitPos(ev.ally) : null };
          this.fx.skillFx(ev.fx, at, targets, extra);
          if (ev.name && ev.fx !== 'roosterFlee') this.floatText(at[0], at[1] - 55, ev.name, '#e8c3ff', 15);
          sfx(ev.fx === 'allyBuff' ? (u?.speciesId === 'wolf' ? 'howl' : 'note') : SKILL_SFX[ev.fx] ?? 'magic');
          break;
        }
        case 'hold': { const targets = (ev.eids ?? []).map((id) => this.enemyViews.get(id)).filter(Boolean).map((v) => [v.lastX, v.lastY]); this.fx.skillFx('hold', unitPos(ev.uid), targets, { burst: ev.burst }); sfx(ev.burst ? 'slam' : 'hold'); break; }
        case 'counter': { const v = this.enemyViews.get(ev.eid); if (v) this.fx.skillFx('counter', unitPos(ev.uid), [[v.lastX, v.lastY]]); sfx('slash'); break; }
        case 'shieldUp': { const v = this.enemyViews.get(ev.eid); if (v) this.fx.ring(v.lastX, v.lastY, 'purple', 1.4); sfx('shield'); break; }
        case 'splash': { const v = this.enemyViews.get(ev.eid); if (v) { this.fx.burst('orb', v.lastX, v.lastY, 1); this.fx.hit(v.lastX, v.lastY, 'green'); this.floatText(v.lastX, v.lastY - 30, '배 떨어짐!', '#c5e1a5', 12); } break; }
        case 'bait': sfx('bait'); break;
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
    this.tutorialText.setVisible(true).setText(TUTORIAL[this.tutorialStep] + '   (가이드 닫기: 이 말풍선 누르기)');
    if (!this.tutorialText.input) this.tutorialText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.endTutorial());
  }

  endTutorial() { this.tutorialStep = -1; this.save.tutorialDone = true; writeSave(this.registry.get('storage'), this.save); this.tutorialText.setVisible(false); }

  updateHud() {
    const s = this.state, data = this.data2;
    this.lifeText.setText(`♥ ${s.life}`);
    this.goldText.setText(`골드 ${s.gold}`);
    this.waveText.setText(`${s.stage.name} · 웨이브 ${s.wave}/${s.stage.waves.length}`);
    this.phaseText.setText(s.phase === 'prep' ? `준비 ${Math.ceil(s.prepLeft)}초` : s.phase === 'wave' ? '전투 중' : '');
    const w = s.stage.waves[s.wave - 1];
    if (w) this.nextText.setText(`이번 웨이브: ${Object.keys(w.mix).map((id) => data.enemyById[id].name).join(', ')}${(w.extra ?? []).length ? ' + ' + w.extra.map((id) => data.enemyById[id].name).join(', ') : ''}`);
    const syn = (s.view?.synergies ?? []).map((c) => SYN_TEXT[c]);
    this.synText.setText(syn.join('   '));
    const bonds = (s.view?.bonds ?? []).map((b) => `${b.bond.kind === 'clash' ? '⚡' : '♥'}${b.bond.name}`);
    this.bondText.setText(bonds.length ? '켜진 인연: ' + bonds.join('  ') : '');
    const cost = summonPrice(s, data, this.designate.habitat ? { habitat: 1 } : this.designate.continent ? { continent: 1 } : {});
    this.summonBtn.set(`소환 ${cost}골드  (스페이스)`).setEnabled(s.gold >= cost && s.bench.includes(null));
    this.skipBtn.setVisible(s.phase === 'prep');
    this.speedBtn.set(`${this.speed}배속`);
    this.pauseBtn.set(this.paused ? '계속' : '일시정지');
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
const SKILL_SFX = { damageHeld: 'slash', flee: 'roar', pushHeld: 'slam', damageAll: 'stampede', stunRadius: 'slam', halveRespawn: 'crow', stance: 'stance', charm: 'charm', tongue: 'tongue', hundred: 'hundred', crowCall: 'crow', roosterFlee: 'crow' };
