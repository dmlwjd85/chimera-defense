import Phaser from 'phaser';
import { button, title, style, panel } from './ui.js';
import { buildData } from '../logic/data.js';
import { setCarry, writeSave } from '../logic/meta.js';

const ACH = { firstSummon: '첫 소환', firstSpirit: '첫 영물', firstChimera: '첫 키메라', allRecipes: '레시피 7개 모두 발견', flawlessBoss: '무결점 보스 처치' };

/** Result screen: clear/lose, essence lines, species xp and level-ups, new finds. */
export default class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  create(d) {
    d = d?.report ? d : { report: { clear: false, essence: 0, lines: [], xp: [], newRecipes: [], newSpecies: [], newFlops: [], achievements: [], hintsMade: [] }, wave: 0, total: 15, life: 0, stageId: 'forest-1' };
    const D = buildData(this.registry.get('raw'));
    const r = d.report;
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.45);
    title(this, 640, r.clear ? 44 : 70, r.clear ? '스테이지 클리어!' : '패배', r.clear ? 40 : 56).setColor(r.clear ? '#7CFC9A' : '#ff6b6b');
    if (r.clear && r.goals) {
      const g = r.goals, mm = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      const st = this.add.text(640, 112, '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), style(34, '#ffd84d', { stroke: '#000', strokeThickness: 5 })).setOrigin(0.5).setScale(0.2);
      this.tweens.add({ targets: st, scale: 1, duration: 500, ease: 'Back.out' });
      this.add.text(640, 150, `✔ 클리어    ${g.life ? '✔' : '✘'} 생명 ${g.lifeNeed}% 이상    ${g.time ? '✔' : '✘'} ${mm(g.par)} 안에 (걸린 시간 ${mm(r.time)})    ·    모은 별 ⭐${r.totalStars}`, style(14, '#cfe8ff')).setOrigin(0.5);
      if (r.newSpells?.length) {
        const sp = D.config.spells.list.filter((x) => r.newSpells.includes(x.id));
        this.add.text(640, 172, `🔮 새 마법을 배웠어요: ${sp.map((x) => `${x.icon} ${x.name}`).join(', ')} — ${sp[0].desc}`, style(15, '#d7bde2', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(20);
      }
      if (r.joined?.length) {
        const t = this.add.text(640, 548, `🎉 새 친구 합류: ${r.joined.map((id) => D.unitById[id]?.name).join(', ')} — 이제 지구본에서 만남`, style(17, '#9cff6b', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5).setDepth(20);
        this.tweens.add({ targets: t, scale: { from: 1, to: 1.06 }, yoyo: true, repeat: -1, duration: 700 });
      }
    }
    this.add.text(640, r.clear && r.goals ? 84 : 130, `${D.stageById[d.stageId]?.name ?? ''} · 도달 웨이브 ${d.wave}/${d.total} · 남은 생명 ${d.life}${d.bossLeaked ? ' · 보스가 방어선을 넘음(보스 처치 보상 없음)' : ''}`, style(r.clear ? 13 : 18, '#dddddd')).setOrigin(0.5);

    panel(this, 60, 165, 560, 375);
    this.add.text(85, 180, `에센스 +${r.essence}`, style(24, '#ffd84d'));
    if (r.shards) this.add.text(595, 184, `💎 유물 조각 +${r.shards}${r.shardRelics ? ` (유물 ${r.shardRelics}개가 조각으로)` : ''}`, style(15, '#e0c3ff')).setOrigin(1, 0);
    r.lines.forEach(([t, v], i) => this.add.text(95, 222 + i * 26, `${t}`, style(16)).setData('v', v) && this.add.text(560, 222 + i * 26, `+${v}`, style(16, '#ffd84d')).setOrigin(1, 0));
    let y = 230 + r.lines.length * 26 + 10;
    const finds = [
      ...r.newRecipes.map((id) => `새 키메라: ${D.recipeById[id].name}`),
      ...r.newFlops.map((k) => `흑역사: 어설픈 ${k.split('+').map((p) => D.unitById[p]?.name).join('')}`),
      ...r.hintsMade.map((h) => `힌트 공개: ${D.unitById[h.part].name}이(가) 들어가는 레시피`),
      ...r.achievements.map((a) => `업적 달성: ${ACH[a]}`),
    ];
    const hl = this.registry.get('highlight');
    finds.slice(0, hl ? 3 : 6).forEach((t, i) => this.add.text(95, y + i * 24, t, style(15, '#d7bde2')));
    if (hl && this.textures.exists('highlight')) {
      this.add.text(85, 372, `📸 명장면 · 웨이브 ${hl.wave}`, style(14, '#ffd84d'));
      this.add.rectangle(215, 462, 248, 142, 0x000000).setStrokeStyle(2, 0xd4b06a);
      this.add.image(215, 462, 'highlight').setDisplaySize(244, 138);
      this.add.text(350, 420, hl.caption, style(14, '#ffffff', { wordWrap: { width: 250 } }));
    }

    panel(this, 660, 165, 560, 375);
    this.add.text(685, 180, r.clear ? '종 경험치' : r.xp.length ? '종 경험치 (진 판은 조금)' : '패배한 판은 경험치 없음', style(22, '#ffe2b8'));
    if (!r.clear) {
      // 아깝다!(개선제안 4): 얼마나 가까웠는지 한 줄
      const left = d.total - d.wave;
      const t = this.add.text(640, 108, left <= 3 ? `😣 아깝다! ${left === 0 ? '마지막 웨이브' : `${left}웨이브만 더`} 버텼으면 클리어!` : `웨이브 ${d.wave}까지 버팀 — 다음엔 더 멀리!`, style(20, '#ffb27a', { stroke: '#000', strokeThickness: 4 })).setOrigin(0.5);
      this.tweens.add({ targets: t, scale: { from: 1, to: 1.06 }, yoyo: true, repeat: -1, duration: 650 });
    }
    r.xp.slice(0, r.mvp?.length ? 6 : 10).forEach((x, i) => {
      const up = x.after > x.before;
      this.add.text(700, 222 + i * 28, `${D.unitById[x.id].name}  +${x.gain}`, style(16));
      this.add.text(1190, 222 + i * 28, up ? `Lv.${x.before} → Lv.${x.after} ▲` : `Lv.${x.after}`, style(16, up ? '#58d68d' : '#aaaaaa')).setOrigin(1, 0);
    });
    if (r.mvp?.length) {
      const top = r.mvp[0].dmg || 1;
      this.add.text(700, 418, '🏆 이번 판 주인공', style(15, '#ffd84d'));
      r.mvp.forEach((m, i) => {
        const y = 444 + i * 22;
        this.add.text(700, y, `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${m.soul ? '👑' : ''}${m.name}`, style(13, m.soul ? '#ffd84d' : '#ffffff'));
        this.add.rectangle(880, y + 8, 220 * m.dmg / top, 10, m.soul ? 0xffd84d : 0x7fd1ff).setOrigin(0, 0.5);
        this.add.text(1190, y, `${m.dmg.toLocaleString()}`, style(12, '#cfe8ff')).setOrigin(1, 0);
      });
    }
    if (r.clear) this.add.text(700, 512, '레벨마다 그 종의 피해 +2%, 레벨 5부터 10%로 성장기 등장', style(13, '#8899aa'));

    const next = D.stages[D.stages.findIndex((x) => x.id === d.stageId) + 1];
    if (r.clear && next && d.candidates?.length) {
      const save = this.registry.get('save');
      const stageName = { young: '어린', teen: '성장기' };
      this.add.text(640, r.joined?.length ? 572 : 562, `${next.name}에 데려갈 동물 1마리 (성장기까지, 특성 유지)`, style(15, '#9cff6b')).setOrigin(0.5);
      const picks = d.candidates.slice(0, 6);
      const btns = [];
      const mark = (k) => btns.forEach((b, i) => b.set((i === k ? '✔ ' : '') + label(picks[i])));
      const label = (c) => `${c.white ? '흰 ' : ''}${stageName[c.stage]} ${D.unitById[c.speciesId].name}`;
      picks.forEach((c, i) => btns.push(button(this, 640 - (picks.length - 1) * 75 + i * 150, 598, 140, 34, label(c), () => { setCarry(save, D, d.stageId, c); writeSave(this.registry.get('storage'), save); mark(i); }, { size: 13, fill: 0x2e5a3a })));
      mark(0);
    }
    button(this, 440, 650, 200, 56, '다시 하기 (R)', () => this.scene.start('Battle', { stageId: d.stageId }), { size: 20 });
    button(this, 660, 650, 200, 56, '스테이지 선택', () => this.scene.start('StageSelect'), { size: 20, fill: 0x3a7bd5 });
    button(this, 870, 650, 140, 56, '타이틀 (ESC)', () => this.scene.start('Title'), { size: 16 });
    button(this, 1050, 650, 200, 56, '✨ 별자리 나무', () => this.scene.start('Talent', { back: 'StageSelect' }), { size: 18, fill: 0x3a2466, stroke: 0xc77dff });
    this.input.keyboard.on('keydown-R', () => this.scene.start('Battle', { stageId: d.stageId }));
    this.input.keyboard.on('keydown-ESC', () => this.scene.start('Title'));
    // 명장면 그림은 이 화면에서만 씀 → 나갈 때 지움(메모리, 개선제안 13)
    this.events.once('shutdown', () => { if (this.textures.exists('highlight')) this.textures.remove('highlight'); this.registry.set('highlight', null); });
  }
}
