import { PATH_Y, PATH_H, tileToX, xToTile, laneAt, SKY_TOP, SKY_BOTTOM } from './layout.js';
import { deploy, moveUnit, recall, sell, merge } from '../logic/battle.js';
import { confirmBox, showRange, hideRange, highlightRing } from './widgets.js';
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
    showRange(scene, tileToX(u.pos - effRange(u)), tileToX(u.pos + effRange(u)), PATH_Y, PATH_H);
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
    if (u && u.stats.flyer && pointer.y >= SKY_TOP && pointer.y <= SKY_BOTTOM && pointer.x < 1000) { say(moveUnit(st(), data, u.uid, xToTile(pointer.x), { skyY: Math.round(pointer.y) })); return; }
    if (u && onPath(pointer.y)) { say(moveUnit(st(), data, u.uid, xToTile(pointer.x), { lane: laneAt(pointer.y) })); return; }
    deselect();
  });

  scene.input.on('dragstart', (pointer, obj) => {
    if (obj.unitUid == null || scene.modalOpen || st().phase === 'ended') return;
    const me = unitOf(st(), refOf(st(), obj.unitUid));
    if (!me) return;
    scene.dragUid = obj.unitUid;
    dragStart = { x: pointer.downX, y: pointer.downY };
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
  });

  scene.input.on('dragend', (pointer, obj) => {
    if (scene.dragUid !== obj.unitUid) return;
    clearRings();
    obj.setDepth(0);
    const uid = scene.dragUid;
    scene.dragUid = null;
    if (!dragStart || Math.hypot(pointer.x - dragStart.x, pointer.y - dragStart.y) < DRAG_MIN) return;
    const positions = new Map();
    for (const [vuid, v] of scene.unitViews) if (vuid !== uid) positions.set(vuid, { x: v.container.x, y: v.container.y });
    const inSell = scene.sellZone.getBounds().contains(pointer.x, pointer.y);
    const plan = planDrop(st(), data, uid, pointer.x, pointer.y, { positions, inSell });
    runPlan(plan);
  });

  const runPlan = (plan) => {
    const s = st();
    switch (plan.action) {
      case 'merge': {
        const doMerge = () => {
          const r = say(merge(s, data, plan.fromRef, plan.toRef));
          if (r.ok && r.kind !== 'swap') { scene.toast(r.unit.stats.name); select(r.unit.uid); }
        };
        const p = plan.preview;
        const from = unitOf(s, plan.fromRef), to = unitOf(s, plan.toRef);
        const names = (list) => list.map((t) => { const v = traitView(t, data); return (v.tone === 'str' ? '＋' : v.tone === 'flip' ? '★' : '－') + v.name; }).join('  ');
        let traitLine = '';
        if (p.kind === 'spirit') traitLine = '특성: ' + names(inheritSpirit(to.traits, from.traits)) + '  (약점이 모두 뒤집혀요)';
        else if (p.kind === 'chimera' && p.textKey === 'merge.chimera') traitLine = '특성: ' + names(inheritChimera(to.traits, from.traits));
        else if (p.kind === 'weak' && p.textKey === 'merge.weakKnown') traitLine = '약점만 남아요: ' + names(inheritWeak(to.traits, from.traits, data, makeRng(1)).traits);
        else if (p.kind === 'chimera' || p.kind === 'weak') traitLine = '레시피가 있으면 키메라, 없으면 약체 키메라가 태어나요.';
        if (plan.confirm === 'spirit') confirmBox(scene, T('merge.spirit', p.vars) + '\n' + T('merge.spiritConfirm') + '\n' + traitLine, T('ui.yes'), T('ui.no'), doMerge);
        else if (plan.confirm === 'preview') confirmBox(scene, T('merge.previewTitle') + '\n' + T(p.textKey, p.vars) + '\n' + traitLine, T('ui.ok'), T('ui.cancel'), doMerge);
        else doMerge();
        break;
      }
      case 'sell': {
        const doSell = () => say(sell(s, data, plan.ref));
        if (plan.confirm) confirmBox(scene, T('sell.confirm', { name: plan.name, price: plan.price }), T('ui.yes'), T('ui.no'), doSell);
        else doSell();
        break;
      }
      case 'deploy': say(deploy(s, data, plan.index, plan.pos, plan.opts)); break;
      case 'move': say(moveUnit(s, data, plan.uid, plan.pos, plan.opts)); break;
      case 'recall': say(recall(s, data, plan.uid)); break;
      default: break;
    }
  };
  scene.runDropPlan = runPlan;
}
