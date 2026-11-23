import Phaser from 'phaser';
import { button, title, style, panel, unitToken } from './ui.js';
import { buildData, pairKey } from '../logic/data.js';
import { levelInfo } from '../logic/meta.js';

const TABS = [['units', '동물'], ['spirits', '신화급'], ['chimeras', '키메라'], ['flops', '흑역사'], ['bonds', '인연'], ['enemies', '적']];
const CONT = { eurasia: '유라시아', america: '아메리카', africa: '아프리카' };

export default class CodexScene extends Phaser.Scene {
  constructor() { super('Codex'); }

  create(d) {
    this.data2 = buildData(this.registry.get('raw'));
    this.save = this.registry.get('save');
    this.tab = d?.tab ?? 'units';
    this.cameras.main.setBackgroundColor('#141a21');
    if (this.textures.exists('bg-title')) this.add.image(640, 360, 'bg-title').setDisplaySize(1280, 720).setAlpha(0.45);
    title(this, 640, 45, '도감', 36);
    TABS.forEach(([id, label], i) => button(this, 640 - (TABS.length - 1) * 80 + i * 160, 100, 145, 40, label, () => this.scene.restart({ tab: id }), { fill: id === this.tab ? 0xb8742a : 0x2f4f6f }));
    panel(this, 40, 130, 1200, 520);
    this[this.tab]();
    button(this, 120, 685, 160, 44, '← 타이틀', () => this.scene.start('Title'));
  }

  cell(i, cols = 4, w = 290, h = 120) { return { x: 60 + (i % cols) * (w + 5), y: 145 + Math.floor(i / cols) * (h + 6), w, h }; }

  units() {
    const D = this.data2, S = this.save;
    D.units.forEach((u, i) => {
      const c = this.cell(i, 4, 290, 120), seen = S.codex.units.includes(u.id);
      const lv = levelInfo(S.speciesXp[u.id] ?? 0, D.config);
      const tok = unitToken(this, { kind: 'base', speciesId: u.id, stage: lv.level >= 10 ? 'spirit' : 'adult', stats: { color: u.color } }, D);
      tok.setPosition(c.x + 40, c.y + 45).setAlpha(seen ? 1 : 0.5);
      if (!seen) tok.list.forEach((o) => o.setTint?.(0x000000));
      this.add.text(c.x + 80, c.y + 8, seen ? `${u.name}  Lv.${lv.level}` : '???', style(17, lv.level >= 10 ? '#ffd84d' : '#ffffff'));
      this.add.text(c.x + 80, c.y + 32, `${CONT[u.continent]} · 영물 ${seen ? u.stageNames.spirit : '???'}`, style(12, '#aabbcc'));
      if (seen) {
        this.add.text(c.x + 80, c.y + 52, `"${u.codex}"`, style(12, '#dddddd', { wordWrap: { width: 200 } }));
        if (u.nickname && u.nickname !== '없음') this.add.text(c.x + 10, c.y + 100, `별명: ${u.nickname}`, style(11, '#8899aa'));
      }
    });
  }

  /** 신화급(영물) 도감: 만든 적 있으면 이름·고향·기술·설화, 아니면 실루엣과 '성체 둘을 합치면' 힌트. */
  spirits() {
    const D = this.data2, S = this.save, T = D.tales ?? {};
    const made = new Set([...(S.codex.spirits ?? []), ...D.units.filter((u) => levelInfo(S.speciesXp[u.id] ?? 0, D.config).level >= 10).map((u) => u.id)]);
    D.units.forEach((u, i) => {
      const c = this.cell(i, 3, 385, 122), got = made.has(u.id), m = T.myth?.[u.id];
      const g = this.add.graphics();
      g.fillStyle(got ? 0x3a2a10 : 0x10161e, got ? 0.55 : 0.6).fillRoundedRect(c.x, c.y, c.w, c.h, 12);
      g.lineStyle(2, got ? 0xffd84d : 0x3b4b5e, got ? 0.9 : 0.6).strokeRoundedRect(c.x, c.y, c.w, c.h, 12);
      if (got) g.fillStyle(0xffd84d, 0.18).fillCircle(c.x + 48, c.y + 52, 40);
      const tok = unitToken(this, { kind: 'base', speciesId: u.id, stage: 'spirit', stats: { color: u.color } }, D);
      tok.setPosition(c.x + 48, c.y + 52);
      if (!got) tok.list.forEach((o) => o.setTint?.(0x000000));
      this.add.text(c.x + 96, c.y + 8, got ? `🌟 ${u.stageNames.spirit}` : '🌟 ???', style(19, got ? '#ffd84d' : '#7f8c99', { stroke: '#000', strokeThickness: 3 }));
      this.add.text(c.x + c.w - 10, c.y + 10, m ? `${m.flag} ${got ? m.land : '???'}` : '', style(12, '#cfd8dc')).setOrigin(1, 0);
      if (got) {
        this.add.text(c.x + 96, c.y + 36, `${m?.source ?? ''} · ✦ ${u.spiritSkill.name}`, style(12, '#e8c3ff'));
        this.add.text(c.x + 96, c.y + 56, T.skills?.[`${u.id}_spirit`]?.[1] ?? u.spiritSkill.desc, style(12, '#efe3c8', { wordWrap: { width: 275 } }));
        this.add.text(c.x + 96, c.y + 94, `"${u.spiritCodex}"`, style(11, '#aab4be', { wordWrap: { width: 275 } }));
      } else {
        this.add.text(c.x + 96, c.y + 40, `성체 ${S.codex.units.includes(u.id) ? u.name : '???'} 둘을 겹치면 깨어난대요.`, style(12, '#8fa1b3', { wordWrap: { width: 275 } }));
        this.add.text(c.x + 96, c.y + 64, m ? `${m.flag} 어느 ${m.source.endsWith('신화') ? '신화' : '이야기'} 속 짐승…` : '', style(12, '#6f7f8f'));
      }
    });
    this.add.text(640, 632, `깨운 신화급 ${made.size} / ${D.units.length}`, style(15, '#ffd84d')).setOrigin(0.5);
  }

  chimeras() {
    const D = this.data2, S = this.save;
    D.recipes.forEach((r, i) => {
      const c = this.cell(i, 3, 385, 120), known = S.codex.recipes.includes(r.id);
      const hint = S.hints[r.id] ?? [];
      const tok = unitToken(this, { kind: 'chimera', speciesId: r.id, stage: 'adult', parts: r.parts, stats: {} }, D);
      tok.setPosition(c.x + 40, c.y + 45).setAlpha(known ? 1 : 0.5);
      if (!known) tok.list.forEach((o) => o.setTint?.(0x000000));
      const parts = r.parts.map((p) => (known || hint.includes(p) ? D.unitById[p].name : `?(${CONT[D.unitById[p].continent]})`)).join(' + ');
      this.add.text(c.x + 85, c.y + 8, known ? r.name : '???', style(18, known ? '#d7bde2' : '#888888'));
      this.add.text(c.x + 85, c.y + 34, parts, style(13, '#aabbcc'));
      this.add.text(c.x + 85, c.y + 56, known ? r.desc : `출처: ${r.source}`, style(11, '#dddddd', { wordWrap: { width: 290 } }));
      if (known && r.codex) this.add.text(c.x + 85, c.y + 96, `"${r.codex}"`, style(11, '#c0c0c0', { wordWrap: { width: 290 } }));
    });
    this.add.text(640, 632, `힌트 조각 ${S.hintShards}/${D.config.hintShardsPerReveal} — 흑역사를 만들 때마다 1개`, style(14, '#ffd84d')).setOrigin(0.5);
  }

  flops() {
    const D = this.data2, S = this.save;
    if (!S.codex.failedPairs.length) this.add.text(640, 380, '아직 실패한 합성이 없습니다. 언젠가는 생깁니다.', style(18, '#888888')).setOrigin(0.5);
    S.codex.failedPairs.forEach((k, i) => {
      const [a, b] = k.split('+');
      const c = this.cell(i, 4, 290, 80);
      this.add.text(c.x + 10, c.y + 8, `어설픈 ${D.unitById[a]?.name ?? a}${D.unitById[b]?.name ?? b}`, style(17, '#bbbbbb'));
      this.add.text(c.x + 10, c.y + 36, '단점만 모였다. 적들이 구경했다.', style(12, '#888888'));
    });
    const total = D.units.length * (D.units.length - 1) / 2 - D.recipes.filter((r) => r.parts.every((p) => D.unitById[p])).length;
    this.add.text(640, 632, `흑역사 ${S.codex.failedPairs.length}/${total}`, style(14, '#aaaaaa')).setOrigin(0.5);
  }

  bonds() {
    const D = this.data2, S = this.save;
    D.lore.bonds.forEach((b, i) => {
      const c = this.cell(i, 3, 385, 70), seen = S.codex.bonds.includes(b.id);
      const names = b.pair.map((p) => D.unitById[p]?.name ?? p).join(' + ');
      this.add.text(c.x + 10, c.y + 6, `${b.kind === 'clash' ? '⚡' : '♥'} ${seen ? b.name : '???'}`, style(17, b.kind === 'clash' ? '#f0883e' : '#ff8fb1'));
      this.add.text(c.x + 10, c.y + 30, `${names} · ${b.sameTeam ? '함께 출전' : b.tiles + '타일 안'}`, style(12, '#aabbcc'));
      this.add.text(c.x + 10, c.y + 48, seen ? b.desc : `출처: ${b.source}`, style(12, '#dddddd'));
    });
  }

  enemies() {
    const D = this.data2, S = this.save;
    D.enemies.forEach((e, i) => {
      const c = this.cell(i, 4, 290, 100), seen = S.codex.enemies.includes(e.id);
      this.add.rectangle(c.x + 30, c.y + 40, e.boss ? 44 : 30, e.boss ? 44 : 30, Phaser.Display.Color.HexStringToColor(e.color).color).setAlpha(seen ? 1 : 0.15);
      this.add.text(c.x + 65, c.y + 8, seen ? e.name : '???', style(17));
      if (seen) {
        this.add.text(c.x + 65, c.y + 32, e.desc, style(11, '#aabbcc', { wordWrap: { width: 215 } }));
        this.add.text(c.x + 65, c.y + 66, `"${e.codex}"`, style(11, '#dddddd', { wordWrap: { width: 215 } }));
      }
    });
  }
}
