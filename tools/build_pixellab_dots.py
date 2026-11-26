# PixelLab 확정 그림(art-src/pixellab/<종>_<단계>.png) → 게임 도트 시트 + dot.json
#  - <종>.png / <종>.dot.json : 아기(young 0.?)·성장기·성체 한 시트 (16색 묶음)
#  - <종>_spirit.png / <종>_spirit.dot.json : 신화급 따로 (16색 묶음)
# 그림 1칸 = 화면 1px(DOT_PX 2 × 단계 배율 0.5). 아직 동작 그림은 없고 대기 들썩임·공격 내딛기는 코드 연출.
# 쓰는 법: python3 tools/build_pixellab_dots.py   (그림을 바꾼 뒤 다시 돌리고 node tools/pack-art.mjs)
import json, os
from PIL import Image
import sys as _sys; _sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from myth_recolor import recolor   # 신화급 털색 다듬기(tools/pixellab/myth_recolor.json)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art-src', 'pixellab')
PUB = os.path.join(ROOT, 'public')
SPECIES = ['bear', 'tiger', 'fox', 'rabbit', 'wolf', 'dog', 'bison', 'bighorn', 'monkey', 'ant', 'grasshopper', 'frog', 'crow', 'eagle', 'rooster']
OUTLINE = '#291a1f'
T6 = [0.12, 0.12, 0.07, 0.11, 0.2, 0.28]
SCALE = 0.5   # DOT_PX 2 × 0.5 = 그림 1칸이 화면 1px


def crop(im):
    return im.crop(im.getbbox())


def sheet(key, frames, out_png):
    """frames: [(name, img)] → 같은 칸 크기(가장 큰 그림 + 여백), 발밑선 = 칸 아래에서 3줄 위."""
    W = max(i.width for _, i in frames) + 4
    H = max(i.height for _, i in frames) + 3
    foot = H - 3
    S = Image.new('RGBA', (W * len(frames), H), (0, 0, 0, 0))
    for k, (_, im) in enumerate(frames):
        S.alpha_composite(im, (k * W + (W - im.width) // 2, foot + 1 - im.height))
    S.save(out_png)
    pal = sorted({'#%02x%02x%02x' % p[:3] for p in S.getdata() if p[3]} | {OUTLINE})
    return W, H, foot, pal


def idle(name):
    return {'frames': [name, name], 'durs': [0.36, 0.36], 'loop': True, 'fx': {'bob': 1}}


def claw(name):
    return {'frames': [name] * 6, 'durs': T6, 'hold': {'frame': 3, 'sec': 0.09}, 'events': [[0.31, 'hit']], 'fx': {'lunge': 4}}


index = []
for sp in SPECIES:
    ims = {st: crop(Image.open(os.path.join(SRC, f'{sp}_{st}.png')).convert('RGBA')) for st in ('baby', 'teen', 'adult', 'myth')}
    ims['myth'] = recolor(ims['myth'], sp)
    names = {st: f'{sp}_{st}_idle_01' for st in ims}
    # 아기·성장기·성체
    W, H, foot, pal = sheet(sp, [(names[s], ims[s]) for s in ('baby', 'teen', 'adult')], os.path.join(PUB, 'assets', 'dot', f'{sp}.png'))
    tops = {s: H - 3 + 1 - ims[s].height for s in ('baby', 'teen', 'adult')}
    d = {
        'note': f'{sp} 도트(2026-11-26 PixelLab 확정: 손발·머리·눈이 큰 캐주얼, 아기·성장기·성체). 그림 1칸 = 화면 1px. 동작 그림은 아직이고 대기 들썩임·공격 내딛기는 코드 연출. 원본 art-src/pixellab.',
        'species': sp, 'sheet': f'dot-{sp}', 'file': f'assets/dot/{sp}.png',
        'frameW': W, 'frameH': H, 'foot': foot, 'cols': 3, 'anchorX': W // 2, 'palette': pal,
        'frames': [names['baby'], names['teen'], names['adult']], 'standing': [names['baby'], names['teen'], names['adult']],
        'attacks': ['claw'],
        'sets': {
            'baby': {'top': tops['baby'], 'idle': idle(names['baby'])},
            'teen': {'top': tops['teen'], 'idle': idle(names['teen'])},
            'adult': {'top': tops['adult'], 'idle': idle(names['adult']), 'claw': claw(names['adult'])},
        },
        'stages': {'young': {'set': 'baby', 'scale': SCALE}, 'teen': {'set': 'teen', 'scale': SCALE}, 'adult': {'set': 'adult', 'scale': SCALE}},
    }
    json.dump(d, open(os.path.join(PUB, 'data', 'dot', f'{sp}.dot.json'), 'w'), ensure_ascii=False, indent=1)
    index.append(sp)
    # 신화급
    key = f'{sp}_spirit'
    W, H, foot, pal = sheet(key, [(names['myth'], ims['myth'])], os.path.join(PUB, 'assets', 'dot', f'{key}.png'))
    d = {
        'note': f'{sp} 신화급 도트(2026-11-26 PixelLab 확정: 손 달린 사람 모양). 그림 1칸 = 화면 1px.',
        'species': key, 'sheet': f'dot-{key}', 'file': f'assets/dot/{key}.png',
        'frameW': W, 'frameH': H, 'foot': foot, 'cols': 1, 'anchorX': W // 2, 'palette': pal,
        'frames': [names['myth']], 'standing': [names['myth']], 'attacks': ['claw'],
        'sets': {'myth': {'top': H - 3 + 1 - ims['myth'].height, 'idle': idle(names['myth']), 'claw': claw(names['myth'])}},
        'stages': {'spirit': {'set': 'myth', 'scale': SCALE}},
    }
    json.dump(d, open(os.path.join(PUB, 'data', 'dot', f'{key}.dot.json'), 'w'), ensure_ascii=False, indent=1)
    index.append(key)

ip = os.path.join(PUB, 'data', 'dot', 'index.json')
idx = json.load(open(ip))
idx['species'] = index
idx['note'] = '도트 그림이 있는 종 목록. 종마다 <종>.dot.json(아기·성장기·성체)과 <종>_spirit.dot.json(신화급). 2026-11-26 PixelLab 확정본 15종(tools/build_pixellab_dots.py).'
json.dump(idx, open(ip, 'w'), ensure_ascii=False, indent=2)
mp = os.path.join(PUB, 'assets', 'manifest.json')
m = json.load(open(mp))
for k in index: m['images'][f'dot-{k}'] = f'assets/dot/{k}.png'
json.dump(m, open(mp, 'w'), ensure_ascii=False, indent=1)
print('built', len(index), 'dot sheets')
