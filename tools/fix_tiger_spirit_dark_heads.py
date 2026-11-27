# 산군(tiger_spirit) 동작 장 4개의 '어두운 남색 머리'를 다른 장과 같은 흰 호랑이 머리로 고침 (2026-11-27)
#  증상: tiger_myth_a1_06, a2_00, a2_04, hit_00 네 장은 머리 털이 남색(#445c8b)으로 칠해져 있어, 앞뒤 장(흰 털 #efd4c5)과 번쩍 다르게 보였음.
#  고침: 그 장의 머리 안에서 남색 칸만 흰 털색(#efd4c5)으로 바꿈. 외곽선·눈·줄무늬(#43151c)·머리 모양은 그 동작 그대로라 동작에 맞음.
#        팔레트 16색 그대로(새 색 없음), 투명/불투명 칸 그대로(키·머리 크기·어깨 폭·발 위치 변화 0). 다른 장은 한 칸도 안 바뀜.
#  머리 = 그 장에서 남색 칸 덩어리 중 가장 큰 것(머리 털) + 그 덩어리 상자 안(2칸 여유)에 든 작은 남색 덩어리. 몸·갑옷의 남색 줄은 머리 밖이라 그대로.
#  다시 돌려도 더 바뀌는 것 없음(남색 머리 덩어리가 200칸 미만이면 건너뜀).
#  쓰는 법: python3 tools/fix_tiger_spirit_dark_heads.py     되돌리기: art-src/backup/tiger_spirit_darkhead_20261127/
#  참고: 원본 장(art-src/pixellab/anim)은 PixelLab 색이 제각각이라(게임 시트로 줄일 때 16색으로 모음) 여기서는 게임 시트만 고침.
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BLUE = np.array([0x44, 0x5c, 0x8b]); CREAM = np.array([0xef, 0xd4, 0xc5, 255], np.uint8)
FRAMES = ['tiger_myth_a1_06', 'tiger_myth_a2_00', 'tiger_myth_a2_04', 'tiger_myth_hit_00']


def fix(a):
    m = (a[..., :3] == BLUE).all(axis=2) & (a[..., 3] > 0)
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if not n: return a, 0
    sizes = ndimage.sum(m, lab, range(1, n + 1)); big = int(np.argmax(sizes)) + 1
    if sizes[big - 1] < 200: return a, 0
    ys, xs = np.where(lab == big); x0, x1, y0, y1 = xs.min() - 2, xs.max() + 2, ys.min() - 2, ys.max() + 2
    out = a.copy(); cnt = 0
    for i in range(1, n + 1):
        yy, xx = np.where(lab == i)
        if i == big or (xx.min() >= x0 and xx.max() <= x1 and yy.min() >= y0 and yy.max() <= y1):
            out[yy, xx] = CREAM; cnt += len(yy)
    return out, cnt


def main():
    j = json.load(open(os.path.join(ROOT, 'public/data/dotm/tiger_spirit.dot.json')))
    p = os.path.join(ROOT, 'public/assets/dotm/tiger_spirit.png'); S = Image.open(p).convert('RGBA')
    for k in FRAMES:
        x, y, w, h, ox, oy = j['rects'][k]
        a = np.array(S.crop((x, y, x + w, y + h))); b, n = fix(a)
        if n: S.paste(Image.fromarray(b, 'RGBA'), (x, y)); print(k, n, '칸 바꿈')
    S.save(p, optimize=True)


if __name__ == '__main__':
    main()
