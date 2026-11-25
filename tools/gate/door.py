import sys, numpy as np, cv2
from PIL import Image
src, out, bx0, by0, bx1, by1 = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
roi = im[by0:by1, bx0:bx1]
hsv = cv2.cvtColor(roi.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
wood = ((h >= 8) & (h <= 40) & (s > float(sys.argv[7]) if len(sys.argv) > 7 else s > 0.35) & (v > 0.12) & (v < 0.75)) | (v < 0.2)
m = wood.astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
door = (lab == k).astype(np.uint8)
# fill holes (iron rings / bands)
ff = door.copy() * 255; hh, ww = ff.shape; mask = np.zeros((hh + 2, ww + 2), np.uint8)
inv = ff.copy(); cv2.floodFill(inv, mask, (ww - 1, hh - 1), 255); door = ((ff | (255 - inv)) > 0).astype(np.uint8)
ys, xs = np.nonzero(door)
print('door bbox', xs.min() + bx0, ys.min() + by0, xs.max() + bx0, ys.max() + by0, 'area', door.sum())
full = np.zeros((H, W), np.uint8); full[by0:by1, bx0:bx1] = door
Image.fromarray(full * 255).save(out)
