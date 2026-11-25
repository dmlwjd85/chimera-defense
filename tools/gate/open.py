import sys, numpy as np, cv2
from PIL import Image
src, mpath, out, xmax = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
im = np.array(Image.open(src).convert('RGB')).astype(np.float32)
m = np.array(Image.open(mpath)) > 0
m[:, xmax:] = False
m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((15, 15), np.uint8)) > 0
ys, xs = np.nonzero(m); y0, y1, x1 = ys.min(), ys.max(), xs.max()
H, W, _ = im.shape
yy, xx = np.mgrid[0:H, 0:W]
# per-column top/bottom of the opening
top = np.full(W, H); bot = np.zeros(W, int)
for x in range(0, x1 + 1):
    c = np.nonzero(m[:, x])[0]
    if len(c): top[x], bot[x] = c.min(), c.max()
t = np.clip((yy - y0) / max(1, (y1 - y0)), 0, 1)
dark = np.stack([22 + 10 * t, 15 + 6 * t, 18 + 4 * t], -1)
# warm torch glow deep inside, low and centred
cx, cy = x1 * 0.45, y1 - (y1 - y0) * 0.28
g = np.exp(-(((xx - cx) / (x1 * 0.38)) ** 2 + ((yy - cy) / ((y1 - y0) * 0.16)) ** 2))
dark += g[..., None] * np.array([70, 38, 16])
# floor inside: slightly lighter stone at the bottom quarter
fl = np.clip((yy - (y1 - (y1 - y0) * 0.18)) / ((y1 - y0) * 0.18), 0, 1)
dark = dark * (1 - fl[..., None] * 0.5) + fl[..., None] * np.array([58, 48, 44]) * 0.5
PAL = np.array([[16, 11, 14], [26, 18, 21], [38, 26, 25], [58, 36, 26], [88, 54, 30]], np.float32)
lum = dark.sum(-1)
idx = np.abs(lum[..., None] - PAL.sum(-1)[None, None, :]).argmin(-1)
dark = PAL[idx]
out_im = im.copy()
out_im[m] = dark[m]
# wall thickness (stone reveal) on the right side of the opening and under the arch
rev = np.zeros((H, W), bool)
for x in range(0, x1 + 1):
    if top[x] < H:
        rev[top[x]:top[x] + 14, x] = True
dist = x1 - xx
rev |= m & (dist >= 0) & (dist < 26)
rev &= m
shade = np.clip((dist) / 26, 0, 1)
stone = np.stack([70 - 25 * shade, 66 - 24 * shade, 74 - 26 * shade], -1)
out_im[rev] = stone[rev]
# opened door leaf seen edge-on just inside the reveal
leaf = m & (dist >= 26) & (dist < 50) & (yy > np.take(top, np.clip(xx, 0, W - 1)) + 20)
lc = np.array([92, 56, 34]); ld = np.array([62, 38, 24]); le = np.array([120, 76, 44])
band = ((yy - y0) % 110) < 12
edge = dist >= 44
col = np.where(band[..., None], np.array([44, 42, 48]), np.where(edge[..., None], le, np.where(((xx // 10) % 2 == 0)[..., None], lc, ld)))
out_im[leaf] = col[leaf]
# pixelate the edited area to match the art's pixel size
B = 6
reg = m.copy()
small = cv2.resize(out_im, (W // B, H // B), interpolation=cv2.INTER_AREA)
big = cv2.resize(small, (W // B * B, H // B * B), interpolation=cv2.INTER_NEAREST)
pix = out_im.copy(); pix[:big.shape[0], :big.shape[1]] = big
out_im[reg] = pix[reg]
Image.fromarray(np.clip(out_im, 0, 255).astype(np.uint8)).save(out, quality=92)
Image.fromarray(np.clip(out_im, 0, 255).astype(np.uint8)[400:1100, 0:500]).save('/tmp/open_view.png')
print(y0, y1, x1)
