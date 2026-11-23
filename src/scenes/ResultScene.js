import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { buildData } from '../logic/data.js';

const ACH = { firstSummon: '첫 소환', firstSpirit: '첫 영물', firstChimera: '첫 키메라', allRecipes: '레시피 7개 모두 발견', flawlessBoss: '무결점 보스 처치' };

/** Result screen: clear/lose, essence lines, species xp and level-ups, new finds. */
export default class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  create(d) {
    d = d?.report ? d : { report: { clear: false, essence: 0, lines: [], xp: [], newRecipes: [], newSpecies: [], newFlops: [], achievements: [], hintsMade: [] }, wave: 0, total: 15, life: 0, stageId: 'forest-1' };
    const D = buildData(this.registry.get('raw'));
    const r = d.report;
    this.cameras.main.setBackgroundColor('#141a21');
    title(this, 640, 70, r.clear ? '스테이지 클리어!' : '패배', 56).setColor(r.clear ? '#7CFC9A' : '#ff6b6b');
    this.add.text(640, 130, `${D.stageById[d.stageId]?.name ?? ''} · 도달 웨이브 ${d.wave}/${d.total} · 남은 생명 ${d.life}${d.bossLeaked ? ' · 보스가 방어선을 넘음(보스 처치 보상 없음)' : ''}`, style(18, '#dddddd')).setOrigin(0.5);

    panel(this, 60, 165, 560, 430);
    this.add.text(85, 180, `에센스 +${r.essence}`, style(24, '#ffd84d'));
    r.lines.forEach(([t, v], i) => this.add.text(95, 222 + i * 26, `${t}`, style(16)).setData('v', v) && this.add.text(560, 222 + i * 26, `+${v}`, style(16, '#ffd84d')).setOrigin(1, 0));
    let y = 230 + r.lines.length * 26 + 10;
    const finds = [
      ...r.newRecipes.map((id) => `새 키메라: ${D.recipeById[id].name}`),
      ...r.newFlops.map((k) => `흑역사: 어설픈 ${k.split('+').map((p) => D.unitById[p]?.name).join('')}`),
      ...r.hintsMade.map((h) => `힌트 공개: ${D.unitById[h.part].name}이(가) 들어가는 레시피`),
      ...r.achievements.map((a) => `업적 달성: ${ACH[a]}`),
    ];
    finds.slice(0, 8).forEach((t, i) => this.add.text(95, y + i * 24, t, style(15, '#d7bde2')));

    panel(this, 660, 165, 560, 430);
    this.add.text(685, 180, r.clear ? '종 경험치' : '패배한 판은 경험치가 없습니다', style(22, '#ffe2b8'));
    r.xp.slice(0, 12).forEach((x, i) => {
      const up = x.after > x.before;
      this.add.text(700, 222 + i * 28, `${D.unitById[x.id].name}  +${x.gain}`, style(16));
      this.add.text(1190, 222 + i * 28, up ? `Lv.${x.before} → Lv.${x.after} ▲` : `Lv.${x.after}`, style(16, up ? '#58d68d' : '#aaaaaa')).setOrigin(1, 0);
    });
    if (r.clear) this.add.text(700, 560, '레벨마다 그 종의 피해 +2%, 레벨 5부터 10%로 성장기 등장', style(13, '#8899aa'));

    button(this, 440, 650, 200, 56, '다시 하기 (R)', () => this.scene.start('Battle', { stageId: d.stageId }), { size: 20 });
    button(this, 660, 650, 200, 56, '스테이지 선택', () => this.scene.start('StageSelect'), { size: 20, fill: 0x3a7bd5 });
    button(this, 880, 650, 160, 56, '타이틀 (ESC)', () => this.scene.start('Title'), { size: 18 });
    this.input.keyboard.on('keydown-R', () => this.scene.start('Battle', { stageId: d.stageId }));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
  }
}
