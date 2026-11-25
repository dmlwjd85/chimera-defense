// 폰 튕김 추적(2026-11-25): 전투 중 1초마다 상태를 남겨서, 튕긴 뒤 다시 열면 어디서 멈췄는지 볼 수 있음.
// 주소 끝에 ?debug=1 → 화면 왼쪽 위에 지난 기록·오류와 지금 FPS·메모리를 띄움.
const KEY = 'chimera-crumb';
export const debugOn = (() => { try { return new URLSearchParams(location.search).get('debug') === '1'; } catch { return false; } })();

const heap = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) + 'MB' : '-');

/** One line of the battle state, kept in localStorage. */
export function crumb(scene) {
  const s = scene.state, g = scene.game;
  const line = { at: new Date().toISOString().slice(11, 19), stage: s?.stage?.id, phase: s?.phase, wave: s?.wave, t: Math.round(s?.time ?? 0), field: s?.field.length, enemies: s?.enemies.length,
    fps: Math.round(g.loop.actualFps), heap: heap(), tex: Object.keys(g.textures.list).length, objs: scene.children.length, K: window.__K, half: !!window.__artHalf };
  try { const list = JSON.parse(localStorage.getItem(KEY) || '[]'); list.push(line); localStorage.setItem(KEY, JSON.stringify(list.slice(-12))); } catch { /* ignore */ }
  if (debugOn) showDebug(scene, line);
}

/** Overlay with the last session's crumbs and errors (debug only). */
export function showDebug(scene, now) {
  if (!debugOn) return;
  let prev = [];
  try { prev = JSON.parse(localStorage.getItem(KEY + '-prev') || '[]'); } catch { /* ignore */ }
  const errs = window.__errors?.() ?? [];
  const ua = navigator.userAgent.replace(/^Mozilla\/5.0 /, '').slice(0, 90);
  const lines = [
    `UA ${ua}`,
    `화면 ${innerWidth}×${innerHeight} dpr ${devicePixelRatio} K ${window.__K} half ${!!window.__artHalf} gl ${scene.game.renderer.type === 2 ? 'webgl' : 'canvas'}`,
    now ? `지금 ${JSON.stringify(now)}` : '',
    '— 지난번 마지막 기록 —', ...prev.slice(-4).map((l) => JSON.stringify(l)),
    '— 오류 —', ...errs.slice(0, 4).map((e) => `${e.at?.slice(11, 19)} ${e.where} ${e.msg} ${e.stack?.slice(0, 120)}`),
  ].filter(Boolean);
  if (!scene.__dbg) scene.__dbg = scene.add.text(6, 104, '', { fontSize: '11px', color: '#ffffff', backgroundColor: '#000000cc', wordWrap: { width: 1260 } }).setDepth(99999).setScrollFactor(0);
  scene.__dbg.setText(lines.join('\n'));
}

/** Call once at boot: move the last session's crumbs aside so they survive this run. */
export function rotateCrumbs() {
  try { const cur = localStorage.getItem(KEY); if (cur) { localStorage.setItem(KEY + '-prev', cur); localStorage.removeItem(KEY); } } catch { /* ignore */ }
}
