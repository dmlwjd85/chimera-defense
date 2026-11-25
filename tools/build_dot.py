# 확정 도트(아기 baby/, 성체 adult2/) → 게임 규격 시트(assets/dot/<종>.png) + <종>.dot.json
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans
OUT = np.array([0x29, 0x1a, 0x1f]); FOOT = 51; FW, FH = 72, 56
N4 = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)

def load(p):
    a = np.array(Image.open(p).convert('RGBA')).astype(int)
    al = a[..., 3] > 127
    al[FOOT + 1:] = False
    # 발밑선에 닿게: 맨 아래 줄을 51로
    rows = np.nonzero(al.any(1))[0]
    sh = FOOT - rows.max()
    if sh:
        a = np.roll(a, sh, 0); al = np.roll(al, sh, 0)
    return a[..., :3], al

def tidy(rgb, al, is_out):
    for _ in range(4):
        # 외딴 점 제거
        nb = ndimage.convolve(al.astype(int), N4.astype(int) - np.eye(3, dtype=int) * 0, mode='constant') - al
        nb = ndimage.convolve(al.astype(int), np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]]), mode='constant')
        al = al & (nb > 0)
        # 투명과 닿은 채움 점은 외곽선으로
        inner = ndimage.binary_erosion(al, N4, border_value=0)
        edge = al & ~inner
        is_out = is_out | edge
    return al, is_out

def build(sp):
    frames = []
    for d in ('baby', 'adult2'):
        rgb, al = load(f'{d}/{sp}.png')
        dark = al & (rgb.sum(2) < 110)
        frames.append([rgb, al, dark])
    fill = np.concatenate([f[0][f[1] & ~f[2]] for f in frames])
    k = min(15, len(np.unique(fill, axis=0)))
    km = KMeans(n_clusters=k, n_init=4, random_state=1).fit(fill)
    cents = np.clip(np.round(km.cluster_centers_), 0, 255).astype(int)
    pal = sorted({'#%02x%02x%02x' % tuple(c) for c in cents} | {'#291a1f'})
    sheet = np.zeros((FH, FW * 2, 4), np.uint8)
    for i, (rgb, al, dark) in enumerate(frames):
        out = np.zeros((FH, FW, 4), np.uint8)
        lab = km.predict(rgb.reshape(-1, 3)).reshape(FH, FW)
        q = cents[lab]
        al, isout = tidy(rgb, al, dark)
        q[isout] = OUT
        out[..., :3] = q; out[..., 3] = al * 255
        out[~al] = 0
        sheet[:, i * FW:(i + 1) * FW] = out
    used = {'#%02x%02x%02x' % tuple(p[:3]) for p in sheet.reshape(-1, 4) if p[3]}
    pal = sorted(used | {'#291a1f'})
    Image.fromarray(sheet).save(f'build/{sp}.png')
    b, a = f'{sp}_baby_idle_01', f'{sp}_adult_idle_01'
    T6 = [0.12, 0.12, 0.07, 0.11, 0.2, 0.28]
    d = {
        'note': f'{sp} 도트(2026-11-25 제미나이 확정 시안: 아기 눈 크게, 성체 머리 크게). 칸 72×56, 발밑선 y=51. 아직 그림은 대기 1장씩이고 걷기·공격은 코드 연출(통통·내딛기) — 동작 그림은 나중에.',
        'species': sp, 'sheet': f'dot-{sp}', 'file': f'assets/dot/{sp}.png',
        'frameW': FW, 'frameH': FH, 'foot': FOOT, 'cols': 2, 'anchorX': 36, 'palette': pal,
        'frames': [b, a], 'standing': [b, a], 'attacks': ['claw'],
        'sets': {
            'baby': {'top': int(np.nonzero(sheet[:, :FW, 3].any(1))[0].min()), 'idle': {'frames': [b, b], 'durs': [0.34, 0.34], 'loop': True, 'fx': {'bob': 1}}},
            'adult': {'top': int(np.nonzero(sheet[:, FW:, 3].any(1))[0].min()), 'idle': {'frames': [a, a], 'durs': [0.38, 0.38], 'loop': True, 'fx': {'bob': 1}},
                      'claw': {'frames': [a] * 6, 'durs': T6, 'hold': {'frame': 3, 'sec': 0.09}, 'events': [[0.31, 'hit']], 'fx': {'lunge': 4}}},
        },
        'stages': {'young': {'set': 'baby', 'scale': 0.8}, 'teen': {'set': 'baby', 'scale': 1}, 'adult': {'set': 'adult', 'scale': 1}},
    }
    json.dump(d, open(f'build/{sp}.dot.json', 'w'), ensure_ascii=False, indent=1)
    return len(pal)

for sp in sys.argv[1:]:
    print(sp, build(sp))
