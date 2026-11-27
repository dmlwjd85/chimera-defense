# 산군(tiger_spirit) 도트의 '털 구멍' 메우기 (2026-11-27)
#  증상: 흰 호랑이의 흰 털(몸·얼굴·다리) 칸이 투명하게 비어 있어, 전투에서 배경이 몸 안쪽으로 비쳐 보였음.
#        (PixelLab 그림에서 흰 털이 배경으로 지워진 것. 신화급 산군의 모든 동작·모든 장이 같음.)
#  고침: 외곽선으로 완전히 둘러싸인 투명 칸(= 몸 안쪽 구멍)만 털색으로 채움. 몸 밖과 이어진 빈 곳(다리 사이 등)은 그대로.
#        털색: 원본 그림(art-src)은 bfbdd2(흰 털) → 게임 시트는 신화급 털색 다듬기를 거쳐 efd4c5. 다른 칸·색은 건드리지 않음.
#  쓰는 법: python3 tools/fix_tiger_spirit_holes.py            (원본 그림·동작 장·게임 시트 모두. 이미 고쳤으면 아무것도 안 바뀜)
#          python3 tools/fix_tiger_spirit_holes.py --sheets-only (게임 시트만)
#  참고: tools/build_pixellab_motions.py tiger 로 시트를 다시 뽑으면 산군 말고 tiger.png까지 바이트가 달라지고(예전과 똑같이 재현되지 않음)
#        산군 시트도 3,700칸쯤 달라져서, 이번엔 다시 뽑지 않고 게임 시트를 이 도구로 직접 고쳤음. 시트를 다시 뽑게 되면 뽑은 뒤 이 도구를 한 번 더 돌릴 것.
#  남은 문제(구멍 아님, 이번에 안 건드림): 머리가 어두운 남색으로 그려진 장 4개 — tiger_myth_a1_06, a2_00, a2_04, hit_00
#  되돌리기: art-src/backup/tiger_spirit_20261127/ 에 고치기 전 파일이 그대로 있음.
import json, os, sys, glob
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC_FUR = (0xbf, 0xbd, 0xd2, 255)      # 원본 그림(PixelLab 출력)의 흰 털
SHEET_FUR = (0xef, 0xd4, 0xc5, 255)    # 게임 시트의 털(= 신화급 다듬기 거친 뒤)


def fill(arr, color):
    """RGBA 배열의 몸 안쪽 구멍(몸 밖과 상하좌우로 이어지지 않는 투명 칸)을 color로 채움. (새 배열, 채운 칸 수)"""
    m = arr[..., 3] > 0
    hole = ndimage.binary_fill_holes(m) & ~m
    out = arr.copy(); out[hole] = color
    return out, int(hole.sum())


def main():
    sheets_only = '--sheets-only' in sys.argv
    total = 0
    if not sheets_only:
        for p in [os.path.join(ROOT, 'art-src/pixellab/tiger_myth.png')] + sorted(glob.glob(os.path.join(ROOT, 'art-src/pixellab/anim/tiger_myth_*/f[0-9]*.png'))):
            a = np.array(Image.open(p).convert('RGBA')); b, n = fill(a, SRC_FUR)
            if n: Image.fromarray(b, 'RGBA').save(p); total += n
    # 게임 시트: 동작 시트(칸마다 따로) + 옛 한 장짜리 시트
    j = json.load(open(os.path.join(ROOT, 'public/data/dotm/tiger_spirit.dot.json')))
    p = os.path.join(ROOT, 'public/assets/dotm/tiger_spirit.png'); S = Image.open(p).convert('RGBA'); n_fr = 0
    for k, (x, y, w, h, ox, oy) in j['rects'].items():
        a = np.array(S.crop((x, y, x + w, y + h))); b, n = fill(a, SHEET_FUR)
        if n: S.paste(Image.fromarray(b, 'RGBA'), (x, y)); total += n; n_fr += 1
    S.save(p, optimize=True)
    p = os.path.join(ROOT, 'public/assets/dot/tiger_spirit.png'); a = np.array(Image.open(p).convert('RGBA')); b, n = fill(a, SHEET_FUR)
    if n: Image.fromarray(b, 'RGBA').save(p, optimize=True); total += n
    print(f'동작 시트 {n_fr}/{len(j["rects"])}장 고침, 총 {total}칸 채움')


if __name__ == '__main__':
    main()
