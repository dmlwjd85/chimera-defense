// Sound effects. 13 roles play real sound files (public/assets/sfx/); every other effect — and any role whose
// file is missing or fails to load — is synthesized with WebAudio (each sound is a tiny recipe of oscillators and noise).
let ctx = null, master = null, bus = null, noiseBuf = null;
const last = {};
const recent = {};   // name -> start times of the last few plays (for the overlap limit)
const OVERLAP_WINDOW = 0.3, OVERLAP_MAX = 3;   // the same sound: at most 3 starts within 0.3 s
const PITCH_JITTER = 0.08;                     // playback speed varies by +-8 %
export const ENEMY_HIT_DB = -4;                // enemy attacks are 4 dB quieter than ours
const MIN_GAP = { hit: 0.045, slash: 0.05, shoot: 0.05, magic: 0.06, note: 0.12, coin: 0.05, kill: 0.04, dodge: 0.1, heal: 0.2, hold: 0.1 };
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
// sound name -> files in public/assets/sfx/ (several files = variants, played in turn). `dir` '' = CC0 (Kenney),
// 'sonniss' = Sonniss GDC license files that are NOT stored in the public repository (see docs/에셋_출처.md).
// Anything that fails to load simply keeps the synthesized sound below.
export const SOUND_FILES = {
  click: { files: ['click'], dir: 'sonniss' },
  hit: { files: ['hit_light'], dir: 'sonniss' },
  slam: { files: ['hit_heavy'], dir: 'sonniss' },
  shoot: { files: ['shoot'], dir: 'sonniss' },
  magic: { files: ['magic'], dir: 'sonniss' },
  skill: { files: ['magic'], dir: 'sonniss' },       // sfx('skill') (skill effects) shares the magic sound
  shield: { files: ['shield'], dir: '' },
  heal: { files: ['heal'], dir: 'sonniss' },
  kill: { files: ['kill'], dir: 'sonniss' },
  coin: { files: ['coin'], dir: 'sonniss' },
  evolve: { files: ['evolve'], dir: 'sonniss' },
  clear: { files: ['win'], dir: '' },
  lose: { files: ['lose'], dir: '' },
  boss: { files: ['boss'], dir: 'sonniss' },
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
      const raw = await fetchBuf(`${FILE_BASE}${dir ? dir + '/' : ''}${file}.${ext}`);
      buffers[key] = await new Promise((res, rej) => ctx.decodeAudioData(raw, res, rej));
      return;
    } catch { /* try the next format, then give up quietly (synth stays) */ }
  }
}
function loadAll() {
  if (loadStarted || !ctx) return;
  loadStarted = true;
  const seen = new Set();
  for (const d of Object.values(SOUND_FILES)) for (const f of d.files) { const k = `${d.dir}/${f}`; if (!seen.has(k)) { seen.add(k); loadFile(d.dir, f); } }
}
/** AudioBuffer to play for `name`, rotating through variants; null when no file is loaded (-> synth). */
function pickBuffer(name) {
  const d = SOUND_FILES[name];
  if (!d) return null;
  const n = d.files.length;
  for (let k = 1; k <= n; k++) {
    const i = ((rotate[name] ?? -1) + k) % n;
    const b = buffers[`${d.dir}/${d.files[i]}`];
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

const SOUNDS = {
  click: () => tone('triangle', 900, 900, 0.05, 0.15),
  hit: () => { noise(0.07, 0.35, 0, { type: 'bandpass', f: 1800, q: 1.2 }); tone('square', 220, 110, 0.06, 0.08); },
  slash: () => noise(0.12, 0.3, 0, { type: 'highpass', f: 1200 }, 6000),
  shoot: () => tone('square', 320, 900, 0.08, 0.1, 0, { lp: 2500 }),
  magic: () => { tone('sine', 700, 1400, 0.18, 0.15, 0, { vib: 18, vibDepth: 40 }); tone('triangle', 1400, 2100, 0.12, 0.06, 0.04); },
  note: () => { const r = [72, 76, 79, 84][Math.floor(Math.random() * 4)]; tone('triangle', N(r), N(r), 0.18, 0.12); tone('sine', N(r + 12), N(r + 12), 0.12, 0.05, 0.02); },
  bolt: () => { noise(0.2, 0.3, 0, { type: 'highpass', f: 2500 }); tone('sawtooth', 1800, 200, 0.18, 0.08); },
  fire: () => { noise(0.35, 0.25, 0, { type: 'lowpass', f: 900 }, 300); tone('sawtooth', 200, 90, 0.3, 0.06, 0, { lp: 600 }); },
  coin: () => { tone('sine', 988, 988, 0.08, 0.15); tone('sine', 1319, 1319, 0.2, 0.15, 0.07); },
  kill: () => { tone('sine', 420, 70, 0.18, 0.25); noise(0.12, 0.2, 0, { type: 'lowpass', f: 1500 }); },
  bigKill: () => { tone('sawtooth', 160, 40, 0.8, 0.3, 0, { lp: 800 }); noise(0.9, 0.35, 0, { type: 'lowpass', f: 2000 }, 200); [60, 64, 67, 72].forEach((n, i) => tone('triangle', N(n), N(n), 0.5, 0.12, 0.25 + i * 0.09)); },
  summon: () => [60, 64, 67, 72].forEach((n, i) => tone('triangle', N(n + 12), N(n + 12), 0.14, 0.12, i * 0.07)),
  reveal: () => { tone('sine', N(84), N(84), 0.5, 0.12, 0, { vib: 6, vibDepth: 6 }); tone('sine', N(91), N(91), 0.5, 0.08, 0.06); },
  evolve: () => { [67, 71, 74, 79, 83].forEach((n, i) => tone('triangle', N(n), N(n), 0.3, 0.12, i * 0.06)); noise(0.6, 0.08, 0, { type: 'highpass', f: 6000 }); },
  spirit: () => { [60, 67, 72, 76, 79, 84].forEach((n, i) => tone('sine', N(n), N(n), 1.2, 0.12, i * 0.08, { vib: 5, vibDepth: 4 })); tone('triangle', N(96), N(96), 1.4, 0.06, 0.5); },
  chimera: () => { noise(0.5, 0.25, 0, { type: 'bandpass', f: 400, q: 3 }, 3000); [57, 60, 64, 69, 72].forEach((n, i) => tone('sawtooth', N(n), N(n), 0.6, 0.06, 0.4 + i * 0.07, { lp: 2200 })); },
  weak: () => { tone('sawtooth', 220, 200, 0.25, 0.15, 0, { lp: 700 }); tone('sawtooth', 196, 170, 0.25, 0.15, 0.28, { lp: 700 }); tone('sawtooth', 174, 110, 0.6, 0.15, 0.56, { lp: 700, vib: 7, vibDepth: 8 }); },
  roar: () => { tone('sawtooth', 110, 70, 0.6, 0.3, 0, { lp: 500, vib: 30, vibDepth: 15 }); noise(0.6, 0.3, 0, { type: 'lowpass', f: 700 }); },
  slam: () => { tone('sine', 110, 35, 0.35, 0.45); noise(0.25, 0.35, 0, { type: 'lowpass', f: 600 }); },
  stampede: () => { for (let i = 0; i < 6; i++) { tone('sine', 90, 40, 0.15, 0.3, i * 0.09); noise(0.1, 0.2, i * 0.09, { type: 'lowpass', f: 500 }); } },
  howl: () => tone('sine', 380, 720, 1.0, 0.18, 0, { glide: 0.4, vib: 5, vibDepth: 18, attack: 0.15 }),
  tongue: () => tone('sine', 180, 900, 0.16, 0.22),
  charm: () => [88, 91, 95].forEach((n, i) => tone('sine', N(n), N(n), 0.2, 0.08, i * 0.05)),
  hold: () => { tone('square', 140, 140, 0.1, 0.08, 0, { lp: 900 }); noise(0.08, 0.15, 0, { type: 'bandpass', f: 3000, q: 4 }); },
  stance: () => { tone('sine', 300, 600, 0.4, 0.15); tone('triangle', 600, 600, 0.4, 0.05, 0.1, { vib: 8 }); },
  crow: () => { tone('sawtooth', 600, 1100, 0.12, 0.12, 0, { lp: 3000 }); tone('sawtooth', 1100, 700, 0.35, 0.12, 0.12, { lp: 3000, vib: 12, vibDepth: 40 }); },
  shield: () => { tone('sine', 1200, 1200, 0.5, 0.1, 0, { vib: 9, vibDepth: 20 }); tone('sine', 1800, 1800, 0.4, 0.05); },
  shatter: () => { noise(0.5, 0.35, 0, { type: 'highpass', f: 3000 }, 8000); [96, 100, 103].forEach((n, i) => tone('sine', N(n), N(n), 0.25, 0.06, i * 0.03)); },
  bossSummon: () => { noise(0.5, 0.2, 0, { type: 'bandpass', f: 800, q: 2 }, 200); tone('sawtooth', 300, 120, 0.4, 0.08, 0, { lp: 1200 }); },
  wave: () => { tone('sawtooth', N(55), N(55), 0.35, 0.15, 0, { lp: 1200, attack: 0.05 }); tone('sawtooth', N(62), N(62), 0.5, 0.15, 0.3, { lp: 1200, attack: 0.05 }); },
  boss: () => { [41, 48, 53].forEach((n) => tone('sawtooth', N(n), N(n), 1.4, 0.12, 0, { lp: 900, attack: 0.3, vib: 4, vibDepth: 2 })); noise(1.2, 0.12, 0.1, { type: 'lowpass', f: 300 }); },
  leak: () => { tone('sine', 90, 50, 0.3, 0.4); tone('square', 120, 110, 0.3, 0.06, 0.05, { lp: 500 }); },
  down: () => [67, 63, 58].forEach((n, i) => tone('triangle', N(n), N(n), 0.12, 0.1, i * 0.08)),
  respawn: () => [60, 67, 72].forEach((n, i) => tone('triangle', N(n), N(n), 0.12, 0.1, i * 0.06)),
  dodge: () => noise(0.15, 0.2, 0, { type: 'bandpass', f: 600, q: 2 }, 3000),
  heal: () => tone('sine', N(84), N(88), 0.3, 0.06, 0, { vib: 6 }),
  bond: () => { tone('sine', N(81), N(81), 0.15, 0.12); tone('sine', N(85), N(85), 0.25, 0.12, 0.12); },
  clang: () => { tone('square', 1760, 1500, 0.09, 0.07); tone('triangle', 2640, 2300, 0.22, 0.06, 0.01, { vib: 14, vibDepth: 30 }); noise(0.08, 0.2, 0, { type: 'highpass', f: 5000 }); },
  clash: () => { noise(0.12, 0.25, 0, { type: 'highpass', f: 4000 }); tone('square', 900, 300, 0.1, 0.08); },
  hundred: () => [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone('triangle', N(n), N(n), 0.25, 0.1, i * 0.06)),
  clear: () => [[72, 0], [72, 0.15], [72, 0.3], [76, 0.45], [79, 0.7], [76, 0.9], [79, 1.05], [84, 1.25]].forEach(([n, t]) => { tone('square', N(n), N(n), 0.2, 0.07, t, { lp: 3000 }); tone('triangle', N(n - 12), N(n - 12), 0.22, 0.08, t); }),
  lose: () => [[67, 0], [63, 0.3], [60, 0.6], [55, 0.9]].forEach(([n, t]) => tone('sawtooth', N(n), N(n), 0.35, 0.08, t, { lp: 1200 })),
  skill: () => { tone('sine', 520, 1040, 0.22, 0.14, 0, { vib: 14, vibDepth: 30 }); tone('triangle', 1040, 1560, 0.16, 0.06, 0.05); },
  bait: () => { tone('sine', 500, 700, 0.1, 0.12); tone('sine', 700, 1000, 0.1, 0.1, 0.08); },
};

/**
 * Play a named sound. Throttled per name, and the same sound starts at most 3 times within 0.3 s.
 * `db` = volume offset in decibels (enemy attacks pass ENEMY_HIT_DB). Real file when loaded, otherwise the synth recipe.
 */
export function sfx(name, db = 0) {
  if (muted || !SOUNDS[name]) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  loadAll();
  const now = c.currentTime;
  if (now - (last[name] ?? -9) < (MIN_GAP[name] ?? 0.03)) return;
  const r = (recent[name] ??= []).filter((t) => now - t < OVERLAP_WINDOW);
  recent[name] = r;
  if (r.length >= OVERLAP_MAX) return;
  last[name] = now; r.push(now);
  const dd = dbg(); if (dd) ((dd.__t ??= {})[name] ??= []).push(+now.toFixed(3));
  const lvl = typeof db === 'number' && isFinite(db) ? db : 0;
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
