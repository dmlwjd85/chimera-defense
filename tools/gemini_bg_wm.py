# 제미나이 반짝이 표식(오른쪽 아래) 지우기: 바로 왼쪽 같은 높이 조각으로 덮고 가장자리를 섞음
import sys, numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(float); H, W = a.shape[:2]
    x0, y0, w, h = W - 152, H - 152, 64, 64
    patch = a[y0:y0 + h, x0 - 70:x0 - 70 + w].copy()
    m = np.ones((h, w)); r = 10
    for i in range(r): m[i, :] *= i / r; m[-1 - i, :] *= i / r; m[:, i] *= i / r; m[:, -1 - i] *= i / r
    a[y0:y0 + h, x0:x0 + w] = a[y0:y0 + h, x0:x0 + w] * (1 - m[..., None]) + patch * m[..., None]
    Image.fromarray(a.astype(np.uint8)).save(p.replace('.png', '_c.png'))
