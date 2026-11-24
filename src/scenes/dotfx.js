import Phaser from 'phaser';

// 도트 시험판: ?dot=1 일 때 유닛·적·배경을 화면 공통 격자로 픽셀화하고, 색 수를 줄이고, 1도트 진한 외곽선을 두름.
// 모든 물체가 같은 화면 격자를 쓰므로 섞여 있어도 도트 크기가 맞음.
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uRes;
uniform float uPx;
uniform float uLv;
uniform float uLine;
uniform float uSoft;
varying vec2 outTexCoord;
vec4 S(vec2 p) { vec2 c = (floor(p / uPx) + 0.5) * uPx; return texture2D(uMainSampler, c / uRes); }
void main() {
  vec2 p = outTexCoord * uRes;
  vec4 c = S(p);
  if (uSoft > 0.5) {
    float a = floor(c.a * 4.0 + 0.5) / 4.0;
    if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec3 q = floor(c.rgb / max(c.a, 0.01) * uLv + 0.5) / uLv;
    gl_FragColor = vec4(q * a, a);
    return;
  }
  if (c.a < 0.45) {
    if (uLine < 0.5) { gl_FragColor = vec4(0.0); return; }
    float a = max(max(S(p + vec2(uPx, 0.0)).a, S(p - vec2(uPx, 0.0)).a), max(S(p + vec2(0.0, uPx)).a, S(p - vec2(0.0, uPx)).a));
    gl_FragColor = a >= 0.45 ? vec4(0.16, 0.10, 0.12, 1.0) : vec4(0.0);
    return;
  }
  vec3 rgb = c.rgb / c.a;
  // 밝기 단계를 줄이되 채도는 살짝 올려 도트 특유의 또렷한 색면을 만듦
  float l = dot(rgb, vec3(0.299, 0.587, 0.114));
  rgb = clamp(mix(vec3(l), rgb, 1.18), 0.0, 1.0);
  rgb = floor(rgb * uLv + 0.5) / uLv;
  gl_FragColor = vec4(rgb, 1.0);
}`;

export class DotFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) { super({ game, name: 'DotFX', fragShader: FRAG }); this.px = 3; this.lv = 6; this.line = 1; this.soft = 0; }
  onPreRender() {
    this.set2f('uRes', this.renderer.width, this.renderer.height);
    this.set1f('uPx', this.px * (window.__K || 1));
    this.set1f('uLv', this.lv);
    this.set1f('uLine', this.line);
    this.set1f('uSoft', this.soft);
  }
}

export const dotOn = () => {
  try { const q = new URLSearchParams(location.search).get('dot'); if (q != null) localStorage.setItem('chimera-dot', q); return (q ?? localStorage.getItem('chimera-dot')) === '1'; } catch { return false; }
};

/** 장면에 한 번 등록하고, 물체에 도트 효과를 씌움. line=false면 외곽선 없이(배경). */
export function dotify(scene, obj, line = true, soft = false) {
  if (!obj || !scene.renderer?.pipelines) return obj;
  const P = scene.renderer.pipelines;
  if (!P.getPostPipeline('DotFX')) P.addPostPipeline('DotFX', DotFX);
  obj.setPostPipeline?.('DotFX');
  const p = obj.getPostPipeline?.('DotFX');
  const one = Array.isArray(p) ? p[p.length - 1] : p;
  if (one) { one.line = line ? 1 : 0; one.soft = soft ? 1 : 0; }
  return obj;
}
