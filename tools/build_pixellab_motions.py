# PixelLab 동작(art-src/pixellab/anim/<종>_<단계>_<동작>/f*.png) → 전투용 동작 시트 + dot.json
#  - public/assets/dotm/<종>.png, <종>_spirit.png  (덱에 든 종만 전투에 들어갈 때 불러옴: 폰 메모리)
#  - public/data/dotm/<종>.dot.json, <종>_spirit.dot.json
# 정리(규칙 docs/동작_주문_규칙.md): 반투명 0, 외딴 점 0(작은 떨어진 덩어리 지움), 색은 확정 원화 팔레트(16색 이하)로만,
# 외곽선 #291a1f. 잘라 붙이기·늘리기·사이 장 합성은 하지 않음 — 장은 PixelLab이 몸 전체를 다시 그린 그대로.
# 쓰는 법: python3 tools/build_pixellab_motions.py [종,종...]   → 검수 표 qa/motions/<종>.json
import json, os, sys, glob
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art-src', 'pixellab')
PUB = os.path.join(ROOT, 'public')
OUTLINE = (0x29, 0x1a, 0x1f)
SCALE = 0.5
CANVAS = {'baby': 96, 'teen': 112, 'adult': 128, 'myth': 160}   # 주문 때 쓴 칸(motion_spec.py와 같음)
FOOT_PAD = 6                                                   # 원화 발밑 = 칸 아래에서 7줄 위
STAGE_OF = {'baby': 'young', 'teen': 'teen', 'adult': 'adult', 'myth': 'spirit'}
# 동작 이름(게임) ← 주문 이름. 장 시간(초)
CLIP = {'idle': ('idle', 0.16), 'walk': ('move', 0.085), 'a1': ('attack', 0.065), 'a2': ('attack2', 0.065),
        'el': ('skill', 0.07), 'ult': ('ult', 0.07), 'hit': ('hit', 0.06), 'down': ('down', 0.08)}
ATTACKS = {'a1', 'a2', 'el', 'ult'}
FLYERS = {'eagle', 'crow'}
MIN_BLOB = 14   # 이보다 작은 떨어진 덩어리는 지움(외딴 점·찌꺼기)


def comps(im):
    """불투명 칸의 8방향 연결 덩어리들."""
    W, H = im.size; px = im.load(); seen = set(); out = []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] == 0 or (x, y) in seen: continue
            st = [(x, y)]; seen.add((x, y)); c = []
            while st:
                p = st.pop(); c.append(p)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        q = (p[0] + dx, p[1] + dy)
                        if 0 <= q[0] < W and 0 <= q[1] < H and q not in seen and px[q][3]:
                            seen.add(q); st.append(q)
            out.append(c)
    return out


def nearest(pal):
    cache = {}
    def f(c):
        if c not in cache:
            r, g, b = c
            cache[c] = min(pal, key=lambda p: 2 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 3 * (p[2] - b) ** 2)
        return cache[c]
    return f


def clean(im, pal_fn):
    im = im.convert('RGBA'); px = im.load(); W, H = im.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (*pal_fn((r, g, b)), 255) if a >= 128 else (0, 0, 0, 0)
    cs = comps(im)
    if cs:
        big = max(len(c) for c in cs)
        for c in cs:
            if len(c) < max(MIN_BLOB, big * 0.08):   # 몸에서 떨어진 연기·빛 조각(효과는 코드가 그림)
                for p in c: px[p] = (0, 0, 0, 0)
    # 상하좌우로 이웃이 하나도 없는 점(대각선으로만 붙은 점)도 외딴 점 → 지움
    for _ in range(2):
        lone = [(x, y) for y in range(H) for x in range(W) if px[x, y][3] and not any(0 <= x + dx < W and 0 <= y + dy < H and px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for p in lone: px[p] = (0, 0, 0, 0)
    # 몸 가장자리(투명과 닿은 칸)가 밝은 주색이면 외곽선으로(외곽선 끊김 막기). 흰색·노랑 빛은 그대로.
    edge = []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] == 0: continue
            if any(not (0 <= x + dx < W and 0 <= y + dy < H) or px[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                c = px[x, y][:3]
                if c not in ((255, 255, 255), (255, 225, 90)) and sum(c) > 150: edge.append((x, y))
    for p in edge: px[p] = (*OUTLINE, 255)
    return im


def palette_of(paths):
    cols = set()
    for p in paths:
        for c in Image.open(p).convert('RGBA').get_flattened_data():
            if c[3]: cols.add(c[:3])
    cols.add(OUTLINE)
    return sorted(cols)


def hit_frame(ims):
    """앞(오른쪽)으로 가장 멀리 뻗은 장 = 타격 순간(앞 75% 안에서)."""
    n = max(1, int(len(ims) * 0.75))
    rights = [(im.getbbox() or (0, 0, 0, 0))[2] for im in ims[:n]]
    return max(range(n), key=lambda i: rights[i])


def build(sp):
    report = {'species': sp, 'motions': {}}
    groups = {'main': ['baby', 'teen', 'adult'], 'spirit': ['myth']}
    for gname, stages in groups.items():
        pal = palette_of([os.path.join(SRC, f'{sp}_{st}.png') for st in stages])
        assert len(pal) <= 16, f'{sp} {gname} palette {len(pal)}'
        pfn = nearest(pal)
        frames = []          # (이름, 칸 그림(주문 칸 크기), 단계)
        sets = {}
        for st in stages:
            src = Image.open(os.path.join(SRC, f'{sp}_{st}.png'))
            C = CANVAS[st]; ox = (C - src.width) // 2; oy = C - src.height - FOOT_PAD
            foot_c, anchor_c = oy + src.height - 1, ox + src.width // 2
            ref_h = src.getbbox()[3] - src.getbbox()[1]
            # PixelLab이 발을 1~3줄 옮겨 그려서, 그 단계 대기 장들의 발 높이(가운데값)를 발밑선으로 삼음(뛰는 장은 그대로 뜸)
            idle_fs = sorted(glob.glob(os.path.join(SRC, 'anim', f'{sp}_{st}_idle', 'f[0-9]*.png')))[1:]
            if idle_fs:
                bots = sorted(Image.open(f).getbbox()[3] - 1 for f in idle_fs); foot_c = bots[len(bots) // 2]
            sset = {'top': None}
            for d in sorted(glob.glob(os.path.join(SRC, 'anim', f'{sp}_{st}_*'))):
                m = d.rsplit('_', 1)[1]
                if m not in CLIP: continue
                fs = sorted(glob.glob(os.path.join(d, 'f[0-9]*.png')))[1:]   # f00 = 넣은 원화와 같은 장 → 뺌
                ims = [clean(Image.open(f), pfn) for f in fs]
                if not ims: continue
                if m == 'down':   # 가장 낮게 누운 장까지만 쓰고 거기서 멈춤(다시 일어서는 장 버림)
                    hs = [(im.getbbox() or (0, 0, 0, 0))[3] - (im.getbbox() or (0, 0, 0, 0))[1] for im in ims]
                    ims = ims[:hs.index(min(hs)) + 1]
                name, dur = CLIP[m]
                q = []
                for i, im in enumerate(ims):
                    bb = im.getbbox(); h = bb[3] - bb[1]
                    q.append({'h%': round(100 * (h - ref_h) / ref_h, 1), 'foot': bb[3] - 1 - foot_c})
                    frames.append((f'{sp}_{st}_{m}_{i:02d}', im, st, anchor_c, foot_c))
                clip = {'frames': [f'{sp}_{st}_{m}_{i:02d}' for i in range(len(ims))], 'durs': [dur] * len(ims)}
                if m in ('idle', 'walk'): clip['loop'] = True
                if m == 'down': clip['stay'] = True
                if m in ATTACKS:
                    hf = hit_frame(ims); clip['hold'] = {'frame': hf, 'sec': 0.06}
                    clip['events'] = [[round(dur * hf + 0.01, 3), 'cast' if m in ('el', 'ult') else 'hit']]
                    if m in ('el', 'ult'): clip['events'].append([round(dur * hf + 0.02, 3), 'hit'])
                sset[name] = clip
                report['motions'][f'{st}_{m}'] = {'n': len(ims), 'max|h%|': max(abs(r['h%']) for r in q), 'foot±': max(abs(r['foot']) for r in q)}
            # 나는 새(아기·성장기·성체)는 하늘에 떠 있는 동안 늘 날갯짓: 대기 = 날기 장을 조금 느리게
            if sp in FLYERS and st != 'myth' and 'move' in sset:
                sset['idle'] = {**sset['move'], 'durs': [0.1] * len(sset['move']['frames']), 'loop': True}
            sets[st] = sset
        # 장마다 그림만 잘라(빈 곳 버림) 촘촘히 묶음: 폰 메모리. rects[이름] = [x, y, w, h, 왼쪽, 위] (왼쪽·위 = 기준점(가운데·발밑) 대비 칸 위치)
        cut = []
        for n, im, st, a, f in frames:
            bb = im.getbbox(); cut.append((n, im.crop(bb), st, bb[0] - a, bb[1] - (f + 1)))
        order = sorted(range(len(cut)), key=lambda k: -cut[k][1].height)
        SW = 2048; x = y = rowh = 0; pos = {}
        for k in order:
            w, h = cut[k][1].size
            if x + w + 1 > SW: x = 0; y += rowh + 1; rowh = 0
            pos[k] = (x, y); x += w + 1; rowh = max(rowh, h)
        S = Image.new('RGBA', (SW, y + rowh), (0, 0, 0, 0))
        rects = {}
        for k, (n, im, st, lx, ty) in enumerate(cut):
            S.alpha_composite(im, pos[k]); rects[n] = [*pos[k], im.width, im.height, lx, ty]
        L = max(-r[4] for r in rects.values()); R = max(r[2] + r[4] for r in rects.values())
        T = max(-r[5] for r in rects.values()); B = max(0, max(r[3] + r[5] for r in rects.values()))
        W, H, foot = L + R, T + B + 1, T - 1
        tops = {}
        for n, im, st, lx, ty in cut:
            if '_idle_' in n: tops[st] = min(tops.get(st, 99999), foot + 1 + ty)   # 머리 높이(체력바 자리)는 대기 장으로
        key = sp if gname == 'main' else f'{sp}_spirit'
        os.makedirs(os.path.join(PUB, 'assets', 'dotm'), exist_ok=True)
        S.save(os.path.join(PUB, 'assets', 'dotm', f'{key}.png'), optimize=True)
        used = sorted({'#%02x%02x%02x' % p[:3] for p in S.get_flattened_data() if p[3]})
        for st in stages: sets[st]['top'] = max(0, tops.get(st, 0))
        d = {
            'note': f'{sp} 동작 도트(PixelLab animate-with-text-v3, 원화를 첫 장으로 몸 전체를 다시 그림). 그림 1칸 = 화면 1px. 원본 art-src/pixellab/anim, 만든 도구 tools/build_pixellab_motions.py',
            'species': key, 'sheet': f'dot-m-{key}', 'file': f'assets/dotm/{key}.png',
            'frameW': W, 'frameH': H, 'foot': foot, 'cols': 1, 'anchorX': L, 'palette': used, 'rects': rects,
            'frames': [n for n, *_ in frames], 'standing': [n for n, *_ in frames if '_idle_' in n],
            'attacks': ['attack', 'attack2'],
            'sets': {st: sets[st] for st in stages},
            'stages': {STAGE_OF[st]: {'set': st, 'scale': SCALE} for st in stages},
        }
        os.makedirs(os.path.join(PUB, 'data', 'dotm'), exist_ok=True)
        json.dump(d, open(os.path.join(PUB, 'data', 'dotm', f'{key}.dot.json'), 'w'), ensure_ascii=False, indent=1)
        report[gname] = {'sheet': S.size, 'box': (W, H), 'frames': len(frames), 'colors': len(used), 'px': S.size[0] * S.size[1]}
    os.makedirs(os.path.join(ROOT, 'qa', 'motions'), exist_ok=True)
    json.dump(report, open(os.path.join(ROOT, 'qa', 'motions', f'{sp}.json'), 'w'), ensure_ascii=False, indent=1)
    return report


def write_index():
    keys = sorted(os.path.basename(f)[:-9] for f in glob.glob(os.path.join(PUB, 'data', 'dotm', '*.dot.json')))
    json.dump({'note': '동작 시트가 있는 종(전투에 들어갈 때 덱에 든 종만 불러옴)', 'species': keys}, open(os.path.join(PUB, 'data', 'dotm', 'index.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sps = sys.argv[1].split(',') if len(sys.argv) > 1 else sorted({os.path.basename(d).split('_')[0] for d in glob.glob(os.path.join(SRC, 'anim', '*'))})
    for sp in sps:
        r = build(sp)
        print(sp, r['main'], r.get('spirit'))
        for k, v in r['motions'].items(): print('  ', k, v)
    write_index()
