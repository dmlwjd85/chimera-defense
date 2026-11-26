# 신화급 털색 다듬기: tools/pixellab/myth_recolor.json 대로 신화급 그림의 색을 1:1로 바꿈(색 수는 그대로 16색 이하).
import colorsys, json, os
_CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pixellab', 'myth_recolor.json')))

def _rgb(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _toward(c, t, k, jump=False):
    h1, l1, s1 = colorsys.rgb_to_hls(*[v / 255 for v in c]); h2, l2, s2 = colorsys.rgb_to_hls(*[v / 255 for v in t])
    dh = ((h2 - h1 + 0.5) % 1) - 0.5
    if jump or s1 < 0.12: h1 = h2; dh = 0  # tint·거의 흰색: 색상은 목표로 바로(중간 색상을 거치지 않게), 밝기·채도만 옮김
    r = colorsys.hls_to_rgb((h1 + dh * k) % 1, l1 + (l2 - l1) * k, s1 + (s2 - s1) * k)
    return tuple(max(0, min(255, round(v * 255))) for v in r)

def _mute(c, s):
    h, l, sat = colorsys.rgb_to_hls(*[v / 255 for v in c])
    r = colorsys.hls_to_rgb(h, l * 0.94 + 0.03, sat * s)
    return tuple(max(0, min(255, round(v * 255))) for v in r)

def table(species):
    cfg = _CFG.get(species)
    if not cfg: return {}
    if cfg['kind'] == 'mute': return {_rgb(h): _mute(_rgb(h), cfg['s']) for h in cfg['colors']}
    return {_rgb(a): _toward(_rgb(a), _rgb(b), k, cfg['kind'] == 'tint') for a, b, k in cfg['map']}

def recolor(im, species):
    """신화급 그림(RGBA) 색을 바꿔 돌려줌. 목록에 없는 종은 그대로."""
    t = table(species)
    if not t: return im
    im = im.convert('RGBA').copy(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in t: px[x, y] = (*t[p[:3]], p[3])
    return im
