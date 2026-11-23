import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { buildData } from '../logic/data.js';
import { buyUnlock, writeSave } from '../logic/meta.js';

const ACH = { firstSummon: '첫 소환', firstSpirit: '첫 영물', firstChimera: '첫 키메라', allRecipes: '레시피 7개 모두 발견', flawlessBoss: '생명을 하나도 잃지 않고 보스 처치' };

export default class UnlockScene extends Phaser.Scene {
  constructor() { super('Unlock'); }

  create(d) {
    const D = buildData(this.registry.get('raw'));
    const save = this.registry.get('save');
    const U = D.config.unlocks;
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.45);
    title(this, 640, 50, '해금', 36);
    this.add.text(640, 100, `에센스 ${save.essence}`, style(24, '#ffd84d')).setOrigin(0.5);
    if (d?.msg) this.add.text(640, 135, d.msg, style(16, '#58d68d')).setOrigin(0.5);
    const rows = [
      ['startGold', '시작 골드', `+${U.startGold.step}씩`, save.unlocks.startGold, U.startGold.costs],
      ['bench', '대기석 확장', `+${U.bench.step}칸`, save.unlocks.bench, U.bench.costs],
    ];
    rows.forEach(([key, name, eff, lv, costs], i) => {
      const y = 200 + i * 110;
      panel(this, 240, y - 40, 800, 90);
      this.add.text(270, y - 22, `${name}  (${lv}/${costs.length})`, style(22));
      this.add.text(270, y + 10, `${eff} · 지금 +${lv * (key === 'bench' ? U.bench.step : U.startGold.step)}`, style(15, '#aabbcc'));
      const done = lv >= costs.length;
      button(this, 920, y, 180, 50, done ? '최대' : `${costs[lv]} 에센스`, () => {
        const r = buyUnlock(save, D, key);
        if (r.ok) { writeSave(this.registry.get('storage'), save); this.scene.restart({ msg: `${name} 해금!` }); }
        else this.scene.restart({ msg: r.reason === 'essence' ? '에센스가 모자라요' : '더 살 수 없어요' });
      }, { fill: done ? 0x333333 : 0x2e8b57 }).setEnabled(!done && save.essence >= costs[lv]);
    });
    const y = 420;
    panel(this, 240, y - 40, 800, 90);
    this.add.text(270, y - 22, '레시피 힌트', style(22));
    this.add.text(270, y + 10, '아직 못 찾은 레시피 하나의 재료 1종을 도감에 공개', style(15, '#aabbcc'));
    button(this, 920, y, 180, 50, `${U.hint.cost} 에센스`, () => {
      const r = buyUnlock(save, D, 'hint');
      if (r.ok) { writeSave(this.registry.get('storage'), save); const rc = D.recipeById[r.hint.recipe]; this.scene.restart({ msg: `힌트: ??? 의 재료에 ${D.unitById[r.hint.part].name}이(가) 들어간다 (출처: ${rc.source})` }); }
      else this.scene.restart({ msg: r.reason === 'essence' ? '에센스가 모자라요' : '공개할 힌트가 없어요' });
    }).setEnabled(save.essence >= U.hint.cost);
    this.add.text(240, 500, '업적', style(20, '#ffe2b8'));
    Object.entries(ACH).forEach(([id, name], i) => {
      const got = save.achievements.includes(id);
      this.add.text(260 + (i % 2) * 400, 535 + Math.floor(i / 2) * 30, `${got ? '★' : '☆'} ${name}`, style(16, got ? '#ffd84d' : '#777777'));
    });
    button(this, 120, 685, 160, 44, '← 타이틀', () => this.scene.start('Title'));
  }
}
