// 연전 화면(2026-11-26): 다키스트 던전 + 유니콘 오버로드 느낌.
// 교전 = 양쪽 앞줄·뒷줄이 마주 서서 실시간 자동 전투. 행동 게이지(파란 줄)가 차면 한 마리씩 앞으로 튀어나와 침.
// 필살기·속성·기술은 화면이 어두워지며 공격자와 표적이 크게 당겨져 보이고(클로즈업) 잠깐 느려짐.
// 교전이 끝나면 정비: 회복, 보상 3개 중 1개, 끌어서 자리 바꾸기·합성, 다음 교전 미리 보기.
import Phaser from 'phaser';
import { buildData } from '../logic/data.js';
import { battleOptions, settleRun, writeSave, carryCandidates, setCarry } from '../logic/meta.js';
import { createGauntlet, tickGauntlet, takeReward, moveAnimal, mergeHint, nextEncounter, nextPreview, castG, spellBlockG, unitsIn, gcfg, clashOfU, clashOfE, startEncounter, styleOf } from '../logic/gauntlet.js';
import { spellDef, spellCost } from '../logic/spells.js';
import { unitRig, enemyRig, playAttack, ATTACK_MOTIONS, queueMotionSheets, dropMotionSheets, stageEnemyIds } from './rigs.js';
import { FX, ambient, weather } from './fx.js';
import { sfx, unlockAudio } from './sfx.js';
import { button, style, unitToken, hex, COLORS, speciesImage } from './ui.js';
import { dotOn, dotify } from './dotfx.js';

const STYLE_ICON = { bruiser: '🛡', skirm: '⚔', ranged: '🏹', support: '✚' };
const ROLE = { bruiser: '🛡 막기', dealer: '⚔ 딜러', technician: '🎯 기술', buffer: '🎺 응원', weak: '약체' };
const MERGE_NAME = { evolve: '진화', spirit: '신화급!', chimera: '키메라!', weak: '약체 키메라…', swap: '자리 바꾸기' };
// 자리: 0~2 앞줄, 3~5 뒷줄. 세 줄 깊이(위·가운데·아래)를 살짝 엇갈려 세움
const DEPTH_Y = [292, 410, 528], DEPTH_DX = [-16, 0, 16], DEPTH_S = [0.94, 1, 1.06];
const ALLY_X = { front: 470, back: 240 }, ENEMY_X = { front: 820, back: 1040 };
const seatXY = (side, seat) => {
  const front = seat < 3, d = seat % 3;
  const col = side === 'u' ? (front ? ALLY_X.front : ALLY_X.back) : (front ? ENEMY_X.front : ENEMY_X.back);
  return { x: col + DEPTH_DX[d] * (side === 'u' ? 1 : -1), y: DEPTH_Y[d], s: DEPTH_S[d] };
};
// 교전 중에는 양쪽이 가운데로 모여 붙음(정비 때는 seatXY 자리로 돌아감)
const FIGHT_X = { u: { front: 548, back: 330 }, e: { front: 732, back: 950 } };
const fightXY = (side, seat) => {
  const front = seat < 3, d = seat % 3, col = FIGHT_X[side][front ? 'front' : 'back'];
  return { x: col + DEPTH_DX[d] * (side === 'u' ? 1 : -1), y: DEPTH_Y[d], s: DEPTH_S[d] };
};
const CLASH_GAP = 40;
const SCRUM_Y = 418;
const scaleAtY = (y) => 0.94 + Math.max(0, Math.min(1, (y - 292) / 236)) * 0.12;
// 교전 중 한 무리: 세 줄을 따로 세우지 않고 가운데로 좁혀(줄 사이 70px) 서로 겹치게
const fightXY2 = (side, seat, style) => {
  const d = seat % 3, front = seat < 3;
  const y = SCRUM_Y + (d - 1) * 70 + (front ? 0 : (d - 1) * -12);
  const x = side === 'u' ? (style === 'skirm' ? 505 + (front ? 0 : -40) : front ? 520 : 330)
    : style === 'skirm' ? 790 + (front ? 0 : 40) : style === 'ranged' ? 975 : style === 'support' ? 925 : front ? 770 : 880;
  return { x: x + (side === 'u' ? 1 : -1) * (d - 1) * 10, y, s: scaleAtY(y) };
};   // 힘겨루기: 가운데에서 맞댄 두 몸 사이 반 거리
const BENCH = (i) => ({ x: 120 + i * 104, y: 650 });
const UNIT_SCALE = 0.34;
// 앞으로 튀어나왔다 돌아오는 곡선(0→1→0)
const bump = (k) => Math.sin(Math.min(1, Math.max(0, k)) * Math.PI);

export default class GauntletScene extends Phaser.Scene {
  constructor() { super('Gauntlet'); }

  preload(d) {
    try {
      const data = buildData(this.registry.get('raw'));
      const pool = battleOptions(this.registry.get('save'), data, d?.stageId ?? 'forest-1').pool ?? [];
      queueMotionSheets(this, pool);
      queueMotionSheets(this, stageEnemyIds(data.stageById[d?.stageId ?? 'forest-1'], data));   // 그 판 적의 PixelLab 동작
    } catch (e) { console.warn('motion sheets', e); }
    this.load.on('loaderror', (f) => console.warn('motion sheet missing', f.key));
  }

  create(d) {
    this.events.once('shutdown', () => dropMotionSheets(this));
    this.D = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.stageId = d?.stageId ?? 'forest-1';
    this.stage = this.D.stageById[this.stageId];
    Object.assign(this, { speed: 1, slow: 0, uViews: new Map(), eViews: new Map(), ui: [], leaving: false, state: null, mode: null });
    this.cameras.main.setBackgroundColor('#0b0d12');
    this.fx = new FX(this);
    this.drawStage();
    this.input.on('pointerdown', unlockAudio);
    this.input.keyboard.on('keydown-ONE', () => { this.speed = 1; });
    this.input.keyboard.on('keydown-TWO', () => { this.speed = 2; });
    if (d?.hard != null) this.begin(!!d.hard); else this.chooseDifficulty();
  }

  // ---------- 배경: 어둡게 깔고 가운데만 밝게(다키스트 던전 느낌) ----------
  drawStage() {
    const st = this.stage, key = 'bg-' + (st.art ?? st.id);
    if (this.textures.exists(key)) {
      const bg = this.add.image(640, 360, key).setDisplaySize(1280, 720).setDepth(-20);
      if (dotOn()) dotify(this, bg, false);
    }
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(0x05060a, 0.45).fillRect(0, 0, 1280, 720);
    // 땅: 네 칸 줄(아군 뒤·앞, 적 앞·뒤)
    g.fillStyle(0x000000, 0.35).fillEllipse(640, 470, 1180, 300);
    for (const [x, c] of [[ALLY_X.back, 0xd4b06a], [ALLY_X.front, 0xd4b06a], [ENEMY_X.front, 0xb388ff], [ENEMY_X.back, 0xb388ff]]) {
      g.lineStyle(2, c, 0.18);
      for (const y of DEPTH_Y) g.strokeEllipse(x, y + 34, 96, 24);
    }
    // 가장자리 비네트
    const v = this.add.graphics().setDepth(1500);
    for (let i = 0; i < 10; i++) { v.lineStyle(40, 0x000000, 0.06 + i * 0.012); v.strokeRect(-20 + i * 14, -20 + i * 14, 1320 - i * 28, 760 - i * 28); }
    this.add.text(ALLY_X.back, 250, '뒷줄', style(13, '#c9b88a', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(5);
    this.add.text(ALLY_X.front, 250, '앞줄', style(13, '#c9b88a', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(5);
    this.add.text(ENEMY_X.front, 250, '앞줄', style(13, '#c4a6ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(5);
    this.add.text(ENEMY_X.back, 250, '뒷줄', style(13, '#c4a6ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(5);
    try { ambient(this, st); } catch { /* */ }
    try { weather(this, this.D.config.climates?.[st.climate]); } catch { /* */ }
    this.dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 1).setAlpha(0).setDepth(900);
  }

  // ---------- 난이도 ----------
  chooseDifficulty() {
    const rec = this.save.stages?.[this.stageId];
    const hardOpen = !!rec?.cleared;
    const g = gcfg(this.D);
    const box = this.add.graphics().setDepth(3000);
    box.fillStyle(0x000000, 0.7).fillRect(0, 0, 1280, 720);
    box.fillStyle(0x141a2e, 1).fillRoundedRect(330, 130, 620, 460, 18).lineStyle(2, 0xd4b06a, 0.9).strokeRoundedRect(330, 130, 620, 460, 18);
    const t1 = this.add.text(640, 175, this.stage.name, style(30, '#ffffff')).setOrigin(0.5).setDepth(3001);
    const t2 = this.add.text(640, 212, `교전 ${this.D.stages.length ? g.encounters : 8}번 + 보스 · 난이도를 고름`, style(15, '#b9b4a6')).setOrigin(0.5).setDepth(3001);
    const t3 = this.add.text(640, 330, `노멀 ♥ 생명 ${g.life}\n지면 성문이 맞아 생명 -1, 다음 교전으로. 생명 0이면 끝.`, style(15, '#d8f5d0', { align: 'center' })).setOrigin(0.5).setDepth(3001);
    const t4 = this.add.text(640, 490, hardOpen ? `하드 · 한 번 지면 끝\n에센스 ×${g.hardEssence} · 유물 조각 ×${g.hardShards} · 깨면 👑` : '하드 · 노멀을 한 번 깨면 열림', style(15, hardOpen ? '#ffd0c8' : '#888888', { align: 'center' })).setOrigin(0.5).setDepth(3001);
    const parts = [box, t1, t2, t3, t4];
    const close = () => { parts.forEach((p) => p.destroy()); bn.destroy(); bh.destroy(); bb.destroy(); };
    const bn = button(this, 640, 280, 260, 54, '노멀로 출발', () => { close(); this.begin(false); }, { depth: 3002, fill: 0x2e5a3a, stroke: 0x7ddc6f, size: 20 });
    const bh = button(this, 640, 440, 260, 54, hardOpen ? '하드로 출발' : '🔒 하드', () => { if (!hardOpen) return; close(); this.begin(true); }, { depth: 3002, fill: hardOpen ? 0x5a1e1e : 0x333333, stroke: 0xff6b5a, size: 20 });
    bh.setEnabled(hardOpen);
    const bb = button(this, 640, 560, 180, 40, '← 돌아가기', () => this.scene.start('StageSelect'), { depth: 3002, size: 15 });
  }

  begin(hard) {
    const seed = Number(new URLSearchParams(window.location.search).get('seed')) || Date.now() % 100000;
    this.state = createGauntlet(this.D, this.stageId, seed, { ...battleOptions(this.save, this.D, this.stageId), hard });
    window.__gauntlet = { scene: this, get state() { return this.scene.state; }, data: this.D,
      jump: (n) => { const st = this.state; st.enc = n; this.eViews.forEach((v) => v.c.destroy()); this.eViews.clear(); startEncounter(st, this.D); this.startFightView(); } };   // 시험용: n번째 교전으로
    this.drawHud();
    this.startFightView();
  }

  // ---------- HUD ----------
  drawHud() {
    const s = this.state;
    const top = this.add.graphics().setDepth(1800);
    top.fillStyle(0x0d1222, 0.92).fillRect(0, 0, 1280, 54);
    this.hudEnc = this.add.text(24, 14, '', style(24, '#ffffff')).setDepth(1801);
    this.hudInfo = this.add.text(1256, 18, '', style(16, '#f4f1e8')).setOrigin(1, 0).setDepth(1801);
    this.hudMode = this.add.text(250, 20, s.hard ? '하드 · 한 번 지면 끝' : '노멀', style(14, s.hard ? '#ff8a7a' : '#9fe0a0', { backgroundColor: '#1f2a4a', padding: { x: 10, y: 3 } })).setDepth(1801);
    this.timeBg = this.add.rectangle(640, 66, 900, 10, 0x0d1222).setDepth(1801);
    this.timeBar = this.add.rectangle(190, 66, 900, 10, 0x8fd3ff).setOrigin(0, 0.5).setDepth(1802);
    this.timeText = this.add.text(1100, 58, '', style(15, '#cfe8ff')).setDepth(1802);
    // 아래: 기록 3줄 + 배속 + 마법
    this.bottom = this.add.graphics().setDepth(1800);
    this.bottom.fillStyle(0x0d1222, 0.9).fillRect(0, 604, 1280, 116);
    this.logText = this.add.text(24, 616, '', style(15, '#cfd6e6', { lineSpacing: 6 })).setDepth(1801);
    this.speedBtn = button(this, 860, 662, 90, 48, '×1', () => { this.speed = this.speed === 1 ? 2 : 1; this.speedBtn.set('×' + this.speed); }, { depth: 1802, size: 18 });
    this.spellBtns = (s.spells ?? []).slice(-3).map((id, i) => {
      const def = spellDef(this.D, id);
      return { id, def, btn: button(this, 990 + i * 96, 662, 90, 52, `${def.icon}\n${def.name}`, () => this.doSpell(id), { depth: 1802, size: 13, fill: 0x1d4a6a, stroke: 0x8fd3ff, tip: def.desc }) };
    });
    this.manaText = this.add.text(990 - 50, 612, '', style(12, '#8fd3ff')).setDepth(1802);
    if (!this.spellBtns.length) this.manaText.setVisible(false);
  }

  updateHud() {
    const s = this.state, g = gcfg(this.D);
    const spec = s.plan[Math.min(s.enc, s.plan.length - 1)];
    this.hudEnc.setText(spec?.boss ? `보스 교전` : `교전 ${Math.min(s.enc + 1, s.plan.length)} / ${s.plan.length}`);
    this.hudInfo.setText(`${s.hard ? '' : `♥ ${s.life} / ${s.maxLife}    `}처치 ${s.kills}`);
    const fight = s.phase === 'fight';
    const left = Math.max(0, g.timeLimit - s.encTime);
    this.timeBar.setVisible(fight).setScale(Math.max(0, left / g.timeLimit), 1); this.timeBg.setVisible(fight);
    this.timeText.setVisible(fight).setText(`0:${String(Math.ceil(left)).padStart(2, '0')}`);
    this.logText.setVisible(fight).setText(s.log.slice(-3).join('\n'));
    const max = this.D.config.spells?.max ?? 100;
    this.manaText.setText(`마력 ${Math.floor(s.mana)} / ${max}`);
    for (const b of this.spellBtns) {
      const why = spellBlockG(s, this.D, b.id);
      b.btn.setVisible(fight); b.btn.setEnabled(!why);
      b.btn.text.setColor(!why ? '#ffffff' : '#9ab');
    }
    this.speedBtn.setVisible(fight);
    this.bottom.setVisible(fight); this.manaText.setVisible(fight && this.spellBtns.length > 0);
  }

  doSpell(id) {
    const r = castG(this.state, this.D, id);
    if (!r.ok) { this.toast(r.reason === 'mana' ? '마력이 모자람' : r.reason === 'cooldown' ? '잠깐 기다림' : '지금은 못 씀'); return; }
    sfx('magic');
  }

  toast(msg, color = '#ffd84d') {
    this.toastT?.destroy();
    this.toastT = this.add.text(640, 110, msg, style(20, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(2600);
    this.tweens.add({ targets: this.toastT, alpha: 0, delay: 900, duration: 400 });
  }

  // ---------- views ----------
  makeUnitView(u) {
    const c = this.add.container(0, 0);
    const sub = this.add.container(0, 30);
    const rig = unitRig(this, u, sub, UNIT_SCALE);
    if (rig && !rig.dot && dotOn()) dotify(this, sub);
    const tok = rig ? sub : unitToken(this, u, this.D);
    const top = rig?.dot ? Math.max(-150, Math.min(-60, 30 + Math.round(rig.view.topY()))) : -70;
    const shadow = this.add.ellipse(0, 34, 70, 16, 0x000000, 0.35);
    const ring = this.add.ellipse(0, 34, 86, 22).setStrokeStyle(3, COLORS.gold, 0).setFillStyle(0, 0);
    const crown = u.soul ? this.add.text(0, top - 6, '👑', style(16)).setOrigin(0.5) : null;
    // 체력·행동 게이지는 발밑(다키스트 던전처럼): 위 줄 동물과 겹치지 않음
    const barBg = this.add.rectangle(0, 48, 66, 8, 0x000000).setOrigin(0.5);
    const bar = this.add.rectangle(-33, 48, 66, 8, 0x7ddc6f).setOrigin(0, 0.5);
    const gBg = this.add.rectangle(0, 55, 66, 4, 0x000000).setOrigin(0.5);
    const gBar = this.add.rectangle(-33, 55, 66, 4, 0x8fd3ff).setOrigin(0, 0.5);
    const name = this.add.text(0, 67, `${STYLE_ICON[styleOf(u)] ?? ''} ${u.stats.name}`, style(12, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    const tag = this.add.text(0, top - (crown ? 18 : 2), '', style(12, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5, 1);
    c.add([shadow, ring, tok, barBg, bar, gBg, gBar, name, tag, crown].filter(Boolean));
    c.setSize(90, 110).setInteractive({ draggable: true, useHandCursor: true });
    c.on('drag', (p, x, y) => { if (this.state.phase !== 'regroup') return; c.x = x; c.y = y; c.setDepth(2500); v.dragging = true; this.showDropHint(v, x, y); });
    c.on('dragend', () => { if (!v.dragging) return; v.dragging = false; this.dropUnit(v); });
    c.on('pointerup', () => { if (this.pickFood && !v.dragging) this.feed(u.uid); });
    const v = { c, rig, tok, bar, gBar, name, tag, ring, top, key: `${u.uid}:${u.kind}:${u.speciesId}:${u.stage}`, ox: 0, oy: 0, z: 1, lastHp: u.hp, uid: u.uid, lunge: null, cu: null };
    rig?.inst.play('idle', { loop: true });
    return v;
  }

  makeEnemyView(e) {
    const def = this.D.enemyById[e.id];
    const size = e.boss ? 60 : e.id === 'swarm' ? 30 : 34;
    const holder = this.add.container(0, 0);
    const px = size * 2.2 * (e.boss ? 1.25 : 1.3);
    const rig = enemyRig(this, e, holder, px, UNIT_SCALE);
    if (rig && !rig.dot && dotOn()) dotify(this, holder);
    const body = rig ? null : this.add.rectangle(0, -size / 2, size, size, hex(def.color));
    if (body) holder.add(body);
    const c = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 34, size * 2, 16, 0x000000, e.flying ? 0.15 : 0.35);
    const ring = this.add.ellipse(0, 34, size * 2.4, 24).setStrokeStyle(3, 0xff6b5a, 0);
    const top = -(px * 0.7) - 6;
    const bw = e.boss ? 110 : 66;
    const barBg = this.add.rectangle(0, 48, bw, 8, 0x000000);
    const bar = this.add.rectangle(-bw / 2, 48, bw, 8, e.boss ? 0xff6b5a : 0x9b6cf0).setOrigin(0, 0.5);
    const gBg = this.add.rectangle(0, 55, 66, 4, 0x000000);
    const gBar = this.add.rectangle(-33, 55, 66, 4, 0xc4a6ff).setOrigin(0, 0.5);
    const name = this.add.text(0, 67, `${STYLE_ICON[e.style] ?? ''} ${def.name}`, style(e.boss ? 15 : 12, e.boss ? '#ffcccc' : '#d8ccff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    const tag = this.add.text(0, top, '', style(12, '#c4a6ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5, 1);
    c.add([shadow, ring, holder, barBg, bar, gBg, gBar, name, tag]);
    holder.y = 34;
    rig?.inst.play('idle', { loop: true });
    const at = seatXY('e', e.seat);
    c.setPosition(at.x + 160, at.y).setAlpha(0);
    this.tweens.add({ targets: c, x: at.x, alpha: 1, duration: 420, ease: 'Cubic.out' });
    return { c, rig, holder, body, bar, gBar, ring, name, tag, ox: 0, oy: 0, z: 1, lastHp: e.hp, eid: e.eid, px, size, entering: true, lunge: null, cu: null };
  }

  startFightView() {
    const s = this.state, spec = s.plan[s.enc];
    this.clearUi();
    this.sync(0);
    if (spec.boss) { this.fx.banner(`보스 · ${this.D.enemyById[spec.ids[0]].name}`, '#ff8a7a', '마계연합 우두머리가 나타남'); sfx('boss'); }
    else { this.fx.banner(`교전 ${s.enc + 1}`, '#ffffff', spec.ids.length >= 5 ? '큰 무리' : ''); sfx('wave'); }
    this.paused = 0.35;   // 배너 뜨고 바로 돌격
  }

  /** 앞으로 튀어나옴(lunge)·맞고 밀림(kick)·클로즈업(cu)을 시간으로 계산(트윈이 꼬여 멈춰 있지 않게). */
  /** 패싸움 무리 자리: 힘겨루기 묶음을 가운데에 다닥다닥 붙여 세우고 천천히 출렁이게. 거드는 적은 뒤쪽 위아래로 붙음. */
  scrumLayout() {
    const s = this.state, out = { u: new Map(), e: new Map() };
    const groups = [...(s.clashes ?? [])].sort((a, b) => a.uid - b.uid), n = groups.length, t = this.time.now / 1000;
    groups.forEach((c, i) => {
      const y = SCRUM_Y + (i - (n - 1) / 2) * 82 + Math.sin(t * 0.9 + i * 2.1) * 8;
      const x = 650 + (i % 2 ? 44 : -30) + Math.sin(t * 0.7 + i) * 12 + c.push * 40;
      const jig = (k) => Math.sin(t * 22 + k) * 2;
      out.u.set(c.uid, { x: x - CLASH_GAP + jig(c.uid), y, s: scaleAtY(y) });
      out.e.set(c.eid, { x: x + CLASH_GAP + jig(c.eid), y, s: scaleAtY(y) });
      (c.helpers ?? []).forEach((id, k) => { const hy = y + (k % 2 ? 36 : -36); out.e.set(id, { x: x + CLASH_GAP + 70 + k * 16 + jig(id), y: hy, s: scaleAtY(hy) }); });
    });
    return out;
  }

  stepOffsets(v, dt) {
    let ox = 0, oy = 0, z = 0;
    if (v.lunge) { v.lunge.t += dt; const k = v.lunge.t / v.lunge.dur; if (k >= 1) v.lunge = null; else ox += v.lunge.reach * bump(k); }
    if (v.dash) {   // 치고 빠지기: 표적 앞까지 달려가 → 치고 → 깡충 뛰어 돌아옴
      v.dash.t += dt; const k = v.dash.t / v.dash.dur;
      if (k >= 1) v.dash = null;
      else {
        const out = k < 0.32 ? 1 - Math.pow(1 - k / 0.32, 3) : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        ox += v.dash.dx * out; oy += v.dash.dy * out - (k > 0.55 ? Math.sin(((k - 0.55) / 0.45) * Math.PI) * 26 : 0);
        v.dashBack = k > 0.55;
      }
    } else v.dashBack = false;
    if (v.kick) { v.kick.t += dt; const k = v.kick.t / v.kick.dur; if (k >= 1) v.kick = null; else ox += v.kick.px * bump(k); }
    if (v.cu) {
      v.cu.t += dt; const t = v.cu.t, d = v.cu.dur;
      if (t >= d) v.cu = null;
      else { const k = t < 0.16 ? t / 0.16 : t > d - 0.22 ? (d - t) / 0.22 : 1; const e = k * k * (3 - 2 * k); ox += v.cu.ox * e; oy += v.cu.oy * e; z += v.cu.z * e; }
    }
    v.ox = ox; v.oy = oy; v.z = 1 + z;
  }

  offOf(v) { return v.ox ?? 0; }

  // ---------- frame ----------
  update(time, delta) {
    if (!this.state) return;
    const real = Math.min(delta / 1000, 0.1);
    this.realDt = real;
    if (this.paused > 0) this.paused -= real;
    if (this.slow > 0) this.slow -= real;
    const k = this.slow > 0 ? 0.25 : 1;
    const dt = this.state.phase === 'fight' && !(this.paused > 0) && !this.leaving ? real * this.speed * k : 0;
    if (dt > 0) tickGauntlet(this.state, this.D, dt);
    this.drain();
    this.sync(real * (this.slow > 0 ? 0.45 : 1) * (this.state.phase === 'fight' ? this.speed : 1));
    this.drawClashes();
    this.updateHud();
    if (this.state.phase === 'ended' && !this.leaving) this.finish();
  }

  sync(dt) {
    const s = this.state;
    // 아군
    const live = new Set();
    const regroup = s.phase === 'regroup';
    const scrum = this.scrumLayout();
    const place = [];
    s.seats.forEach((uid, i) => { const u = uid && s.field.find((x) => x.uid === uid); if (u) place.push([u, seatXY('u', i)]); });
    s.bench.forEach((u, i) => { if (u) place.push([u, { ...BENCH(i), s: 0.72, bench: true }]); });
    for (const [u, at] of place) {
      if (at.bench && !regroup) continue;
      live.add(u.uid);
      let v = this.uViews.get(u.uid);
      const key = `${u.uid}:${u.kind}:${u.speciesId}:${u.stage}`;
      if (v && v.key !== key) { v.c.destroy(); v = null; }
      if (!v) { v = this.makeUnitView(u); this.uViews.set(u.uid, v); v.c.setPosition(at.x, at.y); }
      this.stepOffsets(v, this.realDt || 0.016);
      if (s.phase !== 'fight') { v.lunge = v.kick = v.cu = v.dash = null; v.ox = v.oy = 0; v.z = 1; }
      // 교전 중 자리: 가운데로 모임, 힘겨루기 중이면 맞댄 자리(밀고 당김에 따라 좌우로)
      const fight = s.phase === 'fight' && !at.bench;
      let home = fight ? fightXY2('u', u.seat ?? 0, styleOf(u)) : at;
      const cl = fight ? clashOfU(s, u.uid) : null;
      if (cl && !u.down && scrum.u.has(u.uid)) home = scrum.u.get(u.uid);
      v.baseX = home.x; v.baseY = home.y;
      if (!v.dragging) {
        const tx = home.x + v.ox, ty = home.y + v.oy;
        const f = v.lunge || v.kick || v.cu || v.dash ? 1 : Math.min(1, (this.realDt || 0.016) * (s.charging ? 4 : cl ? 10 : 4.5));
        const px = v.c.x;
        v.c.x += (tx - v.c.x) * f;
        v.c.y += (ty - v.c.y) * f;
        v.walking = !(v.lunge || v.kick || v.cu || v.dash) && Math.abs(v.c.x - px) > 0.9;
        v.c.setScale((fight ? home.s : at.s) * v.z).setDepth(v.z > 1.01 ? 960 : 100 + v.c.y + (v.dash ? 40 : 0));
      }
      v.bar.setScale(Math.max(0, u.hp / u.maxHp), 1).setFillStyle(u.hp / u.maxHp < 0.3 ? 0xff6b5a : u.hp / u.maxHp < 0.6 ? 0xe6c14a : 0x7ddc6f);
      v.gBar.setScale(Math.min(1, u.gauge ?? 0), 1).setVisible(s.phase === 'fight');
      const melee = u.stats.range <= 1;
      v.tag.setText(u.resting ? '쉼' : u.down ? '' : s.phase === 'fight' && melee && u.seat >= 3 && u.stats.role === 'bruiser' ? '뒷줄 -50%' : s.phase === 'fight' && !melee && u.seat < 3 ? '앞줄 -25%' : (u.gauge ?? 0) > 0.85 && s.phase === 'fight' ? '곧 침' : '');
      v.c.setAlpha(u.down ? 0.35 : u.resting ? 0.5 : 1);
      if (v.rig) {
        const r = v.rig.inst, m = r.motion;
        const busy = [...ATTACK_MOTIONS, 'skill', 'ult', 'hit'].includes(m) && !r.finished;
        if (s.result === 'clear') { if (m !== 'victory' && r.anims.victory) r.play('victory', { loop: true }); }
        else if (u.down) { if (m !== 'down') r.play('down'); }
        else if (!busy && (v.walking || v.dash) && r.anims.move) { if (m !== 'move') r.play('move', { loop: true }); }
        else if (!busy && !v.walking && !v.dash && m !== 'idle') r.play('idle', { loop: true });
        if (u.hp < v.lastHp - 0.5 && !u.down) { r.hitFlash(0.12); if (!busy) r.play('hit'); }
        r.setFacing(v.dashBack ? -1 : 1);
        v.rig.view.update(u.stunLeft > 0 ? 0 : dt);
      }
      v.lastHp = u.hp;
    }
    for (const [uid, v] of this.uViews) if (!live.has(uid)) { v.c.destroy(); this.uViews.delete(uid); }
    // 적
    const seen = new Set();
    for (const e of s.enemies) {
      if (e.hp <= 0 && !this.eViews.has(e.eid)) continue;
      seen.add(e.eid);
      let v = this.eViews.get(e.eid);
      if (!v) { v = this.makeEnemyView(e); this.eViews.set(e.eid, v); }
      let at = s.phase === 'fight' ? fightXY2('e', e.seat ?? 1, e.style) : seatXY('e', e.seat ?? 1);
      const cl = clashOfE(s, e.eid);
      if (cl && e.hp > 0 && scrum.e.has(e.eid)) at = scrum.e.get(e.eid);
      this.stepOffsets(v, this.realDt || 0.016);
      v.baseX = at.x; v.baseY = at.y;
      if (!v.dying && !this.tweens.isTweening(v.c)) {
        const f = v.lunge || v.kick || v.cu || v.dash ? 1 : Math.min(1, (this.realDt || 0.016) * (s.charging ? 4 : cl ? 10 : 4.5));
        const px = v.c.x;
        v.c.x += (at.x + v.ox - v.c.x) * f;
        v.c.y += (at.y + v.oy + (e.flying ? -40 + Math.sin(this.time.now / 300 + e.eid) * 5 : 0) - v.c.y) * (v.dash ? 1 : Math.min(1, (this.realDt || 0.016) * 8));
        v.walking = !(v.lunge || v.kick || v.cu) && Math.abs(v.c.x - px) > 0.9;
      }
      v.c.setScale(at.s * v.z).setDepth(v.z > 1.01 ? 960 : 100 + v.c.y);
      v.bar.setScale(Math.max(0, e.hp / e.maxHp), 1);
      v.gBar.setScale(Math.min(1, e.gauge ?? 0), 1).setVisible(e.hp > 0);
      v.tag.setText(e.stunLeft > 0 ? '💫 기절' : e.shieldLeft > 0 ? '🛡 보호막' : e.slowLeft > 0 ? '❄ 느림' : e.poisonLeft > 0 || e.burnLeft > 0 ? '☠ 독·불' : e.curseLeft > 0 ? '🌙 저주' : '');
      if (v.rig) {
        const r = v.rig.inst, m = r.motion;
        const eb = (['attack', 'hit', 'skill'].includes(m) && !r.finished);
        if (!eb && e.hp > 0) { const want = v.walking && r.anims.move ? 'move' : 'idle'; if (m !== want) r.play(want, { loop: true }); }
        if (e.hp < v.lastHp - 0.5 && e.hp > 0) { r.hitFlash(0.12); if (m !== 'attack') r.play('hit'); }
        r.setFacing(v.dashBack ? 1 : -1);
        v.rig.view.update(e.stunLeft > 0 ? 0 : dt);
      }
      v.lastHp = e.hp;
      if (e.hp <= 0 && !v.dying) this.enemyDeath(v, e);
    }
    for (const [eid, v] of this.eViews) if (!seen.has(eid) && !v.dying) { v.c.destroy(); this.eViews.delete(eid); }
  }

  /** 힘겨루기 줄: 맞댄 두 동물 위에 금색(우리)·보라(적) 막대, 가운데 표시가 밀리는 쪽으로 움직임 */
  drawClashes() {
    const g = (this.clashG ??= this.add.graphics().setDepth(1400));
    g.clear();
    const s = this.state;
    if (s.phase !== 'fight') return;
    for (const c of s.clashes ?? []) {
      const u = s.field.find((x) => x.uid === c.uid);
      if (!u) continue;
      const v = this.uViews.get(c.uid), ev = this.eViews.get(c.eid);
      if (!v || !ev) continue;
      const y = Math.min(v.c.y, ev.c.y) - 100, x = (v.c.x + ev.c.x) / 2, w = 84;
      const k = (c.push + 1) / 2;
      g.fillStyle(0x000000, 0.6).fillRoundedRect(x - w / 2 - 2, y - 5, w + 4, 10, 4);
      g.fillStyle(0xffd84d, 1).fillRect(x - w / 2, y - 3, w * k, 6);
      g.fillStyle(0x9b6cf0, 1).fillRect(x - w / 2 + w * k, y - 3, w * (1 - k), 6);
      g.fillStyle(0xffffff, 1).fillTriangle(x - w / 2 + w * k - 5, y - 10, x - w / 2 + w * k + 5, y - 10, x - w / 2 + w * k, y - 3);
    }
  }

  enemyDeath(v, e) {
    v.dying = true;
    v.gBar.setVisible(false);
    this.fx.kill?.(v.c.x, v.c.y, 0, e.boss);
    sfx(e.boss ? 'bigKill' : 'kill');
    this.tweens.add({ targets: v.c, x: v.c.x + 70, y: v.c.y - 30, angle: 25, alpha: 0, duration: 520, ease: 'Cubic.out', onComplete: () => { v.c.destroy(); this.eViews.delete(e.eid); } });
  }

  // ---------- events → 연출 ----------
  drain() {
    const s = this.state;
    for (const ev of s.events) {
      try { this.onEvent(ev); } catch (err) { console.warn('gauntlet fx', err); }
    }
    s.events.length = 0;
  }

  posOf(side, id) {
    const v = side === 'u' ? this.uViews.get(id) : this.eViews.get(id);
    return v ? [v.c.x, v.c.y] : null;
  }

  onEvent(ev) {
    const s = this.state;
    switch (ev.type) {
      case 'act': return ev.side === 'u' ? this.unitAct(ev) : this.enemyAct(ev);
      case 'down': { const p = this.posOf('u', ev.uid); if (p) this.fx.down(p[0], p[1]); sfx('down'); break; }
      case 'step': { if (ev.who === 'u') { const v = this.uViews.get(ev.id); if (v) this.floatAt(v.c.x, v.c.y - 70, '앞으로!', '#ffd84d'); } break; }
      case 'heal': { const p = this.posOf('u', ev.uid); if (p) this.fx.heal(p[0], p[1]); break; }
      case 'eheal': { for (const v of this.eViews.values()) this.fx.heal(v.c.x, v.c.y); break; }
      case 'summon': { const p = this.posOf('e', ev.eid); if (p) this.fx.shout(p[0], p[1] - 110, '나와라!', 0xc4a6ff); sfx('bossSummon'); break; }
      case 'shield': { const p = this.posOf('e', ev.eid); if (p) { this.flashShield(p[0], p[1], 0xd2b4ff, 900); this.fx.shout(p[0], p[1] - 110, '보호막', 0xd2b4ff); } sfx('shield'); break; }
      case 'charge': { const p = this.posOf('e', ev.eid); if (p) { this.closeUp([this.eViews.get(ev.eid)], [...this.uViews.values()].filter((v) => { const u = s.field.find((x) => x.uid === v.uid); return u && u.seat < 3; }), '돌진!', 0xff6b5a); this.fx.groundAoe(ALLY_X.front, 440, 160, 0xff6b5a); } sfx('stampede'); break; }
      case 'spell': return this.spellFx(ev);
      case 'clashStart': { const a = this.uViews.get(ev.uid); if (a && !s.charging) this.fx.shout(a.c.x + 40, a.c.y - 120, '힘겨루기!', 0xffd84d, { size: 18, hold: 520 }); sfx('clash'); break; }
      case 'guard': {
        const g = this.uViews.get(ev.uid), f = this.uViews.get(ev.for), e = this.eViews.get(ev.eid);
        if (g && f) {
          // 지킴이가 노려진 동료 앞(적 쪽)으로 뛰어들어 막음
          g.dash = { t: 0, dur: 0.7, dx: f.c.x + 46 - (g.baseX ?? g.c.x), dy: f.c.y - (g.baseY ?? g.c.y) };
          this.time.delayedCall(200, () => { this.flashShield(f.c.x + 40, f.c.y - 20, 0xffd84d, 550); this.fx.ring(f.c.x + 40, f.c.y + 20, 0xffd84d, 1, 360); this.dmgNumber(g.c.x, g.c.y - 96, ev.dmg, false); sfx('shield'); });
          this.fx.shout(f.c.x + 40, f.c.y - 120, '지켜!', 0xffd84d, { size: 19 });
        }
        if (e) { e.rig?.inst.play('attack'); e.lunge = { t: 0, dur: 0.3, reach: -30 }; }
        break;
      }
      case 'peel': {
        const p = this.uViews.get(ev.uid), f = this.uViews.get(ev.for), e = this.eViews.get(ev.eid);
        if (p && e) {
          // 딜러가 노린 적에게 달려가 떼어 냄
          p.dash = { t: 0, dur: 0.66, dx: (e.baseX ?? e.c.x) - 64 - (p.baseX ?? p.c.x), dy: (e.baseY ?? e.c.y) + 6 - (p.baseY ?? p.c.y) };
          if (p.rig) playAttack(p.rig.inst, 'a2');
          this.fx.shout(p.c.x, p.c.y - 120, '떨어져!', 0x9cff6b, { size: 19 });
          this.time.delayedCall(230, () => { e.kick = { t: 0, dur: 0.45, px: 90 }; this.dmgNumber(e.c.x, e.c.y - 96, ev.dmg, true); this.fx.impact(e.c.x - 10, e.c.y - 20, 0x9cff6b, 1.2); this.cameras.main.shake(120, 0.004); sfx('slam'); });
        }
        if (f && ev.hurt) this.time.delayedCall(120, () => this.dmgNumber(f.c.x, f.c.y - 96, ev.hurt, false));
        break;
      }
      case 'collide': {
        // 쾅! 맞부딪힌 자리마다 충격, 서로 살짝 튕겼다가 힘겨루기
        for (const p of ev.pairs) {
          const a = this.uViews.get(p.uid), e = this.eViews.get(p.eid);
          if (!a || !e) continue;
          const mx = (a.c.x + e.c.x) / 2, my = (a.c.y + e.c.y) / 2;
          this.fx.impact(mx, my - 30, 0xffe066, 1.6); this.fx.shockwave(mx, my, 0xffe066, 2, 2.2); this.fx.burst('puff', mx, my + 20, 10, 0xd9c49a);
          a.kick = { t: 0, dur: 0.3, px: -26 }; e.kick = { t: 0, dur: 0.3, px: 26 };
          a.rig?.inst.play(a.rig.inst.anims.attack2 ? 'attack2' : 'attack'); e.rig?.inst.play('attack');
        }
        if (ev.pairs.length) { this.fx.sfxWord(640, 300, '쾅!', '#ffe066', 54); this.cameras.main.shake(320, 0.012); sfx('slam'); this.time.delayedCall(90, () => sfx('clash')); }
        break;
      }
      case 'echeer': {
        const a = this.eViews.get(ev.eid), b = this.eViews.get(ev.to);
        if (a && b) { this.fx.line(a.c.x - 10, a.c.y - 40, b.c.x, b.c.y - 40, 0xc4a6ff, 4, 260); this.fx.ring(b.c.x, b.c.y + 30, 0xc4a6ff, 0.8, 360); this.fx.heal(b.c.x, b.c.y); }
        break;
      }
      case 'edodge': { const e = this.eViews.get(ev.eid); if (e) { e.kick = { t: 0, dur: 0.3, px: 46 }; this.floatAt(e.c.x, e.c.y - 96, '휙!', '#c4a6ff', 20); } sfx('dodge'); break; }
      case 'gang': { const e = this.eViews.get(ev.eid); if (e) this.fx.shout(e.c.x, e.c.y - 110, '같이 덤벼!', 0xc4a6ff, { size: 16, hold: 480 }); break; }
      case 'clashWin': {
        const e = this.eViews.get(ev.eid), a = this.uViews.get(ev.uid);
        if (e) { e.kick = { t: 0, dur: 0.42, px: 84 }; this.dmgNumber(e.c.x, e.c.y - 96, ev.dmg, true); this.fx.impact(e.c.x - 20, e.c.y - 20, 0xffd84d, 1.3); }
        if (a) { a.lunge = { t: 0, dur: 0.3, reach: 36 }; a.rig?.inst.play(a.rig.inst.anims.attack2 ? 'attack2' : 'attack'); this.fx.shout(a.c.x + 30, a.c.y - 120, '밀어붙이기!', 0xffd84d, { size: 20 }); }
        this.cameras.main.shake(160, 0.005); sfx('slam'); break;
      }
      case 'clashLose': {
        const e = this.eViews.get(ev.eid), a = this.uViews.get(ev.uid);
        if (a) { a.kick = { t: 0, dur: 0.42, px: -80 }; this.dmgNumber(a.c.x, a.c.y - 96, ev.dmg, true); this.fx.impact(a.c.x + 20, a.c.y - 20, 0xff6b5a, 1.2); this.fx.shout(a.c.x, a.c.y - 120, '밀렸다!', 0xff8a7a, { size: 18 }); }
        if (e) { e.lunge = { t: 0, dur: 0.3, reach: -36 }; e.rig?.inst.play('attack'); }
        this.cameras.main.shake(140, 0.004); sfx('slam'); break;
      }
      case 'cheer': {
        const a = this.uViews.get(ev.uid), b = this.uViews.get(ev.to);
        if (a && b) { this.fx.line(a.c.x + 10, a.c.y - 40, b.c.x, b.c.y - 40, 0xffd84d, 4, 260); this.fx.burst('note', b.c.x, b.c.y - 70, 4, 0xffd84d); this.fx.ring(b.c.x, b.c.y + 30, 0xffd84d, 0.8, 360); if (Math.random() < 0.5) this.floatAt(b.c.x, b.c.y - 110, '힘내!', '#ffd84d', 14); }
        sfx('note'); break;
      }
      case 'timeUp': this.fx.banner('시간 끝!', '#ffd84d', `남은 체력 ${Math.round(ev.ally * 100)}% : ${Math.round(ev.enemy * 100)}%`); break;
      case 'encWin': this.onWin(ev); break;
      case 'encLose': this.onLose(ev); break;
      case 'regroup': this.time.delayedCall(ev && s.lastWin ? 1300 : 1500, () => this.showRegroup()); break;
      case 'encStart': break;
      default: break;
    }
  }

  /** 잠깐만 떴다 사라지는 방패 거품(fx.bubbleShield는 계속 남는 거품이라 연전에서는 쓰지 않음) */
  flashShield(x, y, color, ms = 550) {
    const b = this.add.circle(x, y, 42, color, 0.18).setStrokeStyle(3, color, 0.9).setDepth(1500).setScale(0.7);
    this.tweens.add({ targets: b, scale: 1.08, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: b, alpha: 0, scale: 1.2, delay: ms - 200, duration: 200, onComplete: () => b.destroy() });
  }

  floatAt(x, y, msg, color = '#ffffff', size = 15) {
    const t = this.add.text(x, y, msg, style(size, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(1700);
    this.tweens.add({ targets: t, y: y - 24, alpha: 0, delay: 500, duration: 400, onComplete: () => t.destroy() });
  }

  dmgNumber(x, y, d, heavy) {
    const t = this.add.text(x + Phaser.Math.Between(-8, 8), y, String(Math.round(d)), style(heavy ? 34 : 20, heavy ? '#ffe066' : '#ffffff', { stroke: heavy ? '#7a2a00' : '#000', strokeThickness: heavy ? 7 : 4, fontStyle: 'bold' })).setOrigin(0.5).setDepth(1700).setScale(heavy ? 1.7 : 1.25);
    this.tweens.add({ targets: t, scale: 1, duration: 130, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - (heavy ? 46 : 30), alpha: 0, delay: heavy ? 450 : 260, duration: 420, onComplete: () => t.destroy() });
  }

  /** 다키스트 던전식 클로즈업: 화면이 어두워지고 공격자·표적이 크게 가운데로 당겨짐, 잠깐 느려짐. */
  closeUp(attackers, targets, name, color = 0xffe066, ult = false) {
    if (this.closing) return;
    this.closing = true;
    this.slow = ult ? 0.75 : 0.5;
    this.tweens.add({ targets: this.dim, alpha: 0.6, duration: 120 });
    const all = [...attackers, ...targets].filter(Boolean);
    const hold = ult ? 0.9 : 0.62;
    for (const v of attackers.filter(Boolean)) v.cu = { t: 0, dur: hold + 0.22, z: 0.35, ox: (640 - 70 - (v.c.x - this.offOf(v))) * 0.5, oy: -10 };
    for (const v of targets.filter(Boolean)) v.cu = { t: 0, dur: hold + 0.22, z: 0.2, ox: (640 + 70 - (v.c.x - this.offOf(v))) * 0.3, oy: 0 };
    if (ult) this.fx.cutIn(name, color, '필살기'); else if (attackers[0]) this.fx.shout(attackers[0].c.x + (640 - 60 - attackers[0].c.x) * 0.45, attackers[0].c.y - 130, name, color);
    this.cameras.main.shake(ult ? 220 : 120, ult ? 0.006 : 0.003);
    this.fx._banner?.forEach((o) => o.setVisible(false));
    this.time.delayedCall(ult ? 900 : 620, () => {
      this.tweens.add({ targets: this.dim, alpha: 0, duration: 200 });
      this.closing = false;
    });
  }

  unitAct(ev) {
    const s = this.state, v = this.uViews.get(ev.uid), u = s.field.find((x) => x.uid === ev.uid);
    if (!v || !u) return;
    const tv = ev.eid != null ? this.eViews.get(ev.eid) : null;
    const targets = (ev.hits ?? []).map((h) => this.eViews.get(h.eid)).filter(Boolean);
    if (v.rig) { if (ev.move === 'skill') v.rig.inst.play(v.rig.inst.anims.skill ? 'skill' : 'attack'); else playAttack(v.rig.inst, ev.move); }
    const big = ev.big;
    const color = ev.move === 'ult' ? 0xffd84d : ev.el ? (this.D.config.elements.defs[ev.el] ? 0x8fd3ff : 0xffe066) : 0xffe066;
    if (big && (targets.length || ev.move === 'skill')) this.closeUp([v], targets.slice(0, 3), ev.name ?? '기술', ev.move === 'ult' ? 0xffd84d : ev.move === 'skill' ? 0x9cff6b : 0x8fd3ff, ev.move === 'ult');
    else if (ev.name) this.fx.shout(v.c.x, v.c.y - 110, ev.name, 0xffffff, { size: 17, hold: 420 });
    // 싸움 모양마다 움직임이 다름
    //  치고 빠지기(근접 딜러·기술): 표적 바로 앞까지 달려가 치고 깡충 돌아옴
    //  힘겨루기(브루저): 맞댄 채로 짧게 들이받음 / 응원·원거리: 제자리에서 살짝
    let hitDelay = big ? 200 : ev.melee ? 120 : 60;
    if (!big && ev.style === 'skirm' && tv) {
      const dx = (tv.baseX ?? tv.c.x) - 64 - (v.baseX ?? v.c.x), dy = (tv.baseY ?? tv.c.y) + 6 - (v.baseY ?? v.c.y);
      v.dash = { t: 0, dur: 0.66, dx, dy };
      v.lunge = null;
      hitDelay = 230;
    } else if (!big && ev.style === 'bruiser' && clashOfU(s, u.uid)) {
      v.lunge = { t: 0, dur: 0.24, reach: 18 };
      hitDelay = 90;
    } else if (!big) {
      const tx = tv ? tv.c.x : v.c.x + 200;
      v.lunge = { t: 0, dur: ev.melee ? 0.34 : 0.22, reach: ev.melee ? Math.max(30, (tx - v.c.x) - 110) : ev.style === 'support' ? 14 : 26 };
    }
    if (v.ring) { v.ring.setStrokeStyle(3, COLORS.gold, 1); this.tweens.add({ targets: v.ring, alpha: { from: 1, to: 0 }, duration: 500, onComplete: () => v.ring.setAlpha(1).setStrokeStyle(3, COLORS.gold, 0) }); }
    const impact = () => {
      for (const h of ev.hits ?? []) {
        const t = this.eViews.get(h.eid);
        if (!t) continue;
        const heavy = big || h.dmg >= 0.18 * (s.enemies.find((e) => e.eid === h.eid)?.maxHp ?? 1e9);
        this.dmgNumber(t.c.x, t.c.y - 90, h.dmg, heavy);
        this.fx.hit(t.c.x, t.c.y - 10, heavy ? 'orange' : 'white', heavy);
        if (ev.melee && !big) this.fx.slash(t.c.x - 10, t.c.y - 10, 0xffffff);
        t.ring.setStrokeStyle(3, 0xff6b5a, 1); this.tweens.add({ targets: t.ring, alpha: { from: 1, to: 0 }, duration: 380, onComplete: () => t.ring.setAlpha(1).setStrokeStyle(3, 0xff6b5a, 0) });
        t.kick = { t: 0, dur: 0.16, px: heavy ? 26 : 12 };
      }
      if (ev.el) try { this.fx.element(ev.el, [v.c.x, v.c.y], targets.map((t) => [t.c.x, t.c.y])); } catch { /* */ }
      if (ev.move === 'skill' && ev.action) try { this.fx.skillFx(ev.action, [v.c.x, v.c.y], targets.map((t) => [t.c.x, t.c.y]), { allies: [...this.uViews.values()].map((a) => [a.c.x, a.c.y]) }); } catch { /* */ }
      sfx(big ? 'slam' : ev.melee ? 'hit' : 'shoot');
    };
    if (!ev.melee && tv && ev.move !== 'skill') {
      sfx('shoot');
      this.fx.projectile(u.speciesId, v.c.x + 20, v.c.y - 20, tv.c.x, tv.c.y - 10, ev.move === 'ult', impact);
    } else this.time.delayedCall(hitDelay, impact);
  }

  enemyAct(ev) {
    const v = this.eViews.get(ev.eid), t = this.uViews.get(ev.uid);
    if (!v) return;
    v.rig?.inst.play('attack');
    const tx = t ? t.c.x : v.c.x - 200;
    if (ev.style === 'skirm' && !ev.clash && t) {
      // 적 돌격대: 우리 뒷줄까지 달려와 치고 빠짐
      v.dash = { t: 0, dur: 0.66, dx: (t.baseX ?? t.c.x) + 64 - (v.baseX ?? v.c.x), dy: (t.baseY ?? t.c.y) + 6 - (v.baseY ?? v.c.y) };
    } else {
      const reach = ev.clash ? -18 : ev.melee ? -Math.max(30, (v.c.x - tx) - 110) : ev.style === 'support' ? -14 : -24;
      v.lunge = { t: 0, dur: ev.clash ? 0.24 : ev.melee ? 0.36 : 0.22, reach };
    }
    const impact = () => {
      if (!t) return;
      if (ev.dodged) { t.kick = { t: 0, dur: 0.3, px: -46 }; this.floatAt(t.c.x, t.c.y - 96, '휙!', '#9cff6b', 20); sfx('dodge'); return; }
      this.dmgNumber(t.c.x, t.c.y - 90, ev.dmg, ev.boss);
      this.fx.hit(t.c.x, t.c.y - 10, ev.boss ? 'red' : 'white', ev.boss);
      t.kick = { t: 0, dur: 0.16, px: -14 };
      if (ev.boss) this.cameras.main.shake(120, 0.004);
      sfx(ev.boss ? 'slam' : 'hit');
    };
    if (!ev.melee && t) { this.fx.line?.(v.c.x - 20, v.c.y - 30, t.c.x, t.c.y - 10, 0xc4a6ff, 4, 160); this.time.delayedCall(120, impact); }
    else this.time.delayedCall(ev.style === 'skirm' && !ev.clash ? 230 : 140, impact);
  }

  spellFx(ev) {
    const def = spellDef(this.D, ev.id);
    this.fx.cutIn(`${ev.icon ?? ''} ${ev.name}`, 0x8fd3ff, def?.tale ?? '');
    this.slow = 0.5;
    for (const h of ev.hits ?? []) { const t = this.eViews.get(h.eid); if (t) { this.dmgNumber(t.c.x, t.c.y - 90, h.dmg, true); this.fx.impact(t.c.x, t.c.y - 20, 0x8fd3ff, 1.2); } }
    if (def?.effect === 'meteor') this.fx.groundAoe(ENEMY_X.front, 440, 170, 0xffb35c);
    if (def?.effect === 'guard' || def?.effect === 'drum') for (const v of this.uViews.values()) this.fx.ring(v.c.x, v.c.y + 30, 0x8fd3ff, 0.9);
    if (def?.effect === 'wall') for (const v of this.eViews.values()) this.fx.burst('leaf', v.c.x, v.c.y, 6, 0x66bb6a);
  }

  onWin(ev) {
    sfx(ev.boss ? 'clear' : 'coin');
    for (const v of this.uViews.values()) if (v.rig?.inst.anims.victory) v.rig.inst.play('victory');
    if (ev.boss) { this.fx.confetti(); this.fx.banner('스테이지 클리어!', '#7CFC9A'); }
    else this.fx.banner('승리!', '#ffd84d', '전열 정비');
  }

  onLose(ev) {
    sfx('lose');
    if (this.state.phase === 'ended') this.fx.banner(this.state.hard ? '패배 — 하드는 여기서 끝' : '패배 — 생명이 다함', '#ff8a7a');
    else { this.fx.banner('후퇴…', '#ff8a7a', `성문이 맞음 · 생명 ${ev.life} 남음`); this.cameras.main.shake(260, 0.008); }
  }

  // ---------- 정비 ----------
  clearUi() { this.ui.forEach((o) => o.destroy()); this.ui = []; this.slots?.forEach((o) => o.destroy()); this.slots = []; this.pickFood = false; this.globePick = null; this.relicPick = null; }

  addUi(o) { this.ui.push(o); return o; }

  showRegroup() {
    if (this.leaving || this.state.phase !== 'regroup') return;
    const s = this.state, D = this.D;
    this.clearUi();
    this.eViews.forEach((v) => v.c.destroy()); this.eViews.clear();
    // 자리 칸(끌어 놓을 곳)
    this.slots = [];
    const sg = this.add.graphics().setDepth(60);
    for (let i = 0; i < 6; i++) { const at = seatXY('u', i); sg.lineStyle(2, 0xd4b06a, 0.55).strokeRoundedRect(at.x - 54, at.y - 58, 108, 112, 14); }
    sg.fillStyle(0x0d1222, 0.92).fillRect(0, 604, 640, 116);
    for (let i = 0; i < s.bench.length; i++) { const b = BENCH(i); sg.lineStyle(2, 0x8fd3ff, 0.6).strokeRoundedRect(b.x - 46, b.y - 46, 92, 92, 12); }
    this.slots.push(sg);
    this.slots.push(this.add.text(BENCH(0).x - 46, 610, `대기석 ${s.bench.filter(Boolean).length}/${s.bench.length}`, style(12, '#8fd3ff')).setDepth(61));
    this.slots.push(this.add.text(330, 92, '끌어서 자리 바꾸기 · 겹치면 합성', style(14, '#d4b06a', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(61));
    // 오른쪽 판
    const g = this.addUi(this.add.graphics().setDepth(2000));
    g.fillStyle(0x0d1222, 0.95).fillRoundedRect(660, 80, 600, 620, 16).lineStyle(2, 0xd4b06a, 0.7).strokeRoundedRect(660, 80, 600, 620, 16);
    const win = s.lastWin;
    this.addUi(this.add.text(684, 96, win ? '승리! 전열 정비' : '후퇴… 전열 정비', style(26, win ? '#ffd84d' : '#ff8a7a')).setDepth(2001));
    this.addUi(this.add.text(684, 132, win ? `살아 있는 동물 체력 +${gcfg(D).healPct}% · 쓰러진 동물은 한 교전 쉼` : `모두 간신히 일어남 · ${s.hard ? '' : `생명 ${s.life} 남음`}`, style(13, '#b9b4a6')).setDepth(2001));
    if (s.mvp) this.addUi(this.add.text(684, 154, s.mvp.grew ? `⭐ 활약상: ${s.mvp.from} (${s.mvp.dmg}) → ${s.mvp.to}로 자람!` : `⭐ 활약상: ${s.mvp.from} (${s.mvp.dmg})`, style(14, '#9cff6b')).setDepth(2001));
    if (s.mvp?.grew) { const p = this.posOf('u', s.mvp.uid); if (p) { this.fx.evolve(p[0], p[1], false); sfx('evolve'); } }
    this.drawRewards();
    this.drawPreview();
    this.addUi(button(this, 1150, 660, 180, 56, '다음 교전 ▶', () => this.goNext(), { depth: 2002, fill: 0x8a6a1a, stroke: 0xffd84d, size: 20 }));
  }

  drawRewards() {
    const s = this.state, D = this.D, o = s.offer;
    this.rewardObjs?.forEach((x) => x.destroy()); this.rewardObjs = [];
    const add = (x) => { this.rewardObjs.push(x); this.ui.push(x); return x; };
    add(this.add.text(684, 184, o?.taken ? '보상 — 받음' : '보상 — 하나만 고름', style(18, '#ffffff')).setDepth(2001));
    if (!o) return;
    const y = 214, w = 180;
    const card = (i, title, desc, color, onClick, on = true) => {
      const x = 684 + i * (w + 12);
      const b = add(this.add.graphics().setDepth(2001));
      const taken = o.taken === ['globe', 'food', 'relic'][i];
      b.fillStyle(taken ? 0x3b2f12 : 0x182040, 1).fillRoundedRect(x, y, w, 118, 12).lineStyle(taken ? 3 : 2, taken ? 0xffd84d : color, on ? 1 : 0.3).strokeRoundedRect(x, y, w, 118, 12);
      add(this.add.text(x + 12, y + 10, title, style(17, on ? '#ffffff' : '#777777')).setDepth(2002));
      add(this.add.text(x + 12, y + 38, desc, style(12, on ? '#d8d2c2' : '#666666', { wordWrap: { width: w - 24 } })).setDepth(2002));
      const z = add(this.add.zone(x + w / 2, y + 59, w, 118).setInteractive({ useHandCursor: on && !o.taken }).setDepth(2003));
      z.on('pointerdown', () => { if (on && !o.taken) onClick(); });
    };
    card(0, '🌐 지구본', '덱 동물 후보 3마리 중 1마리를 데려옴(어린 단계)', 0xf2b544, () => this.showGlobe(), s.bench.includes(null) || s.seats.includes(null));
    card(1, '🍖 먹이 한 바구니', '한 마리가 한 단계 자람. 다 자랐으면 체력 가득', 0x7ddc6f, () => { this.pickFood = true; this.toast('먹일 동물을 누름', '#9cff6b'); });
    card(2, '✨ 유물', o.relic ? '이번 판 내내 효과, 끝나도 별자리 재료로 남음' : '받을 유물이 없음', 0xc4a6ff, () => this.showRelics(), !!o.relic);
    this.sub?.forEach((x) => x.destroy()); this.sub = [];
  }

  subUi(o) { this.sub.push(o); this.ui.push(o); return o; }

  showGlobe() {
    const s = this.state, D = this.D;
    this.sub?.forEach((x) => x.destroy()); this.sub = [];
    this.subUi(this.add.text(684, 344, '지구본이 멈춘 곳의 짐승들 — 하나를 고름', style(14, '#f2b544')).setDepth(2001));
    s.offer.globe.forEach((c, i) => {
      const sp = D.unitById[c.speciesId], x = 684 + i * 192, y = 368;
      const g = this.subUi(this.add.graphics().setDepth(2001));
      g.fillStyle(0x2b2410, 1).fillRoundedRect(x, y, 180, 110, 12).lineStyle(2, 0xf2b544, 0.9).strokeRoundedRect(x, y, 180, 110, 12);
      const im = speciesImage(this, sp.id, 'young', x + 44, y + 52, 84); if (im) this.subUi(im.setDepth(2002));
      this.subUi(this.add.text(x + 86, y + 18, sp.name, style(17, '#ffffff')).setDepth(2002));
      this.subUi(this.add.text(x + 86, y + 44, `${ROLE[sp.role] ?? ''}\n사거리 ${sp.range}`, style(12, '#d8d2c2')).setDepth(2002));
      const z = this.subUi(this.add.zone(x + 90, y + 55, 180, 110).setInteractive({ useHandCursor: true }).setDepth(2003));
      z.on('pointerdown', () => { const r = takeReward(s, D, 'globe', i); if (r.ok) { sfx('summon'); this.toast(`${sp.name} 합류!`, '#9cff6b'); this.drawRewards(); } else this.toast(r.reason === 'benchFull' ? '자리가 없음' : '못 고름'); });
    });
  }

  showRelics() {
    const s = this.state, D = this.D;
    this.sub?.forEach((x) => x.destroy()); this.sub = [];
    this.subUi(this.add.text(684, 344, '별빛 유물 — 하나를 고름', style(14, '#c4a6ff')).setDepth(2001));
    s.offer.relic.forEach((id, i) => {
      const r = D.relicById[id], x = 684 + i * 192, y = 368;
      const g = this.subUi(this.add.graphics().setDepth(2001));
      g.fillStyle(0x1f1733, 1).fillRoundedRect(x, y, 180, 110, 12).lineStyle(2, 0xc4a6ff, 0.9).strokeRoundedRect(x, y, 180, 110, 12);
      this.subUi(this.add.text(x + 12, y + 10, `${r.icon} ${r.name}`, style(15, '#ffffff')).setDepth(2002));
      this.subUi(this.add.text(x + 12, y + 36, r.desc, style(12, '#d8d2c2', { wordWrap: { width: 156 } })).setDepth(2002));
      const z = this.subUi(this.add.zone(x + 90, y + 55, 180, 110).setInteractive({ useHandCursor: true }).setDepth(2003));
      z.on('pointerdown', () => { const res = takeReward(s, D, 'relic', id); if (res.ok) { sfx('magic'); this.toast(`${r.name}!`, '#c4a6ff'); this.drawRewards(); } });
    });
  }

  feed(uid) {
    const r = takeReward(this.state, this.D, 'food', uid);
    this.pickFood = false;
    if (!r.ok) { this.toast(r.reason === 'maxed' ? '이미 다 자라고 체력도 가득' : '못 먹임'); return; }
    const p = this.posOf('u', r.unit.uid);
    this.time.delayedCall(30, () => { const q = this.posOf('u', r.unit.uid) ?? p; if (q) this.fx.evolve(q[0], q[1], false); });
    sfx(r.healed ? 'heal' : 'evolve');
    this.toast(r.healed ? `${r.unit.stats.name} 체력 가득` : `${r.unit.stats.name}로 자람!`, '#9cff6b');
    this.drawRewards();
  }

  drawPreview() {
    const p = nextPreview(this.state, this.D);
    if (!p) return;
    const y = 500;
    const g = this.addUi(this.add.graphics().setDepth(2001));
    g.fillStyle(0x1f1733, 1).fillRoundedRect(684, y, 552, 116, 12);
    this.addUi(this.add.text(700, y + 10, p.boss ? '다음: 보스 교전' : `다음 교전 미리 보기 · ${this.state.enc + 1} / ${this.state.plan.length}`, style(16, p.boss ? '#ff8a7a' : '#c4a6ff')).setDepth(2002));
    this.addUi(this.add.text(700, y + 40, p.list.map((x) => `${x.boss ? '👑 ' : ''}${x.name} ×${x.n}${x.flying ? ' (날아다님)' : ''}`).join('   '), style(14, '#f4f1e8', { wordWrap: { width: 520 } })).setDepth(2002));
    const fly = p.list.filter((x) => x.flying).reduce((n, x) => n + x.n, 0);
    const tip = fly >= 2 ? '나는 적이 많음 → 원거리를 뒷줄에' : p.boss ? '보스 → 체력이 약한 동물은 뒷줄로, 브루저는 앞줄로' : '근접은 앞줄, 원거리·응원은 뒷줄이 제 힘';
    this.addUi(this.add.text(700, y + 84, tip, style(13, '#d8d2c2')).setDepth(2002));
  }

  goNext() {
    const s = this.state;
    if (s.offer && !s.offer.taken) { this.toast('보상을 먼저 하나 고름'); return; }
    const r = nextEncounter(s, this.D);
    if (!r.ok) { this.toast('출전할 동물이 없음'); return; }
    this.startFightView();
  }

  // ---------- 끌어 놓기 ----------
  slotAt(x, y) {
    const s = this.state;
    let best = null, bd = 80;
    for (let i = 0; i < 6; i++) { const a = seatXY('u', i); const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = { where: 'seat', index: i }; } }
    for (let i = 0; i < s.bench.length; i++) { const a = BENCH(i); const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = { where: 'bench', index: i }; } }
    return best;
  }

  refOf(uid) {
    const s = this.state;
    const si = s.seats.indexOf(uid);
    if (si >= 0) return { where: 'seat', index: si };
    const bi = s.bench.findIndex((u) => u?.uid === uid);
    return bi >= 0 ? { where: 'bench', index: bi } : null;
  }

  showDropHint(v, x, y) {
    const to = this.slotAt(x, y), from = this.refOf(v.uid);
    const k = to && from ? mergeHint(this.state, this.D, from, to) : null;
    this.hintT?.destroy();
    if (k && k !== 'swap') this.hintT = this.add.text(x, y - 110, MERGE_NAME[k], style(18, k === 'weak' ? '#aaaaaa' : '#ffd84d', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(2600);
  }

  dropUnit(v) {
    this.hintT?.destroy();
    const to = this.slotAt(v.c.x, v.c.y), from = this.refOf(v.uid);
    if (!to || !from) return;
    const r = moveAnimal(this.state, this.D, from, to);
    if (!r.ok) { if (r.reason !== 'same') this.toast(r.reason === 'last' ? '한 마리는 남아야 함' : '못 옮김'); return; }
    if (r.kind === 'move' || r.kind === 'swap') { sfx('click'); return; }
    const at = to.where === 'seat' ? seatXY('u', to.index) : BENCH(to.index);
    if (r.kind === 'evolve') { this.fx.evolve(at.x, at.y, false); sfx('evolve'); }
    else if (r.kind === 'spirit') { this.fx.evolve(at.x, at.y, true); this.fx.cutIn(r.unit.stats.name, 0xffd84d, '신화급이 깨어남'); sfx('spirit'); }
    else if (r.kind === 'chimera') { this.fx.chimera(at.x, at.y); this.fx.cutIn(r.unit.stats.name, 0xc77dff, '새 이야기가 태어남'); sfx('chimera'); }
    else if (r.kind === 'weak') { this.fx.weak(at.x, at.y); this.toast(`${r.unit.stats.name}… 단점만 모였음`, '#aaaaaa'); sfx('weak'); }
  }

  // ---------- 끝 ----------
  finish() {
    this.leaving = true;
    const s = this.state;
    const report = settleRun(this.save, s, this.D);
    const candidates = s.result === 'clear' ? carryCandidates(s, this.D) : [];
    if (candidates.length) setCarry(this.save, this.D, this.stageId, candidates[0]);
    writeSave(this.registry.get('storage'), this.save);
    this.time.delayedCall(s.result === 'clear' ? 2600 : 1600, () => this.scene.start('Result', { report, candidates, stageId: this.stageId, wave: Math.min(s.enc + 1, s.plan.length), total: s.plan.length, life: s.life, gauntlet: true, hard: s.hard }));
  }
}

export { unitsIn };
