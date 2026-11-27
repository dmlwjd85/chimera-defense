#!/usr/bin/env python3
"""산군(호랑이 신화급) 털색 되돌리기(2026-11-27 "산군 이미지 만든거 다시 잘 넣어줘").

16색 정리 때 원화(art-src/pixellab/tiger_myth.png)의 흰 호랑이 털(#bfbdd2)이 살구색(#efd4c5)으로,
줄무늬(#190632)가 밤색(#43151c)으로 바뀌어 게임 속 산군이 누런 호랑이가 됨.
같은 칸끼리 원화와 비교해 두 색만 원래 색으로 바꾼다(다른 색·모양은 그대로). 원본은 art-src/backup/tiger_spirit_beige_20261127.
"""
import json
from pathlib import Path
from PIL import Image

R = Path(__file__).resolve().parent.parent
MAP = {(0xef, 0xd4, 0xc5): (0xbf, 0xbd, 0xd2), (0x43, 0x15, 0x1c): (0x19, 0x06, 0x32)}
hx = lambda t: '#%02x%02x%02x' % t


def fix_png(p):
    im = Image.open(p).convert('RGBA')
    px = im.load()
    n = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in MAP:
                px[x, y] = (*MAP[(r, g, b)], a); n += 1
    im.save(p)
    return n


def fix_json(p):
    d = json.loads(p.read_text())
    pal = d.get('palette')
    if pal:
        back = {hx(k): hx(v) for k, v in MAP.items()}
        d['palette'] = sorted(back.get(c, c) for c in pal)
        p.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')) if '\n' not in p.read_text()[:200] else json.dumps(d, ensure_ascii=False, indent=1))


for png, js in [('public/assets/dot/tiger_spirit.png', 'public/data/dot/tiger_spirit.dot.json'),
                ('public/assets/dotm/tiger_spirit.png', 'public/data/dotm/tiger_spirit.dot.json')]:
    print(png, fix_png(R / png), 'px')
    fix_json(R / js)
