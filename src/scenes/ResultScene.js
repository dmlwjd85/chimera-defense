import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { buildData } from '../logic/data.js';
import { writeSave, unlockGauge, setLegend } from '../logic/meta.js';
import { drawGauge, showUnlockPicker } from './unlockFx.js';

const ACH = { firstSummon: '첫 소환', firstSpirit: '첫 영물', firstChimera: '첫 키메라', allRecipes: '레시피 7개 모두 발견', flawlessBoss: '무결점 보스 처치' };

/**
 * 결과 화면(2026-11-26 단순화): 별 → 받은 것 한 줄 → 전설 새기기 → 해금 게이지 → 버튼 셋.
 * 자세한 내역(에센스 줄·종 경험치·주인공)은 '자세히'를 눌러야 펼쳐짐.
 */
export default class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  create(d) {
    d = d?.report ? d : { report: { clear: false, essence: 0, lines: [], xp: [], newRecipes: [], newSpecies: [], newFlops: [], achievements: [], hintsMade: [] }, wave: 0, total: 8, life: 0, stageId: 'forest-1' };
    const D = this.D = buildData(this.registry.get('raw'));
    const r = d.report, save = this.registry.get('save'), storage = this.registry.get('storage');
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.35);
    title(this, 640, 70, r.clear ? '클리어!' : '패배', 56).setColor(r.clear ? '#7CFC9A' : '#ff6b6b');
    this.add.text(640, 118, `${D.stageById[d.stageId]?.name ?? ''}${d.tier === 'god' ? ' · ⚡ 신계' : d.tier === 'hardcore' ? ' · 하드코어' : d.hard ? ' · 하드' : ''}`, style(16, '#cfd6e6')).setOrigin(0.5);

    // 별
    if (r.clear) {
      const st = this.add.text(640, 168, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), style(56, '#ffd84d', { stroke: '#000', strokeThickness: 6 })).setOrigin(0.5).setScale(0.2);
      this.tweens.add({ targets: st, scale: 1, duration: 500, ease: 'Back.out' });
      const g = r.goals ?? {};
      this.add.text(640, 214, `${g.clear ? '✔' : '✘'} 클리어   ${g.life ? '✔' : '✘'} 생명   ${g.time ? '✔' : '✘'} 쓰러짐 ${g.downNeed ?? 3}↓`, style(15, '#aabbcc')).setOrigin(0.5);
    }

    // 받은 것 한 줄
    const ups = (r.xp ?? []).filter((x) => x.after > x.before);
    const got = [`💠 ${r.essence}`, r.shards ? `💎 ${r.shards}` : null, ups.length ? `⬆ ${ups.map((x) => D.unitById[x.id]?.name).slice(0, 3).join('·')}` : null, r.newRecipes?.length ? `🧬 ${r.newRecipes.map((id) => D.recipeById[id]?.name).join('·')}` : null].filter(Boolean);
    this.add.text(640, 262, got.join('     '), style(22, '#ffe2b8', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5);

    // 전설 새기기(1장): 이번 판에 만든 신화급·키메라
    let y = 318;
    if (r.legends?.length) {
      const cur = save.legend;
      this.add.text(640, y, `⭐ 전설로 새기기${cur ? `  (지금: ${cur.name})` : ''}`, style(17, '#ffd84d')).setOrigin(0.5);
      const list = r.legends.slice(0, 3);
      const btns = list.map((c, i) => button(this, 640 - (list.length - 1) * 110 + i * 220, y + 40, 200, 40, c.name, () => {
        setLegend(save, c); writeSave(storage, save);
        btns.forEach((b, k) => b.set((k === i ? '✔ ' : '') + list[k].name));
        this.cameras.main.flash(200, 255, 230, 150);
      }, { size: 15, fill: 0x4a3d14, stroke: 0xffd84d }));
      y += 96;
    }

    // 해금 게이지
    if (r.gauge) {
      drawGauge(this, 340, y + 20, 600, D, save, r.gauge, 25);
      if (unlockGauge(save, D).pending > 0) {
        const pb = button(this, 640, y + 74, 240, 46, '🎁 새 친구', () => showUnlockPicker(this, D, save, storage, () => pb.destroy()), { size: 20, fill: 0x2e5a3a, stroke: 0x9cff6b, depth: 30 });
        this.tweens.add({ targets: pb.text, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: -1, duration: 600 });
      }
    }

    // 버튼 셋
    const retry = () => this.scene.start(d.gauntlet ? 'Gauntlet' : 'Battle', { stageId: d.stageId, hard: d.gauntlet ? !!d.hard : undefined, tier: d.tier ?? null });
    button(this, 440, 650, 200, 56, '▶ 지도', () => this.scene.start('StageSelect'), { size: 22, fill: 0x3a7bd5 });
    button(this, 660, 650, 200, 56, '↻ 다시', retry, { size: 22 });
    button(this, 880, 650, 200, 56, '📋 자세히', () => this.details(r), { size: 20 });
    this.input.keyboard.on('keydown-R', retry);
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
  }

  /** 자세한 내역: 에센스 줄, 종 경험치, 주인공, 새로 찾은 것 */
  details(r) {
    if (this.detailObjs) { this.detailObjs.forEach((o) => o.destroy()); this.detailObjs = null; return; }
    const D = this.D, objs = [];
    const add = (o) => { objs.push(o.setDepth?.(4000) ?? o); return o; };
    add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.75).setInteractive().on('pointerdown', () => this.details(r)));
    add(panel(this, 60, 80, 560, 520)).setDepth?.(4001);
    add(this.add.text(85, 96, `💠 에센스 +${r.essence}`, style(22, '#ffd84d')));
    (r.lines ?? []).forEach(([t, v], i) => { add(this.add.text(95, 136 + i * 26, t, style(16))); add(this.add.text(590, 136 + i * 26, `+${v}`, style(16, '#ffd84d')).setOrigin(1, 0)); });
    let y = 146 + (r.lines?.length ?? 0) * 26;
    if (r.gauge) { add(this.add.text(85, y, `🎁 해금 게이지 +${r.gauge.gain}`, style(18, '#9cff6b'))); y += 28; r.gauge.parts.forEach(([t, v]) => { add(this.add.text(95, y, `${t} +${v}`, style(14, '#cfe8ff'))); y += 22; }); }
    const finds = [...(r.newRecipes ?? []).map((id) => `새 키메라: ${D.recipeById[id].name}`), ...(r.achievements ?? []).map((a) => `업적: ${ACH[a]}`)];
    finds.slice(0, 5).forEach((t, i) => add(this.add.text(95, y + 10 + i * 22, t, style(14, '#d7bde2'))));
    add(panel(this, 660, 80, 560, 520)).setDepth?.(4001);
    add(this.add.text(685, 96, '종 경험치', style(22, '#ffe2b8')));
    (r.xp ?? []).slice(0, 8).forEach((x, i) => {
      const up = x.after > x.before;
      add(this.add.text(700, 136 + i * 28, `${D.unitById[x.id]?.name}  +${x.gain}`, style(16)));
      add(this.add.text(1190, 136 + i * 28, up ? `Lv.${x.before} → ${x.after} ▲` : `Lv.${x.after}`, style(16, up ? '#58d68d' : '#aaaaaa')).setOrigin(1, 0));
    });
    add(this.add.text(700, 380, 'Lv3 성장기 · Lv6 성체로 출전 (신화급은 합성만)', style(13, '#8899aa')));
    if (r.mvp?.length) {
      const top = r.mvp[0].dmg || 1;
      add(this.add.text(700, 420, '🏆 주인공', style(15, '#ffd84d')));
      r.mvp.forEach((m, i) => {
        const yy = 448 + i * 24;
        add(this.add.text(700, yy, `${['🥇', '🥈', '🥉'][i]} ${m.name}`, style(14)));
        add(this.add.rectangle(880, yy + 9, 220 * m.dmg / top, 10, 0x7fd1ff).setOrigin(0, 0.5));
      });
    }
    objs.forEach((o) => o.setDepth?.(Math.max(o.depth ?? 0, 4000)));
    this.detailObjs = objs;
  }
}
