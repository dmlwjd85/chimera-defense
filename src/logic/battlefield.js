// 교전 땅(2026-11-27 선생님 "맵은 아래가 땅인데 전투는 공중에서 하는 어색한 상황 → 맵의 땅 부분에서 싸우게").
// 값은 public/data/battlefield.json 한 곳에 둠. 여기는 그 값으로 줄 높이를 계산하는 순수 함수만(시험 가능).

export const BF_DEFAULT = { foot: 34, feetBottom: 558, groundMin: 400, groundMax: 460, minGap: 48, hudTop: 604, nameBelowFoot: 41, flyLift: 40, floorMarks: false, unitShadows: false, ground: {}, landmarks: {} };

export const bfOf = (raw) => ({ ...BF_DEFAULT, ...(raw ?? {}) });

/** 배경(art) 땅 높이: 표에 없으면 가운데 값. 너무 위(하늘)·너무 아래(줄 간격이 좁아짐)로 가지 않게 묶음 */
export function groundOf(bf, art) {
  const b = bfOf(bf);
  const g = b.ground?.[art] ?? Math.round((b.groundMin + b.groundMax) / 2);
  return Math.max(b.groundMin, Math.min(b.groundMax, g));
}

/** 세 라인(위=먼 쪽·가운데·아래=가까운 쪽) 발 높이 */
export function laneFeet(bf, art) {
  const b = bfOf(bf), top = groundOf(b, art), bot = b.feetBottom;
  return [top, Math.round((top + bot) / 2), bot];
}

/** 화면에서 동물·적 묶음(컨테이너)의 y: 발은 묶음 y + foot */
export function fightLaneY(bf, art) {
  const b = bfOf(bf);
  return laneFeet(b, art).map((f) => f - b.foot);
}

/** 같은 라인 안에서 위아래로 비켜 설 수 있는 폭(다른 라인을 넘지 않게) */
export function laneSpread(bf, art) {
  const f = laneFeet(bf, art);
  return Math.floor(Math.min(f[1] - f[0], f[2] - f[1]) * 0.5);
}

/** 교전 중 묶음 y가 머물 범위(위로는 먼 줄보다 조금 위, 아래로는 이름표가 아래 기록판에 닿지 않게) */
export function laneBounds(bf, art) {
  const b = bfOf(bf), y = fightLaneY(b, art);
  return { min: y[0] - 12, max: b.hudTop - b.nameBelowFoot - b.foot };
}

/** 가운데 빈 하늘(땅으로 내려서 생긴 공간)에 띄울 줄 높이: 위 알림(128)과 먼 줄 머리 사이 */
export function midRows(bf, art) {
  const top = fightLaneY(bf, art)[0];
  const rows = [];
  for (let y = 178; y <= top - 96; y += 44) rows.push(y);
  return rows.length ? rows : [178];
}

/**
 * 가운데 연출 자리 찾기: 여러 개가 같이 떠도 겹치지 않게 줄 세움.
 * rows = 줄 y들, w·h = 크기, want = 바라는 가운데 x, busy = 이미 차지한 네모들 {x0,x1,y0,y1}.
 * 바라는 x에서 좌우로 조금씩 옮겨 보고, 안 되면 다음 줄. 끝내 자리가 없으면 null.
 */
export function midPlace({ rows, w, h, want, busy = [], minX = 12, maxX = 1268, gap = 8 }) {
  const clampX = (x) => Math.max(minX + w / 2, Math.min(maxX - w / 2, x));
  const hit = (x, y) => busy.some((b) => x - w / 2 - gap < b.x1 && x + w / 2 + gap > b.x0 && y - h / 2 - gap < b.y1 && y + h / 2 + gap > b.y0);
  for (const y of rows) {
    for (const d of [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6]) {
      const x = Math.round(clampX(want + d * 60));
      if (!hit(x, y)) return { x, y, x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
    }
  }
  return null;
}
