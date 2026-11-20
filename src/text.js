// Screen text lives in public/data/text.json (Korean). Code uses keys only.
export const FONT = '"Noto Sans KR", "Malgun Gothic", sans-serif';

export function makeT(dict) {
  return (key, vars = {}) =>
    String(dict?.[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
