import Phaser from 'phaser';
import { button, style } from './ui.js';
import { buildData } from '../logic/data.js';
import { writeSave } from '../logic/meta.js';
import { unitRig, enemyRig } from './rigs.js';
import { Globe } from './globe.js';
import { sfx, unlockAudio } from './sfx.js';
import { FX } from './fx.js';

/** 오프닝: 장면마다 그림 한 장(story.json의 bg) + 짧은 자막. 그림이 없으면 예전 코드 장면(scene_<키>)으로 그림.
 *  아무 데나 누르면 다음, '건너뛰기'로 바로 시작. */
export default class OpeningScene extends Phaser.Scene {
  constructor() { super('Opening'); }

  create(d) {
    this.next = d?.next ?? 'StageSelect';
    // 같은 장면을 다시 열 때(📖 이야기 두 번째) 지난번 '끝남'·글자 찍기 상태가 남아 있으면 마지막 장에서 멈춤 → 처음 상태로
    this.done = false; this.typing = null;
    this.D = buildData(this.registry.get('raw'));
    this.story = this.registry.get('raw').story;
    this.cameras.main.setBackgroundColor('#05080c');
    this.fx = new FX(this);
    this.layer = this.add.container(0, 0);
    this.rigs = [];
    // 자막 띠: 화면 아래 26%(그림을 덜 가림). 장마다 cap: 'right'면 오른쪽 아래 절반에만
    this.band = this.add.graphics().setDepth(50);
    this.caption = this.add.text(640, 655, '', style(26, '#fff4dc', { align: 'center', lineSpacing: 10, stroke: '#1a1006', strokeThickness: 4, wordWrap: { width: 1080 } })).setOrigin(0.5).setDepth(51);
    this.pageNo = this.add.text(640, 584, '', style(13, '#d4b06a')).setOrigin(0.5).setDepth(51);
    this.captionAt('bottom');
    this.hint = this.add.text(1240, 700, '누르면 다음 ▶', style(13, '#cfd8dc')).setOrigin(1, 0.5).setDepth(51);
    this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    button(this, 1180, 36, 140, 40, '건너뛰기 ⏭', () => this.finish(), { size: 15, depth: 60 });
    this.i = -1;
    this.input.on('pointerdown', (p, objs) => { unlockAudio(); if (!objs.length) this.advance(); });
    this.input.keyboard.on('keydown-SPACE', () => this.advance());
    this.input.keyboard.on('keydown-ENTER', () => this.advance());
    this.input.keyboard.on('keydown-ESC', () => this.finish());
    this.advance();
  }

  advance() {
    if (this.typing) { this.typing.remove(); this.typing = null; this.caption.setText(this.full); return; }
    this.i += 1;
    const pages = this.story.opening;
    if (this.i >= pages.length) return this.finish();
    const pg = pages[this.i];
    this.pageNo.setText(`— ${this.i + 1} / ${pages.length} —`);
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.clear();
      this.captionAt(pg.cap === 'right' ? 'right' : 'bottom');
      if (!this.art(pg)) this[`scene_${pg.scene}`]?.();
      this.cameras.main.fadeIn(320, 0, 0, 0);
      this.type(pg.text);
      sfx(pg.scene === 'crack' || pg.scene === 'king' ? 'bossSummon' : pg.scene === 'globe' ? 'reveal' : 'note');
    });
  }

  /** 자막 띠 자리: bottom = 아래 26% 전체, right = 오른쪽 아래 절반(왼쪽 아래 인물을 가리지 않게) */
  captionAt(where) {
    const right = where === 'right';
    const x0 = right ? 640 : 0, cx = right ? 960 : 640, y0 = right ? 475 : 533, line = right ? 540 : 601;
    this.band.clear();
    this.band.fillGradientStyle(0x08040e, 0x08040e, 0x08040e, 0x08040e, 0, 0, 0.85, 0.85).fillRect(x0, y0, 1280 - x0, 720 - y0);
    this.band.lineStyle(2, 0xd4b06a, 0.7).lineBetween(cx - (right ? 190 : 380), line, cx + (right ? 190 : 380), line);
    this.pageNo.setPosition(cx, line - 14);
    this.caption.setPosition(cx, right ? 620 : 655).setWordWrapWidth(right ? 600 : 1080);
  }

  /** 장면 그림 한 장을 꽉 차게 깔고 천천히 확대(켄 번스) + 장면별 가벼운 덧효과. 그림이 없으면 false → 예전 코드 장면 */
  art(pg) {
    if (!pg.bg || !this.textures.exists(pg.bg)) return false;
    const im = this.add.image(640, 360, pg.bg).setDisplaySize(1280, 720);
    this.layer.add(im);
    this.tweens.add({ targets: im, scale: im.scale * 1.05, duration: 9000, ease: 'Sine.inOut' });
    const fx = (k) => this.textures.exists(k);
    const k = pg.scene;
    if (k === 'core') { const beat = () => this.fx.ring(640, 300, 0xffd36b, 2, 900); beat(); this.extra.push(this.time.addEvent({ delay: 1100, loop: true, callback: beat })); }
    if (k === 'crack') {
      this.cameras.main.shake(500, 0.006);
      if (fx('fx-spark')) this.extra.push(this.add.particles(0, 0, 'fx-spark', { x: { min: 520, max: 760 }, y: 520, speedY: { min: -160, max: -50 }, lifespan: 1600, frequency: 70, scale: { start: 0.5, end: 0 }, tint: 0xb388ff, blendMode: 'ADD' }).setDepth(5));
    }
    if (k === 'king' && fx('fx-snow')) this.extra.push(this.add.particles(0, 0, 'fx-snow', { x: { min: 0, max: 1280 }, y: -10, speedY: { min: 30, max: 70 }, speedX: { min: -20, max: 10 }, lifespan: 9000, frequency: 140, scale: { min: 0.2, max: 0.5 }, alpha: 0.6 }).setDepth(5));
    if (k === 'globe') this.time.delayedCall(900, () => { if (this.done) return; this.fx.burst('star', 640, 230, 16, 0xfff6a0); this.fx.ring(640, 230, 0xfff1a8, 3, 600); });
    if ((k === 'myth' || k === 'unite' || k === 'home') && fx('fx-spark')) this.extra.push(this.add.particles(0, 0, 'fx-spark', { x: { min: 0, max: 1280 }, y: 560, speedY: { min: -60, max: -20 }, speedX: { min: -8, max: 8 }, lifespan: 7000, frequency: k === 'home' ? 600 : 220, scale: { start: 0.35, end: 0 }, tint: 0xffc04d, alpha: { start: 0.8, end: 0 }, blendMode: 'ADD' }).setDepth(5));
    if (k === 'call') { const flash = () => this.cameras.main.flash(160, 190, 150, 255); this.time.delayedCall(500, flash); this.extra.push(this.time.addEvent({ delay: 3200, loop: true, callback: flash })); }
    return true;
  }

  type(text) {
    this.full = text; this.caption.setText('');
    let n = 0;
    this.typing = this.time.addEvent({ delay: 34, repeat: text.length - 1, callback: () => { n += 1; this.caption.setText(text.slice(0, n)); if (n >= text.length) this.typing = null; } });
  }

  clear() {
    this.tweens.killTweensOf(this.layer.list);
    this.layer.removeAll(true);
    this.rigs.forEach((r) => r.view.destroy()); this.rigs = [];
    this.globe?.g.destroy(); this.globe?.over.destroy(); this.globe?.label.destroy(); this.globe = null;
    this.extra?.forEach((o) => o.destroy()); this.extra = [];
  }

  /** Painted backdrop with a slow Ken Burns drift. */
  bg(key, tint = null, alpha = 1) {
    const story = key.replace('bg-', 'story-');
    if (this.textures.exists(story)) key = story;
    if (!this.textures.exists(key)) return null;
    const im = this.add.image(640, 300, key).setDisplaySize(1340, 754).setAlpha(alpha);
    if (tint) im.setTint(tint);
    this.layer.add(im);
    this.tweens.add({ targets: im, scale: im.scale * 1.06, x: 610, duration: 9000, ease: 'Sine.inOut' });
    return im;
  }

  beast(id, x, y, scale = 0.32, opts = {}) {
    const hold = this.add.container(x, y); this.layer.add(hold);
    const rig = opts.enemy ? enemyRig(this, { id, eid: x, flying: false }, hold, opts.px ?? 90) : unitRig(this, { kind: 'base', speciesId: id, stage: opts.stage ?? 'adult', stats: {} }, hold, scale);
    if (rig) { rig.inst.play(opts.motion ?? 'idle', { loop: true }); this.rigs.push(rig); if (opts.flip) rig.inst.setFacing(-1); }
    hold.setAlpha(0); this.tweens.add({ targets: hold, alpha: 1, y: y - 6, duration: 500, delay: opts.delay ?? 0 });
    return hold;
  }

  update(t, dt) { for (const r of this.rigs) r.view.update(dt / 1000); this.globe?.update(dt / 1000); }

  // ---------- scenes ----------
  scene_core() {
    // 지구를 한 조각 잘라 낸 단면: 바깥은 바다와 땅, 안쪽은 맨틀·외핵, 한가운데 빛나는 심장(내핵)
    const g = this.add.graphics(); this.layer.add(g);
    const cx = 640, cy = 270, R = 230, a0 = Phaser.Math.DegToRad(-80), a1 = Phaser.Math.DegToRad(10);
    this.layer.add(this.add.circle(cx, cy, R + 30, 0x7fc8ff, 0.12));
    g.fillStyle(0x2f78c4, 1).fillCircle(cx, cy, R);
    g.fillStyle(0x4f9fe0, 0.8).fillCircle(cx - R * 0.25, cy - R * 0.25, R * 0.62);
    for (const [dx, dy, w, h] of [[-0.75, -0.1, 0.55, 0.42], [-0.35, 0.25, 0.4, 0.5], [0.1, 0.35, 0.5, 0.3]]) g.fillStyle(0x7cc25a, 1).fillEllipse(cx + dx * R + w * R / 2, cy + dy * R + h * R / 2, w * R, h * R);
    [[R, 0x7a5230], [R * 0.93, 0xb5531c], [R * 0.62, 0xe0772a], [R * 0.36, 0xffb347]].forEach(([r, c]) => { g.fillStyle(c, 1).slice(cx, cy, r, a0, a1, false).fillPath(); });
    g.lineStyle(3, 0x2a1a0c, 0.9).lineBetween(cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R).lineBetween(cx, cy, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    g.fillStyle(0xfff1a8, 1).fillCircle(cx, cy, R * 0.15);
    g.lineStyle(3, 0xd4b06a, 0.9).strokeCircle(cx, cy, R);
    const glow = this.add.circle(cx, cy, R * 0.22, 0xffe08a, 0.55).setBlendMode('ADD'); this.layer.add(glow);
    this.tweens.add({ targets: glow, scale: 1.5, alpha: 0.12, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const lab = this.add.text(cx + R * 0.55, cy - R * 0.55, '지구의 심장', style(20, '#fff1a8', { stroke: '#2a1a08', strokeThickness: 5, fontStyle: 'bold' })).setOrigin(0, 0.5).setAlpha(0); this.layer.add(lab);
    const ln = this.add.graphics(); this.layer.add(ln); ln.lineStyle(2, 0xfff1a8, 0.8).lineBetween(cx + 8, cy - 8, cx + R * 0.53, cy - R * 0.53);
    ln.setAlpha(0); this.tweens.add({ targets: [lab, ln], alpha: 1, duration: 600, delay: 900 });
    const beat = () => this.fx.ring(cx, cy, 0xffd36b, 2, 900);
    beat(); this.extra.push(this.time.addEvent({ delay: 1100, loop: true, callback: beat }));
  }

  scene_home() {
    this.bg('bg-forest-1');
    [['bear', 330, 400], ['fox', 520, 420, { delay: 150 }], ['rabbit', 700, 425, { delay: 300 }], ['crow', 860, 260, { delay: 450, motion: 'move' }], ['tiger', 1010, 405, { delay: 600, flip: true }]].forEach(([id, x, y, o]) => this.beast(id, x, y, 0.36, o));
    this.extra.push(this.add.particles(0, 0, 'fx-leaf', { x: { min: 0, max: 1280 }, y: -10, speedY: { min: 30, max: 70 }, lifespan: 9000, frequency: 260, scale: { min: 0.3, max: 0.7 }, rotate: { min: 0, max: 360 }, tint: [0xffd0e0, 0xfff1a8] }).setDepth(5));
  }

  scene_crack() {
    this.bg('bg-forest-3', 0x6a7aa8, 0.9);
    // 땅이 쩍 갈라진 틈: 들쭉날쭉한 금 + 아래서 새어 나오는 보랏빛
    const pts = []; for (let i = 0; i <= 14; i++) pts.push({ x: 380 + i * 38, y: 448 + (i % 2 ? -10 : 9) + Math.sin(i * 1.7) * 6 });
    const glow = this.add.graphics().setBlendMode('ADD'); this.layer.add(glow);
    glow.fillStyle(0x9b4dff, 0.18).fillEllipse(650, 440, 640, 70);
    const g = this.add.graphics(); this.layer.add(g);
    g.lineStyle(16, 0x7b3fbf, 0.5).strokePoints(pts); g.lineStyle(7, 0x12061f, 1).strokePoints(pts); g.lineStyle(2, 0xe0c0ff, 0.9).strokePoints(pts);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 });
    this.extra.push(this.add.particles(0, 0, 'fx-spark', { x: { min: 420, max: 900 }, y: 448, speedY: { min: -120, max: -40 }, lifespan: 1600, frequency: 60, scale: { start: 0.5, end: 0 }, tint: 0xb388ff, blendMode: 'ADD' }).setDepth(5));
    [['normal', 520, 450], ['fast', 780, 450, { delay: 200 }], ['bat', 650, 260, { delay: 400 }]].forEach(([id, x, y, o]) => this.beast(id, x, y, 1, { enemy: true, px: 80, motion: 'move', ...o }));
    this.cameras.main.shake(500, 0.006);
  }

  scene_king() {
    this.bg('bg-forest-3', 0x223355, 0.6);
    const ice = this.add.graphics(); this.layer.add(ice);
    for (let i = 0; i < 14; i++) { const x = 60 + i * 90; ice.fillStyle(0xbfeaff, 0.35).fillTriangle(x, 0, x + 40, 0, x + 20, 90 + (i % 3) * 40); }
    this.beast('boss_shadow', 640, 400, 1, { enemy: true, px: 260, motion: 'idle' });
    const eyes = this.add.text(640, 210, '● ●', style(28, '#ff4040')).setOrigin(0.5).setAlpha(0); this.layer.add(eyes);
    this.tweens.add({ targets: eyes, alpha: 1, duration: 600, delay: 500, yoyo: true, hold: 800, repeat: -1 });
    this.extra.push(this.add.particles(0, 0, 'fx-snow', { x: { min: 0, max: 1280 }, y: -10, speedY: { min: 40, max: 90 }, speedX: { min: -30, max: 10 }, lifespan: 9000, frequency: 90, scale: { min: 0.3, max: 0.7 } }).setDepth(5));
  }

  scene_globe() {
    const g = this.add.graphics(); this.layer.add(g);
    g.fillStyle(0x2a1a0c, 1).fillRect(0, 0, 1280, 720);
    g.fillStyle(0x4a3018, 1).fillRect(0, 380, 1280, 340);
    this.globe = new Globe(this, 640, 260, 150, this.registry.get('raw').globe);
    this.globe.g.setDepth(3); this.globe.over.setDepth(4);
    this.tweens.add({ targets: this.globe, lon: this.globe.lon + 720, duration: 4200, ease: 'Cubic.inOut' });
    this.time.delayedCall(4200, () => { if (!this.globe) return; this.globe.highlight = 'eurasia'; this.fx.burst('star', 640, 260, 20, 0xfff6a0); this.fx.ring(640, 260, 0xfff1a8, 3, 600); });
  }

  /** 세 수호자(웅녀·산군·구미호)가 금빛 속에서 깨어남 — 그림이 없을 때만 쓰는 코드 장면 */
  scene_myth() {
    this.bg('bg-forest-3', 0x554466, 0.7);
    const glow = this.add.circle(640, 300, 200, 0xffd84d, 0.18).setBlendMode('ADD'); this.layer.add(glow);
    this.tweens.add({ targets: glow, scale: 1.2, duration: 1100, yoyo: true, repeat: -1 });
    [['fox', 400, 420], ['tiger', 640, 400, { delay: 200 }], ['bear', 880, 420, { delay: 400, flip: true }]].forEach(([id, x, y, o]) => this.beast(id, x, y, 0.4, o));
    this.time.delayedCall(900, () => this.fx.burst('rise', 640, 420, 24, 0xffd84d));
  }

  scene_unite() {
    this.bg('bg-forest-2');
    const line = [['bison', 180], ['wolf', 330], ['bear', 480], ['fox', 630], ['frog', 780], ['bighorn', 930], ['rooster', 1080]];
    line.forEach(([id, x], k) => this.beast(id, x, 420 + (k % 2) * 14, 0.3, { delay: k * 120 }));
    this.beast('eagle', 400, 220, 0.32, { delay: 900, motion: 'move' });
    this.beast('crow', 880, 210, 0.3, { delay: 1000, motion: 'move' });
    this.time.delayedCall(1500, () => { this.fx.chimera?.(640, 380); this.fx.burst('rise', 640, 400, 30, 0xffd84d); });
  }

  scene_call() {
    this.bg('bg-forest-1', 0xffe0b0);
    const glow = this.add.circle(640, 260, 170, 0xffd84d, 0.18).setBlendMode('ADD'); this.layer.add(glow);
    this.tweens.add({ targets: glow, scale: 1.15, duration: 1200, yoyo: true, repeat: -1 });
    this.globe = new Globe(this, 640, 260, 110, this.registry.get('raw').globe);
    this.globe.g.setDepth(3); this.globe.over.setDepth(4);
    const t = this.add.text(640, 420, '🌏 지구본지기', style(34, '#ffe6b0', { stroke: '#2a1a08', strokeThickness: 6, fontStyle: 'bold' })).setOrigin(0.5).setAlpha(0); this.layer.add(t);
    this.tweens.add({ targets: t, alpha: 1, y: 410, duration: 600, delay: 300 });
  }

  finish() {
    if (this.done) return; this.done = true;
    const save = this.registry.get('save');
    save.openingSeen = true; writeSave(this.registry.get('storage'), save);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.clear(); this.scene.start(this.next); });
  }
}
