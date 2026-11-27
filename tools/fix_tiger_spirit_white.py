# 산군(호랑이 신화급) 흰 털 바로잡기(2026-11-27 사용자 "산군 이미지 이상한데"):
#  PixelLab이 흰 털을 배경으로 지워 구멍 → 회색 한 가지로 메운 탓에 얼굴·몸이 납작한 회색 덩어리로 보임.
#  메운 자리(예전 시트에서 투명)는 흰 털(#f4f1fa), 예전 크림 선(#efd4c5) 자리는 옅은 회색 결(#ccc7de)로 1:1 칸 색만 바꿈(새로 그리거나 붙이지 않음).
#  덧그린 이펙트 장(파란 베기 자국·머리 위 고리·맞을 때 별 터짐)은 동작에서 뺌.
#  쓰는 법: python3 tools/fix_tiger_spirit_white.py <예전 시트 png> <예전 dot.json>   (예전 = git 7d04c87, 구멍 메우기 전)
import json, sys
from PIL import Image
OLD_PNG, OLD_JSON = sys.argv[1], sys.argv[2]
SHEET, DOT = 'public/assets/dotm/tiger_spirit.png', 'public/data/dotm/tiger_spirit.dot.json'
FUR, WHITE, LINE, CREAM = (191, 189, 210), (244, 241, 250), (204, 199, 222), (239, 212, 197)
DROP = {'attack': ['tiger_myth_a1_02', 'tiger_myth_a1_04', 'tiger_myth_a1_05'], 'attack2': ['tiger_myth_a2_03', 'tiger_myth_a2_04'], 'hit': ['tiger_myth_hit_00', 'tiger_myth_hit_01']}
o, n = json.load(open(OLD_JSON)), json.load(open(DOT))
os_, ns = Image.open(OLD_PNG).convert('RGBA'), Image.open(SHEET).convert('RGBA')
po, pn = os_.load(), ns.load()
for k, r in n['rects'].items():
    ro = o['rects'][k]
    for dy in range(r[3]):
        for dx in range(r[2]):
            b = pn[r[0] + dx, r[1] + dy]
            if b[3] == 0 or b[:3] != FUR: continue
            a = po[ro[0] + dx, ro[1] + dy]
            pn[r[0] + dx, r[1] + dy] = (*(LINE if a[3] and a[:3] == CREAM else WHITE), 255)
# 16색 한도: 아주 어두운 붉은 #4c0d1e는 테두리 #291a1f로 합침
for y in range(ns.height):
    for x in range(ns.width):
        q = pn[x, y]
        if q[3] and q[:3] == (0x4c, 0x0d, 0x1e): pn[x, y] = (0x29, 0x1a, 0x1f, q[3])
ns.save(SHEET, optimize=True)
pal = [p for p in n['palette'] if p.lower() not in ('#bfbdd2', '#4c0d1e')] + ['#f4f1fa', '#ccc7de']
n['palette'] = sorted(set(pal))
for m, names in DROP.items():
    c = n['sets']['myth'][m]
    keep = [i for i, f in enumerate(c['frames']) if f not in names]
    if len(keep) == len(c['frames']): continue
    c['frames'] = [c['frames'][i] for i in keep]; c['durs'] = [c['durs'][i] for i in keep]
    if 'hold' in c and c['hold']['frame'] >= len(c['frames']): c['hold']['frame'] = len(c['frames']) - 1
open(DOT, 'w').write(json.dumps(n, ensure_ascii=False, indent=1) + '\n')
print('ok', {m: len(n['sets']['myth'][m]['frames']) for m in DROP}, len(n['palette']), 'colors')
