import sys, numpy as np
from PIL import Image
mp, cx, ys, rx, ry, b0, b1, xr = sys.argv[1], *map(float, sys.argv[2:9])
m = np.array(Image.open(mp)) > 0
H, W = m.shape
yy, xx = np.mgrid[0:H, 0:W]
d = np.clip(1 - ((xx - cx) / rx) ** 2, 0, 1)
top = np.where(np.abs(xx - cx) < rx, ys - ry * np.sqrt(d), ys)
bot = b0 + (b1 - b0) * xx / xr
arch = (yy >= top) & (yy <= bot) & (xx <= xr)
Image.fromarray(((m | arch) & arch).astype(np.uint8) * 255).save(mp)
