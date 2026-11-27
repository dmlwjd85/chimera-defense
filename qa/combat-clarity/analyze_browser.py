# browser_probe 결과 분석: 체력바가 실제로 줄어든 양 vs 화면에 뜬 숫자, 회복(숫자 없음), 바가 먼저 줄고 숫자가 늦게 뜬 시간
import json, sys
r = json.load(open(sys.argv[1]))
hp = r['hp']; names = r['names']
keys = set(k for row in hp for k in row if k != 't')
drops, rises = [], []
for k in keys:
    prev = None
    for row in hp:
        if k not in row: continue
        if prev is not None and row[k] < prev - 0.05: drops.append((row['t'], k, prev - row[k]))
        if prev is not None and row[k] > prev + 0.05: rises.append((row['t'], k, row[k] - prev))
        prev = row[k]
shown = r['shown']
def side(k): return 'u' if k.startswith('u') else 'e'
out = {}
for sd in 'ue':
    D = [d for d in drops if side(d[1]) == sd]; S = [s for s in shown if s['who'] and side(s['who']) == sd]
    out[sd] = dict(drop_steps=len(D), drop_total=round(sum(d[2] for d in D)), shown_n=len(S), shown_total=sum(s['d'] for s in S))
heals = [x for x in rises]
out['heal_steps'] = len(heals); out['heal_total'] = round(sum(h[2] for h in heals))
out['heal_by_side'] = {sd: round(sum(h[2] for h in heals if side(h[1]) == sd)) for sd in 'ue'}
# 숫자 지연: 숫자가 뜬 대상의 가장 가까운 앞선 체력 감소와의 시간 차(게임 초)
lags = []
for s in shown:
    c = [d for d in drops if d[1] == s['who'] and d[0] <= s['t'] + 0.01 and s['t'] - d[0] < 3]
    if c: lags.append(round(s['t'] - max(c)[0], 2))
out['lag_game_s'] = dict(n=len(lags), avg=round(sum(lags) / max(1, len(lags)), 2), max=max(lags) if lags else None)
# 숫자 vs 실제: 숫자가 뜬 대상의 '숫자 뜨기 전 1초' 실제 감소량 비교 몇 개
ex = []
for s in shown[:40]:
    c = [d for d in drops if d[1] == s['who'] and s['t'] - 1.2 <= d[0] <= s['t'] + 0.01]
    ex.append(dict(t=round(s['t'], 2), who=names.get(s['who'], s['who']), shown=s['d'], real_drop_1s=round(sum(d[2] for d in c), 1)))
out['examples'] = ex
print(json.dumps(out, ensure_ascii=False, indent=1))
