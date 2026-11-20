import Phaser from 'phaser';
import { FONT } from '../text.js';
import { attachInput } from './BattleInput.js';
import { buildData } from '../logic/data.js';
import { createBattle, step, summon, skipPrep, deploy, moveUnit, recall, sell, merge } from '../logic/battle.js';
import { summonCost } from '../logic/economy.js';

export const PATH_Y = 330, X0 = 100, TILE = 90, PATH_H = 120, BENCH_Y = 630, BENCH_X0 = 110, BENCH_GAP = 105, SLOT = 90;
export const ZONE_COLORS = { village: 0x9c8a6b, field: 0x7fb069, forest: 0x3d6b45, plains: 0xc2b280, mountain: 0x8d8d8d, wetland: 0x4f7c6b };
const ZONE_TILES = 4;
const STAGE_ID = 'forest-1';

/** Tile position to screen x. */
export function tileToX(pos) { return X0 + pos * TILE; }
/** Screen x to tile position. */
export function xToTile(x) { return (x - X0) / TILE; }
/** Screen x of a bench slot centre. */
export function benchSlotX(i) { return BENCH_X0 + i * BENCH_GAP; }

const hexColor = (hex) => Phaser.Display.Color.HexStringToColor(hex ?? '#888888').color;
const textStyle = (size, color = '#ffffff', extra = {}) => ({ fontSize: `${size}px`, color, fontFamily: FONT, ...extra });

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create() {
    const T = (this.T = this.registry.get('T'));
    this.data2 = buildData(this.registry.get('raw'));
    const seedParam = Number(new URLSearchParams(window.location.search).get('seed'));
    this.state = createBattle(this.data2, STAGE_ID, seedParam > 0 ? seedParam : Date.now() % 100000);
    this.speed = 1;
    this.paused = false;
    this.leaving = false;
    this.unitViews = new Map();
    this.enemyViews = new Map();

    this.drawPath();
    this.drawHud();
    this.drawBench();
    this.toastText = this.add.text(640, 90, '', textStyle(20, '#ffd84d')).setOrigin(0.5).setDepth(2000).setVisible(false);

    const kb = this.input.keyboard;
    kb.on('keydown-SPACE', () => this.doSummon());
    kb.on('keydown-ONE', () => { this.speed = 1; });
    kb.on('keydown-TWO', () => { this.speed = 2; });
    kb.on('keydown-P', () => { this.paused = !this.paused; });

    window.__battle = { scene: this, get state() { return this.scene.state; }, data: this.data2,
      actions: { summon, deploy, moveUnit, recall, sell, merge, skipPrep } };
    attachInput(this);
  }

  drawPath() {
    const T = this.T;
    this.state.stage.zones.slice(0, 3).forEach((id, i) => {
      const x = tileToX(i * ZONE_TILES + ZONE_TILES / 2);
      this.add.rectangle(x, PATH_Y, TILE * ZONE_TILES, PATH_H, ZONE_COLORS[id] ?? 0x666666);
      this.add.text(x, PATH_Y - PATH_H / 2 - 14, T('zone.' + id), textStyle(16)).setOrigin(0.5).setAlpha(0.7);
    });
    this.add.rectangle(tileToX(0), PATH_Y, 6, PATH_H + 20, 0xe74c3c);
    this.add.text(tileToX(0), PATH_Y + PATH_H / 2 + 22, T('hud.defense'), textStyle(14, '#ff8a80')).setOrigin(0.5);
    this.add.text(tileToX(this.data2.config.pathLength), PATH_Y + PATH_H / 2 + 22, T('hud.spawn'), textStyle(14, '#cccccc')).setOrigin(0.5);
  }

  drawHud() {
    const T = this.T;
    this.lifeText = this.add.text(30, 30, '', textStyle(22)).setOrigin(0, 0.5);
    this.goldText = this.add.text(190, 30, '', textStyle(22, '#ffd84d')).setOrigin(0, 0.5);
    this.waveText = this.add.text(640, 30, '', textStyle(22)).setOrigin(0.5);
    this.phaseText = this.add.text(640, 60, '', textStyle(16, '#cccccc')).setOrigin(0.5);
    this.skipBtn = this.makeButton(940, 30, 130, 40, T('hud.skip'), () => this.doSkip());
    this.speedBtn = this.makeButton(1080, 30, 100, 40, '', () => { this.speed = this.speed === 1 ? 2 : 1; });
    this.pauseBtn = this.makeButton(1200, 30, 110, 40, '', () => { this.paused = !this.paused; });
  }

  drawBench() {
    const T = this.T;
    this.add.text(BENCH_X0 - SLOT / 2, BENCH_Y - SLOT / 2 - 18, T('hud.bench'), textStyle(16)).setOrigin(0, 0.5);
    this.benchSlots = this.state.bench.map((_, i) => this.add.rectangle(benchSlotX(i), BENCH_Y, SLOT, SLOT).setStrokeStyle(2, 0x8899aa));
    this.sellZone = this.add.rectangle(740, BENCH_Y, 150, SLOT, 0x5c1f1f).setStrokeStyle(2, 0xc0392b);
    this.add.text(740, BENCH_Y, T('hud.sell'), textStyle(18)).setOrigin(0.5);
    this.summonBtn = this.makeButton(1090, BENCH_Y, 220, 80, '', () => this.doSummon(), 24);
    this.rouletteText = this.add.text(1090, BENCH_Y - 70, '', textStyle(14, '#ddeeff')).setOrigin(0.5);
  }

  /** Rectangle button with a centred label. */
  makeButton(x, y, w, h, label, onClick, size = 16) {
    const rect = this.add.rectangle(x, y, w, h, 0x2f4f6f).setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, textStyle(size)).setOrigin(0.5);
    rect.on('pointerdown', onClick);
    return { rect, text, setVisible: (v) => { rect.setVisible(v); text.setVisible(v); } };
  }

  /** Show a short message for 1.5 seconds. */
  toast(msg) {
    this.toastText.setText(msg).setVisible(true);
    this.toastTimer?.remove();
    this.toastTimer = this.time.delayedCall(1500, () => this.toastText.setVisible(false));
  }

  doSummon() {
    const T = this.T;
    const r = summon(this.state, this.data2);
    if (!r.ok) return this.toast(T('reason.' + r.reason));
    const { roll } = r;
    this.rouletteText.setText(T('roulette.line', {
      continent: T('continent.' + roll.continent), cp: Math.round(roll.continentChances[roll.continent] * 100),
      habitat: T('zone.' + roll.habitat), hp: Math.round(roll.habitatChances[roll.habitat] * 100),
      name: r.unit.stats.name, up: (roll.chances[roll.unitId] * 100).toFixed(1),
    }));
  }

  doSkip() {
    const r = skipPrep(this.state, this.data2);
    if (!r.ok) this.toast(this.T('reason.' + r.reason));
  }

  update(time, delta) {
    if (!this.paused) step(this.state, this.data2, Math.min(delta / 1000, 0.1) * this.speed);
    this.syncUnits();
    this.syncEnemies();
    this.drainEvents();
    this.updateHud();
    if (this.state.phase === 'ended' && !this.leaving) {
      this.leaving = true;
      const s = this.state;
      this.time.delayedCall(800, () => this.scene.start('Result', { result: s.result, wave: s.wave, total: s.stage.waves.length, life: s.life }));
    }
  }

  makeUnitView(unit) {
    const c = this.add.container(0, 0);
    const imgId = unit.kind === 'weak' ? null : 'unit-' + unit.speciesId;
    const body = imgId && this.textures.exists(imgId)
      ? this.add.image(0, 0, imgId).setDisplaySize(56, 56)
      : this.add.circle(0, 0, 26, hexColor(unit.stats.color));
    const name = this.add.text(0, 40, unit.stats.name, textStyle(13, '#ffffff', { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5);
    const barBg = this.add.rectangle(0, -36, 50, 6, 0x000000).setOrigin(0.5);
    const bar = this.add.rectangle(-25, -36, 50, 6, 0x2ecc71).setOrigin(0, 0.5);
    const downText = this.add.text(0, 0, '', textStyle(20, '#ffffff', { stroke: '#000000', strokeThickness: 4 })).setOrigin(0.5);
    c.add([body, name, barBg, bar, downText]);
    c.unitUid = unit.uid;
    c.setSize(60, 60).setInteractive({ draggable: true, useHandCursor: true });
    return { container: c, bar, barBg, downText, name, speciesKey: `${unit.kind}:${unit.speciesId}:${unit.stage}` };
  }

  syncUnits() {
    const s = this.state;
    const live = [
      ...s.field.map((u) => [u, tileToX(u.pos), PATH_Y, true]),
      ...s.bench.map((u, i) => (u ? [u, benchSlotX(i), BENCH_Y, false] : null)).filter(Boolean),
    ];
    const seen = new Set();
    for (const [u, x, y, onField] of live) {
      seen.add(u.uid);
      let v = this.unitViews.get(u.uid);
      if (!v) this.unitViews.set(u.uid, (v = this.makeUnitView(u)));
      if (this.dragUid !== u.uid) v.container.setPosition(x, y);
      v.bar.width = 50 * Math.max(0, u.hp) / u.stats.hp;
      v.bar.setVisible(onField);
      v.barBg.setVisible(onField);
      v.container.setAlpha(u.down ? 0.35 : 1);
      v.downText.setText(u.down ? String(Math.ceil(u.respawnLeft)) : '');
    }
    for (const [uid, v] of this.unitViews) {
      if (!seen.has(uid)) { v.container.destroy(); this.unitViews.delete(uid); }
    }
  }

  makeEnemyView(e) {
    const def = this.data2.enemyById[e.id];
    const size = e.boss ? 48 : 28;
    const rect = this.add.rectangle(0, 0, size, size, hexColor(def.color));
    const barW = e.boss ? 50 : 30;
    const bar = this.add.rectangle(-barW / 2, -size / 2 - 6, barW, 4, 0xff5252).setOrigin(0, 0.5);
    return { rect, bar, barW, size };
  }

  syncEnemies() {
    const seen = new Set();
    for (const e of this.state.enemies) {
      seen.add(e.eid);
      let v = this.enemyViews.get(e.eid);
      if (!v) this.enemyViews.set(e.eid, (v = this.makeEnemyView(e)));
      const x = tileToX(e.pos);
      const y = e.flying ? PATH_Y - 50 : PATH_Y + ((e.eid % 3) - 1) * 14;
      v.rect.setPosition(x, y);
      v.bar.setPosition(x - v.barW / 2, y - v.size / 2 - 6);
      v.bar.width = v.barW * Math.max(0, e.hp) / e.maxHp;
      const stroke = e.holdLeft > 0 || e.stunLeft > 0 ? 0xffffff : e.confuseLeft > 0 ? 0x9b59b6 : e.slowLeft > 0 ? 0x3498db : null;
      if (stroke === null) v.rect.setStrokeStyle(); else v.rect.setStrokeStyle(3, stroke);
      v.lastX = x; v.lastY = y;
    }
    for (const [eid, v] of this.enemyViews) {
      if (seen.has(eid)) continue;
      v.rect.destroy(); v.bar.destroy();
      this.enemyViews.delete(eid);
      this.goneViews ??= new Map();
      this.goneViews.set(eid, v);
    }
  }

  floatText(x, y, msg, color) {
    const t = this.add.text(x, y, msg, textStyle(18, color, { stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  drainEvents() {
    const T = this.T;
    for (const ev of this.state.events) {
      if (ev.type === 'kill') {
        const v = this.goneViews?.get(ev.eid);
        if (v) this.floatText(v.lastX, v.lastY, T('float.gold', { gold: ev.gold }), '#ffd84d');
      } else if (ev.type === 'leak') {
        this.floatText(tileToX(0) + 30, PATH_Y - 40, T('float.leak', { leak: ev.leak }), '#ff5252');
        this.cameras.main.shake(100, 0.005);
      }
    }
    this.state.events.length = 0;
    this.goneViews?.clear();
  }

  updateHud() {
    const T = this.T, s = this.state, cfg = this.data2.config;
    this.lifeText.setText(T('hud.life', { life: s.life }));
    this.goldText.setText(T('hud.gold', { gold: s.gold }));
    this.waveText.setText(T('hud.wave', { wave: s.wave, total: s.stage.waves.length }));
    this.phaseText.setText(s.phase === 'prep' ? T('hud.prep', { sec: Math.ceil(s.prepLeft) }) : s.phase === 'wave' ? T('hud.fighting') : '');
    const cost = summonCost(s.summonCount, cfg);
    this.summonBtn.text.setText(T('hud.summon', { cost }));
    this.summonBtn.rect.setAlpha(s.gold < cost ? 0.5 : 1);
    this.skipBtn.setVisible(s.phase === 'prep');
    this.speedBtn.text.setText(T('hud.speed', { speed: this.speed }));
    this.pauseBtn.text.setText(T(this.paused ? 'hud.resume' : 'hud.pause'));
  }
}
