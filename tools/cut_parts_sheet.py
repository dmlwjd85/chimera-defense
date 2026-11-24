# 부위판 → 덩어리를 줄(위→아래)·칸(왼→오) 순서로 정렬해 이름 붙이기
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
im = Image.open(src).convert('RGB'); W, H = im.size
work = im.copy()
for pt in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2)]:
    ImageDraw.floodfill(work, pt, (255, 0, 255), thresh=38)
a = np.array(work); fg = ~((a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255))
fg = ndimage.binary_closing(fg, structure=np.ones((3, 3)), iterations=5)  # 흰 안쪽 털 때문에 갈라진 조각을 붙임
fg = ndimage.binary_fill_holes(fg)
lab, n = ndimage.label(fg)
objs = ndimage.find_objects(lab); sizes = ndimage.sum(fg, lab, range(1, n + 1))
comps = []
for i, (sl, s) in enumerate(zip(objs, sizes)):
    if s < 1500: continue
    comps.append(dict(idx=i + 1, y0=sl[0].start, y1=sl[0].stop, x0=sl[1].start, x1=sl[1].stop, cy=(sl[0].start + sl[0].stop) / 2, cx=(sl[1].start + sl[1].stop) / 2))
comps.sort(key=lambda c: c['cy'])
rows = []
for c in comps:   # 세로로 겹치면 같은 줄
    if rows and c['cy'] < max(r['y1'] for r in rows[-1]) - 10: rows[-1].append(c)
    else: rows.append([c])
order = [c for r in rows for c in sorted(r, key=lambda c: c['cx'])]
print(len(order), 'parts; rows', [len(r) for r in rows])
os.makedirs(out, exist_ok=True)
for name, c in zip(names, order):
    m = ndimage.binary_fill_holes(lab == c['idx'])
    al = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    rgba = im.convert('RGBA'); rgba.putalpha(al)
    rgba.crop((c['x0'], c['y0'], c['x1'], c['y1'])).save(f'{out}/{name}.png')
