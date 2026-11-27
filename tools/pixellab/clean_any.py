# 적 원화 규칙 맞춤: out/en_<id>/c<k>.png → pick/en_<id>.png
# 외곽선 #291a1f, 불투명 색 16 이하(외곽선 포함), 외딴 점 0, 반투명 0, 발밑선 = 맨 아래 줄 위 2칸
# python3 clean_enemy.py <id> <k>
import sys, numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans
OUT = np.array([0x29, 0x1a, 0x1f]); N4 = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)
src, dst = sys.argv[1], sys.argv[2]
a = np.array(Image.open(src).convert('RGBA')).astype(int)
al = a[..., 3] > 127
for _ in range(3):
    nb = ndimage.convolve(al.astype(int), np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]]), mode='constant')
    al &= nb > 0
lab, n = ndimage.label(al, structure=np.ones((3, 3)))
if n > 1:
    sz = ndimage.sum(al, lab, range(1, n + 1)); big = sz.max()
    al = np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= max(6, 0.04 * big)])
rgb = a[..., :3]
edge = al & ~ndimage.binary_erosion(al, N4, border_value=0)
dark = al & (np.abs(rgb - OUT).sum(2) < 45)
outs = edge | dark
fill = rgb[al & ~outs]
km = KMeans(n_clusters=min(15, len(np.unique(fill, axis=0))), n_init=4, random_state=1).fit(fill)
cent = np.clip(np.round(km.cluster_centers_), 0, 255).astype(int)
q = cent[km.predict(rgb.reshape(-1, 3))].reshape(rgb.shape)
q[outs] = OUT
out = np.zeros(rgb.shape[:2] + (4,), np.uint8); out[..., :3] = q; out[..., 3] = al * 255
ys = np.nonzero(al.any(1))[0]; xs = np.nonzero(al.any(0))[0]
crop = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
H, W = crop.shape[0] + 3, crop.shape[1] + 4
cell = np.zeros((H, W, 4), np.uint8); cell[H - 2 - crop.shape[0]:H - 2, 2:2 + crop.shape[1]] = crop
Image.fromarray(cell).save(dst)
cols = {tuple(c) for c in cell[cell[..., 3] > 0][:, :3]}
print(dst, 'size', cell.shape[1], cell.shape[0], 'colors', len(cols))
