import { PATH_Y, PATH_H, tileToX, xToTile, laneAt, SKY_TOP, SKY_BOTTOM } from './layout.js';
import { deploy, moveUnit, recall, sell, merge, swap } from '../logic/battle.js';
import { mergeKind } from '../logic/merge.js';
import { confirmBox, choiceBox, showRange, hideRange, highlightRing } from './widgets.js';
import { inheritEvolve, inheritSpirit, inheritChimera, inheritWeak, traitView } from '../logic/traits.js';
import { effRange } from '../logic/mods.js';
import { makeRng } from '../logic/rng.js';
import { DRAG_MIN, refOf, unitOf, onPath, planDrop, ringFor } from './dropPlan.js';

/** Wire drag, tap, merge, sell and confirm handling onto the battle scene. */
export function attachInput(scene) {
  const T = scene.registry.get('T');
  const st = () => scene.state;
  const data = scene.data2;
  const say = (r) => { if (r && r.ok === false) scene.toast(T('reason.' + r.reason)); return r; };
  let rings = [];
  let dragStart = null;

  scene.input.dragDistanceThreshold = DRAG_MIN;
  scene.selectedUid = null;

  const clearRings = () => { rings.forEach((o) => o.destroy()); rings = []; };

  const deselect = () => { scene.selectedUid = null; scene.hideUnitCard(); hideRange(scene); };

  const select = (uid) => {
    const u = unitOf(st(), refOf(st(), uid));
    if (!u) return deselect();
    scene.selectedUid = uid;
    scene.showUnitCard(uid);
    refreshRange();
  };

  const refreshRange = () => {
    const u = scene.selectedUid == null ? null : st().field.find((f) => f.uid === scene.selectedUid);
    if (!u) return hideRange(scene);
    const reach = u.stats.range <= 1 ? (data.config.meleeReach ?? 1) + Math.max(0, effRange(u) - 1) : effRange(u);
    showRange(scene, tileToX(u.pos - (u.stats.range <= 1 ? 0.35 : reach)), tileToX(u.pos + reach), PATH_Y, PATH_H, u.stats.range <= 1);
  };

  scene.events.on('postupdate', () => {
    if (scene.selectedUid == null) return;
    if (!refOf(st(), scene.selectedUid)) deselect(); else refreshRange();
  });

  scene.input.on('gameobjectdown', (pointer, obj) => {
    if (scene.modalOpen || obj.unitUid == null) return;
    select(obj.unitUid);
  });

  scene.input.on('pointerdown', (pointer, objs) => {
    if (scene.modalOpen || objs.length > 0) return;
    const u = scene.selectedUid == null ? null : st().field.find((f) => f.uid === scene.selectedUid);
    if (u) { const plan = planDrop(st(), data, u.uid, pointer.worldX, pointer.worldY, { positions: new Map(), inSell: false }); if (plan.action === 'move') { say(moveUnit(st(), data, u.uid, plan.pos, plan.opts)); return; } if (plan.reason) { say({ ok: false, reason: plan.reason }); return; } }
    deselect();
  });

  scene.input.on('dragstart', (pointer, obj) => {
    if (obj.unitUid == null || scene.modalOpen || st().phase === 'ended') return;
    const me = unitOf(st(), refOf(st(), obj.unitUid));
    if (!me) return;
    scene.dragUid = obj.unitUid;
    dragStart = { x: pointer.worldX, y: pointer.worldY };
    obj.setDepth(1000);
    for (const [uid, v] of scene.unitViews) {
      if (uid === obj.unitUid) continue;
      const other = unitOf(st(), refOf(st(), uid));
      const ring = other && ringFor(me, other, data, st().known);
      if (ring) rings.push(...highlightRing(scene, v.container.x, v.container.y, ring.color, ring.question));
    }
  });

  scene.input.on('drag', (pointer, obj, dragX, dragY) => {
    if (scene.dragUid !== obj.unitUid) return;
    obj.setPosition(dragX, dragY);
    scene.hoverCell?.(pointer.worldX, pointer.worldY, obj.unitUid);
  });

  scene.input.on('dragend', (pointer, obj) => {
    if (scene.dragUid !== obj.unitUid) return;
    clearRings();
    scene.hoverCell?.(0, 0, null);
    obj.setDepth(obj.baseDepth ?? 0);
    const uid = scene.dragUid;
    scene.dragUid = null;
    if (!dragStart || Math.hypot(pointer.worldX - dragStart.x, pointer.worldY - dragStart.y) < DRAG_MIN) return;
    // 합성 제단 칸에 놓으면 제단에 올림
    const slot = scene.altar?.slotAt(pointer.worldX, pointer.worldY) ?? -1;
    if (slot >= 0) { scene.altar.put(slot, uid); return; }
    // 놓을 곳: 들판·케이지의 동물 그림과 왼쪽 출전 초상화 둘 다
    const positions = [];
    for (const [vuid, v] of scene.unitViews) if (vuid !== uid) positions.push([vuid, { x: v.container.x, y: v.container.y }]);
    for (const [vuid, p] of scene.roster?.spots() ?? []) if (vuid !== uid) positions.push([vuid, p]);
    const inSell = scene.sellZone.getBounds().contains(pointer.worldX, pointer.worldY);
    const plan = planDrop(st(), data, uid, pointer.worldX, pointer.worldY, { positions, inSell });
    runPlan(plan);
  });

  const runPlan = (plan) => {
    const s = st();
    switch (plan.action) {
      case 'merge': {
        const p = plan.preview;
        const from = unitOf(s, plan.fromRef), to = unitOf(s, plan.toRef);
        const kind = mergeKind(from, to, data);
        const names = (list) => list.map((t) => { const v = traitView(t, data); return (v.tone === 'str' ? '＋' : v.tone === 'flip' ? '★' : '－') + v.name; }).join('  ');
        const doMerge = () => { const r = say(merge(s, data, plan.fromRef, plan.toRef)); if (r.ok && r.kind !== 'swap') { scene.toast(r.unit.stats.name); select(r.unit.uid); } };
        const doSwap = () => { const r = say(swap(s, data, plan.fromRef, plan.toRef)); if (r.ok) scene.fx?.ring(scene.unitViews.get(from.uid)?.container.x ?? 640, (scene.unitViews.get(from.uid)?.container.y ?? 300) + 20, 0x7fd1ff, 0.8); };
        const opts = [];
        const where = (ref) => (ref.where === 'bench' ? '대기석' : '진영');
        opts.push({ icon: '⇄', label: '자리 바꾸기', sub: `${from.stats.name}(${where(plan.fromRef)}) ↔ ${to.stats.name}(${where(plan.toRef)})`, color: 0x7fd1ff, onPick: doSwap });
        if (kind === 'evolve') opts.unshift({ icon: '⬆', label: '진화', sub: `${T(p.textKey, p.vars)}\n특성: ${names(inheritEvolve(to.traits, from.traits))}`, color: 0x2ecc71, onPick: doMerge });
        if (kind === 'spirit') opts.unshift({ icon: '🌟', label: '영물로 진화', sub: `${T('merge.spirit', p.vars)}\n특성: ${names(inheritSpirit(to.traits, from.traits))} (약점이 모두 뒤집혀요)`, color: 0xffd84d, onPick: doMerge });
        if (kind === 'chimera' || kind === 'weak') {
          let line = '레시피가 있으면 키메라, 없으면 약체 키메라가 태어나요.';
          if (p.kind === 'chimera' && p.textKey === 'merge.chimera') line = `${T(p.textKey, p.vars)}\n특성: ${names(inheritChimera(to.traits, from.traits))}`;
          else if (p.kind === 'weak' && p.textKey === 'merge.weakKnown') line = `${T(p.textKey, p.vars)}\n약점만 남아요: ${names(inheritWeak(to.traits, from.traits, data, makeRng(1)).traits)}`;
          opts.unshift({ icon: '🧪', label: p.textKey === 'merge.chimera' ? '합성' : '합성 (모험)', sub: line, color: p.textKey === 'merge.chimera' ? 0xb388ff : 0xaaaaaa, onPick: doMerge });
        }
        choiceBox(scene, `${from.stats.name} → ${to.stats.name}`, [[kind === 'swap' ? '두 동물의 자리를 바꿈.' : '합치면 되돌릴 수 없음. 무엇을 할지 선택.', kind === 'swap' ? '#cfd8dc' : '#ffcf8a']], opts);
        break;
      }
      case 'sell': {
        const doSell = () => say(sell(s, data, plan.ref));
        if (plan.confirm) confirmBox(scene, T('sell.confirm', { name: plan.name, price: plan.price }), T('ui.yes'), T('ui.no'), doSell);
        else doSell();
        break;
      }
      case 'deploy': { const r = say(deploy(s, data, plan.index, plan.pos, plan.opts)); if (r.ok) scene.onPlaced?.(r.unit); break; }
      case 'move': say(moveUnit(s, data, plan.uid, plan.pos, plan.opts)); break;
      case 'recall': say(recall(s, data, plan.uid)); break;
      default: if (plan.reason) say({ ok: false, reason: plan.reason }); break;
    }
  };
  scene.runDropPlan = runPlan;
}
