// 가운데 연출판(2026-11-27 선생님 "가운데 공간은 필살기나 멘트 같은 거 띄워서 화면 공간 활용 알차게").
// 땅으로 내려 싸우면서 생긴 위·가운데 빈 하늘에 필살기 이름 띠·동물 말풍선·보스 예고를 띄움.
// 짧게 떴다 사라지고, 여러 개가 같이 뜨면 줄을 세워 겹치지 않게(자리 없으면 잠깐 기다렸다 뜨거나 버림).
// 문구는 public/data/text.json 의 mid.* 한 곳에서만 가져옴(다국어).
import { FONT } from '../text.js';
import { midPlace, midRows } from '../logic/battlefield.js';
import { speciesImage } from './ui.js';

const DEPTH = 1840;   // 동물·적(100+y)·클로즈업(960)보다 위, 위 알림(1850)·필살기 컷(1900)·배너(2400)보다 아래

export class MidStage {
  constructor(scene, bf, art) {
    this.sc = scene;
    this.rows = midRows(bf, art);
    this.live = [];   // { rect, until, objs }
    this.wait = [];   // 자리가 없어 기다리는 것 { make, w, h, want, expire }
    const dict = scene.cache.json.get('text') ?? {};
    this.T = scene.registry.get('T') ?? ((k) => dict[k] ?? k);
    this.pools = {};
    for (const k of Object.keys(dict)) { const m = k.match(/^(mid\.[a-zA-Z]+)\.\d+$/); if (m) (this.pools[m[1]] ??= []).push(k); }
  }

  /** 같은 상황 문구 중 하나(번호 붙은 키 mid.start.1, mid.start.2 …) */
  line(group, vars = {}) {
    const keys = this.pools['mid.' + group];
    if (!keys?.length) return null;
    return this.T(keys[Math.floor(Math.random() * keys.length)], vars);
  }

  busy() {
    const now = this.sc.time.now;
    const out = this.live.filter((l) => l.until > now).map((l) => l.rect);
    // 힘싸움 막대(화면 위 띠)는 피해서
    for (const b of this.sc.clashBars ?? []) out.push({ x0: b.x - 80, x1: b.x + 80, y0: b.y - 34, y1: b.y + 14 });
    return out;
  }

  /** 필살기 컷(화면 전체 띠)이나 배너가 떠 있는 동안은 기다림 */
  blocked() {
    const now = this.sc.time.now;
    return now - (this.sc.lastCutIn ?? -9999) < 1250 || !!this.sc.fx?._banner;
  }

  place(w, h, want, make, life) {
    const at = this.blocked() ? null : midPlace({ rows: this.rows, w, h, want, busy: this.busy() });
    if (!at) { if (this.wait.length < 3) this.wait.push({ w, h, want, make, life, expire: this.sc.time.now + 1600 }); return false; }
    const objs = make(at);
    const until = this.sc.time.now + life;
    this.live.push({ rect: at, until, objs });
    for (const o of objs) { o.setDepth?.(DEPTH + (o.__z ?? 0)); }
    // 나타남: 살짝 커지며(번짐 없음) → 머묾 → 위로 조금 뜨며 사라짐
    this.sc.tweens.add({ targets: objs, alpha: { from: 0, to: 1 }, duration: 120 });
    this.sc.time.delayedCall(life - 220, () => this.sc.tweens.add({ targets: objs, alpha: 0, y: '-=10', duration: 220, onComplete: () => objs.forEach((o) => o.destroy()) }));
    return true;
  }

  update() {
    const now = this.sc.time.now;
    this.live = this.live.filter((l) => l.until > now);
    if (!this.wait.length) return;
    const w = this.wait; this.wait = [];
    for (const it of w) if (it.expire > now) this.place(it.w, it.h, it.want, it.make, it.life);
  }

  /** 도트 느낌 판: 진한 2px 테두리 + 색 2px 안쪽 테두리(둥글림·그림자 번짐 없음) */
  panel(x, y, w, h, fill, edge) {
    const g = this.sc.add.graphics();
    const X = Math.round(x - w / 2), Y = Math.round(y - h / 2);
    g.fillStyle(0x140c18, 1).fillRect(X - 2, Y - 2, w + 4, h + 4);
    g.fillStyle(edge, 1).fillRect(X, Y, w, h);
    g.fillStyle(fill, 0.94).fillRect(X + 2, Y + 2, w - 4, h - 4);
    return g;
  }

  /** 필살기 이름 띠: [얼굴] ✨ 기술 이름! / 누구의 필살기. 쓴 동물 쪽에서
   *  fx = { c: [밝은, 주, 짙은, 아주 짙은], o: 외곽선, myth, slant, stripes, slide } 이면 컷인처럼(비스듬한 판 + 속성 색 줄무늬 + 옆에서 미끄러져 들어옴) */
  ult(who, skill, x, color = 0xffd84d, speciesId = null, stage = 'adult', fx = null) {
    const sc = this.sc;
    if (fx?.c) return this.ultCut(who, skill, x, speciesId, stage, fx);
    const title = this.T('mid.ult.title', { skill }), sub = this.T('mid.ult.who', { name: who });
    const probe = sc.add.text(0, 0, title, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold' });
    const tw = Math.ceil(probe.width); probe.destroy();
    const face = speciesId ? 40 : 0, w = Math.max(160, tw + 28 + face), h = 52;
    const hex = '#' + color.toString(16).padStart(6, '0');
    return this.place(w, h, x, (at) => {
      const g = this.panel(at.x, at.y, w, h, 0x10162a, color);
      const left = Math.round(at.x - w / 2) + 10 + face;
      const t = sc.add.text(left, at.y - 13, title, { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(0, 0.5);
      const s2 = sc.add.text(left, at.y + 13, sub, { fontFamily: FONT, fontSize: '13px', color: hex, stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 0.5);
      const out = [g, t, s2];
      if (speciesId) {
        const img = speciesImage(sc, speciesId, stage, Math.round(at.x - w / 2) + 26, at.y - 2, 40);
        if (img) {
          // 도트가 뭉개지지 않게 정수배(2·1배) 또는 정수분의 1(½·⅓·¼)로만
          const fh = img.height || 1, k = [2, 1, 1 / 2, 1 / 3, 1 / 4].find((q) => fh * q <= 46) ?? 1 / 4;
          img.setScale(k);
          img.__z = 1; out.push(img);
        }
      }
      return out;
    }, 1700);
  }

  /** 컷인 띠(스킬 이펙트, 2026-11-27): 평행사변형 판 + 속성 색 줄무늬가 흘러감 + 얼굴 + 이름. 쓴 동물 쪽에서 미끄러져 들어옴 */
  ultCut(who, skill, x, speciesId, stage, fx) {
    const sc = this.sc;
    const title = this.T('mid.ult.title', { skill }), sub = this.T('mid.ult.who', { name: who });
    const size = fx.myth ? 26 : 22;
    const probe = sc.add.text(0, 0, title, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold' });
    const tw = Math.ceil(probe.width); probe.destroy();
    const sl = fx.slant ?? 18, face = speciesId ? 52 : 0, w = Math.max(200, tw + 48 + face + sl), h = fx.myth ? 62 : 54;
    const hx = (c) => '#' + c.toString(16).padStart(6, '0');
    const [c0, c1, c2, c3] = fx.c, o = fx.o ?? 0x140c18;
    const fromLeft = x < 640;
    return this.place(w, h, x, (at) => {
      const X = Math.round(at.x - w / 2), Y = Math.round(at.y - h / 2);
      const quad = (g, inset, col, a = 1) => g.fillStyle(col, a).fillPoints([{ x: X + sl + inset, y: Y + inset }, { x: X + w - inset, y: Y + inset }, { x: X + w - sl - inset, y: Y + h - inset }, { x: X + inset, y: Y + h - inset }], true);
      const g = sc.add.graphics();
      quad(g, -4, o); quad(g, 0, c1); quad(g, 4, c3, 0.96);
      // 줄무늬(비스듬히) — 흘러가게 따로 그림
      const st = sc.add.graphics(); st.__z = 1;
      const n = fx.stripes ?? 7, step = Math.ceil(w / n);
      const mask = sc.make.graphics({ add: false }); quad(mask, 4, 0xffffff);
      st.setMask(mask.createGeometryMask());
      const paint = (off) => { st.clear(); for (let i = -2; i < n + 2; i++) { const sx = X + i * step + (off % step); st.fillStyle(i % 2 ? c2 : c1, 0.28).fillPoints([{ x: sx + sl, y: Y }, { x: sx + sl + step * 0.45, y: Y }, { x: sx + step * 0.45, y: Y + h }, { x: sx, y: Y + h }], true); } };
      const flow = { v: 0 }; paint(0);
      sc.tweens.add({ targets: flow, v: step * 6, duration: (fx.life ?? 1700), onUpdate: () => paint(flow.v) });
      const edge = sc.add.graphics(); edge.__z = 2;
      edge.fillStyle(c0, 1).fillRect(X + sl + 6, Y + 5, w - sl - 14, 3);
      const left = X + sl + 12 + face;
      const t = sc.add.text(left, at.y - (fx.myth ? 12 : 11), title, { fontFamily: FONT, fontSize: size + 'px', fontStyle: 'bold', color: hx(c0), stroke: hx(o), strokeThickness: 6 }).setOrigin(0, 0.5);
      t.setShadow(2, 3, hx(c2), 0, true, true);
      const s2 = sc.add.text(left, at.y + (fx.myth ? 17 : 14), sub, { fontFamily: FONT, fontSize: '13px', color: hx(c1), stroke: hx(o), strokeThickness: 3 }).setOrigin(0, 0.5);
      t.__z = 3; s2.__z = 3;
      const out = [g, st, edge, t, s2];
      if (speciesId) {
        const img = speciesImage(sc, speciesId, stage, X + sl + 6 + face / 2, at.y - 2, 48);
        if (img) { const fh = img.height || 1, k = [2, 1, 1 / 2, 1 / 3, 1 / 4].find((q) => fh * q <= 56) ?? 1 / 4; img.setScale(k); img.__z = 4; out.push(img); }
      }
      // 옆에서 쓱 미끄러져 들어옴(쓴 동물 쪽에서)
      const dx = (fx.slide ?? 90) * (fromLeft ? -1 : 1);
      for (const ob of out) { const x0 = ob.x; ob.x = x0 + dx; sc.tweens.add({ targets: ob, x: x0, duration: 200, ease: 'Back.out' }); }
      mask.x = dx; sc.tweens.add({ targets: mask, x: 0, duration: 200, ease: 'Back.out' });
      st.once('destroy', () => { sc.tweens.killTweensOf(flow); mask.destroy(); });
      return out;
    }, fx.life ?? 1700);
  }

  /** 말풍선: 말하는 쪽(x) 위 하늘에, 꼬리는 아래로 */
  quip(text, x, side = 'u') {
    if (!text) return false;
    const sc = this.sc;
    const probe = sc.add.text(0, 0, text, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold' });
    const w = Math.ceil(probe.width) + 26, h = 34; probe.destroy();
    const ink = side === 'u' ? 0x2a1606 : 0x2a0a3a, edge = side === 'u' ? 0xffd84d : 0xc4a6ff;
    return this.place(w, h, x, (at) => {
      const g = this.panel(at.x, at.y, w, h, 0xfdf6e3, edge);
      // 꼬리(계단 모양 3칸): 말한 쪽으로 기울게
      const tx = Math.round(Math.max(at.x - w / 2 + 12, Math.min(at.x + w / 2 - 12, x))), ty = Math.round(at.y + h / 2);
      g.fillStyle(0x140c18, 1).fillRect(tx - 6, ty, 12, 4).fillRect(tx - 4, ty + 4, 8, 4).fillRect(tx - 2, ty + 8, 4, 4);
      g.fillStyle(0xfdf6e3, 1).fillRect(tx - 4, ty - 2, 8, 4).fillRect(tx - 2, ty + 2, 4, 4);
      const t = sc.add.text(at.x, at.y, text, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#' + ink.toString(16).padStart(6, '0') }).setOrigin(0.5);
      return [g, t];
    }, 1900);
  }

  /** 예고·안내 한 줄(가운데) */
  notice(text, color = 0xff8a7a) {
    if (!text) return false;
    const sc = this.sc;
    const probe = sc.add.text(0, 0, text, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold' });
    const w = Math.ceil(probe.width) + 30, h = 38; probe.destroy();
    return this.place(w, h, 640, (at) => {
      const g = this.panel(at.x, at.y, w, h, 0x1a0a0a, color);
      const t = sc.add.text(at.x, at.y, text, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#' + color.toString(16).padStart(6, '0'), stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
      return [g, t];
    }, 2400);
  }

  /** 안내(💡): 노란 판, 가운데, 조금 길게 */
  guide(text) {
    const sc = this.sc;
    const probe = sc.add.text(0, 0, text, { fontFamily: FONT, fontSize: '17px' });
    const w = Math.ceil(probe.width) + 30, h = 34; probe.destroy();
    return this.place(w, h, 640, (at) => {
      const g = this.panel(at.x, at.y, w, h, 0xffe27a, 0xb8860b);
      const t = sc.add.text(at.x, at.y, text, { fontFamily: FONT, fontSize: '17px', color: '#0d1222' }).setOrigin(0.5);
      return [g, t];
    }, 3400);
  }

  clear() { for (const l of this.live) l.objs.forEach((o) => o.destroy()); this.live = []; this.wait = []; }
}
