// 도트(픽셀 아트) 데이터 규격과 검사. Phaser 없이 돌아가는 순수 코드라 브라우저·시험(node) 양쪽에서 씀.
// 도트 그림 한 종 = 스프라이트 시트 PNG 1장(같은 크기 칸을 가로로 늘어놓음) + 설정 JSON(public/data/dot/<종>.dot.json).

export const DOT_PX = 3;                 // 기본 배율: 도트 1칸 = 화면 3×3px (1280×720 기준)
export const OUTLINE = '#291a1f';        // 모든 캐릭터 공통 1도트 외곽선 색
export const MAX_COLORS = 16;            // 한 종에 쓸 수 있는 불투명 색 수 상한
// 외곽선 없이 투명과 바로 닿아도 되는 색(타격 빛·발톱 궤적의 흰색·노랑)
export const FX_COLORS = ['#ffffff', '#ffe15a'];

const HEX = /^#[0-9a-f]{6}$/;
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** 한 동작(클립)의 전체 길이(초). hold는 '타격 멈칫'처럼 특정 장을 더 붙잡는 시간. */
export function clipDuration(clip) {
  return (clip.durs || []).reduce((s, d) => s + d, 0) + (clip.hold?.sec ?? 0);
}

/** dot.json 내용 검사. 문제를 문자열 배열로 돌려줌(빈 배열 = 통과). */
export function validateDot(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['dot data missing'];
  if (!d.species) errs.push('species missing');
  if (!d.sheet || !String(d.sheet).startsWith('dot-')) errs.push('sheet key must start with dot-');
  if (!d.file) errs.push('file missing');
  for (const k of ['frameW', 'frameH', 'foot', 'cols']) if (!Number.isInteger(d[k]) || d[k] <= 0) errs.push(`${k} must be a positive integer`);
  if (Number.isInteger(d.foot) && Number.isInteger(d.frameH) && d.foot >= d.frameH) errs.push('foot must be inside the frame');
  if (!Array.isArray(d.palette) || !d.palette.length) errs.push('palette missing');
  else {
    if (d.palette.length > MAX_COLORS) errs.push(`palette has ${d.palette.length} colors (max ${MAX_COLORS})`);
    for (const c of d.palette) if (!HEX.test(c)) errs.push(`palette color ${c} must be #rrggbb lowercase`);
    if (!d.palette.includes(OUTLINE)) errs.push(`palette must include outline ${OUTLINE}`);
  }
  const frames = new Set();
  if (!Array.isArray(d.frames) || !d.frames.length) errs.push('frames missing');
  else for (const f of d.frames) { if (frames.has(f)) errs.push(`duplicate frame ${f}`); frames.add(f); }
  for (const f of d.standing || []) if (!frames.has(f)) errs.push(`standing: unknown frame ${f}`);
  const attacks = d.attacks || [];
  if (!attacks.length) errs.push('attacks missing');
  if (!d.sets || !Object.keys(d.sets).length) errs.push('sets missing');
  for (const [sname, set] of Object.entries(d.sets || {})) {
    if (!set.idle) errs.push(`set ${sname}: idle missing`);
    if (!attacks.some((a) => set[a])) errs.push(`set ${sname}: no attack clip (${attacks.join('/')})`);
    for (const [cname, c] of Object.entries(set)) {
      const at = `set ${sname} clip ${cname}`;
      if (!Array.isArray(c.frames) || !c.frames.length) { errs.push(`${at}: frames missing`); continue; }
      for (const f of c.frames) if (!frames.has(f)) errs.push(`${at}: unknown frame ${f}`);
      if (!Array.isArray(c.durs) || c.durs.length !== c.frames.length) errs.push(`${at}: durs must match frames`);
      else if (c.durs.some((t) => !(t > 0))) errs.push(`${at}: every dur must be > 0`);
      if (c.hold) {
        if (!Number.isInteger(c.hold.frame) || c.hold.frame < 0 || c.hold.frame >= c.frames.length) errs.push(`${at}: hold.frame out of range`);
        if (!(c.hold.sec > 0)) errs.push(`${at}: hold.sec must be > 0`);
      }
      const total = clipDuration(c);
      let last = -1;
      for (const ev of c.events || []) {
        if (!Array.isArray(ev) || typeof ev[1] !== 'string') { errs.push(`${at}: event must be [time, name]`); continue; }
        if (ev[0] < last) errs.push(`${at}: events out of order`);
        if (ev[0] < 0 || ev[0] > total + 1e-9) errs.push(`${at}: event ${ev[1]} outside the clip`);
        last = ev[0];
      }
      if (attacks.includes(cname) && !(c.events || []).some((e) => e[1] === 'hit')) errs.push(`${at}: attack needs a hit event`);
    }
  }
  if (!d.stages || !Object.keys(d.stages).length) errs.push('stages missing');
  for (const [st, def] of Object.entries(d.stages || {})) {
    if (!['young', 'teen', 'adult', 'spirit'].includes(st)) errs.push(`unknown stage ${st}`);
    if (!d.sets?.[def.set]) errs.push(`stage ${st}: unknown set ${def.set}`);
    if (!(def.scale > 0)) errs.push(`stage ${st}: scale must be > 0`);
  }
  return errs;
}

/**
 * 그림 한 칸 검사. img = { width, height, data(RGBA 바이트) }, (x0, y0)은 칸의 왼쪽 위.
 * 오류: 반투명 점, 팔레트 밖 색, 발밑선 아래 점, (서 있는 장인데) 발밑선에 안 닿음, 빈 칸, 외곽선 끊김, 외딴 점.
 * 경고: 두 겹 외곽선 모서리 수.
 */
export function checkFrame(img, x0, y0, spec) {
  const { frameW: W, frameH: H, foot } = spec;
  const pal = new Set(spec.palette), fxc = new Set(spec.fxColors ?? FX_COLORS);
  const errors = [], warnings = [];
  const at = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const i = ((y0 + y) * img.width + (x0 + x)) * 4, d = img.data;
    return d[i + 3] === 0 ? null : toHex(d[i], d[i + 1], d[i + 2]);
  };
  let semi = 0, below = 0, onFoot = 0, solid = 0, broken = 0, lonely = 0, doubles = 0;
  const offPal = new Set(), used = new Set();
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = img.data[((y0 + y) * img.width + (x0 + x)) * 4 + 3];
    if (a !== 0 && a !== 255) semi++;
    const c = at(x, y); if (!c) continue;
    solid++; used.add(c);
    if (!pal.has(c)) offPal.add(c);
    if (y > foot) below++;
    if (y === foot) onFoot++;
    const nb = N4.map(([dx, dy]) => at(x + dx, y + dy));
    if (nb.every((n) => !n)) lonely++;
    const open = nb.some((n) => !n);
    if (open && c !== OUTLINE && !fxc.has(c)) broken++;
    if (open && c === OUTLINE && !nb.some((n) => n && n !== OUTLINE)) {
      const ks = N4.filter((_, i) => nb[i] === OUTLINE);
      if (ks.length >= 3 || (ks.length === 2 && (ks[0][0] !== -ks[1][0] || ks[0][1] !== -ks[1][1]))) doubles++;
    }
  }
  if (!solid) errors.push('empty frame');
  if (semi) errors.push(`${semi} semi-transparent pixels`);
  if (offPal.size) errors.push(`colors outside palette: ${[...offPal].join(' ')}`);
  if (used.size > MAX_COLORS) errors.push(`${used.size} colors (max ${MAX_COLORS})`);
  if (below) errors.push(`${below} pixels below the foot line y=${foot}`);
  if (spec.standing && solid && !onFoot) errors.push(`standing frame does not touch the foot line y=${foot}`);
  if (broken) errors.push(`${broken} fill pixels touch transparency (outline broken)`);
  if (lonely) errors.push(`${lonely} isolated pixels`);
  if (doubles) warnings.push(`${doubles} doubled outline corners`);
  return { errors, warnings, colors: used.size };
}

/** 시트 전체 검사: 시트 크기가 칸 크기의 배수인지, 칸 수가 frames와 맞는지, 칸마다 checkFrame. */
export function checkSheet(img, d) {
  const out = { errors: [], warnings: [], frames: {} };
  if (img.width !== d.cols * d.frameW) out.errors.push(`sheet width ${img.width} != cols ${d.cols} × ${d.frameW}`);
  const rows = Math.ceil(d.frames.length / d.cols);
  if (img.height !== rows * d.frameH) out.errors.push(`sheet height ${img.height} != rows ${rows} × ${d.frameH}`);
  if (out.errors.length) return out;
  const standing = new Set(d.standing || []);
  d.frames.forEach((name, i) => {
    const r = checkFrame(img, (i % d.cols) * d.frameW, Math.floor(i / d.cols) * d.frameH, { ...d, standing: standing.has(name) });
    out.frames[name] = r;
    for (const e of r.errors) out.errors.push(`${name}: ${e}`);
    for (const w of r.warnings) out.warnings.push(`${name}: ${w}`);
  });
  return out;
}
