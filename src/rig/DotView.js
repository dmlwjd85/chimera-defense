// DotInstance를 Phaser로 그리는 쪽. RigView와 같은 겉모양(update·sync·destroy·container)이라 전투 코드가 그대로 씀.
// 도트 1칸이 화면에서 늘 정수 픽셀이 되게 배율을 맞추고(NEAREST 필터), 번짐 없이 또렷하게 그림.
import Phaser from 'phaser';
import { DOT_PX } from './dotData.js';

/** 시트 그림에 칸(프레임) 이름을 한 번만 등록하고, 가장 가까운 점 복사(NEAREST)로 확대되게 함. */
export function ensureDotFrames(scene, dot) {
  const tex = scene.textures.get(dot.sheet);
  if (!tex || tex.key === '__MISSING') return false;
  if (!tex._dotReady) {
    dot.frames.forEach((name, i) => { if (!tex.has(name)) tex.add(name, 0, (i % dot.cols) * dot.frameW, Math.floor(i / dot.cols) * dot.frameH, dot.frameW, dot.frameH); });
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    tex._dotReady = true;
  }
  return true;
}

export class DotView {
  /** opts: { parent(컨테이너), px(기본 도트 크기, 화면 px) } */
  constructor(scene, inst, opts = {}) {
    this.scene = scene; this.inst = inst; this.opts = opts; this.dot = inst.dot;
    ensureDotFrames(scene, this.dot);
    this.container = opts.parent ?? scene.add.container(0, 0);
    this.px = opts.px ?? DOT_PX;
    const d = this.dot, ax = d.anchorX ?? d.frameW / 2;
    this.sprite = scene.add.image(0, 0, d.sheet, d.frames[0]).setOrigin(ax / d.frameW, (d.foot + 1) / d.frameH);
    this.container.add(this.sprite);
    this.objs = { body: this.sprite };   // RigView와 같은 이름(전투 코드가 objs를 훑는 곳 대비)
    this.sync();
  }

  /** 지금 화면에서 도트 1칸이 몇 픽셀인지(정수)와, 그걸 위해 그림에 줄 배율. 부모 크기·카메라 확대까지 계산. */
  dotScale() {
    let ws = 1;
    try { const m = this.container.getWorldTransformMatrix(); ws = Math.hypot(m.a, m.b) || 1; } catch { ws = 1; }
    const z = this.scene.cameras?.main?.zoom || 1;
    const want = this.px * (this.inst.stageDef.scale ?? 1) * ws * z;
    // 정수로 맞추면 앞뒤로 움직일 때 도트 1칸이 1px↔2px로 툭 바뀌어 크기가 튐 → config.art.dotSmooth면 부드럽게(2026-11-25 크기 비교 뒤)
    const d = (this.scene.data2?.config?.art?.dotSmooth ?? this.scene.registry?.get('dotSmooth')) ? Math.max(0.5, want) : Math.max(1, Math.round(want));
    return { device: d, local: d / (ws * z) };
  }

  /** 그림 맨 위(머리·귀 끝)의 높이: 부모 안에서 발밑(0) 기준 y(위가 -). 세트에 top(가장 높은 점의 줄)이 있으면 그걸로. */
  topY() {
    const top = this.inst.set.top ?? 0;
    return -(this.dot.foot + 1 - top) * this.px * (this.inst.stageDef.scale ?? 1);
  }

  sync() {
    const p = this.inst.getPose(), o = this.sprite;
    if (o.frame.name !== p.frame) o.setFrame(p.frame);
    const { local } = this.dotScale();
    o.setScale(local).setFlipX(p.facing < 0).setAlpha(p.alpha);
    o.setPosition(p.dx * local * p.facing, p.dy * local);
    if (p.silhouette) o.setTintFill(0x0b0e12); else if (p.white) o.setTintFill(0xffffff); else o.clearTint();
    if (!this.opts?.parent) this.container.setDepth(this.inst.y ?? 0);
  }

  update(dt) { const ev = this.inst.update(dt); this.sync(); return ev; }
  destroy() { if (!this.opts?.parent) this.container.destroy(); else this.sprite.destroy(); }
}
