// 해금 게이지(2026-11-26): 게이지 막대 그리기 + 다 차면 실루엣 2마리 중 1마리 고르기 → 화려한 해금 연출
import Phaser from 'phaser';
import { button, style, speciesImage } from './ui.js';
import { FX } from './fx.js';
import { sfx } from './sfx.js';
import { unlockGauge, unlockCandidates, pickUnlock, writeSave } from '../logic/meta.js';
import { deckOf } from '../logic/soul.js';

const ROLE = { bruiser: '🛡 막기', dealer: '⚔ 딜러', technician: '🎯 기술', buffer: '🎺 응원' };
const CONT = { eurasia: '유라시아', america: '아메리카', africa: '아프리카' };

/** 게이지 막대. from → to로 차오르는 연출(넘치면 한 바퀴 돌고 다시). 반환: 갱신 함수. */
export function drawGauge(scene, x, y, w, data, save, rep = null, depth = 20) {
  const g = scene.add.graphics().setDepth(depth);
  const label = scene.add.text(x, y - 20, '', style(14, '#ffe2b8', { stroke: '#000', strokeThickness: 3 })).setDepth(depth + 1);
  const right = scene.add.text(x + w, y - 20, '', style(14, '#9cff6b', { stroke: '#000', strokeThickness: 3 })).setOrigin(1, 0).setDepth(depth + 1);
  const paint = (pts, need, flash = 0) => {
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(x - 3, y - 3, w + 6, 20, 8);
    g.fillStyle(0x2a3556, 1).fillRoundedRect(x, y, w, 14, 6);
    const k = Math.max(0, Math.min(1, pts / need));
    if (k > 0) { g.fillStyle(0x9cff6b, 1).fillRoundedRect(x, y, Math.max(12, w * k), 14, 6); g.fillStyle(0xffffff, 0.25 + flash * 0.5).fillRoundedRect(x, y, Math.max(12, w * k), 5, 3); }
    label.setText(`🎁 해금 게이지  ${Math.floor(pts)} / ${need}`);
  };
  const cur = unlockGauge(save, data);
  if (!rep) { paint(cur.pts, cur.need); right.setText(cur.pending ? `새 친구 ${cur.pending}마리 고를 수 있음!` : ''); return { g, label, right }; }
  // 차오르는 연출: before → (꽉 참 × filled) → after
  const steps = [];
  let pts = rep.before.pts, need = rep.before.need, left = rep.gain;
  while (left > 0) { const room = need - pts; const add = Math.min(room, left); steps.push({ from: pts, to: pts + add, need }); left -= add; pts += add; if (pts >= need) { pts = 0; need += (data.config.unlockGauge?.step ?? 50); } }
  if (!steps.length) steps.push({ from: rep.after.pts, to: rep.after.pts, need: rep.after.need });
  paint(steps[0].from, steps[0].need);
  right.setText(`+${rep.gain}`);
  let i = 0;
  const run = () => {
    const s = steps[i];
    const t = { v: s.from };
    scene.tweens.add({ targets: t, v: s.to, duration: 500 + 600 * ((s.to - s.from) / s.need), ease: 'Cubic.out', onUpdate: () => paint(t.v, s.need), onComplete: () => {
      if (s.to >= s.need) {   // 꽉 참: 번쩍
        sfx('reveal');
        const fx = new FX(scene);
        fx.burst?.('star', x + w, y + 7, 16, 0x9cff6b);
        const fl = { f: 1 }; scene.tweens.add({ targets: fl, f: 0, duration: 500, onUpdate: () => paint(s.need, s.need, fl.f) });
      }
      i += 1;
      if (i < steps.length) scene.time.delayedCall(350, run);
      else right.setText(unlockGauge(save, data).pending ? `🎉 가득 참! 새 친구를 고를 수 있음` : `+${rep.gain}`);
    } });
  };
  scene.time.delayedCall(500, run);
  return { g, label, right };
}

/** 실루엣 2마리 중 하나 고르기 → 해금 연출. onDone(id) */
export function showUnlockPicker(scene, data, save, storage, onDone = () => {}) {
  const ids = unlockCandidates(save, data);
  if (!ids.length || !(unlockGauge(save, data).pending > 0)) return null;
  const D = 5000, objs = [];
  const add = (o) => { objs.push(o); return o.setDepth?.(o.depth > D ? o.depth : D) ?? o; };
  const close = () => { objs.forEach((o) => o.destroy()); };
  const bg = add(scene.add.rectangle(640, 360, 1280, 720, 0x05060c, 0.88).setInteractive());
  bg.setAlpha(0); scene.tweens.add({ targets: bg, alpha: 1, duration: 250 });
  add(scene.add.text(640, 90, '🎁 해금 게이지가 가득 찼어요!', style(34, '#ffe066', { stroke: '#000', strokeThickness: 6 })).setOrigin(0.5));
  add(scene.add.text(640, 132, '그림자 속 두 친구 중 하나를 깨워요', style(17, '#cfe8ff')).setOrigin(0.5));
  const E = data.config.elements?.defs ?? {};
  const cards = ids.map((id, i) => {
    const u = data.unitById[id], x = 640 + (i === 0 ? -200 : 200), y = 370;
    const c = scene.add.container(x, y).setDepth(D + 2);
    const gfx = scene.add.graphics();
    gfx.fillStyle(0x141a2e, 1).fillRoundedRect(-150, -170, 300, 340, 18).lineStyle(3, 0xd4b06a, 1).strokeRoundedRect(-150, -170, 300, 340, 18);
    const im = speciesImage(scene, id, 'adult', 0, -30, 190);
    if (im) im.setTint(0x000000);
    const q = scene.add.text(0, 92, '???', style(30, '#ffffff', { stroke: '#000', strokeThickness: 5 })).setOrigin(0.5);
    const hint = scene.add.text(0, 132, `${ROLE[u.role] ?? ''}   ${E[u.element]?.icon ?? ''} ${E[u.element]?.name ?? ''}   ${CONT[u.continent] ?? ''}`, style(14, '#aabbcc')).setOrigin(0.5);
    c.add([gfx, im, q, hint].filter(Boolean));
    c.setSize(300, 340).setInteractive({ useHandCursor: true });
    c.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 380, delay: 150 + i * 120, ease: 'Back.out' });
    scene.tweens.add({ targets: c, y: y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 300 });
    c.on('pointerover', () => c.setScale(1.05)); c.on('pointerout', () => c.setScale(1));
    c.on('pointerdown', () => choose(i));
    objs.push(c);
    return { c, id, im, q, hint, gfx };
  });
  let chosen = false;
  const choose = (i) => {
    if (chosen) return; chosen = true;
    const pick = cards[i], other = cards[1 - i];
    const r = pickUnlock(save, data, pick.id);
    if (!r.ok) { close(); return; }
    writeSave(storage, save);
    scene.tweens.killTweensOf(pick.c);
    if (other) scene.tweens.add({ targets: other.c, alpha: 0, scale: 0.7, duration: 300 });
    sfx('summon');
    reveal(scene, data, save, storage, pick, objs, close, onDone);
  };
  return { close };
}

function reveal(scene, data, save, storage, pick, objs, close, onDone) {
  const D = 5000, fx = new FX(scene), u = data.unitById[pick.id];
  const add = (o) => { objs.push(o); return o; };
  // 1) 가운데로 → 2) 빛기둥·회전 빛살 모음 → 3) 카드 뒤집기(색이 드러남) → 4) 터짐·이름·도감 한 줄
  scene.tweens.add({ targets: pick.c, x: 640, y: 360, scale: 1.15, duration: 500, ease: 'Cubic.inOut' });
  const rays = add(scene.add.graphics().setDepth(D + 1).setPosition(640, 360).setAlpha(0));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; rays.fillStyle(k % 2 ? 0xffe066 : 0x9cff6b, 0.35).fillTriangle(0, 0, Math.cos(a - 0.09) * 700, Math.sin(a - 0.09) * 700, Math.cos(a + 0.09) * 700, Math.sin(a + 0.09) * 700); }
  scene.tweens.add({ targets: rays, alpha: 1, duration: 600, delay: 400 });
  scene.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });
  scene.time.delayedCall(500, () => { fx.pillar?.(640, 420, 0xffe066); fx.shockwave?.(640, 400, 0xffe066, 2, 2.6); sfx('reveal'); });
  scene.time.delayedCall(1100, () => {
    scene.tweens.add({ targets: pick.c, scaleX: 0, duration: 180, ease: 'Cubic.in', onComplete: () => {
      pick.im?.clearTint();
      pick.q.setText(u.name).setColor('#ffe066');
      pick.hint.setText(`${pick.hint.text}`);
      scene.tweens.add({ targets: pick.c, scaleX: 1.15, duration: 220, ease: 'Back.out' });
      scene.cameras.main.flash(260, 255, 250, 210);
      scene.cameras.main.shake(300, 0.008);
      fx.confetti?.();
      fx.burst?.('star', 640, 360, 30, 0xffe066);
      fx.shockwave?.(640, 360, 0x9cff6b, 3, 3.2);
      sfx('spirit');
      const name = add(scene.add.text(640, 600, `🎉 ${u.name} 합류!`, style(40, '#ffe066', { stroke: '#3a1e00', strokeThickness: 8 })).setOrigin(0.5).setDepth(D + 5).setScale(0.3));
      scene.tweens.add({ targets: name, scale: 1, duration: 420, ease: 'Back.out' });
      const line = add(scene.add.text(640, 646, u.codex ?? '', style(15, '#cfe8ff', { wordWrap: { width: 760 }, align: 'center' })).setOrigin(0.5).setDepth(D + 5).setAlpha(0));
      scene.tweens.add({ targets: line, alpha: 1, duration: 400, delay: 300 });
      scene.time.delayedCall(900, () => {
        const deckIn = button(scene, 540, 690, 200, 40, '덱에 넣기', () => {
          const pool = [...data.config.roster.starter, ...(save.unlockedAnimals ?? [])];
          const deck = deckOf(save, data, pool);
          if (!deck.includes(pick.id)) { const i = [...deck].reverse().findIndex((id) => id !== save.soulPet); if (i >= 0) deck[deck.length - 1 - i] = pick.id; save.deck = deck; writeSave(storage, save); }
          done();
        }, { depth: D + 6, fill: 0x2e5a3a, stroke: 0x9cff6b, size: 16 });
        const ok = button(scene, 760, 690, 160, 40, '확인', () => done(), { depth: D + 6, size: 16 });
        objs.push(deckIn, ok);
      });
    } });
  });
  const done = () => { close(); onDone(pick.id); };
}
