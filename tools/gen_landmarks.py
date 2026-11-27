"""배경 그림 속 성·차원문을 오려 낸 '덧그림'을 만든다(2026-11-27 "성이랑 차원문은 도드라지게").

- 배경 원본(public/assets/bg/bg-*.jpg)은 건드리지 않는다. 오린 그림은 public/assets/bg/lm/ 에 새로 만든다.
- 화면에서 배경은 1920×1080 → 1280×720(2/3)로 그려지므로, 오린 그림도 같은 2/3 크기로 만들어 1배(정수배)로 겹쳐 그린다.
- 모양 오리기: rembg(isnet-general-use, MIT)로 대략 오린 뒤 반투명 없이 0/1로 자르고 가장 큰 덩어리만 남긴다.
- 테두리: 진한 2px + 색 2px(도트처럼 계단 모양, 번짐 없음). 색 테두리는 따로 저장해 코드에서 밝기만 숨쉬듯 바꾼다.
결과 위치는 public/data/battlefield.json 의 landmarks(화면 좌표, 왼쪽 위 기준)에만 쓴다(다른 값은 그대로 둠).

쓰는 법: python3 tools/gen_landmarks.py [--force]
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'public/assets/bg'
OUT = BG / 'lm'
DATA = ROOT / 'public/data/battlefield.json'
ARTS = ['forest-1', 'forest-2', 'forest-3'] + [f'stage-{i}' for i in range(4, 13)]
# 찾을 범위(원본 1920×1080 픽셀). 성은 왼쪽, 차원문은 오른쪽에 그려져 있음
BOX = {'castle': (0, 150, 640, 960), 'portal': (1280, 120, 1920, 960)}
# rembg가 다른 물체(비석·나무)를 잡는 배경: 성 둘레 상자를 주고 OpenCV grabCut으로 오림
GRABCUT = {('stage-8', 'castle'): (0, 415, 275, 385), ('stage-9', 'castle'): (0, 195, 325, 530), ('stage-11', 'castle'): (0, 295, 315, 500)}
RIM = {'castle': (255, 216, 77), 'portal': (199, 125, 255)}
DARK = (26, 16, 32)
K = 2 / 3


def ring(mask, n):
    st = ndimage.generate_binary_structure(2, 1)
    return ndimage.binary_dilation(mask, structure=st, iterations=n) & ~mask


def main(force=False):
    from rembg import remove, new_session
    sess = new_session('isnet-general-use')
    OUT.mkdir(exist_ok=True)
    data = {}
    for art in ARTS:
        src = Image.open(BG / f'bg-{art}.jpg').convert('RGB')
        assert src.size == (1920, 1080), (art, src.size)
        entry = {}
        for kind, box in BOX.items():
            if (art, kind) in GRABCUT:
                import cv2
                x, y, w, h = GRABCUT[(art, kind)]
                img = cv2.cvtColor(np.array(src), cv2.COLOR_RGB2BGR)
                gm = np.zeros(img.shape[:2], np.uint8); b1 = np.zeros((1, 65)); b2 = np.zeros((1, 65))
                cv2.setRNGSeed(1)
                cv2.grabCut(img, gm, (x, y, w, h), b1, b2, 6, cv2.GC_INIT_WITH_RECT)
                a = ((gm == 1) | (gm == 3))[box[1]:box[3], box[0]:box[2]]
            else:
                a = np.array(remove(src.crop(box), session=sess))[:, :, 3] >= 128
            lab, n = ndimage.label(a)
            if n == 0:
                print('못 찾음', art, kind); continue
            sizes = ndimage.sum(a, lab, range(1, n + 1))
            keep = lab == (int(np.argmax(sizes)) + 1)
            keep = ndimage.binary_fill_holes(keep)
            ys, xs = np.where(keep)
            # 화면 좌표(2/3)로 맞춘 정수 상자 + 테두리 여유 6px
            x0 = int((box[0] + xs.min()) * K) - 6; y0 = int((box[1] + ys.min()) * K) - 6
            x1 = int(np.ceil((box[0] + xs.max() + 1) * K)) + 6; y1 = int(np.ceil((box[1] + ys.max() + 1) * K)) + 6
            x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(1280, x1), min(720, y1)
            w, h = x1 - x0, y1 - y0
            # 배경 전체를 화면 크기로 줄인 뒤 같은 자리를 자름(화면에 그려진 배경과 픽셀이 맞음)
            screen = src.resize((1280, 720), Image.LANCZOS)
            rgb = np.array(screen.crop((x0, y0, x1, y1)))
            full = np.zeros((1080, 1920), bool); full[box[1]:box[3], box[0]:box[2]] = keep
            m = np.array(Image.fromarray(full.astype(np.uint8) * 255).resize((1280, 720), Image.BOX))[y0:y1, x0:x1] >= 128
            dark = ring(m, 2)
            rim = ring(m | dark, 2)
            body = np.zeros((h, w, 4), np.uint8)
            body[m, :3] = rgb[m]; body[m, 3] = 255
            body[dark, :3] = DARK; body[dark, 3] = 255
            glow = np.zeros((h, w, 4), np.uint8)
            glow[rim, :3] = RIM[kind]; glow[rim, 3] = 255
            for name, arr in ((f'{art}-{kind}.png', body), (f'{art}-{kind}-rim.png', glow)):
                p = OUT / name
                if p.exists() and not force:
                    print('이미 있음(덮어쓰려면 --force):', p); continue
                im = Image.fromarray(arr)
                if name.endswith('-rim.png'): im.save(p, optimize=True)
                else: im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(p, optimize=True)   # 도트 그림이라 256색이면 충분(용량 절약)
            entry[kind] = {'x': x0, 'y': y0, 'w': w, 'h': h, 'base': int(y0 + np.where(m.any(1))[0].max())}
            print(art, kind, entry[kind])
        data[art] = entry
    bf = json.loads(DATA.read_text()) if DATA.exists() else {}
    bf['landmarks'] = {**bf.get('landmarks', {}), **data}
    write_bf(bf)


def write_bf(bf):
    # 사람이 읽기 쉽게: 맨 위 값은 한 줄씩, 배경별 값도 한 줄씩
    lines = []
    for k, v in bf.items():
        if isinstance(v, dict) and v and all(isinstance(x, dict) for x in v.values()):
            inner = ',\n'.join(f'  "{a}": ' + json.dumps(b, ensure_ascii=False) for a, b in v.items())
            lines.append(f' "{k}": {{\n{inner}\n }}')
        else:
            lines.append(f' "{k}": ' + json.dumps(v, ensure_ascii=False))
    DATA.write_text('{\n' + ',\n'.join(lines) + '\n}\n')


if __name__ == '__main__':
    main('--force' in sys.argv)
