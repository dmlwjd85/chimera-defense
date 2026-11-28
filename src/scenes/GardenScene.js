// 무릉도원(2026-11-27): 도감에서 고른 동물이 복숭아꽃 동산을 거닐고 어울림. 처음 1마리, 별을 모으면 10마리까지.
// 쓰다듬기(하트 + 그 종 경험 조금) · 소품 꾸미기(끌어 놓기) · 사진 찍기.
import Phaser from 'phaser';
import { button, style, speciesImage } from './ui.js';
import { unitRig, queueMotionSheets, dropMotionSheets } from './rigs.js';
import GauntletScene from './GauntletScene.js';
import { buildData } from '../logic/data.js';
import { writeSave, totalStars } from '../logic/meta.js';
import * as G from '../logic/garden.js';
import { sfx } from './sfx.js';

const GROUND = { x0: 80, x1: 1200, y0: 450, y1: 650 };   // 동물이 걷는 풀밭(발 기준)
const persp = (y) => 0.9 + 0.14 * Math.max(0, Math.min(1, (y - GROUND.y0) / (GROUND.y1 - GROUND.y0)));   // 원근 살짝
const BASE = 0.34;                                        // 연전과 같은 동물 배율
const PROP_SCALE = { pavilion: 2, peach: 2, pond: 2, lantern: 1.5, flowers: 1.5, bridge: 2 };
const rnd = (a, b) => a + Math.random() * (b - a);
// 깊이(2026-11-28 사용자 "소품들이 캐릭터 앞으로 나와 있는데 캐릭터가 앞에 있게"): 소품은 늘 동물 뒤(0~), 동물은 그 위(PET_Z~)에서 발 높이 순
const PROP_Z = (y) => y * 0.1, PET_Z = 200;
const STAGE_NAME = { young: '어린', teen: '성장기', adult: '성체', spirit: '신화급' };

export default class GardenScene extends Phaser.Scene {
  constructor() { super('Garden'); }

  preload() {
    try { queueMotionSheets(this, G.gardenOf(this.registry.get('save')).animals.map((a) => a.id)); } catch (e) { console.warn('garden sheets', e); }
  }

  create() {
    this.events.once('shutdown', () => dropMotionSheets(this));
    this.D = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.g = G.gardenOf(this.save);
    this.pets = []; this.propObjs = []; this.ui = []; this.decor = false;
    // 도트 그림은 또렷하게(늘려도 번지지 않게)
    for (const k of ['bg-garden', ...G.GARDEN_PROPS.map((id) => 'garden-' + id)]) if (this.textures.exists(k)) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
    // 배경: PixelLab 무릉도원(도트 톤을 전투와 맞춤). 없으면 하늘·풀 두 색
    if (this.textures.exists('bg-garden')) this.add.image(640, 360, 'bg-garden').setDisplaySize(1280, 720).setDepth(-10);
    else { this.add.rectangle(640, 200, 1280, 400, 0xbfe3f0).setDepth(-10); this.add.rectangle(640, 560, 1280, 320, 0x8cc56a).setDepth(-10); }
    // 꽃잎이 바람에 날림
    if (this.textures.exists('fx-spark')) this.add.particles(0, 0, 'fx-spark', { x: { min: -40, max: 1280 }, y: -20, speedY: { min: 18, max: 46 }, speedX: { min: 12, max: 50 }, lifespan: 16000, scale: { min: 0.12, max: 0.22 }, tint: [0xffc0d8, 0xffd6e6, 0xffffff], alpha: { start: 0.9, end: 0.4 }, rotate: { min: 0, max: 360 }, frequency: 420 }).setDepth(900);
    this.g.props.forEach((p, i) => this.makeProp(p, i));
    this.g.animals.forEach((a) => this.spawn(a));
    this.drawUi();
    this.input.on('drag', (pointer, obj, x, y) => { if (!this.decor || obj.propIndex == null) return; const px = Phaser.Math.Clamp(x, GROUND.x0, GROUND.x1), py = Phaser.Math.Clamp(y, GROUND.y0 - 40, GROUND.y1 + 40); obj.setPosition(px, py).setDepth(PROP_Z(py)); });
    this.input.on('dragend', (pointer, obj) => { if (obj.propIndex == null) return; G.moveProp(this.save, obj.propIndex, obj.x, obj.y); this.persist(); });
    if (!this.g.animals.length) this.time.delayedCall(500, () => this.openPicker());
  }

  persist() { writeSave(this.registry.get('storage'), this.save); }

  // ---------- 화면 위 단추 ----------
  drawUi() {
    this.ui.forEach((o) => o.destroy()); this.ui = [];
    const slots = G.gardenSlots(this.save, this.D), next = G.starsToNextSlot(this.save, this.D);
    const bar = this.add.rectangle(640, 34, 1280, 68, 0x1a1420, 0.55).setDepth(2000);
    const t = this.add.text(24, 16, '🍑 무릉도원', style(28, '#ffe3ef', { stroke: '#5a2040', strokeThickness: 5 })).setDepth(2001);
    const s = this.add.text(232, 14, `🐾 ${this.g.animals.length} / ${slots}마리`, style(18, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setDepth(2001);
    const s2 = this.add.text(232, 40, next ? `⭐ 별 ${next}개 더 모으면 한 칸 더 (지금 별 ${totalStars(this.save)}개)` : '🌸 동산이 가득 열렸어요', style(13, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setDepth(2001);
    const b1 = button(this, 690, 34, 150, 44, '🐾 데려오기', () => this.openPicker(), { size: 17, depth: 2002 });
    const b2 = button(this, 850, 34, 150, 44, this.decor ? '✔ 다 꾸몄어요' : '🏮 꾸미기', () => this.toggleDecor(), { size: 17, depth: 2002, fill: this.decor ? 0x8a6a1a : undefined });
    const b3 = button(this, 1000, 34, 130, 44, '📸 사진', () => this.photo(), { size: 17, depth: 2002 });
    const b4 = button(this, 1170, 34, 170, 44, '← 처음으로', () => this.scene.start('Title'), { size: 17, depth: 2002 });
    this.ui.push(bar, t, s, s2, b1, b2, b3, b4);
    if (this.decor) this.drawPalette();
  }

  // ---------- 동물 ----------
  spawn(a, at = null) {
    const unit = { kind: a.kind ?? 'base', speciesId: a.id, stage: a.stage, parts: a.parts ?? null, uid: Math.floor(Math.random() * 1e6), stats: {} };
    const c = this.add.container(at?.x ?? rnd(GROUND.x0 + 60, GROUND.x1 - 60), at?.y ?? rnd(GROUND.y0 + 20, GROUND.y1 - 20));
    const shadow = this.add.ellipse(0, 34, 66, 14, 0x000000, 0.28);
    const sub = this.add.container(0, 30);
    let fix = 1; try { fix = GauntletScene.prototype.sizeFix.call(this, unit); } catch { /* 크기 맞춤 없이 */ }
    const rig = unitRig(this, unit, sub, BASE * fix);
    if (!rig) { c.destroy(); return null; }
    rig.inst.play('idle', { loop: true });
    c.add([shadow, sub]);
    const p = { a, unit, c, sub, rig, state: 'idle', t: rnd(0.5, 2.5), face: Math.random() < 0.5 ? -1 : 1, meetCd: rnd(2, 5), hop: 0 };
    c.setSize(110 * fix, 120 * fix).setInteractive(new Phaser.Geom.Rectangle(-55 * fix, -70 * fix, 110 * fix, 120 * fix), Phaser.Geom.Rectangle.Contains);
    c.on('pointerdown', () => { if (!this.decor) this.pet(p); });
    this.pets.push(p);
    return p;
  }

  setState(p, st, t, extra = {}) {
    Object.assign(p, { state: st, t }, extra);
    const r = p.rig.inst;
    if (st === 'walk' || st === 'chase' || st === 'flee') r.play(r.anims.move ? 'move' : 'idle', { loop: true });
    else if (st === 'nap') r.play(r.anims.down ? 'down' : 'idle');
    else r.play('idle', { loop: true });
    if (r.timeScale != null) r.timeScale = st === 'chase' || st === 'flee' ? 1.5 : 1;
  }

  bubble(p, text, color = '#ffffff', size = 20) {
    const o = this.add.text(p.c.x, p.c.y - 90 * (p.c.scale || 1), text, style(size, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: o, y: o.y - 34, alpha: 0, delay: 650, duration: 650, onComplete: () => o.destroy() });
  }

  brain(p, dt) {
    p.t -= dt; p.meetCd -= dt;
    const c = p.c, sp = 46 * (p.unit.stage === 'young' ? 0.8 : 1);
    if (p.state === 'walk' || p.state === 'chase' || p.state === 'flee') {
      let tx = p.tx, ty = p.ty;
      if (p.state === 'chase' && p.other) { tx = p.other.c.x; ty = p.other.c.y; }
      if (p.state === 'flee' && p.other) { tx = c.x + (c.x - p.other.c.x); ty = c.y + (c.y - p.other.c.y) * 0.5; }
      tx = Phaser.Math.Clamp(tx, GROUND.x0, GROUND.x1); ty = Phaser.Math.Clamp(ty, GROUND.y0, GROUND.y1);
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), v = sp * (p.state === 'walk' ? 1 : 2.4) * dt;
      if (Math.abs(dx) > 4) p.face = dx < 0 ? -1 : 1;
      if (d <= v || p.t <= 0) { if (p.state === 'walk' && d <= v) c.setPosition(tx, ty); this.setState(p, 'idle', rnd(1.5, 4)); }
      else c.setPosition(c.x + (dx / d) * v, c.y + (dy / d) * v);
    } else if (p.state === 'nap') {
      if (Math.random() < dt * 0.6) this.bubble(p, 'z', '#cfe6ff', 16);
      if (p.t <= 0) { this.setState(p, 'idle', rnd(1, 2)); this.bubble(p, '🥱', '#fff', 18); }
    } else if (p.state === 'idle' && p.t <= 0) {
      const k = Math.random();
      if (k < 0.62) { const [tx, ty] = this.freeSpot(); this.setState(p, 'walk', 9, { tx, ty }); }
      else if (k < 0.72) this.setState(p, 'nap', rnd(5, 9));
      else if (k < 0.86) { p.face *= -1; this.setState(p, 'idle', rnd(1.2, 2.5)); }
      else { this.hop(p, 2); this.bubble(p, ['♪', '🎵', '✨'][Math.floor(Math.random() * 3)], '#ffe066'); this.setState(p, 'idle', rnd(1.5, 3)); }
    }
    // 만남: 가까이 지나가면 어울림(같은 종 장난 · 술래잡기 · 인사)
    if (p.meetCd <= 0 && (p.state === 'walk' || p.state === 'idle')) {
      const o = this.pets.find((q) => q !== p && q.meetCd <= 0 && (q.state === 'walk' || q.state === 'idle') && Math.abs(q.c.x - c.x) < 90 && Math.abs(q.c.y - c.y) < 50);
      if (o) this.meet(p, o);
    }
    // 그리기: 방향·원근·깊이·폴짝
    if (p.hop > 0) { p.hop = Math.max(0, p.hop - dt); }
    const hy = p.hop > 0 ? -Math.abs(Math.sin(p.hop * Math.PI * 3)) * 14 : 0;
    p.sub.y = 30 + hy;
    p.rig.inst.setFacing(p.face);
    c.setScale(persp(c.y)).setDepth(PET_Z + c.y);
    p.rig.view.update(dt);
  }

  hop(p, n = 1) { p.hop = n / 3; }

  /** 걸어갈 곳: 소품(연못·정자·다리 등) 밑동을 피해서 */
  freeSpot() {
    for (let k = 0; k < 12; k++) {
      const x = rnd(GROUND.x0 + 30, GROUND.x1 - 30), y = rnd(GROUND.y0, GROUND.y1);
      const hit = this.propObjs.some((o) => Math.abs(x - o.x) < o.displayWidth * 0.5 + 20 && y > o.y - Math.min(70, o.displayHeight * 0.45) && y < o.y + 18);
      if (!hit) return [x, y];
    }
    return [rnd(GROUND.x0 + 30, GROUND.x1 - 30), rnd(GROUND.y0, GROUND.y1)];
  }

  meet(p, o) {
    const kind = G.meetKind(p.a, o.a, this.D);
    p.meetCd = o.meetCd = rnd(8, 14);
    const face = () => { p.face = o.c.x >= p.c.x ? 1 : -1; o.face = -p.face; };
    if (kind === 'same') { face(); this.setState(p, 'idle', 1.6); this.setState(o, 'idle', 1.6); this.hop(p, 2); this.hop(o, 2); this.bubble(p, '♥', '#ff8fb0'); this.bubble(o, '♪', '#ffe066'); }
    else if (kind === 'chase' || kind === 'flee') {
      const [hunter, prey] = kind === 'chase' ? [p, o] : [o, p];
      this.bubble(hunter, '!', '#ffd84d', 24); this.bubble(prey, '💦', '#8fd3ff', 20);
      this.setState(hunter, 'chase', 2.6, { other: prey }); this.setState(prey, 'flee', 2.6, { other: hunter });
    } else { face(); this.setState(p, 'idle', 1.4); this.setState(o, 'idle', 1.4); this.bubble(p, '👋', '#fff', 20); this.time.delayedCall(260, () => this.bubble(o, '😊', '#fff', 20)); }
  }

  pet(p) {
    const r = G.petAnimal(this.save, this.D, p.a);
    this.hop(p, 2);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 90, () => { const h = this.add.text(p.c.x + rnd(-26, 26), p.c.y - 60, '♥', style(22, '#ff7aa8', { stroke: '#fff', strokeThickness: 3 })).setOrigin(0.5).setDepth(1600); this.tweens.add({ targets: h, y: h.y - 60, alpha: 0, duration: 900, onComplete: () => h.destroy() }); });
    if (r.gained) { this.bubble(p, `정 +${r.gained} (오늘 ${r.left}번 더)`, '#ffd6e6', 14); this.persist(); }
    else this.bubble(p, '😊', '#fff', 20);
    if (p.state === 'nap') this.setState(p, 'idle', 1.5);
    try { sfx('click'); } catch { /* 소리 없음 */ }
  }

  // ---------- 도감에서 데려오기 ----------
  openPicker(page = 0) {
    this.closePicker();
    const have = new Set(this.cache.json.get('dotmIndex')?.species ?? []);
    const hasArt = (id, stage) => have.has(stage === 'spirit' ? id + '_spirit' : id);
    const list = G.gardenChoices(this.save, this.D, hasArt);
    const objs = (this.pk = []);
    const add = (o) => { objs.push(o); return o; };
    add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setDepth(3000).setInteractive());
    add(this.add.rectangle(640, 380, 1180, 590, 0x2a1f2e, 0.97).setStrokeStyle(3, 0xffb6cf).setDepth(3001));
    const slots = G.gardenSlots(this.save, this.D);
    add(this.add.text(640, 110, `🐾 도감에서 데려오기 · ${this.g.animals.length} / ${slots}마리`, style(24, '#ffe3ef', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(3002));
    add(this.add.text(640, 142, '누르면 동산에 데려오고, 다시 누르면 돌려보내요', style(14, '#d8c8d8')).setOrigin(0.5).setDepth(3002));
    if (!list.length) add(this.add.text(640, 360, '아직 만난 동물이 없어요. 연전에서 동물을 만나 봐요!', style(18, '#fff')).setOrigin(0.5).setDepth(3002));
    const PER = 24, pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.max(0, Math.min(pages - 1, page));
    list.slice(page * PER, page * PER + PER).forEach((ch, i) => {
      const x = 130 + (i % 8) * 146, y = 230 + Math.floor(i / 8) * 150;
      const inG = this.g.animals.filter((a) => a.id === ch.id && a.stage === ch.stage);
      const card = add(this.add.rectangle(x, y + 10, 134, 138, inG.length ? 0x3d5a2e : 0x3a2f40, 1).setStrokeStyle(2, inG.length ? 0x9cff6b : 0x7a6a80).setDepth(3002).setInteractive({ useHandCursor: true }));
      const img = speciesImage(this, ch.id, ch.stage === 'spirit' ? 'spirit' : ch.stage, x, y - 6, 84);
      if (img) add(img.setDepth(3003)); else add(this.add.text(x, y - 6, ch.kind === 'chimera' ? '🧬' : '🐾', style(40)).setOrigin(0.5).setDepth(3003));
      add(this.add.text(x, y + 62, ch.name, style(13, '#ffffff', { stroke: '#000', strokeThickness: 3, align: 'center', wordWrap: { width: 128 } })).setOrigin(0.5).setDepth(3003));
      if (inG.length) add(this.add.text(x + 56, y - 50, '✔', style(20, '#9cff6b', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(3003));
      card.on('pointerdown', () => this.pick(ch, page));
    });
    if (pages > 1) {
      add(button(this, 470, 640, 120, 40, '◀ 앞', () => this.openPicker(page - 1), { size: 16, depth: 3003 }));
      add(this.add.text(640, 640, `${page + 1} / ${pages}`, style(16, '#fff')).setOrigin(0.5).setDepth(3003));
      add(button(this, 810, 640, 120, 40, '뒤 ▶', () => this.openPicker(page + 1), { size: 16, depth: 3003 }));
    }
    add(button(this, 1150, 110, 110, 40, '닫기', () => this.closePicker(), { size: 16, depth: 3003 }));
  }
  closePicker() { (this.pk ?? []).forEach((o) => o.destroy()); this.pk = null; }

  pick(ch, page) {
    const inG = this.g.animals.find((a) => a.id === ch.id && a.stage === ch.stage);
    if (inG) {
      G.removeGardenAnimal(this.save, inG.key);
      const i = this.pets.findIndex((p) => p.a.key === inG.key);
      if (i >= 0) { const p = this.pets[i]; this.tweens.add({ targets: p.c, alpha: 0, duration: 300, onComplete: () => p.c.destroy() }); this.pets.splice(i, 1); }
      this.persist(); this.drawUi(); this.openPicker(page); return;
    }
    const r = G.addGardenAnimal(this.save, this.D, ch);
    if (!r.ok) { this.toast(`동산이 꽉 찼어요 — ⭐ 별을 더 모으면 칸이 늘어요`); return; }
    this.persist(); this.drawUi(); this.closePicker();
    const go = () => { const p = this.spawn(r.animal, { x: rnd(500, 780), y: rnd(470, 560) }); if (p) { this.hop(p, 3); this.bubble(p, '🌸 왔어요!', '#ffe3ef', 18); try { sfx('summon'); } catch { /* */ } } };
    queueMotionSheets(this, [ch.id]);
    if (this.load.list.size || this.load.inflight?.size) { this.load.once('complete', go); this.load.start(); } else go();
  }

  toast(msg) {
    const t = this.add.text(640, 680, msg, style(18, '#ffffff', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(4000);
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 500, onComplete: () => t.destroy() });
  }

  // ---------- 소품 꾸미기 ----------
  makeProp(p, i) {
    const key = 'garden-' + p.id;
    if (!this.textures.exists(key)) return null;
    const o = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setScale(PROP_SCALE[p.id] ?? 2).setDepth(PROP_Z(p.y));
    o.propIndex = i; o.setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(o, this.decor);
    o.on('pointerdown', () => { if (this.decor) this.selectProp(o); });
    this.propObjs.push(o);
    return o;
  }
  refreshProps() { this.propObjs.forEach((o) => o.destroy()); this.propObjs = []; this.g.props.forEach((p, i) => this.makeProp(p, i)); }
  selectProp(o) {
    this.selX?.destroy();
    this.selX = button(this, o.x + o.displayWidth / 2 - 10, o.y - o.displayHeight + 10, 44, 36, '✖', () => { G.removeProp(this.save, o.propIndex); this.persist(); this.selX?.destroy(); this.selX = null; this.refreshProps(); }, { size: 16, depth: 2500, fill: 0x8a2a2a });
  }
  toggleDecor() {
    this.decor = !this.decor;
    this.selX?.destroy(); this.selX = null;
    this.propObjs.forEach((o) => this.input.setDraggable(o, this.decor));
    this.palette?.forEach((o) => o.destroy()); this.palette = null;
    this.drawUi();
  }
  drawPalette() {
    const objs = (this.palette = []);
    objs.push(this.add.rectangle(640, 672, 1280, 96, 0x1a1420, 0.7).setDepth(2000));
    objs.push(this.add.text(24, 640, '눌러서 놓고, 끌어서 옮기고, 눌러서 ✖', style(13, '#ffd6e6', { stroke: '#000', strokeThickness: 3, wordWrap: { width: 160 } })).setDepth(2001));
    G.GARDEN_PROPS.forEach((id, i) => {
      const x = 260 + i * 150, key = 'garden-' + id;
      const bg = this.add.rectangle(x, 668, 136, 84, 0x3a2f40, 1).setStrokeStyle(2, 0xffb6cf).setDepth(2001).setInteractive({ useHandCursor: true });
      objs.push(bg);
      if (this.textures.exists(key)) { const im = this.add.image(x, 660, key).setDepth(2002); im.setScale(Math.min(60 / im.height, 110 / im.width)); objs.push(im); }
      objs.push(this.add.text(x, 702, G.PROP_NAME[id], style(13, '#fff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(2002));
      bg.on('pointerdown', () => {
        const r = G.addProp(this.save, this.D, id, rnd(380, 900), rnd(470, 560));
        if (!r.ok) { this.toast('소품은 12개까지 놓을 수 있어요'); return; }
        this.persist();
        const o = this.makeProp(this.g.props[r.index], r.index);
        if (o) { o.setScale(0.1); this.tweens.add({ targets: o, scale: PROP_SCALE[id] ?? 2, duration: 260, ease: 'Back.out' }); this.selectProp(o); }
        try { sfx('click'); } catch { /* */ }
      });
    });
    this.ui.push(...objs);
  }

  // ---------- 사진 ----------
  photo() {
    const hide = [...this.ui, ...(this.palette ?? []), this.selX].filter(Boolean);
    hide.forEach((o) => o.setVisible(false));
    this.time.delayedCall(60, () => {
      this.game.renderer.snapshot((img) => {
        hide.forEach((o) => o.setVisible?.(true));
        const fl = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0.9).setDepth(5000);
        this.tweens.add({ targets: fl, alpha: 0, duration: 380, onComplete: () => fl.destroy() });
        try { sfx('click'); } catch { /* */ }
        try {
          const a = document.createElement('a');
          a.href = img.src; a.download = `무릉도원_${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(a); a.click(); a.remove();
          this.toast('📸 찰칵! 사진을 저장했어요');
        } catch { this.toast('사진을 저장하지 못했어요'); }
      });
    });
  }

  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    for (const p of this.pets) if (p.c.active) this.brain(p, dt);
  }
}
