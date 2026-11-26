# PixelLab이 동작 장에 덧그리는 빛·휘두름 자국·별·연기 지우기(적 동작, 2026-11-26)
# 우리 그림은 몸 둘레가 짙은 외곽선으로 닫혀 있음 → 외곽선 없이 투명과 바로 닿은 밝은 덩어리 = 덧그린 효과.
#   1) 짙은 칸(외곽선)과 나머지(채움)로 나눔
#   2) 채움 덩어리마다 '투명과 바로 닿은 둘레 비율'을 셈 → 높으면(외곽선 없이 떠 있는 빛) 지움
#   3) 남은 채움에 닿지 않는 외곽선(빈 고리·선만 남은 것)도 지움
import numpy as np
from PIL import Image
from scipy import ndimage

N4 = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)


def defx(im, open_frac=0.35, min_keep=0.12):
    a = np.array(im.convert('RGBA')).astype(int)
    al = a[..., 3] >= 128
    lum = (a[..., 0] * 299 + a[..., 1] * 587 + a[..., 2] * 114) // 1000
    dark = al & (lum < 70)
    fill = al & ~dark
    lab, n = ndimage.label(fill, structure=N4)
    if n == 0: return im
    sizes = ndimage.sum(fill, lab, range(1, n + 1))
    big = sizes.max()
    trans = ~al
    # 투명과 상하좌우로 닿은 채움 칸
    touch = fill & (ndimage.binary_dilation(trans, N4, border_value=1))
    tcount = ndimage.sum(touch, lab, range(1, n + 1))
    # 둘레 칸 수(채움 중 다른 것과 닿은 가장자리)
    edge = fill & ~ndimage.binary_erosion(fill, N4, border_value=0)
    ecount = ndimage.sum(edge, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    for i in range(n):
        frac = tcount[i] / max(1, ecount[i])
        # 몸 덩어리(가장 큰 것 포함)는 남김. 외곽선 없이 투명과 닿은 덩어리는 효과로 보고 지움
        if sizes[i] == big or (frac < open_frac and sizes[i] >= 3) or (sizes[i] >= big * min_keep and frac < 0.6):
            keep[i + 1] = True
    kept = keep[lab] & fill
    # 외곽선은 남은 채움 옆(2칸 안)에 있는 것만
    near = ndimage.binary_dilation(kept, iterations=2)
    out_ok = dark & near
    mask = kept | out_ok
    # 남은 것 중 가장 큰 덩어리에서 떨어진 작은 조각 지움
    lab2, n2 = ndimage.label(mask, structure=np.ones((3, 3)))
    if n2 > 1:
        s2 = ndimage.sum(mask, lab2, range(1, n2 + 1)); b2 = s2.max()
        mask = np.isin(lab2, [i + 1 for i, v in enumerate(s2) if v >= b2 * 0.25])
    a[~mask] = 0
    return Image.fromarray(a.astype(np.uint8))
