// 연전 화면(2026-11-26): 다키스트 던전 + 유니콘 오버로드 느낌.
// 교전 = 양쪽 앞줄·뒷줄이 마주 서서 실시간 자동 전투. 행동 게이지(파란 줄)가 차면 한 마리씩 앞으로 튀어나와 침.
// 필살기·속성·기술은 화면이 어두워지며 공격자와 표적이 크게 당겨져 보이고(클로즈업) 잠깐 느려짐.
// 교전이 끝나면 정비: 회복, 보상 3개 중 1개, 끌어서 자리 바꾸기·합성, 다음 교전 미리 보기.
import Phaser from 'phaser';
import { buildData } from '../logic/data.js';
import { battleOptions, settleRun, writeSave, carryCandidates, setCarry, takeOutForRun } from '../logic/meta.js';
import { createGauntlet, tickGauntlet, takeReward, moveAnimal, mergeHint, mergeOddsG, useRally, treatCost, healCost, healUnits, clutchOf, nextEncounter, nextPreview, castG, spellBlockG, unitsIn, gcfg, clashOfU, clashOfE, startEncounter, styleOf, canStance, cyclePrefStance, reviveUnit, releaseUnit, reviveCost, cycleTactic, tacticOf, TACTIC_LABEL, TACTICS, setPlan, statLine, cycleBuild, buildSet, BUILDS, tapShield, setStar, GOD_RULES, godRuleOf, weekKey, recommendSeats, cheerClash, encFactors, buyExtraReward, extraCost, recommendReward, buyPotion, trainUnit, trainCost, tuneOf, laneOf } from '../logic/gauntlet.js';
import { spellDef, spellCost } from '../logic/spells.js';
import { duelData, myDuelDeck, DUEL } from '../logic/duel.js';
import { unitRig, enemyRig, dotDataFor, playAttack, ATTACK_MOTIONS, queueMotionSheets, dropMotionSheets, stageEnemyIds, poolExtraIds, enemyFace } from './rigs.js';
import { FX, ambient, weather } from './fx.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sfx.js';
import { button, style, unitToken, hex, COLORS, speciesImage, pixIcon } from './ui.js';
import { Globe } from './globe.js';
import { dotOn, dotify } from './dotfx.js';
import { stageProfile } from '../logic/matchup.js';

// 작전 한 줄 설명(7살도 알게)
const TACTIC_TIP = { hold: '앞에서 힘싸움', guard: '뒤 친구를 막아 줌', help: '앞 싸움을 도움', hunt: '적 뒷줄을 노림', intercept: '달려드는 적을 막음', front: '앞 친구를 응원', back: '뒤 친구에게 보호막' };
const PLAN_BTNS = [['front', '💪 앞싸움'], ['hunt', '🎯 노리기'], ['guard', '🛡 지키기']];
const STANCE_NAME = { tank: '🛡 탱', deal: '⚔ 딜', support: '✚ 서폿' };
const STANCE_COL = { tank: 0xffd84d, deal: 0xff6b5a, support: 0x7ddc6f };
const STYLE_ICON = { bruiser: '🛡', skirm: '⚔', ranged: '🏹', support: '✚' };
const ROLE = { bruiser: '🛡 막기', dealer: '⚔ 딜러', technician: '🎯 기술', buffer: '🎺 응원', weak: '약체' };
const MERGE_NAME = { evolve: '진화', spirit: '신화급!', chimera: '키메라!', weak: '🧬 슬라임…', reslime: '🫠 다시 합성', swap: '자리 바꾸기' };
// 자리: 0~2 앞줄, 3~5 뒷줄. 세 줄 깊이(위·가운데·아래)를 살짝 엇갈려 세움
// 3×3 자리(seat = 열×3 + 라인): 1열 브루저 · 2열 딜러 · 3열 응원. 정비 때 칸, 교전 때는 라인별로 가운데에 모여 붙음
const LANE_Y = [245, 370, 495], LANE_S = [0.94, 1, 1.06];
const COL_X = { u: [500, 345, 190], e: [780, 935, 1090] };
const seatXY = (side, seat) => { const c = Math.floor((seat ?? 1) / 3), l = (seat ?? 1) % 3; return { x: COL_X[side][c] ?? COL_X[side][0], y: LANE_Y[l], s: LANE_S[l] }; };
const CLASH_GAP = 40;
const SCRUM_Y = 418, FIGHT_LANE_Y = [318, 418, 518];
const scaleAtY = (y) => 0.94 + Math.max(0, Math.min(1, (y - 292) / 236)) * 0.12;
const FIGHT_COL_X = { u: [548, 430, 310], e: [732, 850, 970] };
const fightXY2 = (side, seat) => {
  const c = Math.floor((seat ?? 1) / 3), l = (seat ?? 1) % 3, y = FIGHT_LANE_Y[l];
  return { x: FIGHT_COL_X[side][c] ?? FIGHT_COL_X[side][0], y, s: scaleAtY(y) };
};
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
      if (d?.duel) { queueMotionSheets(this, myDuelDeck(this.registry.get('save'), data).map((x) => x.id)); queueMotionSheets(this, d.duel.foe.deck.map((x) => x.id)); queueMotionSheets(this, poolExtraIds([...myDuelDeck(this.registry.get('save'), data).map((x) => x.id), ...d.duel.foe.deck.map((x) => x.id)])); }
      else {
      queueMotionSheets(this, pool);
      queueMotionSheets(this, poolExtraIds(pool));   // 돌연변이 슬라임 + 덱 종끼리의 자동 키메라(PixelLab 동작)
      queueMotionSheets(this, stageEnemyIds(data.stageById[d?.stageId ?? 'forest-1'], data));
      }   // 그 판 적의 PixelLab 동작
    } catch (e) { console.warn('motion sheets', e); }
    this.load.on('loaderror', (f) => console.warn('motion sheet missing', f.key));
  }

  create(d) {
    this.events.once('shutdown', () => dropMotionSheets(this));
    this.D = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.duelIn = d?.duel ?? null;
    if (this.duelIn) { this.dd = duelData(this.D, this.duelIn.foe); this.D = this.dd.data; }
    this.stageId = this.duelIn ? 'arena' : d?.stageId ?? 'forest-1';
    this.stage = this.D.stageById[this.stageId];
    Object.assign(this, { speed: 1, slow: 0, uViews: new Map(), eViews: new Map(), ui: [], leaving: false, state: null, mode: null });
    this.cameras.main.setBackgroundColor('#0b0d12');
    this.fx = new FX(this);
    this.drawStage();
    this.input.on('pointerdown', unlockAudio);
    this.input.keyboard.on('keydown-ONE', () => { this.speed = 1; this.speedBtn?.set('×1'); });
    this.input.keyboard.on('keydown-TWO', () => { this.speed = 2; this.speedBtn?.set('×2'); });
    this.input.keyboard.on('keydown-THREE', () => { this.speed = 1.5; this.speedBtn?.set('×1.5'); });
    if (this.duelIn) this.beginDuel(); else if (d?.hard != null) this.begin(!!d.hard, d.tier ?? null); else this.chooseDifficulty();
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
    // 세 라인(위·가운데·아래): 같은 라인끼리 맞붙음
    for (const y of FIGHT_LANE_Y) { g.lineStyle(2, 0xffffff, 0.06).lineBetween(160, y + 34, 1120, y + 34); }
    for (const [side, c] of [['u', 0xd4b06a], ['e', 0xb388ff]]) for (const x of FIGHT_COL_X[side]) { g.lineStyle(2, c, 0.14); for (const y of FIGHT_LANE_Y) g.strokeEllipse(x, y + 34, 80, 20); }
    // 가장자리 비네트
    const v = this.add.graphics().setDepth(1500);
    for (let i = 0; i < 10; i++) { v.lineStyle(40, 0x000000, 0.06 + i * 0.012); v.strokeRect(-20 + i * 14, -20 + i * 14, 1320 - i * 28, 760 - i * 28); }
    try { ambient(this, st); } catch { /* */ }
    try { weather(this, this.D.config.climates?.[st.climate]); } catch { /* */ }
    this.dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 1).setAlpha(0).setDepth(900);
  }

  // ---------- 난이도 ----------
  chooseDifficulty() {
    const rec = this.save.stages?.[this.stageId] ?? {};
    const g = gcfg(this.D);
    const rule = GOD_RULES[godRuleOf(Date.now())];
    const parts = [];
    const add = (o) => { parts.push(o); return o; };
    const box = add(this.add.graphics().setDepth(3000));
    box.fillStyle(0x000000, 0.7).fillRect(0, 0, 1280, 720);
    box.fillStyle(0x141a2e, 1).fillRoundedRect(300, 70, 680, 600, 18).lineStyle(2, 0xd4b06a, 0.9).strokeRoundedRect(300, 70, 680, 600, 18);
    add(this.add.text(640, 108, this.stage.name, style(30, '#ffffff')).setOrigin(0.5).setDepth(3001));
    const prof = stageProfile(this.stage, this.D);
    add(this.add.text(640, 144, `교전 ${g.encounters}번 + 보스 · ${prof.tags.join('  ')}`, style(14, '#b9b4a6')).setOrigin(0.5).setDepth(3001));
    // 사다리: 노멀 → 하드 → 하드코어 → 신계 (앞 단계를 깨야 열림)
    const best = this.save.godBest?.[weekKey(Date.now())]?.[this.stageId];
    const rows = [
      { key: 'normal', label: '노멀', open: true, fill: 0x2e5a3a, stroke: 0x7ddc6f, desc: `♥ 생명 ${g.life} · 지면 생명 -1` },
      { key: 'hard', label: '하드', open: !!rec.cleared, fill: 0x5a1e1e, stroke: 0xff6b5a, desc: rec.cleared ? `한 번 지면 끝 · 정예·보스 2단계 · 보상 2개 · 에센스 ×${g.hardEssence}` : '노멀을 깨면 열림' },
      { key: 'hardcore', label: '하드코어', open: !!rec.hard, fill: 0x3a0f2a, stroke: 0xff4fa0, desc: rec.hard ? '정예 2배 · 다음 적 짐작 없음 · 부활 2배 값 · 에센스 ×2' : '하드를 깨면 열림' },
      { key: 'god', label: '⚡ 신계', open: !!rec.hardcore, fill: 0x2a2a6a, stroke: 0xc4a6ff, desc: rec.hardcore ? `이번 주 · ${rule.name}: ${rule.desc}${best ? ` · 내 최고 ${best.enc}교전` : ''}` : '하드코어를 깨면 열림' },
    ];
    const btns = [];
    const close = () => { parts.forEach((p) => p.destroy()); btns.forEach((b) => b.destroy()); };
    rows.forEach((r, i) => {
      const y = 214 + i * 104;
      const b = button(this, 470, y, 220, 54, r.open ? r.label : `🔒 ${r.label}`, () => { if (!r.open) return; close(); this.begin(r.key !== 'normal', r.key === 'hardcore' || r.key === 'god' ? r.key : null); }, { depth: 3002, fill: r.open ? r.fill : 0x333333, stroke: r.stroke, size: 20 });
      b.setEnabled(r.open); btns.push(b);
      add(this.add.text(600, y, r.desc, style(14, r.open ? '#f0e6d0' : '#777777', { wordWrap: { width: 350 } })).setOrigin(0, 0.5).setDepth(3001));
    });
    btns.push(button(this, 640, 640, 180, 40, '← 돌아가기', () => this.scene.start('StageSelect'), { depth: 3002, size: 15 }));
  }

  bindCheer() {
    if (this.cheerBound) return;
    this.cheerBound = true;
    this.input.on('pointerdown', (p) => {
      if (this.state?.phase !== 'fight' || !this.clashBars?.length) return;
      const hit = this.clashBars.find((b) => Math.abs(p.x - b.x) < 95 && Math.abs(p.y - b.y) < 34);
      if (hit) { const r = cheerClash(this.state, hit.uid, this.D); if (!r.ok && r.reason === 'noCheers') this.toast('응원은 교전마다 8번'); }
    });
  }

  /** 덱 대결: 내 대표 덱(해금한 동물·레벨 단계) vs 친구 덱(컴퓨터). 3판 2선승, 마법·유물·금화 없음 */
  beginDuel() {
    this.bindCheer();
    const mine = myDuelDeck(this.save, this.D);
    const teenAt = gcfg(this.D).growLv?.teen ?? 4;
    const seed = Number(new URLSearchParams(window.location.search).get('seed')) || Date.now() % 100000;
    this.state = createGauntlet(this.D, 'arena', seed, {
      pool: mine.map((x) => x.id), levels: Object.fromEntries(mine.map((x) => [x.id, x.stage === 'teen' ? teenAt : 1])), builds: Object.fromEntries(mine.filter((x) => x.build).map((x) => [x.id, x.build])),
      spells: [], plan: this.dd.plan, duel: { hpMul: DUEL.hpMul, need: DUEL.need, foePlan: this.dd.foePlan, code: this.duelIn.code, name: this.duelIn.name }, prelude: true,
    });
    window.__gauntlet = { scene: this, get state() { return this.scene.state; }, data: this.D };
    this.drawHud();
    this.state.events.length = 0;
    this.time.delayedCall(80, () => this.showRegroup());
  }

  begin(hard, tier = null) {
    this.bindCheer();
    const seed = Number(new URLSearchParams(window.location.search).get('seed')) || Date.now() % 100000;
    const bag = takeOutForRun(this.save, this.D);
    writeSave(this.registry.get('storage'), this.save);
    this.state = createGauntlet(this.D, this.stageId, seed, { ...battleOptions(this.save, this.D, this.stageId), hard, tier, pouch: bag.pouch, prep: bag.prep, prelude: true });
    if (bag.pouch || bag.prep) this.time.delayedCall(900, () => this.toast(`🎒 들고 옴: 💰${this.state.gold}${bag.prep?.relics?.length ? ` · 유물 ${bag.prep.relics.length}` : ''}${bag.prep?.food ? ` · 🍖${bag.prep.food}` : ''}${bag.prep?.feathers ? ` · 🪶${bag.prep.feathers}` : ''}`, '#ffd84d'));
    window.__gauntlet = { scene: this, get state() { return this.scene.state; }, data: this.D,
      rigs: { unitRig, queue: (ids) => { queueMotionSheets(this, ids); this.load.start(); } },   // 시험용: 그림 검수(키메라·슬라임 도트)
      jump: (n) => { const st = this.state; st.enc = n; st.prelude = false; this.clearUi?.(); this.tutShow?.(''); this.eViews.forEach((v) => v.c.destroy()); this.eViews.clear(); startEncounter(st, this.D); this.startFightView(); } };   // 시험용: n번째 교전으로
    this.drawHud();
    // 스테이지 1 튜토리얼: 처음 한 번, 하나씩 따라 하며 진행
    this.tut = this.stageId === 'forest-1' && !this.save.tutorialDone && !hard ? { step: 0 } : null;
    // 첫 교전도 정비 화면부터: 자리·작전·다음 적을 보고 ▶ 출발
    this.state.events.length = 0;
    this.time.delayedCall(80, () => { this.showRegroup(); if (this.tut) this.tutShow('🐾 동물 자리를 보고 ▶ 출발!', 1170, 690); });
  }

  // ---------- 튜토리얼(스테이지 1) ----------
  // 단계: 0 보기 → 1 보상 고르기 → 2 다음 → 3 자리 바꾸기 → 4 같은 동물 겹쳐 진화 → 5 마법 → 6 보스
  tutShow(text, px = null, py = null) {
    this.tutObjs?.forEach((o) => o.destroy());
    this.tutObjs = [];
    if (!text) return;
    const t = this.add.text(640, 150, text, style(24, '#ffffff', { backgroundColor: '#1f2a4acc', padding: { x: 18, y: 10 }, stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(2800);
    this.tutObjs.push(t);
    this.tweens.add({ targets: t, scale: { from: 0.9, to: 1 }, duration: 260, ease: 'Back.out' });
    if (px != null) { const h = this.add.text(px, py, '👆', style(44)).setOrigin(0.5, 0).setDepth(2801); this.tutObjs.push(h); this.tweens.add({ targets: h, y: py + 16, yoyo: true, repeat: -1, duration: 420 }); }
  }

  /** 게임 사건마다 불러서 다음 단계로. */
  tutAt(ev) {
    const t = this.tut; if (!t) return;
    const s = this.state;
    const next = (n, text, px, py) => { t.step = n; this.tutShow(text, px, py); };
    if (ev === 'fightStart' && t.step === 0) next(0, '👀 가만히 보세요. 동물들이 알아서 싸워요');
    else if (ev === 'regroup' && t.step === 0) next(1, '🎁 보상을 하나 고르세요', 774, 300);
    else if (ev === 'reward' && t.step === 1) next(2, '▶ 다음을 눌러요', 1150, 690);
    else if (ev === 'next' && t.step === 2) { next(2.5, ''); }
    else if (ev === 'regroup' && t.step === 2.5) {
      // 같은 동물을 확정으로 줘서 진화를 배우게
      const young = s.field.find((u) => u.kind === 'base' && u.stage === 'young');
      if (young && s.offer && !s.offer.taken) s.offer.globe[0] = { speciesId: young.speciesId, traits: [] };
      next(3, '✋ 동물을 끌어서 자리를 바꿔 보세요 (🛡 브루저는 1열)', 360, 330);
    } else if (ev === 'moved' && t.step === 3) next(4, '🌐 동물 → 같은 동물을 데려와 겹치면 진화!', 774, 300);
    else if (ev === 'evolve' && t.step === 4) next(5, '좋아요! ▶ 다음', 1150, 690);
    else if (ev === 'next' && t.step === 5) next(6, '');
    else if (ev === 'mana' && t.step === 6) next(7, '🔮 위기 땐 마법! 눌러 보세요', 990, 600);
    else if (ev === 'cast' && t.step === 7) next(8, '');
    else if (ev === 'boss' && t.step >= 6) { this.tutShow('👑 보스! 브루저가 버텨야 이겨요'); this.time.delayedCall(3500, () => this.tutShow('')); }
  }

  // ---------- HUD ----------
  drawHud() {
    const s = this.state;
    const top = this.add.graphics().setDepth(1800);
    top.fillStyle(0x0d1222, 0.92).fillRect(0, 0, 1280, 54);
    this.hudEnc = this.add.text(24, 14, '', style(24, '#ffffff')).setDepth(1801);
    this.hudInfo = this.add.text(1256, 18, '', style(16, '#f4f1e8')).setOrigin(1, 0).setDepth(1801);
    this.hudMode = this.add.text(s.duel ? 420 : 250, 20, s.duel ? '덱 대결' : s.hard ? '하드 · 한 번 지면 끝' : '노멀', style(14, s.hard ? '#ff8a7a' : '#9fe0a0', { backgroundColor: '#1f2a4a', padding: { x: 10, y: 3 } })).setDepth(1801);
    this.timeBg = this.add.rectangle(640, 66, 900, 10, 0x0d1222).setDepth(1801);
    this.timeBar = this.add.rectangle(190, 66, 900, 10, 0x8fd3ff).setOrigin(0, 0.5).setDepth(1802);
    this.timeText = this.add.text(1100, 58, '', style(15, '#cfe8ff')).setDepth(1802);
    // 흐름 막대: 남은 체력 합계로 누가 이기고 있는지(가운데 기준 왼쪽 우리·오른쪽 적)
    this.flowG = this.add.graphics().setDepth(1801);
    this.flowL = this.add.text(330, 78, '', style(14, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setOrigin(1, 0).setDepth(1802);
    this.flowR = this.add.text(950, 78, '', style(14, '#c4a6ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0, 0).setDepth(1802);
    // 아래: 기록 3줄 + 배속 + 마법
    this.bottom = this.add.graphics().setDepth(1800);
    this.bottom.fillStyle(0x0d1222, 0.9).fillRect(0, 604, 1280, 116);
    this.logText = this.add.text(24, 616, '', style(15, '#cfd6e6', { lineSpacing: 6 })).setDepth(1801);
    this.muteBtn = button(this, 770, 662, 52, 48, isMuted() ? '🔇' : '🔊', () => { setMuted(!isMuted()); unlockAudio(); this.muteBtn.set(isMuted() ? '🔇' : '🔊'); sfx('click'); }, { depth: 1802, size: 18, tip: '소리 켜기/끄기' });
    this.speedBtn = button(this, 860, 662, 90, 48, '×1', () => { this.speed = this.speed === 1 ? 1.5 : this.speed === 1.5 ? 2 : 1; this.speedBtn.set('×' + this.speed); }, { depth: 1802, size: 18 });
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
    this.hudEnc.setText(s.duel ? `⚔ 라운드 ${Math.min(s.enc + 1, s.plan.length)}  나 ${s.wins} : ${s.losses} 친구` : spec?.boss ? `보스 교전` : `교전 ${Math.min(s.enc + 1, s.plan.length)} / ${s.plan.length}`);
    this.hudInfo.setText(s.duel ? `🏆 3판 2선승  ·  ${s.duel.name ?? '친구 덱'}` : `${s.hard ? '' : `♥ ${s.life}/${s.maxLife}   `}💰 ${s.gold}`);
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

  drawFlow() {
    const s = this.state, g = this.flowG; if (!g) return;
    g.clear(); this.flowL.setText(''); this.flowR.setText('');
    if (s.phase !== 'fight') return;
    const us = s.field.filter((u) => !u.resting).reduce((a, u) => a + Math.max(0, u.hp), 0), es = s.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0);
    const uMax = s.field.filter((u) => !u.resting).reduce((a, u) => a + u.maxHp, 0) || 1, eMax = s.enemies.reduce((a, e) => a + e.maxHp, 0) || 1;
    const k = (us / uMax) / ((us / uMax) + (es / eMax) || 1);
    this.flowK = (this.flowK ?? k) + (k - (this.flowK ?? k)) * 0.08;
    const x0 = 340, w = 600, y = 88;
    g.fillStyle(0x000000, 0.6).fillRoundedRect(x0 - 3, y - 9, w + 6, 18, 8);
    g.fillStyle(0xffd84d, 1).fillRoundedRect(x0, y - 6, w * this.flowK, 12, 6);
    g.fillStyle(0x9b6cf0, 1).fillRoundedRect(x0 + w * this.flowK, y - 6, w * (1 - this.flowK), 12, 6);
    g.fillStyle(0xffffff, 1).fillRect(x0 + w / 2 - 1, y - 9, 2, 18);
    this.flowL.setText(`${s.grit?.u ? `🔥+${s.grit.u}% ` : ''}🐾 우리 ${Math.round((us / uMax) * 100)}%`);
    this.flowR.setText(`${Math.round((es / eMax) * 100)}% 적 👿${s.grit?.e ? ` 🔥+${s.grit.e}%` : ''}`);
  }

  /** 역전 찬스: 크게 밀릴 때 한 번, 화면 가운데 큰 버튼(누르면 역전의 함성) */
  showRally() {
    this.rallyUi?.forEach((o) => o.destroy());
    const ring = this.add.circle(640, 520, 74, 0xffd84d, 0.25).setStrokeStyle(5, 0xffd84d, 1).setDepth(1900);
    const b = button(this, 640, 520, 260, 70, '⚡ 역전의 함성!', () => { const r = useRally(this.state, this.D); if (r.ok) { this.paused = Math.max(this.paused ?? 0, 0.1); try { navigator.vibrate?.(60); } catch { /* 없음 */ } } }, { depth: 1901, size: 26, fill: 0x8a3a14, stroke: 0xffd84d });
    const hint = this.add.text(640, 474, '지금 누르면 모두 회복 + 적이 멈칫 + 잠깐 더 세짐', style(14, '#ffe6b0', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(1901);
    this.tweens.add({ targets: ring, scale: { from: 0.8, to: 1.6 }, alpha: { from: 0.8, to: 0 }, duration: 700, repeat: -1 });
    this.tweens.add({ targets: b, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: -1, duration: 320 });
    this.rallyUi = [ring, b, hint];
    this.ticker('⚡ 역전 찬스! 버튼을 눌러요', '#ffd84d'); sfx('hold');
  }

  /** 결정적 장면 자막: 한 번에 하나, 1.1초씩(밀리면 최근 2개만) */
  ticker(text, color = '#ffffff') {
    (this.tickQ ??= []).push([text, color]);
    if (this.tickQ.length > 2) this.tickQ.shift();
    if (!this.tickOn) this.nextTick();
  }
  nextTick() {
    const it = this.tickQ?.shift();
    if (!it) { this.tickOn = false; return; }
    this.tickOn = true;
    const t = this.add.text(640, 128, it[0], style(26, it[1], { stroke: '#000', strokeThickness: 6, backgroundColor: '#0d1222aa', padding: { x: 16, y: 6 } })).setOrigin(0.5).setDepth(1850).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 160, ease: 'Back.out' });
    this.time.delayedCall(1100, () => this.tweens.add({ targets: t, alpha: 0, y: 112, duration: 180, onComplete: () => { t.destroy(); this.nextTick(); } }));
  }

  doSpell(id) {
    const r = castG(this.state, this.D, id);
    if (!r.ok) { this.toast(r.reason === 'mana' ? '마력이 모자람' : r.reason === 'cooldown' ? '잠깐 기다림' : '지금은 못 씀'); return; }
    sfx('magic');
    // 손맛: 누르는 순간 0.08초 멈칫 + 흔들림 + 진동
    this.paused = Math.max(this.paused ?? 0, 0.08); this.cameras.main.shake(140, 0.007); try { navigator.vibrate?.(30); } catch { /* 없음 */ }
    this.tutAt('cast');
  }

  toast(msg, color = '#ffd84d') {
    this.toastT?.destroy();
    this.toastT = this.add.text(640, 110, msg, style(20, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(2600);
    this.tweens.add({ targets: this.toastT, alpha: 0, delay: 900, duration: 400 });
  }

  // ---------- views ----------
  /** 크기 점검: 날개를 편 새(까마귀·독수리)는 그림 칸이 커서 실제보다 커 보임 → 단계 기준 키에 맞춰 줄임 */
  /** 크기 맞춤: 종마다 그림 칸의 실제 키가 달라 어떤 동물(까마귀·원숭이 등)은 너무 커 보임.
   *  같은 단계 기준 키(아기 47 · 성장기 63 · 성체 78)에 맞추고, 새는 조금 더 작게. 신화급·키메라는 그대로 */
  sizeFix(u) {
    // 자동 키메라 정식 그림 · 돌연변이 슬라임(PixelLab): 성체 키 80 / 슬라임 50에 맞춤(주문서 크기 기준)
    if (u.kind === 'chimera' || u.kind === 'weak') {
      const d = u.kind === 'weak' ? this.cache.json.get('dotM-slime') : dotDataFor(this, u.speciesId, 'adult');
      const set = d?.stages?.adult && d.sets?.[d.stages.adult.set];
      if (!set || !d.chimera) return 1;
      const h = (d.foot + 1 - (set.top ?? 0)) * (d.stages.adult.scale ?? 0.5) / 0.5;
      return Math.max(0.45, Math.min(1.1, (u.kind === 'weak' ? 50 : 80) / h));
    }
    if (u.stage === 'spirit' || u.kind !== 'base') return 1;
    const d = dotDataFor(this, u.speciesId, u.stage);   // 리그가 실제로 쓰는 시트와 같은 것
    const st = d?.stages?.[u.stage], set = st && d.sets[st.set];
    if (!set) return 1;
    const h = d.foot + 1 - (set.top ?? 0);
    // 실제 덩치 느낌(호랑이 1 기준, 작은 동물도 잘 보이게 너무 줄이지는 않음)
    const bird = { crow: 0.72, eagle: 0.86, monkey: 0.8, rabbit: 0.78, rooster: 0.82, fox: 0.88, dog: 0.92, frog: 0.8, ant: 0.8, grasshopper: 0.78, bighorn: 0.96, bison: 1.05, bear: 1.03 }[u.speciesId] ?? 1;
    const target = ({ young: 47, teen: 63, adult: 78 }[u.stage] ?? h) * bird;
    return Math.max(0.45, Math.min(1.1, target / h));
  }

  makeUnitView(u) {
    const c = this.add.container(0, 0);
    const sub = this.add.container(0, 30);
    const rig = unitRig(this, u, sub, UNIT_SCALE * this.sizeFix(u));
    if (rig && !rig.dot && dotOn()) dotify(this, sub);
    const tok = rig ? sub : unitToken(this, u, this.D);
    const top = rig?.dot ? Math.max(-150, Math.min(-60, 30 + Math.round(rig.view.topY()))) : -70;
    const shadow = this.add.ellipse(0, 34, 70, 16, 0x000000, 0.35);
    const ring = this.add.ellipse(0, 34, 86, 22).setStrokeStyle(3, COLORS.gold, 0).setFillStyle(0, 0);
    const aura = canStance(u) ? this.add.ellipse(0, 34, 96, 26, 0xffffff, 0.0).setStrokeStyle(3, 0xffffff, 0) : null;
    const pref = canStance(u) ? this.add.text(0, 82, '', style(11, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5) : null;
    const crown = u.soul ? this.add.text(0, top - 46, '👑', style(16)).setOrigin(0.5) : null;
    // 작전 배지(발밑 왼쪽): 🎯 사냥 · ✋ 요격 · 🛡 지키기 · 🧿 뒤 — 기본 작전(버티기·돕기·앞)은 안 보임
    const tac = this.add.text(-44, 40, '', style(16)).setOrigin(0.5);
    // 정비 때 이름 아래 수치(❤ 체력 · ⚔ 공격)
    // 정비 때 머리 위에 수치(❤ 체력 · ⚔ 공격) — 아래는 이름·작전 칸에 가려서 위로
    // 정비 때 수치: 몸 앞쪽(오른쪽)에 아래로 한 줄씩(체력바·이름과 안 겹치게)
    const stat = this.add.text(40, -36, '', style(11, '#ffe9a8', { stroke: '#000', strokeThickness: 3, lineSpacing: 0 })).setOrigin(0, 0);
    // 체력·행동 게이지는 발밑(다키스트 던전처럼): 위 줄 동물과 겹치지 않음
    const barBg = this.add.rectangle(0, 48, 66, 8, 0x000000).setOrigin(0.5);
    const bar = this.add.rectangle(-33, 48, 66, 8, 0x7ddc6f).setOrigin(0, 0.5);
    const gBg = this.add.rectangle(0, 55, 66, 4, 0x000000).setOrigin(0.5);
    const gBar = this.add.rectangle(-33, 55, 66, 4, 0x8fd3ff).setOrigin(0, 0.5);
    const name = this.add.text(0, 67, `${u.legend ? '⭐' : ''}${STYLE_ICON[styleOf(u)] ?? ''}${this.D.config.elements.defs[u.stats.element]?.icon ?? ''} ${u.stats.name}`, style(12, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    const tag = this.add.text(0, top - 24, '', style(12, '#ffd84d', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5, 1);
    // 기적의 키메라: 발밑 무지개 고리(빙글빙글)
    let rainbow = null;
    if (u.stats?.cross) {
      rainbow = this.add.graphics();
      const cols = [0xff5a5a, 0xffa94d, 0xffe066, 0x7ddc6f, 0x5ab0ff, 0xb48cff];
      cols.forEach((col, i) => { rainbow.lineStyle(4, col, 0.9); rainbow.beginPath(); rainbow.arc(0, 0, 46, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2); rainbow.strokePath(); });
      rainbow.setPosition(0, 34).setScale(1, 0.3);
      this.tweens.add({ targets: rainbow, alpha: { from: 1, to: 0.45 }, yoyo: true, duration: 700, repeat: -1 });
    }
    c.add([shadow, rainbow, aura, ring, tok, barBg, bar, gBg, gBar, name, tag, crown, pref, tac, stat].filter(Boolean));
    c.setSize(90, 110).setInteractive({ draggable: true, useHandCursor: true });
    c.on('drag', (p, x, y) => { if (this.state.phase !== 'regroup') return; c.x = x; c.y = y; c.setDepth(2500); v.dragging = true; this.showDropHint(v, x, y); });
    c.on('dragend', () => { if (!v.dragging) return; v.dragging = false; this.dropUnit(v); });
    c.on('pointerup', (p) => {
      if (v.dragging) return;
      if (this.pickFood) { this.feed(u.uid); return; }
      if (this.state?.phase === 'fight') { const r = tapShield(this.state, u.uid); if (!r.ok && r.reason === 'noTaps') this.toast('보호막은 교전마다 3번'); return; }
      // 정비 때 신화급·키메라를 누르면 선호 태세가 바뀜(자동 → 탱 → 딜 → 서폿)
      if (this.state?.phase === 'regroup' && Math.hypot(p.upX - p.downX, p.upY - p.downY) < 8) this.unitMenu(u, v);
    });
    const v = { c, rig, tok, bar, gBar, name, tag, ring, top, aura, pref, tac, stat, key: `${u.uid}:${u.kind}:${u.speciesId}:${u.stage}`, ox: 0, oy: 0, z: 1, lastHp: u.hp, uid: u.uid, lunge: null, cu: null };
    rig?.inst.play('idle', { loop: true });
    return v;
  }

  makeEnemyView(e) {
    const def = this.D.enemyById[e.id];
    const size = e.boss ? 60 : e.id === 'swarm' ? 30 : 34;
    const holder = this.add.container(0, 0);
    const px = size * 2.2 * (e.boss ? 1.25 : 1.3);
    // 대결: 친구 동물은 동물 그림(왼쪽을 봄)
    const rig = def?.animal ? unitRig(this, { kind: 'base', speciesId: def.animal, stage: def.stage ?? 'teen', uid: e.eid }, holder, UNIT_SCALE * this.sizeFix({ kind: 'base', speciesId: def.animal, stage: def.stage ?? 'teen' })) : enemyRig(this, e, holder, px, UNIT_SCALE);
    if (def?.animal) rig?.inst.setFacing?.(-1);
    if (rig && !rig.dot && dotOn()) dotify(this, holder);
    const body = rig ? null : this.add.rectangle(0, -size / 2, size, size, hex(def.color));
    if (body) holder.add(body);
    const c = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 34, size * 2, 16, 0x000000, e.flying ? 0.15 : 0.35);
    const ring = this.add.ellipse(0, 34, size * 2.4, 24).setStrokeStyle(3, 0xff6b5a, 0);
    const top = -(px * 0.7) - 6;
    const rankRing = e.rank ? this.add.ellipse(0, 36, size * 2.2, 20).setStrokeStyle(3, gcfg(this.D).ranks[e.rank].tint, 0.9).setFillStyle(gcfg(this.D).ranks[e.rank].tint, 0.15) : null;
    const bw = e.boss ? 110 : 66;
    const barBg = this.add.rectangle(0, 48, bw, 8, 0x000000);
    const bar = this.add.rectangle(-bw / 2, 48, bw, 8, e.boss ? 0xff6b5a : 0x9b6cf0).setOrigin(0, 0.5);
    const gBg = this.add.rectangle(0, 55, 66, 4, 0x000000);
    const gBar = this.add.rectangle(-33, 55, 66, 4, 0xc4a6ff).setOrigin(0, 0.5);
    const ELITE = { shield: '🛡정예', rage: '😡정예', regen: '💚정예', thorns: '🌵정예' };
    // 등급 색: 몸 색·이름 색·발밑 고리
    const R = e.rank ? gcfg(this.D).ranks[e.rank] : null;
    if (R && rig?.view) rig.view.tint = R.tint;
    const rankCol = R ? '#' + R.tint.toString(16).padStart(6, '0') : null;
    const name = this.add.text(0, 67, `${STYLE_ICON[e.style] ?? ''}${this.D.config.elements.defs[e.element]?.icon ?? ''} ${e.name ?? def.name}${e.elite ? ' ' + ELITE[e.elite] : ''}`, style(e.boss ? 15 : 12, e.boss ? '#ffcccc' : rankCol ?? '#d8ccff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5);
    const tag = this.add.text(0, top, '', style(12, '#c4a6ff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5, 1);
    c.add([shadow, rankRing, ring, holder, barBg, bar, gBg, gBar, name, tag].filter(Boolean));
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
    if (spec.boss) { this.fx.banner(`보스 · ${this.D.enemyById[spec.ids[0]].name}`, '#ff8a7a', '마계연합 우두머리가 나타남'); sfx('boss'); this.tutAt('boss'); }
    else { this.fx.banner(`교전 ${s.enc + 1}`, '#ffffff', spec.ids.length >= 5 ? '큰 무리' : ''); sfx('wave'); }
    this.paused = 0.35;   // 배너 뜨고 바로 돌격
  }

  /** 앞으로 튀어나옴(lunge)·맞고 밀림(kick)·클로즈업(cu)을 시간으로 계산(트윈이 꼬여 멈춰 있지 않게). */
  /** 패싸움 무리 자리: 힘겨루기 묶음을 가운데에 다닥다닥 붙여 세우고 천천히 출렁이게. 거드는 적은 뒤쪽 위아래로 붙음. */
  scrumLayout() {
    const s = this.state, out = { u: new Map(), e: new Map() };
    const groups = [...(s.clashes ?? [])].sort((a, b) => a.uid - b.uid), t = this.time.now / 1000;
    const perLane = [0, 0, 0];
    groups.forEach((c, i) => {
      // 힘싸움은 그 라인 가운데에서(같은 라인에 둘이면 위아래로 벌림). 밀고 당김은 ±20px
      const u = s.field.find((x) => x.uid === c.uid), lane = (u?.seat ?? 1) % 3, k = perLane[lane]++;
      const y = FIGHT_LANE_Y[lane] + (k ? (k % 2 ? 44 : -44) : 0) + Math.sin(t * 0.9 + i * 2.1) * 3;
      const x = 640 + c.push * 20;
      const jig = (q) => Math.sin(t * 22 + q) * 2;
      out.u.set(c.uid, { x: x - CLASH_GAP + jig(c.uid), y, s: scaleAtY(y) });
      out.e.set(c.eid, { x: x + CLASH_GAP + jig(c.eid), y, s: scaleAtY(y) });
      (c.helpers ?? []).forEach((id, h) => { const hy = y + (h % 2 ? 36 : -36); out.e.set(id, { x: x + CLASH_GAP + 34 + h * 16 + jig(id), y: hy, s: scaleAtY(hy) }); });
    });
    // 전진(상대 후열로 밀고 들어감)·붙잡힘(탱커 곁)·깊숙이: 기준점은 힘싸움 자리나 원래 칸(서로의 움직이는 위치를 따라가면 끝없이 밀려남)
    const baseU = new Map(out.u), baseE = new Map(out.e);
    const anchorU = (u) => baseU.get(u.uid) ?? fightXY2('u', u.seat ?? 1);
    const anchorE = (e) => baseE.get(e.eid) ?? fightXY2('e', e.seat ?? 1);
    const at = (a, dx, dy) => { const y = Math.max(300, Math.min(540, a.y + dy)); return { x: a.x + dx, y, s: scaleAtY(y) }; };
    const nearOf = (list, seat) => [...list].sort((a, b) => Math.abs((a.seat % 3) - (seat % 3)) - Math.abs((b.seat % 3) - (seat % 3)))[0];
    const stack = new Map(); const spread = (key, p) => { const n = stack.get(key) ?? 0; stack.set(key, n + 1); return n ? { ...p, y: Math.max(300, Math.min(540, p.y + (n % 2 ? 40 : -40) * Math.ceil(n / 2))), x: p.x - 18 * n } : p; };
    for (const u of s.field) {
      if (u.down || baseU.has(u.uid)) continue;
      if ((u.deepT ?? 0) > s.time && u.deepEid != null) { const e = s.enemies.find((x) => x.eid === u.deepEid && x.hp > 0); if (e) { out.u.set(u.uid, at(anchorE(e), -56, -10)); continue; } }
      if (u.advance && styleOf(u) === 'bruiser') { const t0 = nearOf(s.enemies.filter((e) => e.hp > 0 && e.style !== 'bruiser'), u.seat ?? 1); if (t0) out.u.set(u.uid, spread('e' + t0.eid, at(anchorE(t0), -64, 8))); }
      else if (u.pinnedBy != null) { const e = s.enemies.find((x) => x.eid === u.pinnedBy && x.hp > 0); if (e) out.u.set(u.uid, at(anchorE(e), -58, 34)); }
    }
    for (const e of s.enemies) {
      if (e.hp <= 0 || baseE.has(e.eid)) continue;
      if ((e.deepT ?? 0) > s.time && e.deepUid != null) { const u = s.field.find((x) => x.uid === e.deepUid && !x.down); if (u) { out.e.set(e.eid, at(anchorU(u), 56, -10)); continue; } }
      if (e.advance && e.style === 'bruiser') { const t0 = nearOf(s.field.filter((u) => !u.down && (u.suppressed || styleOf(u) !== 'bruiser')), e.seat ?? 1); if (t0) out.e.set(e.eid, spread('u' + t0.uid, at(anchorU(t0), 64, 8))); }
      else if (e.pinnedBy != null) { const u = s.field.find((x) => x.uid === e.pinnedBy && !x.down); if (u) out.e.set(e.eid, at(anchorU(u), 58, 34)); }
    }
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
    this.rewardGlobe?.update(real);
    if (this.paused > 0) this.paused -= real;
    if (this.slow > 0) this.slow -= real;
    const k = this.slow > 0 ? 0.25 : 1;
    // 기본 속도 늦춤(2026-11-27): 전투 시계 전체를 viewTempo배로(밸런스는 그대로, 한 수 한 수가 보이게). ×1.5 · ×2는 그 위에 곱함
    const base = gcfg(this.D).viewTempo ?? 1;
    const dt = this.state.phase === 'fight' && !(this.paused > 0) && !this.lessonHold && !this.leaving ? real * this.speed * base * k : 0;
    if (dt > 0) tickGauntlet(this.state, this.D, dt);
    if (this.tut && this.tut.step === 6 && this.spellBtns?.length && !spellBlockG(this.state, this.D, this.spellBtns[0].id)) this.tutAt('mana');
    this.drain();
    this.sync(real * (this.slow > 0 ? 0.45 : 1) * (this.state.phase === 'fight' ? this.speed * Math.max(base, 0.8) : 1));
    this.drawClashes();
    this.drawFlow();
    if (dt > 0) this.silly(dt);
    if (dt > 0) { this.guideT = (this.guideT ?? 0) - dt; if (this.guideT <= 0) { this.guideT = 0.6; this.guideFight(); } }
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
      let home = fight ? fightXY2('u', u.seat ?? 0) : at;
      const cl = fight ? clashOfU(s, u.uid) : null;
      if (fight && !u.down && scrum.u.has(u.uid)) home = scrum.u.get(u.uid);
      v.baseX = home.x; v.baseY = home.y;
      if (!v.dragging) {
        const tx = Math.max(70, Math.min(1210, home.x + v.ox)), ty = Math.max(190, Math.min(570, home.y + v.oy));   // 화면 밖으로 안 나가게
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
      v.tag.setText(u.resting ? `🤕부상${u.injured ? ' ' + u.injured : ''}` : u.wobbly && s.phase === 'fight' ? '🫠흐물' : (u.deepT ?? 0) > s.time && s.phase === 'fight' ? '⚠깊숙이' : u.suppressed && s.phase === 'fight' ? '⛓제압' : u.pinnedBy != null && s.phase === 'fight' ? '✋붙잡힘' : u.awake && s.phase === 'fight' ? '🔥각성' : s.star === u.uid ? '⭐주인공' : s.focus === u.uid && s.phase === 'fight' ? '🎯' : '');
      { const want = s.phase === 'regroup' ? (() => { const p = statLine(u, this.D); return `❤${Math.round(u.hp)}\n⚔${p.atk}${u.trained ? `\n🔨${u.trained}` : ''}`; })() : ''; if (v.stat.text !== want) v.stat.setText(want); }
      { const tc = (s.tLevel ?? 2) > 0 ? tacticOf(u, gcfg(this.D)) : null; const ic = tc && !['hold', 'help', 'front'].includes(tc) ? TACTIC_LABEL[tc].split(' ')[0] : ''; if (v.tac.text !== ic) v.tac.setText(ic); }
      v.c.setAlpha(u.down ? 0.35 : u.resting ? 0.5 : 1);
      if (v.aura) {
        const st = s.phase === 'fight' ? u.stance : null, col = STANCE_COL[st] ?? 0xffffff;
        v.aura.setStrokeStyle(3, col, st ? 0.9 : 0).setFillStyle(col, st ? 0.18 + 0.08 * Math.sin(this.time.now / 160) : 0);
        v.pref.setText(s.phase === 'regroup' ? `${STANCE_NAME[u.prefStance] ?? '자동'}` : st ? STANCE_NAME[st] : '');
        const want = `${STYLE_ICON[styleOf(u)] ?? ''}${this.D.config.elements.defs[u.stats.element]?.icon ?? ''} ${u.stats.name}`;
        if (v.name.text !== want) v.name.setText(want);
      }
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
      let at = s.phase === 'fight' ? fightXY2('e', e.seat ?? 1) : seatXY('e', e.seat ?? 1);
      const cl = clashOfE(s, e.eid);
      if (s.phase === 'fight' && e.hp > 0 && scrum.e.has(e.eid)) at = scrum.e.get(e.eid);
      this.stepOffsets(v, this.realDt || 0.016);
      v.baseX = at.x; v.baseY = at.y;
      if (!v.dying && !this.tweens.isTweening(v.c)) {
        const f = v.lunge || v.kick || v.cu || v.dash ? 1 : Math.min(1, (this.realDt || 0.016) * (s.charging ? 4 : cl ? 10 : 4.5));
        const px = v.c.x;
        v.c.x += (Math.max(70, Math.min(1210, at.x + v.ox)) - v.c.x) * f;
        v.c.y += (at.y + v.oy + (e.flying ? -40 + Math.sin(this.time.now / 300 + e.eid) * 5 : 0) - v.c.y) * (v.dash ? 1 : Math.min(1, (this.realDt || 0.016) * 8));
        v.walking = !(v.lunge || v.kick || v.cu) && Math.abs(v.c.x - px) > 0.9;
      }
      v.c.setScale(at.s * v.z).setDepth(v.z > 1.01 ? 960 : 100 + v.c.y);
      v.bar.setScale(Math.max(0, e.hp / e.maxHp), 1);
      v.gBar.setScale(Math.min(1, e.gauge ?? 0), 1).setVisible(e.hp > 0);
      v.tag.setText(e.stunLeft > 0.3 ? '💫' : '');
      if (v.rig) {
        const r = v.rig.inst, m = r.motion;
        const eb = (['attack', 'hit', 'skill'].includes(m) && !r.finished);
        if (!eb && e.hp > 0) { const want = v.walking && r.anims.move ? 'move' : 'idle'; if (m !== want) r.play(want, { loop: true }); }
        if (e.hp < v.lastHp - 0.5 && e.hp > 0) { r.hitFlash(0.12); if (m !== 'attack') r.play('hit'); }
        r.setFacing(enemyFace(e.id, v.dashBack));
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
    this.clashBars = [];
    this.clashTexts ??= new Map();
    const seen = new Set();
    if (s.phase === 'fight') for (const c of s.clashes ?? []) {
      const u = s.field.find((x) => x.uid === c.uid);
      if (!u) continue;
      const v = this.uViews.get(c.uid), ev = this.eViews.get(c.eid);
      if (!v || !ev) continue;
      // 힘싸움 막대(크게): 금색 = 우리, 보라 = 적. 누르면 응원(영차!)
      const y = Math.min(v.c.y, ev.c.y) - 112, x = (v.c.x + ev.c.x) / 2, w = 150;
      const k = (c.push + 1) / 2, pulse = 0.5 + 0.5 * Math.sin(this.time.now / 140);
      g.fillStyle(0x000000, 0.7).fillRoundedRect(x - w / 2 - 4, y - 10, w + 8, 20, 8);
      g.fillStyle(0xffd84d, 1).fillRoundedRect(x - w / 2, y - 7, w * k, 14, 6);
      g.fillStyle(0x9b6cf0, 1).fillRoundedRect(x - w / 2 + w * k, y - 7, w * (1 - k), 14, 6);
      g.fillStyle(0xffffff, 1).fillTriangle(x - w / 2 + w * k - 7, y - 16, x - w / 2 + w * k + 7, y - 16, x - w / 2 + w * k, y - 6);
      g.lineStyle(2, 0xffd84d, 0.35 + 0.4 * pulse).strokeRoundedRect(x - w / 2 - 6, y - 12, w + 12, 24, 10);
      // 시선 끌기: 맞댄 둘 발밑에 빛 고리
      g.lineStyle(3, 0xffd84d, 0.35 + 0.3 * pulse).strokeEllipse(v.c.x, v.c.y + 34, 92, 24);
      g.lineStyle(3, 0xb388ff, 0.35 + 0.3 * pulse).strokeEllipse(ev.c.x, ev.c.y + 34, 92, 24);
      this.clashBars.push({ uid: c.uid, x, y });
      seen.add(c.uid);
      let t = this.clashTexts.get(c.uid);
      if (!t) { t = this.add.text(0, 0, '', style(13, '#ffffff', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(1401); this.clashTexts.set(c.uid, t); }
      const left = 8 - (s.cheers ?? 0);
      t.setPosition(x, y - 26).setText(left > 0 ? `👆 톡! 응원 (${left})` : (c.push > 0.3 ? '우리가 민다!' : c.push < -0.3 ? '밀린다…' : '팽팽!')).setAlpha(0.65 + 0.35 * pulse);
    }
    for (const [uid, t] of this.clashTexts) if (!seen.has(uid)) { t.destroy(); this.clashTexts.delete(uid); }
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
      case 'down': { { const u = s.field.find((x) => x.uid === ev.uid); if (u) this.ticker(`💫 ${u.stats.name} 쓰러짐`, '#ff8a7a'); } const p = this.posOf('u', ev.uid); if (p) { this.fx.down(p[0], p[1]); this.starAway(p[0], p[1]); } sfx('down'); break; }
      case 'step': { if (ev.who === 'u') { const v = this.uViews.get(ev.id); if (v) this.floatAt(v.c.x, v.c.y - 70, '앞으로!', '#ffd84d'); } break; }
      case 'heal': { const p = this.posOf('u', ev.uid); if (p) this.fx.heal(p[0], p[1]); break; }
      case 'eheal': { for (const v of this.eViews.values()) this.fx.heal(v.c.x, v.c.y); break; }
      case 'summon': { const p = this.posOf('e', ev.eid); if (p) this.say(p[0], p[1] - 110, '나와라!', 0xc4a6ff); sfx('bossSummon'); break; }
      case 'shield': { const p = this.posOf('e', ev.eid); if (p) { this.flashShield(p[0], p[1], 0xd2b4ff, 900); this.say(p[0], p[1] - 110, '보호막', 0xd2b4ff); } sfx('shield'); break; }
      case 'charge': { const p = this.posOf('e', ev.eid); if (p) { this.say(p[0], p[1] - 110, '돌진!', 0xff6b5a, { force: true }); this.fx.groundAoe(560, 440, 160, 0xff6b5a); } sfx('stampede'); break; }
      case 'spell': return this.spellFx(ev);
      case 'clashStart': { const a = this.uViews.get(ev.uid); if (a && !s.charging) this.say(a.c.x + 40, a.c.y - 120, Math.random() < 0.2 ? '엉덩이로 밀어!' : '힘겨루기!', 0xffd84d, { size: 18, hold: 520 }); sfx('clash'); break; }
      case 'diveMark': return this.diveArrow(ev);
      case 'breach': { if (ev.deep) { const dv = ev.side === 'u' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid); if (dv) this.time.delayedCall(350, () => this.say(dv.c.x, dv.c.y - 140, '⚠ 깊숙이 들어감!', 0xffb27a, { size: 15, hold: 700 })); }
        this.ticker(ev.side === 'e' ? '💥 우리 뒷줄이 뚫림!' : '🎯 적 뒷줄을 뚫었다!', ev.side === 'e' ? '#ff8a7a' : '#9cff6b');
        const t = ev.side === 'e' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid);
        if (t) { this.say(t.c.x, t.c.y - 130, ev.side === 'e' ? '뚫렸다!' : '뚫었다!', ev.side === 'e' ? 0xff6b5a : 0x9cff6b, { size: 24, force: true }); this.fx.impact(t.c.x, t.c.y - 20, ev.side === 'e' ? 0xff6b5a : 0x9cff6b, 1.4); this.cameras.main.shake(160, 0.006); }
        if (ev.side === 'e') this.hintOnce('breach', '💡 뒤 친구가 당했어요! 🛡지키기 · ✋요격으로 막아요');
        sfx('slam'); break;
      }
      case 'eguard': {
        const g = this.eViews.get(ev.eid), a = this.uViews.get(ev.uid);
        if (g) { this.say(g.c.x, g.c.y - 120, '막힘!', 0xc4a6ff, { size: 20, force: true }); this.flashShield(g.c.x - 30, g.c.y - 20, 0xc4a6ff, 550); g.kick = { t: 0, dur: 0.3, px: -40 }; }
        if (a) a.lunge = { t: 0, dur: 0.3, reach: 40 };
        this.hintOnce('eguard', '💡 적 벽이 막았어요. 그 사이 우리 힘싸움이 유리해져요');
        sfx('shield'); break;
      }
      case 'isolate': this.fx.banner(ev.side === 'u' ? '우리 브루저 고립!' : '적 브루저 고립!', ev.side === 'u' ? '#ff8a7a' : '#9cff6b', ev.side === 'u' ? '뒤에서 돕는 친구가 다 쓰러짐' : '이제 앞을 몰아쳐요'); sfx(ev.side === 'u' ? 'down' : 'clash'); break;
      case 'lesson': return this.showLesson(ev.kind);
      case 'advance': {
        const v = ev.side === 'u' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid);
        if (v) this.say(v.c.x, v.c.y - 124, ev.side === 'u' ? '전진!' : '밀고 들어온다!', ev.side === 'u' ? 0x9cff6b : 0xff6b5a, { size: 18, hold: 600 });
        if (ev.side === 'e') this.hintOnce('eadv', '💡 그 라인에 브루저가 없으면 적 브루저가 뒤로 들어와 제압해요');
        break;
      }
      case 'suppress': { this.ticker(ev.side === 'u' ? '⛓ 우리 후열 제압당함! (그 라인에 브루저 없음)' : '⛓ 적 후열 제압!', ev.side === 'u' ? '#ff8a7a' : '#9cff6b');
        const v = ev.side === 'u' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid);
        if (v) { this.say(v.c.x, v.c.y - 120, '⛓ 제압!', ev.side === 'u' ? 0xff6b5a : 0x9cff6b, { size: 17, hold: 600 }); v.kick = { t: 0, dur: 0.3, px: ev.side === 'u' ? -18 : 18 }; }
        break;
      }
      case 'pin': {
        const v = ev.side === 'u' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid);
        if (v) this.say(v.c.x, v.c.y - 120, ev.side === 'u' ? '붙잡혔다!' : '붙잡았다!', ev.side === 'u' ? 0xffb27a : 0xffd84d, { size: 16, hold: 520 });
        if (ev.side === 'u') this.hintOnce('upin', '💡 적 탱커가 붙으면 딜러는 뒤를 못 노려요. 날쌘·신화 딜러는 빠져나가요');
        break;
      }
      case 'slip': { const v = ev.side === 'u' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid); if (v) this.say(v.c.x, v.c.y - 120, '휙~ 빠져나감!', 0x8fd3ff, { size: 17, hold: 600 }); break; }
      case 'awaken': {
        // 역전 각성: 약할수록 크게. 짧은 컷인 + 금빛 오라
        const a = this.uViews.get(ev.uid), u = s.field.find((x) => x.uid === ev.uid);
        if (a && u) { this.fx.evolve(a.c.x, a.c.y, true); this.fx.shockwave(a.c.x, a.c.y, 0xffd84d, 3, 3); this.fx.cutIn(`${u.stats.name} 각성!`, 0xffd84d, ev.flip ? `약점 극복! ${ev.flip.from} → ✨${ev.flip.to}` : ev.weak >= 0.75 ? '가장 작은 친구가 일어섰다' : '포기하지 않아!'); this.slow = 0.6; this.cameras.main.shake(300, 0.01); }
        if (ev.flip) this.ticker(`✨ 약점 극복 — ${ev.flip.from} → ${ev.flip.to}: ${ev.flip.desc} (도감에 기록)`, '#ffd84d');
        sfx('spirit'); break;
      }
      case 'focus': { const a = this.uViews.get(ev.uid); if (a) { this.say(a.c.x, a.c.y - 130, '🎯 집중 견제!', 0xff6b5a, { size: 18, force: true }); } this.hintOnce('focus', '💡 한 마리만 너무 세면 적이 그 친구를 노려요. 지켜 주세요!'); break; }
      case 'snatch': return this.snatchFx(ev);
      case 'sold': { const p = this.posOf('u', ev.uid) ?? [320, 400]; this.floatAt(p[0], p[1] - 80, `💰+${ev.price} 팔림! 흑역사 안녕~`, '#ffd84d', 18); this.fx.burst?.('spark', p[0], p[1] - 20, 14, 0xffd84d); sfx('coin'); this.goldText?.setText(`💰 ${s.gold}`); break; }
      case 'phoenix': { const v = this.uViews.get(ev.uid); if (v) { this.fx.respawn(v.c.x, v.c.y); this.say(v.c.x, v.c.y - 120, '🔥 불사조!', 0xffb27a, { size: 20, force: true }); } this.ticker('🔥 불사조 깃털로 다시 일어남!', '#ffb27a'); break; }
      case 'ultFx': { this.lastUlt = ev; this.ticker(`✨ ${ev.name} — ${ev.desc}`, '#ffd84d'); break; }
      case 'potion': { for (const v of this.uViews.values()) this.fx.heal(v.c.x, v.c.y); break; }
      case 'grit': { this.ticker(ev.side === 'u' ? '🔥 우리 편 투지! 밀릴수록 세져요' : '🔥 적도 이를 악물었다!', ev.side === 'u' ? '#ffb27a' : '#c4a6ff'); break; }
      case 'clutch': { const v = this.uViews.get(ev.uid); if (v) { this.say(v.c.x, v.c.y - 140, `🔥 ${ev.name}!`, 0xff9f43, { size: 19, force: true, hold: 900 }); this.fx.ring(v.c.x, v.c.y + 20, 0xff9f43, 1.1, 360); if (ev.heal) for (const a of this.uViews.values()) this.fx.heal(a.c.x, a.c.y); } this.ticker(`🔥 ${ev.name} — ${ev.desc}`, '#ffb27a'); break; }
      case 'rallyReady': this.showRally(); break;
      case 'rallyGone': this.rallyUi?.forEach((o) => o.destroy()); this.rallyUi = null; break;
      case 'rally': {
        this.rallyUi?.forEach((o) => o.destroy()); this.rallyUi = null;
        this.cameras.main.flash(220, 255, 230, 120); this.cameras.main.shake(260, 0.012);
        for (const v of this.uViews.values()) { this.fx.heal(v.c.x, v.c.y); this.fx.ring(v.c.x, v.c.y + 20, 0xffd84d, 1.4, 420); }
        this.fx.cutIn('⚡ 역전의 함성!', 0xffd84d, '지금부터 뒤집는다!'); sfx('spirit'); this.slow = 0.5;
        break;
      }
      case 'wobble': { const v = this.uViews.get(ev.uid); if (v) { this.say(v.c.x, v.c.y - 130, '🫠 흐물흐물… (불안정)', 0x9cff6b, { size: 17, force: true, hold: 900 }); } break; }
      case 'injured': break;
      case 'reinforce': { this.ticker('👿 적 증원! 문에서 하나 더 나옴', '#c4a6ff'); const v = this.eViews.get(ev.eid); if (v) this.fx.ring(v.c.x, v.c.y + 20, 0x9b6cf0, 1.4, 420); this.cameras.main.shake(160, 0.006); sfx('hold'); break; }
      case 'eRally': { this.ticker('👿 적 대장의 함성! 적이 다시 일어섬', '#c4a6ff'); for (const v of this.eViews.values()) { this.fx.ring(v.c.x, v.c.y + 20, 0x9b6cf0, 1.2, 380); } this.cameras.main.flash(160, 120, 60, 200); sfx('hold'); break; }
      case 'trained': { const v = this.uViews.get(ev.uid); if (v) { this.fx.ring(v.c.x, v.c.y + 20, 0xffd84d, 1, 320); this.floatAt(v.c.x, v.c.y - 120, `🔨 단련 ${ev.n}`, '#ffd84d', 18); } sfx('evolve'); break; }
      case 'tapCheer': { const v = this.uViews.get(ev.uid); if (v) { this.floatAt(v.c.x + 40, v.c.y - 150, ['영차!', '힘내!', '밀어!'][ev.left % 3], '#ffd84d', 20); this.fx.ring(v.c.x + 40, v.c.y - 20, 0xffd84d, 1, 280); } sfx('click'); try { navigator.vibrate?.(12); } catch { /* 없음 */ } break; }
      case 'tapShield': { const a = this.uViews.get(ev.uid); if (a) { this.flashShield(a.c.x, a.c.y - 20, 0x8fd3ff, 1200); this.floatAt(a.c.x, a.c.y - 110, '🧿 막아!', '#8fd3ff', 18); } sfx('shield'); try { navigator.vibrate?.(15); } catch { /* 없음 */ } break; }
      case 'herb': { const a = this.uViews.get(ev.uid); if (a) this.floatAt(a.c.x, a.c.y - 100, '🌱 쑥쑥', '#9cff6b', 16); break; }
      case 'guard': {
        const g = this.uViews.get(ev.uid), f = this.uViews.get(ev.for), e = this.eViews.get(ev.eid);
        if (g && f) {
          // 지킴이가 노려진 동료 앞(적 쪽)으로 뛰어들어 막음
          g.dash = { t: 0, dur: 0.7, dx: f.c.x + 46 - (g.baseX ?? g.c.x), dy: f.c.y - (g.baseY ?? g.c.y) };
          this.time.delayedCall(200, () => { this.flashShield(f.c.x + 40, f.c.y - 20, 0xffd84d, 550); this.fx.ring(f.c.x + 40, f.c.y + 20, 0xffd84d, 1, 360); this.dmgNumber(g.c.x, g.c.y - 96, ev.dmg, false); sfx('shield'); });
          this.say(f.c.x + 40, f.c.y - 120, ev.taunt ? '도발!' : '막았다!', 0xffd84d, { size: 21, force: true });
          this.slow = Math.max(this.slow ?? 0, 0.3);
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
          this.say(p.c.x, p.c.y - 120, ev.intercept ? '요격!' : '떨어져!', 0x9cff6b, { size: ev.intercept ? 22 : 19, force: !!ev.intercept });
          if (ev.intercept) { this.slow = Math.max(this.slow ?? 0, 0.3); try { navigator.vibrate?.(20); } catch { /* 없음 */ } }
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
      case 'edodge': { const e = this.eViews.get(ev.eid); if (e) { e.kick = { t: 0, dur: 0.3, px: 46 }; this.floatAt(e.c.x, e.c.y - 96, '💨 회피!', '#c4a6ff', 22); } sfx('dodge'); break; }
      case 'stance': {
        const a = this.uViews.get(ev.uid);
        if (a) { this.say(a.c.x, a.c.y - 120, `${STANCE_NAME[ev.stance]} 태세!`, STANCE_COL[ev.stance], { size: 17, hold: 520 }); this.fx.ring(a.c.x, a.c.y + 30, STANCE_COL[ev.stance], 1.1, 420); this.fx.pillar?.(a.c.x, a.c.y, STANCE_COL[ev.stance]); }
        sfx('stance'); break;
      }
      case 'fear': { const a = this.uViews.get(ev.uid); if (a) { this.floatAt(a.c.x, a.c.y - 100, '💦벌벌…💦', '#9fd3ff', 16); a.kick = { t: 0, dur: 0.3, px: -10 }; } break; }
      case 'thorns': { const a = this.uViews.get(ev.uid); if (a) { this.floatAt(a.c.x, a.c.y - 100, '🌵 따끔!', '#9cff6b', 14); this.fx.hit(a.c.x, a.c.y - 10, 'green'); } break; }
      case 'phase2': { const e = this.eViews.get(ev.eid); this.fx.banner(`${this.D.enemyById[s.enemies.find((x) => x.eid === ev.eid)?.id]?.name ?? '보스'} 2단계!`, '#ff6b5a', '더 세지고 기술이 잦아짐'); if (e) { this.fx.shockwave(e.c.x, e.c.y, 0xff6b5a, 3, 3); e.rig?.inst.hitFlash(0.4); } this.cameras.main.shake(400, 0.01); sfx('boss'); break; }
      case 'collapse': {
        if (ev.side === 'u') { this.fx.banner('진형 붕괴!', '#ff6b5a', '브루저가 모두 쓰러짐 · 받는 피해 증가'); this.cameras.main.shake(500, 0.012); sfx('lose'); }
        else { this.fx.banner('적 진형 붕괴!', '#ffe066', '지금이야, 밀어붙여!'); this.cameras.main.shake(400, 0.01); sfx('roar'); for (const v of this.eViews.values()) v.kick = { t: 0, dur: 0.5, px: 60 }; }
        break;
      }
      case 'revive': { const a = this.uViews.get(ev.uid); if (a) this.fx.respawn(a.c.x, a.c.y); sfx('respawn'); break; }
      case 'gang': { const e = this.eViews.get(ev.eid); if (e) this.say(e.c.x, e.c.y - 110, '같이 덤벼!', 0xc4a6ff, { size: 16, hold: 480 }); break; }
      case 'clashWin': { { const u = s.field.find((x) => x.uid === ev.uid); if (u) this.ticker(`💪 ${u.stats.name} 힘싸움 승리!`, '#ffd84d'); }
        const e = this.eViews.get(ev.eid), a = this.uViews.get(ev.uid);
        if (e) { e.kick = { t: 0, dur: 0.42, px: 84 }; this.dmgNumber(e.c.x, e.c.y - 96, ev.dmg, true); this.fx.impact(e.c.x - 20, e.c.y - 20, 0xffd84d, 1.3); }
        if (a) { a.lunge = { t: 0, dur: 0.3, reach: 36 }; a.rig?.inst.play(a.rig.inst.anims.attack2 ? 'attack2' : 'attack'); this.say(a.c.x + 30, a.c.y - 120, '밀어붙이기!', 0xffd84d, { size: 20 }); }
        this.cameras.main.shake(160, 0.005); sfx('slam'); break;
      }
      case 'clashLose': { { const u = s.field.find((x) => x.uid === ev.uid); if (u) this.ticker(`😣 ${u.stats.name} 힘싸움에서 밀림`, '#ff8a7a'); }
        const e = this.eViews.get(ev.eid), a = this.uViews.get(ev.uid);
        if (a) { a.kick = { t: 0, dur: 0.42, px: -80 }; this.dmgNumber(a.c.x, a.c.y - 96, ev.dmg, true); this.fx.impact(a.c.x + 20, a.c.y - 20, 0xff6b5a, 1.2); this.say(a.c.x, a.c.y - 120, '밀렸다!', 0xff8a7a, { size: 18 }); }
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
  /** 돌파 예고: 노리는 쪽에서 표적까지 빨간(적)·초록(우리) 화살표 0.6초, 한 번에 하나만 */
  diveArrow(ev) {
    const a = ev.side === 'u' ? this.uViews.get(ev.from) : this.eViews.get(ev.from);
    const b = ev.side === 'u' ? this.eViews.get(ev.to) : this.uViews.get(ev.to);
    if (!a || !b || this.arrowBusy > this.time.now) return;
    this.arrowBusy = this.time.now + 650;
    const col = ev.side === 'e' ? 0xff4b3a : 0x7dff6b;
    const g = this.add.graphics().setDepth(950);
    const ax = a.c.x, ay = a.c.y - 40, bx = b.c.x, by = b.c.y - 40, mx = (ax + bx) / 2, my = Math.min(ay, by) - 90;
    const draw = (k) => {
      g.clear().lineStyle(7, col, 0.85);
      const pts = []; for (let i = 0; i <= 16 * k; i++) { const t = i / 16; pts.push([(1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by]); }
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokePath();
      if (k >= 1) { g.fillStyle(col, 0.95).fillTriangle(bx, by + 6, bx - 16 * Math.sign(bx - mx || 1), by - 20, bx + 10 * Math.sign(bx - mx || 1), by - 22); }
    };
    this.tweens.addCounter({ from: 0, to: 1, duration: 260, onUpdate: (t) => draw(t.getValue()), onComplete: () => this.time.delayedCall(380, () => g.destroy()) });
    this.say(b.c.x, b.c.y - 128, ev.side === 'e' ? '노림!' : '노린다!', col, { size: 18, hold: 560 });
    if (ev.side === 'e') { this.hintOnce('emark', '💡 빨간 화살표 = 적이 뒤 친구를 노려요. 그 친구를 톡! 누르면 보호막'); if ((this.state.taps ?? 0) < 3) this.floatAt(b.c.x, b.c.y + 60, '톡!', '#ffd84d', 18); }
  }

  /** 쓰러지면 별 하나가 휙~ 반짝 날아감(뻘한 웃음) */
  starAway(x, y) {
    const st = this.add.text(x, y - 30, '⭐', style(30)).setOrigin(0.5).setDepth(1500);
    this.tweens.add({ targets: st, x: x + (Math.random() < 0.5 ? -1 : 1) * 260, y: -40, angle: 720, scale: 0.4, duration: 900, ease: 'Quad.in', onComplete: () => { const tw = this.add.text(st.x, 30, '✨반짝', style(14, '#fff6a8')).setOrigin(0.5).setDepth(1500); this.tweens.add({ targets: tw, alpha: 0, duration: 600, onComplete: () => tw.destroy() }); st.destroy(); } });
  }

  /** 가끔 엉뚱한 한마디(전투 중 12~20초마다 한 마리) */
  silly(dt) {
    this.sillyT = (this.sillyT ?? 14) - dt;
    if (this.sillyT > 0 || this.state.phase !== 'fight') return;
    this.sillyT = 12 + Math.random() * 8;
    const live = [...this.uViews.values()].filter((v) => this.state.field.find((u) => u.uid === v.uid && !u.down));
    const v = live[Math.floor(Math.random() * live.length)];
    const L = ['밥 먹고 싸우면 안 돼?', '나 지금 멋있지?', '엄마 보고 있어?', '졸려…', '간지러워!', '이거 끝나면 낮잠!', '방귀 아니야!', '꼬리 밟지 마!'];
    if (v) this.say(v.c.x, v.c.y - 120, L[Math.floor(Math.random() * L.length)], 0xffffff, { size: 15, hold: 1200 });
  }

  /** 추천 행동 안내(튜토리얼을 끄기 전까지): 전투 중·정비·보상 */
  guideOn() { return !this.save?.guideOff; }
  guideSay(key, text) {
    if (!this.guideOn()) return;
    this.guideAt ??= {};
    const now = this.time.now;
    if ((this.guideAt[key] ?? -1e9) > now - 9000 || (this.guideAny ?? -1e9) > now - 3500) return;
    this.guideAt[key] = now; this.guideAny = now;
    this.guideObj?.destroy();
    const t = this.add.text(640, 574, `💡 ${text}`, style(17, '#0d1222', { backgroundColor: '#ffe27add', padding: { x: 14, y: 6 } })).setOrigin(0.5).setDepth(1860).setAlpha(0);
    this.guideObj = t;
    this.tweens.add({ targets: t, alpha: 1, duration: 180 });
    this.time.delayedCall(3200, () => { if (t.active) this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() }); });
  }
  guideFight() {
    const s = this.state;
    if (!this.guideOn() || s.phase !== 'fight' || s.charging) return;
    const marked = s.enemies.some((e) => e.hp > 0 && e.diveMark?.uid);
    if (marked && (s.taps ?? 0) < 3) return this.guideSay('tap', '빨간 화살표로 노려진 친구를 톡! → 보호막');
    const losing = (s.clashes ?? []).find((c) => c.push < -0.3);
    if (losing && (s.cheers ?? 0) < 8) return this.guideSay('cheer', '밀리는 힘싸움 막대를 톡톡! 응원해요');
    const ready = (this.spellBtns ?? []).find((b) => !spellBlockG(s, this.D, b.id));
    if (ready) {
      const divers = s.enemies.some((e) => e.hp > 0 && (e.style === 'skirm' || e.diveMark));
      const low = s.field.filter((u) => !u.down && u.hp < u.maxHp * 0.4).length >= 2;
      const pick = (this.spellBtns.find((b) => b.def.effect === 'guard' && low && !spellBlockG(s, this.D, b.id)) ?? this.spellBtns.find((b) => b.def.effect === 'snare' && divers && !spellBlockG(s, this.D, b.id)) ?? ready);
      return this.guideSay('spell', `마력이 찼어요 → ${pick.def.icon} ${pick.def.name} 눌러 보세요`);
    }
    if (s.field.some((u) => u.suppressed)) return this.guideSay('sup', '⛓ 제압당했어요 — 다음 정비 때 그 라인에 🛡 브루저를 세워요');
  }
  guideRegroup() {
    const s = this.state, D = this.D;
    if (!this.guideOn()) return;
    const lanes = [0, 1, 2].filter((l) => s.field.some((u) => !u.down && laneOf(u.seat) === l && styleOf(u) !== 'bruiser') && !s.field.some((u) => laneOf(u.seat) === l && styleOf(u) === 'bruiser'));
    const p = nextPreview(s, D);
    let msg = null;
    if (lanes.length && (p?.roles?.bruiser ?? 1) > 0) msg = `${['위', '가운데', '아래'][lanes[0]]} 라인에 🛡 브루저가 없어요 — 제압당할 수 있어요`;
    else if (p?.hint === 'dive') msg = '날쌘 적이 많아요 → 🛡 지키기 작전을 눌러 봐요';
    else if (p?.hint === 'wall') msg = '단단한 벽이에요 → 🎯 노리기 작전을 눌러 봐요';
    else if (s.gold >= 30) msg = `금화가 ${s.gold} — 🔨 단련이나 💰 하나 더에 써 봐요`;
    if (msg) this.addUi(this.add.text(330, 116, `💡 ${msg}`, style(14, '#0d1222', { backgroundColor: '#ffe27add', padding: { x: 10, y: 4 }, wordWrap: { width: 560 } })).setOrigin(0.5, 0).setDepth(2001));
    // 안내 끄기
    this.addUi(button(this, 1170, 610, 140, 30, '💡 안내 끄기', () => { this.save.guideOff = true; writeSave(this.registry.get('storage'), this.save); this.toast('안내를 껐어요 (지도 화면에서 다시 켤 수 있어요)'); this.showRegroup(); }, { depth: 2002, size: 13, fill: 0x24303f }));
  }

  /** 처음 한 번만 뜨는 짧은 안내(세이브에 기억) */
  hintOnce(key, text) {
    const save = this.save ?? {}; save.hints ??= {};
    if (save.hints[key] || (this.state.tLevel ?? 2) === 0) return;
    save.hints[key] = true;
    try { writeSave(this.registry.get('storage'), save); } catch { /* 저장 실패는 무시 */ }
    this.toast(text, '#ffffff');
  }

  /** 수업: 교전을 멈추고 큰 그림 한 장 + 버튼 하나. wall = 앞이 안 뚫림 → 노리기, dive = 뒤가 당함 → 지키기 */
  showLesson(kind) {
    this.lessonHold = true;
    const objs = [];
    const add = (o) => { objs.push(o); return o; };
    add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55).setDepth(2900).setInteractive());
    const g = add(this.add.graphics().setDepth(2901));
    g.fillStyle(0x1f2a4a, 0.97).fillRoundedRect(300, 170, 680, 380, 22).lineStyle(4, kind === 'wall' ? 0x9cff6b : 0xffd84d, 1).strokeRoundedRect(300, 170, 680, 380, 22);
    const L = kind === 'wall'
      ? { big: '🧱 앞이 안 뚫려요!', pic: '🛡🛡  ←  🎯  ➜  🏹✚', line: '적 뒷줄(🏹·✚)이 벽을 돕고 있어요.\n날쌘 친구가 뒤로 돌아가 노려 볼까요?', btn: '🎯 뒤를 노려!', plan: 'hunt' }
      : { big: '😱 뒤 친구가 당했어요!', pic: '⚔  ➜  🏹✚   🛡✋', line: '적 날쌘 녀석이 우리 뒷줄을 노려요.\n브루저가 지키고, 딜러가 막아 줘요!', btn: '🛡 지켜!', plan: 'guard' };
    add(this.add.text(640, 214, L.big, style(34, '#ffffff', { stroke: '#000', strokeThickness: 5 })).setOrigin(0.5).setDepth(2902));
    add(this.add.text(640, 300, L.pic, style(44)).setOrigin(0.5).setDepth(2902));
    add(this.add.text(640, 384, L.line, style(20, '#f4f1e8', { align: 'center', lineSpacing: 6 })).setOrigin(0.5).setDepth(2902));
    const close = () => { objs.forEach((o) => o.destroy()); this.lessonHold = false; if (kind === 'dive' && this.save) { this.save.hints ??= {}; this.save.hints.lessonDone = true; } };
    add(button(this, 640, 486, 260, 64, L.btn, () => { setPlan(this.state, this.D, L.plan); sfx('click'); close(); this.toast(kind === 'wall' ? '🎯 날쌘 친구들이 뒤를 노려요' : '🛡 브루저 지키기 · ✋ 딜러 요격', '#9cff6b'); }, { depth: 2903, fill: 0x8a6a1a, stroke: 0xffd84d, size: 26 }));
    sfx('boss');
  }

  flashShield(x, y, color, ms = 550) {
    const b = this.add.circle(x, y, 42, color, 0.18).setStrokeStyle(3, color, 0.9).setDepth(1500).setScale(0.7);
    this.tweens.add({ targets: b, scale: 1.08, duration: 140, ease: 'Back.out' });
    this.tweens.add({ targets: b, alpha: 0, scale: 1.2, delay: ms - 200, duration: 200, onComplete: () => b.destroy() });
  }

  floatAt(x, y, msg, color = '#ffffff', size = 15) {
    const t = this.add.text(x, y, msg, style(size, color, { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(1700);
    this.tweens.add({ targets: t, y: y - 24, alpha: 0, delay: 500, duration: 400, onComplete: () => t.destroy() });
  }

  /** 말풍선은 한 번에 하나만(정신 사납지 않게). force면 앞의 것을 무시하고 띄움. */
  say(x, y, text, color, opts = {}) {
    const now = this.time.now;
    if (!opts.force && now < (this.sayUntil ?? 0)) return;
    this.sayUntil = now + (opts.hold ?? 600) + 150;
    this.fx.shout(x, y, text, color, opts);
  }

  /** 상성 글자: 효과 굉장! / 별로… / 🍖 사냥! (한 자리에 겹치지 않게) */
  effWord(x, y, eff) {
    const now = this.time.now;
    this.effAt ??= 0;
    if (now - this.effAt < 900) return;
    this.effAt = now;
    const W = { strong: ['효과 굉장!', '#ffe066', 22], weak: ['별로…', '#9aa7b8', 15], prey: ['🍖 사냥!', '#ff9f6b', 19], fear: ['벌벌…', '#9fd3ff', 15] }[eff];
    if (!W) return;
    if (eff === 'strong' || eff === 'prey') this.fx.sfxWord(x, y, W[0], W[1], W[2]); else this.floatAt(x, y, W[0], W[1], W[2]);
  }

  dmgNumber(x, y, d, heavy) {
    const t = this.add.text(x + Phaser.Math.Between(-8, 8), y, String(Math.round(d)), style(heavy ? 34 : 20, heavy ? '#ffe066' : '#ffffff', { stroke: heavy ? '#7a2a00' : '#000', strokeThickness: heavy ? 7 : 4, fontStyle: 'bold' })).setOrigin(0.5).setDepth(1700).setScale(heavy ? 1.7 : 1.25);
    this.tweens.add({ targets: t, scale: 1, duration: 130, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - (heavy ? 46 : 30), alpha: 0, delay: heavy ? 450 : 260, duration: 420, onComplete: () => t.destroy() });
  }

  /** 다키스트 던전식 클로즈업: 화면이 어두워지고 공격자·표적이 크게 가운데로 당겨짐, 잠깐 느려짐. */
  /** 슈퍼로봇대전식 3단 필살기 컷(전투를 잠깐 멈춤): ① 시전자 회전하며 확대 + 기술 이름 ② 옆으로 돌진·집중선 ③ 표적 폭발 + 줌아웃.
   *  실제 도트 리그를 큰 판에 다시 그려 씀. 7초에 한 번까지(너무 잦으면 지루함). */
  robotCut(u, ev, targetViews) {
    const now = this.time.now;
    if (now - (this.lastRobot ?? -99999) < 7000) return false;
    this.lastRobot = now;
    const e = this.state.enemies.find((x) => x.eid === targetViews[0]?.eid) ?? this.state.enemies.find((x) => this.eViews.get(x.eid) === targetViews[0]);
    const col = 0xffd84d, D = 1.5;
    this.paused = D + 0.05;
    const root = this.add.container(0, 0).setDepth(3000);
    const bg = this.add.graphics();
    bg.fillStyle(0x05070d, 0.92).fillRect(0, 0, 1280, 720);
    const lines = this.add.graphics();
    root.add([bg, lines]);
    const stageC = this.add.container(640, 360); root.add(stageC);
    // 몸은 발 기준으로 그려지므로 발을 화면 아래쪽(y≈600)에 둠 — 위로 잘리지 않게
    const atkC = this.add.container(-700, 240); stageC.add(atkC);
    const ar = unitRig(this, u, atkC, 0.8);
    if (ar) { ar.view.update(0); ar.inst.setFacing?.(1); }
    else atkC.add(this.add.text(0, 0, STYLE_ICON[styleOf(u)] ?? '⭐', style(160)).setOrigin(0.5));
    const tgtC = this.add.container(420, 240).setAlpha(0); stageC.add(tgtC);
    const tr = e ? enemyRig(this, e, tgtC, 220, 0.7) : null;
    if (tr) { tr.inst.setFacing?.(enemyFace(e.id)); tr.view.update(0); }
    const nameT = this.add.text(640, 110, ev.name ?? '필살기', style(64, '#ffffff', { stroke: '#b8860b', strokeThickness: 12 })).setOrigin(0.5).setAngle(-6).setScale(2.4).setAlpha(0);
    const udesc = ev.desc ?? (this.lastUlt?.uid === u.uid ? this.lastUlt.desc : null);
    const who = this.add.text(640, 176, udesc ? `${u.stats.name} · ${udesc}` : u.stats.name, style(22, '#ffe9a8', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0);
    root.add([nameT, who]);
    let t = 0, phase = 0;
    const speed = (dir, a) => { lines.clear(); for (let i = 0; i < 26; i++) { const y = (i * 53 + t * 900 * (i % 3 + 1)) % 720; const x = (i * 197 + t * 2400 * dir) % 1600 - 160; lines.fillStyle(i % 4 ? 0xffffff : col, a).fillRect(dir > 0 ? x : 1280 - x, y, 140 + (i % 5) * 40, 2 + (i % 3)); } };
    const radial = (a) => { lines.clear(); lines.fillStyle(0xffffff, a); for (let i = 0; i < 36; i++) { const ang = (i / 36) * Math.PI * 2 + t; const r1 = 260 + (i % 3) * 30; lines.fillTriangle(640 + Math.cos(ang) * r1, 360 + Math.sin(ang) * r1, 640 + Math.cos(ang + 0.03) * 900, 360 + Math.sin(ang + 0.03) * 900, 640 + Math.cos(ang - 0.03) * 900, 360 + Math.sin(ang - 0.03) * 900); } };
    // ① 회전하며 날아 들어와 확대
    this.tweens.add({ targets: atkC, x: -260, angle: { from: -40, to: 0 }, scale: { from: 0.6, to: 1.1 }, duration: 380, ease: 'Back.out' });
    this.tweens.add({ targets: nameT, alpha: 1, scale: 1, duration: 220, delay: 120, ease: 'Back.out', onComplete: () => { this.cameras.main.shake(140, 0.006); sfx('clash'); } });
    this.tweens.add({ targets: who, alpha: 1, duration: 200, delay: 260 });
    const upd = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      const d = 0.016; t += d;
      ar?.view.update(d); tr?.view.update(d);
      if (phase === 0) radial(0.12);
      else if (phase === 1) speed(1, 0.55);
      else radial(0.18 * Math.max(0, 1 - (t - 1.0) * 2));
    } });
    // ② 옆으로 돌진(집중선), 공격 동작
    this.time.delayedCall(560, () => {
      phase = 1;
      if (ar) playAttack(ar.inst, 'ult');
      this.tweens.add({ targets: [nameT, who], alpha: 0, duration: 120 });
      this.tweens.add({ targets: atkC, x: 150, scale: 1.05, angle: 8, duration: 260, ease: 'Cubic.in' });
      this.tweens.add({ targets: tgtC, alpha: 1, x: 300, duration: 200 });
    });
    // ③ 표적 폭발 + 줌아웃
    this.time.delayedCall(860, () => {
      phase = 2;
      const flash = this.add.rectangle(640, 360, 1280, 720, 0xffffff, 0.85); root.add(flash);
      this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
      tr?.inst.hitFlash?.(0.4);
      this.tweens.add({ targets: tgtC, angle: { from: -14, to: 10 }, x: 360, duration: 90, yoyo: true, repeat: 2 });
      const dmg = (ev.hits ?? []).reduce((a, h) => a + (h.dmg ?? 0), 0);
      const big = this.add.text(940, 220, `${dmg}`, style(78, '#ffd84d', { stroke: '#7a1a00', strokeThickness: 12 })).setOrigin(0.5).setScale(0.3); root.add(big);
      this.tweens.add({ targets: big, scale: 1.1, duration: 200, ease: 'Back.out' });
      this.cameras.main.shake(260, 0.014); sfx('slam');
      this.tweens.add({ targets: stageC, scale: 0.85, y: 380, delay: 260, duration: 380, ease: 'Cubic.in' });
    });
    this.time.delayedCall(D * 1000, () => { this.tweens.add({ targets: root, alpha: 0, duration: 160, onComplete: () => { upd.remove(); ar?.view.destroy?.(); tr?.view.destroy?.(); root.destroy(true); } }); });
    return true;
  }

  /** 신화급·키메라 탄생 컷인: 빙글 돌며 커지는 몸 + 붓글씨 이름 + 빛줄기 */
  birthCut(u, color, sub) {
    const root = this.add.container(0, 0).setDepth(3000);
    const bg = this.add.graphics(); bg.fillStyle(0x05070d, 0.9).fillRect(0, 0, 1280, 720); root.add(bg);
    const rays = this.add.graphics(); root.add(rays);
    const body = this.add.container(640, 600).setScale(0.1).setAngle(-360); root.add(body);   // 발 기준(y 600) — 위로 잘리지 않게
    const rg = unitRig(this, u, body, 0.75);
    if (rg) rg.view.update(0); else body.add(this.add.text(0, -60, '✨', style(160)).setOrigin(0.5));
    const name = this.add.text(640, 150, u.stats.name, style(70, '#ffffff', { stroke: '#' + color.toString(16).padStart(6, '0'), strokeThickness: 12 })).setOrigin(0.5).setScale(3).setAlpha(0).setAngle(-4);
    const s2 = this.add.text(640, 226, sub, style(22, '#efe3c8', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0);
    root.add([name, s2]);
    let t = 0;
    const ev = this.time.addEvent({ delay: 16, loop: true, callback: () => { t += 0.016; rg?.view.update(0.016); rays.clear().fillStyle(color, 0.16); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2 + t * 0.8; rays.fillTriangle(640, 460, 640 + Math.cos(a - 0.06) * 900, 460 + Math.sin(a - 0.06) * 900, 640 + Math.cos(a + 0.06) * 900, 460 + Math.sin(a + 0.06) * 900); } } });
    this.tweens.add({ targets: body, scale: 1, angle: 0, duration: 700, ease: 'Back.out' });
    this.tweens.add({ targets: name, alpha: 1, scale: 1, delay: 500, duration: 260, ease: 'Back.out', onComplete: () => this.cameras.main.shake(200, 0.01) });
    this.tweens.add({ targets: s2, alpha: 1, delay: 760, duration: 200 });
    this.time.delayedCall(2100, () => this.tweens.add({ targets: root, alpha: 0, duration: 260, onComplete: () => { ev.remove(); root.destroy(true); } }));
    root.setInteractive?.();
  }

  closeUp(attackers, targets, name, color = 0xffe066, ult = false) {
    if (this.closing) return;
    this.closing = true;
    this.slow = ult ? 0.75 : 0.5;
    this.tweens.add({ targets: this.dim, alpha: 0.6, duration: 120 });
    const all = [...attackers, ...targets].filter(Boolean);
    const hold = ult ? 0.9 : 0.62;
    for (const v of attackers.filter(Boolean)) v.cu = { t: 0, dur: hold + 0.22, z: 0.35, ox: (640 - 70 - (v.c.x - this.offOf(v))) * 0.5, oy: -10 };
    for (const v of targets.filter(Boolean)) v.cu = { t: 0, dur: hold + 0.22, z: 0.2, ox: (640 + 70 - (v.c.x - this.offOf(v))) * 0.3, oy: 0 };
    if (ult) this.fx.cutIn(name, color, '필살기'); else if (attackers[0]) this.say(attackers[0].c.x + (640 - 60 - attackers[0].c.x) * 0.45, attackers[0].c.y - 130, name, color);
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
    if (ev.move === 'ult' && targets.length && this.robotCut(u, ev, targets)) { /* 3단 컷이 대신함 */ } else if (ev.move === 'ult' && targets.length) this.closeUp([v], targets.slice(0, 3), ev.name ?? '기술', ev.move === 'ult' ? 0xffd84d : ev.move === 'skill' ? 0x9cff6b : 0x8fd3ff, ev.move === 'ult');
    // 한 수 한 수가 보이게: 강타·기술·속성 공격은 늘 이름표(2026-11-27 느린 템포)
    else if (ev.move === 'a2') this.say(v.c.x, v.c.y - 112, `💥 강타!${ev.name ? ' ' + ev.name : ''}`, 0xffb27a, { size: 18, hold: 520 });
    else if (ev.move === 'skill' || ev.move === 'el') this.say(v.c.x, v.c.y - 112, `✨ ${ev.name ?? '기술'}`, 0x9fd8ff, { size: 18, hold: 560 });
    else if (ev.name && big) this.say(v.c.x, v.c.y - 110, ev.name, 0xffffff, { size: 17, hold: 420 });
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
    const launched = !ev.melee && !!tv && ev.move !== 'skill';   // 투사체를 쏘는 공격인가
    const impact = () => {
      for (const h of ev.hits ?? []) {
        const t = this.eViews.get(h.eid);
        if (!t) continue;
        const heavy = big || h.dmg >= 0.18 * (s.enemies.find((e) => e.eid === h.eid)?.maxHp ?? 1e9);
        const ehp = s.enemies.find((e) => e.eid === h.eid)?.maxHp ?? 1e9;
        if (heavy || h.dmg >= ehp * 0.08) this.dmgNumber(t.c.x, t.c.y - 90, h.dmg, heavy);
        this.fx.hit(t.c.x, t.c.y - 10, heavy ? 'orange' : 'white', heavy);
        if (h.eff === 'strong' || h.eff === 'prey') this.effWord(t.c.x, t.c.y - 128, h.eff);
        if (ev.melee && !big) this.fx.slash(t.c.x - 10, t.c.y - 10, 0xffffff);
        t.ring.setStrokeStyle(3, 0xff6b5a, 1); this.tweens.add({ targets: t.ring, alpha: { from: 1, to: 0 }, duration: 380, onComplete: () => t.ring.setAlpha(1).setStrokeStyle(3, 0xff6b5a, 0) });
        t.kick = { t: 0, dur: 0.16, px: heavy ? 26 : 12 };
      }
      if (ev.el) try { this.fx.element(ev.el, [v.c.x, v.c.y], targets.map((t) => [t.c.x, t.c.y])); } catch { /* */ }
      if (ev.move === 'skill' && ev.action) try { this.fx.skillFx(ev.action, [v.c.x, v.c.y], targets.map((t) => [t.c.x, t.c.y]), { allies: [...this.uViews.values()].map((a) => [a.c.x, a.c.y]) }); } catch { /* */ }
      if (big) sfx('slam'); else if (ev.melee) sfx('hit'); else if (!launched) sfx('shoot');   // 날아가는 공격은 쏠 때 한 번만(맞을 때 또 울리지 않음)
    };
    if (launched) {
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
      if (ev.dodged) { t.kick = { t: 0, dur: 0.3, px: -46 }; this.floatAt(t.c.x, t.c.y - 96, '💨 회피!', '#9cff6b', 22); sfx('dodge'); return; }
      this.dmgNumber(t.c.x, t.c.y - 90, ev.dmg, ev.boss);
      this.fx.hit(t.c.x, t.c.y - 10, ev.boss ? 'red' : 'white', ev.boss);
      t.kick = { t: 0, dur: 0.16, px: -14 };
      if (ev.boss) this.cameras.main.shake(120, 0.004);
      sfx(ev.boss ? 'slam' : 'hit');
    };
    if (!ev.melee && t) { this.fx.line?.(v.c.x - 20, v.c.y - 30, t.c.x, t.c.y - 10, 0xc4a6ff, 4, 160); this.time.delayedCall(120, impact); }
    else this.time.delayedCall(ev.style === 'skirm' && !ev.clash ? 230 : 140, impact);
  }

  /** 잡아채기 연출: 줄(혀·꼬리·손·덩굴)이 쭉 뻗어 표적을 휙 당김 */
  snatchFx(ev) {
    const s = this.state;
    const c = ev.side === 'u' ? this.uViews.get(ev.uid) : this.eViews.get(ev.eid);
    const t = ev.side === 'u' ? this.eViews.get(ev.eid) : this.uViews.get(ev.uid);
    if (!c || !t) return;
    const K = { tongue: [0xff7ab8, '🐸 혀로 낚아챔!'], tail: [0xb07a3c, '🐒 꼬리로 낚아챔!'], swarm: [0x222222, '🐜 개미 떼가 붙잡음!'], snare: [0x4caf50, '🪤 덫에 걸림!'], hand: [0x7fbf5f, '🧟 땅에서 손이 쑥!'], bone: [0xeeeeee, '💀 뼈 손에 붙잡힘!'], shadow: [0x9b6cf0, '🌑 그림자 손!'] }[ev.kind] ?? [0xffffff, '낚아챔!'];
    const g = this.add.graphics().setDepth(1450);
    const ax = c.c.x, ay = c.c.y - 30, bx = t.c.x, by = t.c.y - 30;
    const draw = (k) => {
      g.clear();
      const x = ax + (bx - ax) * k, y = ay + (by - ay) * k - Math.sin(k * Math.PI) * 30;
      if (ev.kind === 'swarm') { for (let i = 0; i < 10; i++) { const q = (i / 10) * k; g.fillStyle(K[0], 1).fillCircle(ax + (bx - ax) * q, ay + (by - ay) * q + Math.sin(i * 2.3) * 8, 3); } return; }
      g.lineStyle(ev.kind === 'tongue' ? 7 : 5, K[0], 1).beginPath(); g.moveTo(ax, ay); g.lineTo(x, y); g.strokePath();
      g.fillStyle(K[0], 1).fillCircle(x, y, ev.kind === 'tongue' ? 8 : 6);
    };
    this.tweens.addCounter({ from: 0, to: 1, duration: 180, onUpdate: (tw) => draw(tw.getValue()), onComplete: () => {
      // 휙 당김: 표적이 잡아챈 쪽으로 끌려옴
      t.kick = { t: 0, dur: 0.45, px: (ax - bx) * 0.35 };
      this.fx.impact(bx, by, K[0], 1.3); this.cameras.main.shake(140, 0.006); sfx('slam');
      this.tweens.addCounter({ from: 1, to: 0, duration: 220, onUpdate: (tw) => draw(tw.getValue()), onComplete: () => g.destroy() });
    } });
    this.say(t.c.x, t.c.y - 130, K[1], ev.side === 'u' ? 0x9cff6b : 0xff8a7a, { size: 18, force: true });
    if (ev.dmg) this.time.delayedCall(200, () => this.dmgNumber(t.c.x, t.c.y - 96, ev.dmg, true));
    this.slow = Math.max(this.slow ?? 0, 0.35);
    this.ticker(ev.side === 'u' ? `${K[1]} 뒤를 노리던 적을 잡음` : `😱 우리 딜러가 붙잡힘 — ${K[1]}`, ev.side === 'u' ? '#9cff6b' : '#ff8a7a');
    if (ev.side === 'e') this.hintOnce('esnatch', '💡 좀비·해골이 있는 판에서 뒤를 노리면 붙잡힐 수 있어요. 🛡지키기도 생각해 봐요');
    void s;
  }

  spellFx(ev) {
    const def = spellDef(this.D, ev.id);
    this.fx.cutIn(`${ev.icon ?? ''} ${ev.name}`, 0x8fd3ff, def?.tale ?? '');
    this.slow = 0.5;
    for (const h of ev.hits ?? []) { const t = this.eViews.get(h.eid); if (t) { this.dmgNumber(t.c.x, t.c.y - 90, h.dmg, true); this.fx.impact(t.c.x, t.c.y - 20, 0x8fd3ff, 1.2); } }
    if (def?.effect === 'meteor') this.fx.groundAoe(FIGHT_COL_X.e[0], 440, 170, 0xffb35c);
    if (def?.effect === 'guard' || def?.effect === 'drum') for (const v of this.uViews.values()) this.fx.ring(v.c.x, v.c.y + 30, 0x8fd3ff, 0.9);
    if (def?.effect === 'wall') for (const v of this.eViews.values()) this.fx.burst('leaf', v.c.x, v.c.y, 6, 0x66bb6a);
    if (def?.effect === 'snare') {
      // 덩굴 덫: 우리 뒷줄 앞에 덩굴 띠가 덫 시간 동안 깔림
      const g = this.add.graphics().setDepth(90), until = this.time.now + (def.dur ?? 8) * 1000;
      const ev2 = this.time.addEvent({ delay: 50, loop: true, callback: () => { g.clear(); if (this.time.now > until || this.state.phase !== 'fight') { ev2.remove(); g.destroy(); return; } for (const y of FIGHT_LANE_Y) { g.lineStyle(4, 0x4caf50, 0.7).strokeEllipse(FIGHT_COL_X.u[1] + 40, y + 34, 70, 18); g.fillStyle(0x8bc34a, 0.8).fillCircle(FIGHT_COL_X.u[1] + 40 + Math.sin(this.time.now / 200 + y) * 26, y + 30, 4); } } });
    }
  }

  onWin(ev) {
    sfx(ev.boss ? 'clear' : 'coin');
    for (const v of this.uViews.values()) if (v.rig?.inst.anims.victory) v.rig.inst.play('victory');
    // 뻘한 승리 춤: 좌우로 씰룩씰룩
    [...this.uViews.values()].forEach((v, i) => this.tweens.add({ targets: v.c, angle: { from: -12, to: 12 }, duration: 140, yoyo: true, repeat: 3, delay: 300 + i * 60, onComplete: () => v.c.setAngle(0) }));
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
    const COLC = [0xffd84d, 0xff8a7a, 0x9cff6b];
    for (let i = 0; i < 9; i++) { const at = seatXY('u', i), c = Math.floor(i / 3); sg.fillStyle(COLC[c], 0.06).fillRoundedRect(at.x - 70, at.y - 60, 140, 118, 14).lineStyle(2, COLC[c], 0.5).strokeRoundedRect(at.x - 70, at.y - 60, 140, 118, 14); }
    ['🛡 1열 막기', '⚔ 2열 딜러', '✚ 3열 응원'].forEach((t, c) => this.slots.push(this.add.text(seatXY('u', c * 3).x, 168, t, style(14, '#' + COLC[c].toString(16).padStart(6, '0'), { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(61)));
    // 빈 칸에는 추천 역할 아이콘을 흐리게
    for (let i = 0; i < 9; i++) if (s.seats[i] == null) { const at = seatXY('u', i); this.slots.push(this.add.text(at.x, at.y, ['🛡', '⚔', '✚'][Math.floor(i / 3)], style(30)).setOrigin(0.5).setAlpha(0.22).setDepth(61)); }
    this.slots.push(button(this, 345, 590, 150, 34, '↺ 추천 배치', () => { if (recommendSeats(s, this.D).ok) { sfx('click'); this.showRegroup(); } }, { depth: 62, size: 14, fill: 0x24303f, tip: '브루저 1열 · 딜러 2열 · 응원 3열' }));
    sg.fillStyle(0x0d1222, 0.92).fillRect(0, 604, 640, 116);
    for (let i = 0; i < s.bench.length; i++) { const b = BENCH(i); sg.lineStyle(2, 0x8fd3ff, 0.6).strokeRoundedRect(b.x - 46, b.y - 46, 92, 92, 12); }
    this.slots.push(sg);
    this.slots.push(this.add.text(BENCH(0).x - 46, 610, '대기', style(12, '#8fd3ff')).setDepth(61));
    this.slots.push(this.add.text(330, 92, '끌기 = 자리  ·  겹치기 = 합성  ·  누르기 = 메뉴', style(14, '#d4b06a', { stroke: '#000', strokeThickness: 3 })).setOrigin(0.5).setDepth(61));
    // 오른쪽 판
    const g = this.addUi(this.add.graphics().setDepth(2000));
    g.fillStyle(0x0d1222, 0.95).fillRoundedRect(660, 80, 600, 620, 16).lineStyle(2, 0xd4b06a, 0.7).strokeRoundedRect(660, 80, 600, 620, 16);
    const win = s.lastWin;
    this.addUi(this.add.text(684, 96, s.duel ? `⚔ 라운드 ${s.enc + 1} 준비  (나 ${s.wins} : ${s.losses} 친구)` : s.prelude ? '출전 준비' : win ? '승리!' : '후퇴…', style(30, s.prelude ? '#9cff6b' : win ? '#ffd84d' : '#ff8a7a')).setDepth(2001));
    if (s.prelude) this.addUi(this.add.text(684, 142, '자리와 작전을 보고, 다음 적을 확인한 뒤 ▶ 출발', style(15, '#d8d2c2')).setDepth(2001));
    this.goldText = this.addUi(this.add.text(1236, 104, s.duel ? '' : `💰 ${s.gold}`, style(24, '#ffd84d')).setOrigin(1, 0).setDepth(2001));
    if (s.mvp) this.addUi(this.add.text(684, 140, s.mvp.grew ? `⭐ ${s.mvp.from} → ${s.mvp.to}` : `⭐ ${s.mvp.from}`, style(16, '#9cff6b')).setDepth(2001));
    if (s.mvp?.grew) { const p = this.posOf('u', s.mvp.uid); if (p) { this.fx.evolve(p[0], p[1], false); sfx('evolve'); } }
    // 왜 이겼나 / 왜 졌나: 가장 큰 요인 넷
    if (!s.prelude) { const f = encFactors(s, D);
      if (f.length) { this.addUi(this.add.text(684, 352, win ? '이긴 까닭' : '진 까닭', style(16, win ? '#ffd84d' : '#ff8a7a')).setDepth(2001));
        f.forEach((x, i) => this.addUi(this.add.text(684 + (i % 2) * 280, 380 + Math.floor(i / 2) * 26, `${x.good ? '✔' : '✘'} ${x.text}`, style(14, x.good ? '#9cff6b' : '#ff9f9f', { wordWrap: { width: 270 } })).setDepth(2001))); } }
    // 금화 쓰기: 회복 물약 · 단련(동물을 눌러서)
    if (!s.prelude) {
      // 치료(2026-11-27): 이긴 뒤 저절로는 조금만 차고, 나머지는 금화로. 다친 만큼 값
      const pc = healCost(s, D, s.field), used = pc <= 0;
      const pb = this.addUi(button(this, 770, 452, 170, 34, used ? '🩹 다 나음' : `🩹 모두 치료 💰${pc}`, () => { const r = healUnits(s, D); if (!r.ok) { this.toast(r.reason === 'gold' ? '금화가 모자람' : '다친 동물이 없음'); return; } sfx('heal'); this.goldText?.setText(`💰 ${s.gold}`); this.toast(`🩹 ${r.n}마리 체력 가득 (💰${r.cost})`, '#9cff6b'); this.showRegroup(); }, { depth: 2002, size: 14, fill: 0x1d4a3a, stroke: 0x9cff6b, tip: '싸우고 나면 체력이 조금만 차요. 금화로 출전 동물 모두 가득 채움(다친 만큼 값)' }));
      pb.setEnabled(!used && s.gold >= pc);
      // 부상·보름달 안내
      const hurt = s.field.filter((u) => u.resting);
      if (hurt.length) this.addUi(this.add.text(684, 476, `🤕 부상 ${hurt.map((u) => `${u.stats.name} ${u.injured ?? 1}교전`).join(', ')} — 눌러서 치료하거나 후보와 바꿔요`, style(13, '#ffb27a', { wordWrap: { width: 540 } })).setDepth(2001));
      if (s.moonNow) this.addUi(this.add.text(1236, 184, '🌕 보름달 — 이번 정비 합성 +10%', style(14, '#fff6a0', { backgroundColor: '#1d2440', padding: { x: 8, y: 3 } })).setOrigin(1, 0).setDepth(2003));
      if ((s.genePotion ?? 0) > 0) this.addUi(this.add.text(1236, 158, '🧪 유전자 물약 — 다음 합성 +20%', style(13, '#9fd8ff')).setOrigin(1, 0).setDepth(2003));
      this.addUi(this.add.text(870, 444, '🔨 단련: 동물을 눌러 피해 +10%', style(13, '#d8d2c2')).setDepth(2001));
    }
    this.guideRegroup();
    if (!s.prelude) this.tutAt('regroup');
    this.drawRewards();
    this.drawPreview();
    // 작전 한 번에: 💪 앞싸움 · 🎯 노리기 · 🛡 지키기 (+ ? 설명). 2스테이지 수업 뒤부터 보임
    if ((s.tLevel ?? 2) === 2 || (s.tLevel === 1 && (this.save?.hints?.lessonDone || s.enc > 2))) {
      PLAN_BTNS.forEach(([k, label], i) => this.addUi(button(this, 730 + i * 118, 660, 112, 50, label, () => { setPlan(s, this.D, k); sfx('click'); this.toast(`작전: ${label}`, '#9cff6b'); }, { depth: 2002, size: 16, fill: 0x1f2a4a })));
      this.addUi(button(this, 1056, 660, 44, 50, '?', () => this.planHelp(), { depth: 2002, size: 20, fill: 0x2a3a6a }));
    }
    this.addUi(button(this, 1170, 660, 140, 56, s.prelude ? '▶ 출발' : '다음 ▶', () => this.goNext(), { depth: 2002, fill: 0x8a6a1a, stroke: 0xffd84d, size: 22 }));
  }

  drawRewards() {
    const s = this.state, D = this.D, o = s.offer;
    this.rewardObjs?.forEach((x) => x.destroy()); this.rewardObjs = [];
    const add = (x) => { this.rewardObjs.push(x); this.ui.push(x); return x; };
    if (s.prelude) return;
    add(this.add.text(684, 184, o?.taken ? `보상 ✔${o.bought ? ` (+${o.bought})` : ''}` : o?.bought ? '하나 더 고르기' : '보상 1개', style(18, '#ffffff')).setDepth(2001));
    // 금화로 하나 더
    if (o?.taken) { const c = extraCost(s, D); const bb = add(button(this, 1150, 192, 170, 34, this.textures.exists('icon-coin') ? `     ${c} 하나 더` : `💰${c} 하나 더`, () => { const r = buyExtraReward(s, D); if (!r.ok) { this.toast('금화가 모자람'); return; } sfx('coin'); this.goldText?.setText(`💰 ${s.gold}`); this.drawRewards(); }, { depth: 2003, size: 14, fill: s.gold >= c ? 0x5a4a14 : 0x333333, stroke: 0xffd84d })); bb.setEnabled(s.gold >= c); if (this.textures.exists('icon-coin')) add(pixIcon(this, 'coin', 1150 - 52, 192, 28).setDepth(2004)); }
    if (!o) return;
    if (o.taken) this.tutAt('reward');
    const y = 214, w = 180;
    // 보상 카드 = 그림 버튼(2026-11-27): 🌐 돌아가는 지구본 · 🍖 도트 고기 · 💎 도트 보석. 글자는 옆에 짧게
    this.rewardGlobe = null;
    const card = (i, title, desc, color, onClick, on = true) => { // eslint-disable-line
      const x = 684 + i * (w + 12);
      const b = add(this.add.graphics().setDepth(2001));
      const kind = ['globe', 'food', 'relic'][i];
      if (o.dropped === kind) { on = false; desc = '🔒 막힘'; }
      const taken = o.taken === kind;
      b.fillStyle(taken ? 0x3b2f12 : 0x182040, 1).fillRoundedRect(x, y, w, 118, 12).lineStyle(taken ? 3 : 2, taken ? 0xffd84d : color, on ? 1 : 0.3).strokeRoundedRect(x, y, w, 118, 12);
      b.fillStyle(color, on ? 0.16 : 0.05).fillCircle(x + 52, y + 56, 44);
      let pic = null;
      if (kind === 'globe') {
        const G = new Globe(this, x + 52, y + 54, 34, this.registry.get('raw').globe, { depth: 2002, speed: on && !o.taken ? 5 : 0.6 });
        add(G); this.rewardGlobe = G; pic = G;
        if (!on) G.objs.forEach((q) => q.setAlpha?.(0.35));
      } else {
        pic = add(pixIcon(this, kind === 'food' ? 'meat' : 'gem', x + 52, y + 56, 76).setDepth(2002));
        if (!on) pic.setAlpha(0.3).setTint(0x777777);
        else if (!o.taken) this.tweens.add({ targets: pic, y: pic.y - 5, duration: 700 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      add(this.add.text(x + 102, y + 26, title, style(19, on ? '#ffffff' : '#777777', { stroke: '#000', strokeThickness: 3 })).setDepth(2002));
      add(this.add.text(x + 102, y + 56, desc, style(13, on ? '#d8d2c2' : '#666666', { wordWrap: { width: 74 } })).setDepth(2002));
      const z = add(this.add.zone(x + w / 2, y + 59, w, 118).setInteractive({ useHandCursor: on && !o.taken }).setDepth(2003));
      z.on('pointerover', () => { if (on && !o.taken && kind !== 'globe') pic.setScale(pic.scaleX * 1.1); });
      z.on('pointerout', () => { if (kind !== 'globe' && pic.scene) pic.setDisplaySize(76, 76); });
      z.on('pointerdown', () => { if (on && !o.taken) onClick(); });
    };
    const rec = this.guideOn() ? recommendReward(s, D) : null;
    if (rec) { const i = ['globe', 'food', 'relic'].indexOf(rec.kind); const x = 684 + i * 192; add(this.add.text(x + 172, y + 6, '👍 추천', style(13, '#0d1222', { backgroundColor: '#9cff6b', padding: { x: 5, y: 2 } })).setOrigin(1, 0).setDepth(2004)); add(this.add.text(684, y + 124, `💡 ${rec.why}`, style(13, '#9cff6b')).setDepth(2002)); }
    card(0, '동물', '새 친구 뽑기', 0xf2b544, () => this.spinGlobe(), s.bench.includes(null) || s.seats.includes(null));
    card(1, '먹이', '한 마리 쑥쑥', 0x7ddc6f, () => { this.pickFood = true; this.toast('🍖 먹일 동물을 누름', '#9cff6b'); });
    card(2, '유물', o.relic ? '판 내내 힘' : '없음', 0xc4a6ff, () => this.showRelics(), !!o.relic);
    this.sub?.forEach((x) => x.destroy()); this.sub = [];
  }

  subUi(o) { this.sub.push(o); this.ui.push(o); return o; }

  /** 지구본 카드를 누르면: 빠르게 돌다가 첫 후보의 대륙에서 멈추고 → 고르기 카드 */
  spinGlobe() {
    const s = this.state, G = this.rewardGlobe, first = s.offer?.globe?.[0] && this.D.unitById[s.offer.globe[0].speciesId];
    if (!G || !first || this.globeSpin) { this.showGlobe(); return; }
    this.globeSpin = true; sfx('summon');
    const CN = { eurasia: '유라시아', america: '아메리카', africa: '아프리카' };
    G.spinTo(first.continent, null, 520, { cont: CN[first.continent] ?? '', hab: '' });
    this.fx.ring?.(G.x, G.y, 0x9fd8ff, 1.2, 380);
    this.time.delayedCall(600, () => { this.globeSpin = false; if (this.state?.phase === 'regroup') this.showGlobe(); });
  }

  showGlobe() {
    const s = this.state, D = this.D;
    this.sub?.forEach((x) => x.destroy()); this.sub = [];
    this.subUi(this.add.text(684, 344, '하나 고르기', style(14, '#f2b544')).setDepth(2001));
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
    this.subUi(this.add.text(684, 344, '하나 고르기', style(14, '#c4a6ff')).setDepth(2001));
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
    this.addUi(this.add.text(700, y + 12, p.boss ? '다음: 👑 보스' : `다음 적 · ${this.state.enc + 1}/${this.state.plan.length}`, style(17, p.boss ? '#ff8a7a' : '#c4a6ff')).setDepth(2002));
    this.addUi(this.add.text(700, y + 42, p.list.map((x) => `${x.boss ? '👑' : ''}${x.name}${x.n > 1 ? '×' + x.n : ''}`).join('  '), style(15, '#f4f1e8', { wordWrap: { width: 520 } })).setDepth(2002));
    // 역할 아이콘 수 + 짐작: 덱을 보고 상대 작전을 예상
    if (p.hidden) { this.addUi(this.add.text(700, y + 84, '❓ 적의 속셈은 알 수 없어요', style(16, '#c4a6ff')).setDepth(2002)); return; }
    const r = p.roles ?? {};
    this.addUi(this.add.text(1220, y + 12, `🛡${r.bruiser ?? 0}  ⚔${r.skirm ?? 0}  🏹${r.ranged ?? 0}  ✚${r.support ?? 0}`, style(16, '#ffd84d')).setOrigin(1, 0).setDepth(2002));
    const H = { dive: '⚔ 날쌘 녀석이 많아요 → 🛡지키기?', wall: '🛡 벽이 두꺼워요 → 🎯노리기?', mixed: '🤔 골고루 — 섞어서 대비' };
    if (p.hint) this.addUi(this.add.text(700, y + 84, H[p.hint], style(16, '#9cff6b')).setDepth(2002));
  }

  /** 정비 때 동물을 누르면 작은 메뉴: 부활(금화) · 태세(신화급·키메라) · 놓아주기 */
  unitMenu(u, v) {
    this.menuObjs?.forEach((o) => o.destroy());
    const s = this.state, x = Math.max(90, Math.min(560, v.c.x)), items = [];
    let y = v.c.y - 120;
    if (u.resting || u.down) items.push([`🩹 치료 💰${s.feathers > 0 ? 0 : treatCost(s, this.D, u)}${u.injured ? ` (부상 ${u.injured})` : ''}`, () => { const r = reviveUnit(s, this.D, u.uid); if (!r.ok) this.toast(r.reason === 'gold' ? '금화 부족 — 후보와 바꿔도 돼요' : '못 함'); else { this.toast(`🩹 ${u.stats.name} 다 나음!`, '#9cff6b'); sfx('heal'); } }]);
    else if (u.hp < u.maxHp && s.phase === 'regroup' && !s.prelude) items.push([`🩹 체력 💰${healCost(s, this.D, [u])}`, () => { const r = healUnits(s, this.D, u.uid); this.toast(r.ok ? `🩹 ${u.stats.name} 체력 가득` : r.reason === 'gold' ? '금화가 모자람' : '못 함', r.ok ? '#9cff6b' : '#ffffff'); if (r.ok) sfx('heal'); }]);
    if (canStance(u)) items.push([`${STANCE_NAME[u.prefStance] ?? '자동'} 태세`, () => cyclePrefStance(s, u.uid)]);
    if (this.save?.advanced && buildSet(u)) { const B = u.build ? BUILDS[u.build] : null; items.push([`🔧 ${B ? `${B.icon} ${B.name}` : '추천'}`, () => { const r = cycleBuild(s, this.D, u.uid); if (r.ok) { const nb = r.build ? BUILDS[r.build] : null; this.toast(nb ? `${u.stats.name} ${nb.icon} ${nb.name} — ${nb.tip}` : `${u.stats.name} 추천 역할`, '#c4a6ff'); if (this.save) { this.save.builds ??= {}; if (r.build) this.save.builds[u.speciesId] = r.build; else delete this.save.builds[u.speciesId]; } } }]); }
    if (s.field.includes(u)) items.push([`🔨 단련 💰${trainCost(s, this.D, u)}`, () => { const r = trainUnit(s, this.D, u.uid); this.toast(r.ok ? `🔨 ${u.stats.name} 피해 +${gcfg(this.D).trainDmg}% (${r.n}번째)` : r.reason === 'gold' ? '금화가 모자람' : '더는 단련 못 함(3번까지)', r.ok ? '#ffd84d' : '#ffffff'); }]);
    items.push([s.star === u.uid ? '⭐ 주인공 해제' : '⭐ 주인공', () => { setStar(s, this.D, u.uid); this.toast(s.star === u.uid ? `⭐ ${u.stats.name} 주인공! 혼자 세지고 동료는 조금 약해짐` : '주인공 해제', '#ffd84d'); }]);
    const tc = (s.tLevel ?? 2) > 0 && tacticOf(u, gcfg(this.D));
    if (tc) items.push([`작전 ${TACTIC_LABEL[tc]}`, () => { const r = cycleTactic(s, this.D, u.uid); if (r.ok) { this.toast(`${u.stats.name} ${TACTIC_LABEL[r.tactic]} — ${TACTIC_TIP[r.tactic]}`, '#9cff6b'); this.tutAt('tactic'); } }]);
    items.push([u.kind === 'weak' ? `💰${gcfg(this.D).sellWeak} 팔기` : '놓아주기', () => { const r = releaseUnit(s, this.D, u.uid); if (!r.ok) this.toast(r.reason === 'last' ? '한 마리는 남아야 함' : '못 함'); }]);
    // 수치 카드: ❤ 체력 ⚔ 공격 ⚡ 빠르기 🛡 막기 💨 피하기 + 역할·작전
    y = Math.max(y, 150 + items.length * 42);   // 위로 잘리지 않게
    const p = statLine(u, this.D), top = y - (items.length - 1) * 42 - 26;
    const tn = tuneOf(u, gcfg(this.D));
    const card = this.add.text(x, top, `${u.stats.name}\n❤ ${Math.round(u.hp)}/${p.hp}   ⚔ ${p.atk}\n⚡ ${p.spd}/초${p.def ? `   🛡 ${p.def}%` : ''}${p.dodge ? `   💨 ${p.dodge}%` : ''}${tn ? `\n👍 ${tn.pro}\n👎 ${tn.con}` : ''}`, style(15, '#ffffff', { backgroundColor: '#0d1222ee', padding: { x: 12, y: 8 }, align: 'center', lineSpacing: 4 })).setOrigin(0.5, 1).setDepth(2700);
    this.menuObjs = items.map(([label, fn], i) => button(this, x, y - i * 42, 150, 36, label, () => { fn(); sfx('click'); this.menuObjs?.forEach((o) => o.destroy()); this.menuObjs = null; this.goldText?.setText(`💰 ${s.gold}`); }, { depth: 2700, size: 15, fill: 0x1f2a4a }));
    this.menuObjs.push(card);
    this.time.delayedCall(4500, () => { this.menuObjs?.forEach((o) => o.destroy()); this.menuObjs = null; });
  }

  planHelp() {
    const objs = [];
    const add = (o) => { objs.push(o); return o; };
    add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.5).setDepth(2900).setInteractive().on('pointerup', () => objs.forEach((o) => o.destroy())));
    const g = add(this.add.graphics().setDepth(2901));
    g.fillStyle(0x1f2a4a, 0.97).fillRoundedRect(330, 150, 620, 420, 20);
    const lines = ['💪 앞싸움 — 다 같이 앞에서 힘싸움', '🎯 노리기 — 날쌘 친구가 적 뒷줄을 노림', '      → 뒤가 쓰러지면 적 브루저 고립!', '🛡 지키기 — 브루저가 막고 딜러가 요격', '      → 날쌘 적이 많을 때 좋아요', '', '동물을 누르면 한 마리씩 바꿀 수 있어요', '정답은 없어요. 적을 보고 골라요!'];
    add(this.add.text(370, 180, lines.join('\n'), style(20, '#f4f1e8', { lineSpacing: 10 })).setDepth(2902));
    add(this.add.text(640, 540, '누르면 닫힘', style(14, '#8fd3ff')).setOrigin(0.5).setDepth(2902));
  }

  goNext() {
    const s = this.state;
    if (s.offer && !s.offer.taken) { this.toast('보상을 먼저 하나 고름'); return; }
    const first = s.prelude;
    const r = nextEncounter(s, this.D);
    if (!r.ok) { this.toast('출전할 동물이 없음'); return; }
    this.startFightView();
    if (first) { this.tutShow?.(''); this.tutAt('fightStart'); } else this.tutAt('next');
  }

  // ---------- 끌어 놓기 ----------
  slotAt(x, y) {
    const s = this.state;
    let best = null, bd = 80;
    for (let i = 0; i < 9; i++) { const a = seatXY('u', i); const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = { where: 'seat', index: i }; } }
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
    const o = to && from ? mergeOddsG(this.state, this.D, from, to) : null, k = o?.kind;
    this.hintT?.destroy();
    // 염색체 합성: 키메라는 성공 확률, 강이 다르면 '안 섞임'을 미리 보여 줌
    // 같은 강 = 🧬 염색체 확률, 다른 강 = 🌈 기적 확률. 도움 아이콘(🧪📓🌟🌕)과 실패 눈금(n/5, 다 차면 확정)
    const extra = o && (k === 'chimera' || k === 'reslime') ? `${o.bonus?.length ? ' ' + o.bonus.join('') : ''}${o.sure ? '\n✨ 실패 눈금 가득 — 이번엔 확정!' : o.fails ? `\n실패 눈금 ${o.fails}/${o.pity}` : ''}` : '';
    const label = k === 'chimera' ? (o.cross ? `🌈 강이 달라요… 기적 ${o.chance}%` : `🧬 키메라 도전! 성공 ${o.chance}%`) + extra : k === 'reslime' ? `🫠 슬라임 다시 합성! ${o.chance}%` + extra : k === 'weak' ? MERGE_NAME.weak : MERGE_NAME[k];
    const col = k === 'weak' ? '#aaaaaa' : k === 'chimera' || k === 'reslime' ? (o.sure ? '#ffd84d' : o.cross && k === 'chimera' ? '#e8a0ff' : o.chance >= 70 ? '#9cff6b' : o.chance >= 45 ? '#ffd84d' : '#ff9f6b') : '#ffd84d';
    if (k && k !== 'swap') this.hintT = this.add.text(x, y - 110, label, style(18, col, { stroke: '#000', strokeThickness: 4, align: 'center' })).setOrigin(0.5).setDepth(2600);
  }

  dropUnit(v) {
    this.hintT?.destroy();
    const to = this.slotAt(v.c.x, v.c.y), from = this.refOf(v.uid);
    if (!to || !from) return;
    const r = moveAnimal(this.state, this.D, from, to);
    if (!r.ok) { if (r.reason !== 'same') this.toast(r.reason === 'last' ? '한 마리는 남아야 함' : '못 옮김'); return; }
    if (r.kind === 'move' || r.kind === 'swap') { sfx('click'); this.tutAt('moved'); return; }
    const at = to.where === 'seat' ? seatXY('u', to.index) : BENCH(to.index);
    if (r.kind === 'evolve') { this.fx.evolve(at.x, at.y, false); sfx('evolve'); this.tutAt('evolve'); }
    else if (r.kind === 'spirit') { this.fx.evolve(at.x, at.y, true); this.birthCut(r.unit, 0xffd84d, '신화급이 깨어남'); sfx('spirit'); }
    else if (r.kind === 'chimera' && r.miracle) { this.fx.chimera(at.x, at.y); this.cameras.main.flash(300, 255, 200, 255); this.birthCut(r.unit, 0xff7ad9, `🌈 있을 수 없는 일이 일어났다! (${r.chance}%)`); sfx('spirit'); }
    else if (r.kind === 'chimera') { this.fx.chimera(at.x, at.y); this.birthCut(r.unit, 0xc77dff, r.retry ? '슬라임이 다시 태어났다!' : r.sure ? '실패를 딛고 마침내!' : '새 이야기가 태어남'); sfx('chimera'); }
    else if (r.kind === 'weak') {
      this.fx.weak(at.x, at.y); sfx('weak');
      const pity = gcfg(this.D) && this.D.config.genes?.miracle?.pity;
      this.toast(r.king ? `👑 슬라임끼리 뭉쳐 ${r.unit.stats.name}! (조금 더 단단함)` : `🫠 실패 (성공 ${r.chance}%) → ${r.unit.stats.name}${pity ? `  · 실패 눈금 ${Math.min(r.fails, pity)}/${pity}` : ''}`, '#c9f27a');
    }
  }

  // ---------- 끝 ----------
  finish() {
    this.leaving = true;
    const s = this.state;
    if (s.duel) {
      const rec = (this.save.duel ??= { wins: 0, losses: 0, foes: {} });
      const win = s.result === 'clear';
      if (win) rec.wins += 1; else rec.losses += 1;
      const f = (rec.foes[s.duel.code] ??= { w: 0, l: 0, name: s.duel.name ?? null });
      if (win) f.w += 1; else f.l += 1;
      writeSave(this.registry.get('storage'), this.save);
      this.fx.banner(win ? '대결 승리!' : '대결 패배…', win ? '#ffd84d' : '#ff8a7a', `나 ${s.wins} : ${s.losses} 친구`);
      this.time.delayedCall(2400, () => this.scene.start('Duel', { last: { win, wins: s.wins, losses: s.losses, code: s.duel.code } }));
      return;
    }
    if (this.tut && this.tut.step >= 5) this.save.tutorialDone = true;
    this.tutShow?.('');
    const report = settleRun(this.save, s, this.D);
    const candidates = s.result === 'clear' ? carryCandidates(s, this.D) : [];
    if (candidates.length) setCarry(this.save, this.D, this.stageId, candidates[0]);
    writeSave(this.registry.get('storage'), this.save);
    this.time.delayedCall(s.result === 'clear' ? 2600 : 1600, () => this.scene.start('Result', { report, candidates, stageId: this.stageId, wave: Math.min(s.enc + 1, s.plan.length), total: s.plan.length, life: s.life, gauntlet: true, hard: s.hard, tier: s.tier }));
  }
}

export { unitsIn };
