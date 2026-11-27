// Sound effects. Only clear (승리 징글, 음이 올라감) plays a Kenney CC0 file in public/assets/sfx/ (2026-11-27: 파일 음높이를 재 보니 evolve 344→301Hz·lose·boss는 내려가고 click은 236Hz 둔탁 → 모두 밝은 합성음으로).
// Battle roles (hit, slam, shoot, kill, magic, skill, shield, heal) use the original WebAudio synth (same recipes as before PR #62).
// Every other effect — and any file role that fails to load — is also synthesized.
let ctx = null, master = null, bus = null, noiseBuf = null;
const last = {};
const recent = {};   // name -> start times of the last few plays (for the overlap limit)
const OVERLAP_WINDOW = 0.3, OVERLAP_MAX = 3;   // the same sound: at most 3 starts within 0.3 s
const PITCH_JITTER = 0.08;                     // playback speed varies by +-8 %
export const ENEMY_HIT_DB = -4;                // kept for compatibility; not applied to rolled-back battle synths
const MIN_GAP = { hit: 0.045, slash: 0.05, shoot: 0.05, magic: 0.06, skill: 0.06, note: 0.12, coin: 0.05, kill: 0.04, dodge: 0.1, heal: 0.2, hold: 0.1 };
// Battle synths keep the old MIN_GAP only (no 0.3 s / 3-start cap — that cap would thin out rapid hits).
const SYNTH_ONLY = new Set(['hit', 'slam', 'shoot', 'kill', 'magic', 'skill', 'shield', 'heal']);
let muted = false;
try { muted = localStorage.getItem('chimera-mute') === '1'; } catch { /* storage may be blocked */ }

function ensure() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; bus = master;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadAll();   // start loading the sound files right away (until they arrive, the synth plays)
  return ctx;
}

/** Call from any user gesture so browsers allow sound. */
export function unlockAudio() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
export function isMuted() { return muted; }
export function setMuted(m) { muted = m; try { localStorage.setItem('chimera-mute', m ? '1' : '0'); } catch { /* ignore */ } }

// ---- real sound files ----------------------------------------------------------------------------
// sound name -> files in public/assets/sfx/ (several files = variants, played in turn). All of them are Kenney CC0
// (see docs/에셋_출처.md). Anything that fails to load simply keeps the synthesized sound below.
export const SOUND_FILES = {
  clear: { files: ['win'] },
};
const FILE_BASE = 'assets/sfx/';
const buffers = {};        // 'dir/file' -> AudioBuffer (only when loaded and decoded)
const rotate = {};         // name -> index of the variant played last
let loadStarted = false;
const dbg = () => (typeof window !== 'undefined' && window.__sfxDebug ? (window.__sfxPlays ??= {}) : null);

function fetchBuf(url) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', url); x.responseType = 'arraybuffer';
    x.onload = () => ((x.status === 200 || (x.status === 0 && x.response && x.response.byteLength)) ? res(x.response) : rej(new Error('http ' + x.status)));
    x.onerror = () => rej(new Error('network'));
    x.send();
  });
}
async function loadFile(dir, file) {
  const key = `${dir}/${file}`;
  for (const ext of ['ogg', 'mp3']) {
    try {
      const raw = await fetchBuf(`${FILE_BASE}${file}.${ext}`);
      buffers[key] = await new Promise((res, rej) => ctx.decodeAudioData(raw, res, rej));
      return;
    } catch { /* try the next format, then give up quietly (synth stays) */ }
  }
}
function loadAll() {
  if (loadStarted || !ctx) return;
  loadStarted = true;
  const seen = new Set();
  for (const d of Object.values(SOUND_FILES)) for (const f of d.files) { if (!seen.has(f)) { seen.add(f); loadFile('', f); } }
}
/** AudioBuffer to play for `name`, rotating through variants; null when no file is loaded (-> synth). */
function pickBuffer(name) {
  const d = SOUND_FILES[name];
  if (!d) return null;
  const n = d.files.length;
  for (let k = 1; k <= n; k++) {
    const i = ((rotate[name] ?? -1) + k) % n;
    const b = buffers[`/${d.files[i]}`];
    if (b) { rotate[name] = i; return { b, file: d.files[i] }; }
  }
  return null;
}
function playBuffer(b, db) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = b;
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * PITCH_JITTER;
  g.gain.value = Math.pow(10, db / 20);
  src.connect(g); g.connect(master);
  src.start(t);
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(type, f0, f1, dur, vol = 0.3, delay = 0, opts = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * (opts.glide ?? 1));
  if (opts.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = opts.vib; lg.gain.value = opts.vibDepth ?? 12; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
  let node = o;
  if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
  node.connect(g); g.connect(bus);
  env(g, t, opts.attack ?? 0.005, vol, dur);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.3, delay = 0, filt = { type: 'bandpass', f: 1200, q: 1 }, sweepTo = null) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = filt.type; f.frequency.setValueAtTime(filt.f, t); f.Q.value = filt.q ?? 1;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  s.connect(f); f.connect(g); g.connect(bus);
  env(g, t, 0.003, vol, dur);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 2026-11-27: 밝은 소리로 바꿈 — 낮은 톱니파·둔탁한 저음 대신 삼각파·사인파, 장조 음, 위로 올라가는 '퐁·띵·뿅'.
// 아이들 게임이라 맞기·쓰러짐·보스도 무섭지 않게(만화처럼 통통 튀게).
const jit = (f) => f * (1 + (Math.random() * 2 - 1) * 0.06);
const SOUNDS = {
  click: () => tone('triangle', 1200, 1500, 0.05, 0.13),
  // 맞기: 통! 하고 튀는 소리(위로 살짝)
  hit: () => { const f = jit(620); tone('triangle', f, f * 1.6, 0.06, 0.16); noise(0.04, 0.12, 0, { type: 'highpass', f: 4500 }); },
  slash: () => { noise(0.09, 0.2, 0, { type: 'highpass', f: 2500 }, 9000); tone('sine', jit(1500), jit(2200), 0.07, 0.06, 0.02); },
  shoot: () => tone('sine', jit(650), jit(1500), 0.08, 0.12),   // 뿅
  magic: () => { tone('sine', 900, 1800, 0.16, 0.13, 0, { vib: 18, vibDepth: 40 }); tone('triangle', N(91), N(91), 0.14, 0.06, 0.05); tone('triangle', N(96), N(96), 0.12, 0.05, 0.1); },
  note: () => { const r = [76, 79, 81, 84][Math.floor(Math.random() * 4)]; tone('triangle', N(r), N(r), 0.18, 0.12); tone('sine', N(r + 12), N(r + 12), 0.12, 0.05, 0.02); },
  bolt: () => { noise(0.12, 0.2, 0, { type: 'highpass', f: 4000 }); tone('triangle', 2200, 900, 0.12, 0.08); tone('sine', N(88), N(88), 0.1, 0.05, 0.08); },
  fire: () => { noise(0.25, 0.18, 0, { type: 'bandpass', f: 2200, q: 1.5 }, 5000); tone('triangle', 500, 1100, 0.2, 0.06); },
  coin: () => { tone('sine', 1319, 1319, 0.07, 0.15); tone('sine', 1976, 1976, 0.2, 0.14, 0.06); },
  // 쓰러뜨림: 퐁 + 반짝(위로)
  kill: () => { const f = jit(700); tone('triangle', f, f * 2, 0.09, 0.18); tone('sine', N(91), N(91), 0.16, 0.08, 0.06); },
  bigKill: () => { [72, 76, 79, 84, 88].forEach((n, i) => tone('triangle', N(n), N(n), 0.35, 0.13, i * 0.07)); noise(0.5, 0.08, 0.1, { type: 'highpass', f: 6000 }); tone('sine', N(96), N(96), 0.6, 0.06, 0.4, { vib: 6, vibDepth: 8 }); },
  summon: () => [72, 76, 79, 84].forEach((n, i) => tone('triangle', N(n), N(n), 0.14, 0.12, i * 0.07)),
  reveal: () => { tone('sine', N(84), N(84), 0.5, 0.12, 0, { vib: 6, vibDepth: 6 }); tone('sine', N(91), N(91), 0.5, 0.08, 0.06); },
  // 진화: 아래에서 위로 쭉 올라가는 도-미-솔-도-미 + 위로 휘익 + 반짝(점점 올라감)
  evolve: () => { tone('sine', 400, 1600, 0.35, 0.08, 0, { glide: 1 }); [72, 76, 79, 84, 88].forEach((n, i) => tone('triangle', N(n), N(n), 0.28, 0.12, 0.05 + i * 0.07)); tone('sine', N(96), N(96), 0.5, 0.06, 0.42, { vib: 6, vibDepth: 8 }); noise(0.5, 0.05, 0.1, { type: 'highpass', f: 7000 }); },
  spirit: () => { [60, 67, 72, 76, 79, 84].forEach((n, i) => tone('sine', N(n + 5), N(n + 5), 1.0, 0.11, i * 0.08, { vib: 5, vibDepth: 4 })); tone('triangle', N(96), N(96), 1.2, 0.06, 0.5); },
  // 키메라: 휘리릭 올라가는 바람 + 반짝이는 장조 화음
  chimera: () => { noise(0.4, 0.15, 0, { type: 'bandpass', f: 800, q: 3 }, 6000); [72, 76, 79, 84, 88].forEach((n, i) => tone('triangle', N(n), N(n), 0.45, 0.08, 0.3 + i * 0.07)); },
  // 슬라임(실패): 무섭지 않은 만화 '뾰옹~'
  weak: () => { tone('triangle', 700, 380, 0.22, 0.13, 0, { vib: 9, vibDepth: 30 }); tone('triangle', 520, 300, 0.4, 0.12, 0.22, { vib: 7, vibDepth: 40 }); },
  // 포효: 귀여운 '어흥'(낮지 않게, 떨림)
  roar: () => { tone('triangle', 520, 330, 0.45, 0.2, 0, { lp: 3000, vib: 24, vibDepth: 22 }); noise(0.3, 0.1, 0, { type: 'bandpass', f: 1500, q: 1 }); },
  // 쾅: 통통 튀는 '봉!'
  slam: () => { tone('sine', jit(260), jit(520), 0.14, 0.32); noise(0.08, 0.16, 0, { type: 'bandpass', f: 1600, q: 1 }); tone('triangle', N(84), N(84), 0.1, 0.06, 0.05); },
  stampede: () => { for (let i = 0; i < 5; i++) { tone('sine', 280 + i * 40, 520 + i * 60, 0.1, 0.18, i * 0.08); noise(0.05, 0.08, i * 0.08, { type: 'bandpass', f: 1800 }); } },
  howl: () => tone('sine', 520, 980, 0.8, 0.16, 0, { glide: 0.4, vib: 5, vibDepth: 18, attack: 0.12 }),
  tongue: () => tone('sine', 300, 1300, 0.14, 0.2),
  charm: () => [88, 91, 95].forEach((n, i) => tone('sine', N(n), N(n), 0.2, 0.08, i * 0.05)),
  hold: () => { tone('triangle', 1300, 1000, 0.05, 0.12); tone('triangle', 1600, 1300, 0.05, 0.08, 0.06); },   // 톡톡(나무 막대)
  stance: () => { tone('sine', 500, 1000, 0.3, 0.13); tone('triangle', 1000, 1000, 0.3, 0.05, 0.1, { vib: 8 }); },
  crow: () => { tone('triangle', 900, 1500, 0.1, 0.11); tone('triangle', 1300, 1800, 0.18, 0.09, 0.1, { vib: 12, vibDepth: 40 }); },
  shield: () => { tone('sine', 1200, 1200, 0.45, 0.1, 0, { vib: 9, vibDepth: 20 }); tone('sine', 1800, 1800, 0.4, 0.05); },
  shatter: () => { noise(0.4, 0.25, 0, { type: 'highpass', f: 4000 }, 9000); [96, 100, 103].forEach((n, i) => tone('sine', N(n), N(n), 0.25, 0.06, i * 0.03)); },
  // 보스가 졸개를 부름: 마법 휘리릭(무섭지 않게)
  bossSummon: () => { tone('sine', 500, 1300, 0.35, 0.1, 0, { vib: 10, vibDepth: 40 }); [84, 88].forEach((n, i) => tone('triangle', N(n), N(n), 0.15, 0.06, 0.2 + i * 0.08)); },
  // 교전 시작: 밝은 나팔 셋
  wave: () => [[72, 0], [76, 0.14], [79, 0.28]].forEach(([n, t]) => tone('square', N(n), N(n), 0.18, 0.06, t, { lp: 3200, attack: 0.02 })),
  // 보스 등장: 웅장하지만 밝은 장조 팡파르
  boss: () => { [[60, 0], [64, 0.18], [67, 0.36], [72, 0.6]].forEach(([n, t]) => { tone('square', N(n), N(n), 0.32, 0.07, t, { lp: 2600, attack: 0.02 }); tone('triangle', N(n - 12), N(n - 12), 0.34, 0.08, t); }); tone('sine', N(84), N(84), 0.8, 0.05, 0.6, { vib: 5, vibDepth: 6 }); },
  leak: () => { tone('sine', 880, 660, 0.12, 0.12); tone('sine', 660, 520, 0.18, 0.1, 0.12); },   // 앗(살짝)
  down: () => { tone('triangle', N(79), N(74), 0.16, 0.1); tone('sine', N(86), N(86), 0.12, 0.04, 0.1); },   // 퓨~(가볍게)
  respawn: () => [67, 72, 79].forEach((n, i) => tone('triangle', N(n), N(n), 0.12, 0.1, i * 0.06)),
  dodge: () => { noise(0.12, 0.15, 0, { type: 'bandpass', f: 1200, q: 2 }, 5000); tone('sine', 1200, 2000, 0.08, 0.05, 0.03); },
  heal: () => tone('sine', N(84), N(88), 0.3, 0.06, 0, { vib: 6 }),
  bond: () => { tone('sine', N(81), N(81), 0.15, 0.12); tone('sine', N(85), N(85), 0.25, 0.12, 0.12); },
  clang: () => { tone('triangle', 1760, 1760, 0.12, 0.08); tone('sine', 2640, 2640, 0.2, 0.05, 0.01, { vib: 14, vibDepth: 30 }); noise(0.05, 0.12, 0, { type: 'highpass', f: 6000 }); },
  clash: () => { noise(0.08, 0.15, 0, { type: 'highpass', f: 5000 }); tone('triangle', 1200, 1600, 0.08, 0.08); },
  hundred: () => [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone('triangle', N(n + 5), N(n + 5), 0.25, 0.1, i * 0.06)),
  clear: () => [[72, 0], [72, 0.15], [72, 0.3], [76, 0.45], [79, 0.7], [76, 0.9], [79, 1.05], [84, 1.25]].forEach(([n, t]) => { tone('square', N(n), N(n), 0.2, 0.07, t, { lp: 3000 }); tone('triangle', N(n - 12), N(n - 12), 0.22, 0.08, t); }),
  // 졌을 때: 슬프지 않게 '아이고~' 정도(부드러운 삼각파, 끝은 장조로 다독임)
  lose: () => { [[76, 0], [72, 0.22], [69, 0.44]].forEach(([n, t]) => tone('triangle', N(n), N(n), 0.3, 0.09, t)); tone('sine', N(72), N(72), 0.6, 0.06, 0.72, { vib: 5, vibDepth: 5 }); tone('sine', N(76), N(76), 0.6, 0.05, 0.72); },
  skill: () => SOUNDS.magic(),
  bait: () => { tone('sine', 700, 1000, 0.1, 0.12); tone('sine', 1000, 1400, 0.1, 0.1, 0.08); },
};

/**
 * Play a named sound. File roles: at most 3 starts within 0.3 s, optional `db` volume offset, pitch jitter in playBuffer.
 * Battle synths (SYNTH_ONLY): old MIN_GAP only, no overlap cap, no pitch jitter, `db` ignored (exact old sound).
 */
export function sfx(name, db = 0) {
  if (muted || !SOUNDS[name]) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  loadAll();
  const now = c.currentTime;
  if (now - (last[name] ?? -9) < (MIN_GAP[name] ?? 0.03)) return;
  if (!SYNTH_ONLY.has(name)) {
    const r = (recent[name] ??= []).filter((t) => now - t < OVERLAP_WINDOW);
    recent[name] = r;
    if (r.length >= OVERLAP_MAX) return;
    r.push(now);
  }
  last[name] = now;
  const dd = dbg(); if (dd) ((dd.__t ??= {})[name] ??= []).push(+now.toFixed(3));
  const lvl = SYNTH_ONLY.has(name) ? 0 : (typeof db === 'number' && isFinite(db) ? db : 0);
  try {
    const p = pickBuffer(name);
    if (p) { playBuffer(p.b, lvl); if (dd) { (dd[name] ??= { file: 0, synth: 0, files: {} }).file++; dd[name].files[p.file] = (dd[name].files[p.file] ?? 0) + 1; } return; }
    const prev = bus;
    if (lvl) { bus = ctx.createGain(); bus.gain.value = Math.pow(10, lvl / 20); bus.connect(master); }
    try { SOUNDS[name](); } finally { bus = prev; }
    if (dd) (dd[name] ??= { file: 0, synth: 0, files: {} }).synth++;
  } catch { /* ignore audio errors */ }
}

export const SOUND_NAMES = Object.keys(SOUNDS);
