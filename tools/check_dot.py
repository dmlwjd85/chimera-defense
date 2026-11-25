#!/usr/bin/env python3
"""도트(픽셀 아트) 규격 검사기. src/rig/dotData.js 의 checkFrame/checkSheet 와 같은 규칙.

쓰는 법
  python3 tools/check_dot.py                 # public/data/dot/index.json 에 등록된 모든 종의 시트 검사
  python3 tools/check_dot.py fox             # 한 종만
  python3 tools/check_dot.py --frames a.png b.png --size 72x56 --foot 51 --standing 'idle'
                                             # 시트로 묶기 전 낱장 PNG 검사(이름에 --standing 글자가 든 장은 발밑선에 닿아야 함)

검사 항목(오류): 칸 크기, 반투명 점, 팔레트 밖 색(낱장 모드에서는 16색 상한만), 발밑선 아래 점,
서 있는 장이 발밑선에 안 닿음, 빈 칸, 외곽선 끊김(주색이 투명과 바로 닿음, 흰색·노랑 빛은 예외), 외딴 점.
경고: 두 겹 외곽선 모서리.  오류가 하나라도 있으면 종료 코드 1.
"""
import argparse
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
OUTLINE = '#291a1f'
MAX_COLORS = 16
FX_COLORS = {'#ffffff', '#ffe15a'}
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def hexc(p):
    return '#%02x%02x%02x' % p[:3]


def check_frame(px, x0, y0, w, h, foot, palette, standing, fx_colors=FX_COLORS):
    errors, warnings = [], []

    def at(x, y):
        if x < 0 or y < 0 or x >= w or y >= h:
            return None
        p = px[x0 + x, y0 + y]
        return None if p[3] == 0 else hexc(p)

    semi = below = on_foot = solid = broken = lonely = doubles = 0
    off_pal, used = set(), set()
    for y in range(h):
        for x in range(w):
            a = px[x0 + x, y0 + y][3]
            if a not in (0, 255):
                semi += 1
            c = at(x, y)
            if not c:
                continue
            solid += 1
            used.add(c)
            if palette is not None and c not in palette:
                off_pal.add(c)
            if y > foot:
                below += 1
            if y == foot:
                on_foot += 1
            nb = [at(x + dx, y + dy) for dx, dy in N4]
            if not any(nb):
                lonely += 1
            is_open = any(n is None for n in nb)
            if is_open and c != OUTLINE and c not in fx_colors:
                broken += 1
            if is_open and c == OUTLINE and not any(n and n != OUTLINE for n in nb):
                ks = [d for d, n in zip(N4, nb) if n == OUTLINE]
                if len(ks) >= 3 or (len(ks) == 2 and (ks[0][0] != -ks[1][0] or ks[0][1] != -ks[1][1])):
                    doubles += 1
    if not solid:
        errors.append('empty frame')
    if semi:
        errors.append('%d semi-transparent pixels' % semi)
    if off_pal:
        errors.append('colors outside palette: ' + ' '.join(sorted(off_pal)))
    if len(used) > MAX_COLORS:
        errors.append('%d colors (max %d)' % (len(used), MAX_COLORS))
    if below:
        errors.append('%d pixels below the foot line y=%d' % (below, foot))
    if standing and solid and not on_foot:
        errors.append('standing frame does not touch the foot line y=%d' % foot)
    if broken:
        errors.append('%d fill pixels touch transparency (outline broken)' % broken)
    if lonely:
        errors.append('%d isolated pixels' % lonely)
    if doubles:
        warnings.append('%d doubled outline corners' % doubles)
    return errors, warnings, used


def check_species(sp):
    with open(os.path.join(ROOT, 'data', 'dot', sp + '.dot.json'), encoding='utf-8') as f:
        d = json.load(f)
    im = Image.open(os.path.join(ROOT, d['file'])).convert('RGBA')
    px = im.load()
    errors, warnings = [], []
    rows = -(-len(d['frames']) // d['cols'])
    if im.width != d['cols'] * d['frameW']:
        errors.append('sheet width %d != cols %d x %d' % (im.width, d['cols'], d['frameW']))
    if im.height != rows * d['frameH']:
        errors.append('sheet height %d != rows %d x %d' % (im.height, rows, d['frameH']))
    if not errors:
        standing = set(d.get('standing', []))
        pal = set(d['palette'])
        for i, name in enumerate(d['frames']):
            e, w, _ = check_frame(px, (i % d['cols']) * d['frameW'], (i // d['cols']) * d['frameH'],
                                  d['frameW'], d['frameH'], d['foot'], pal, name in standing)
            errors += ['%s: %s' % (name, m) for m in e]
            warnings += ['%s: %s' % (name, m) for m in w]
    return errors, warnings, len(d['frames'])


def check_files(paths, size, foot, standing_word):
    w, h = size
    errors, warnings, colors = [], [], set()
    for p in paths:
        im = Image.open(p).convert('RGBA')
        name = os.path.basename(p)
        if im.size != (w, h):
            errors.append('%s: size %dx%d != %dx%d' % (name, im.width, im.height, w, h))
            continue
        e, wr, used = check_frame(im.load(), 0, 0, w, h, foot, None, bool(standing_word) and standing_word in name)
        colors |= used
        errors += ['%s: %s' % (name, m) for m in e]
        warnings += ['%s: %s' % (name, m) for m in wr]
    if len(colors) > MAX_COLORS:
        errors.append('all frames together use %d colors (max %d)' % (len(colors), MAX_COLORS))
    return errors, warnings, len(paths)


def report(label, errors, warnings, count):
    print('[%s] %d frames: %d errors, %d warnings' % (label, count, len(errors), len(warnings)))
    for m in errors:
        print('  ERROR ' + m)
    for m in warnings:
        print('  warn  ' + m)


def main():
    ap = argparse.ArgumentParser(description='도트 규격 검사')
    ap.add_argument('species', nargs='*', help='검사할 종 id (비우면 index.json 전부)')
    ap.add_argument('--frames', nargs='+', help='낱장 PNG 검사')
    ap.add_argument('--size', default='72x56')
    ap.add_argument('--foot', type=int, default=51)
    ap.add_argument('--standing', default='idle', help='이 글자가 이름에 든 장은 발밑선에 닿아야 함')
    a = ap.parse_args()
    bad = False
    if a.frames:
        w, h = (int(v) for v in a.size.lower().split('x'))
        e, wr, n = check_files(a.frames, (w, h), a.foot, a.standing)
        report('frames', e, wr, n)
        bad = bool(e)
    else:
        sp_list = a.species
        if not sp_list:
            with open(os.path.join(ROOT, 'data', 'dot', 'index.json'), encoding='utf-8') as f:
                sp_list = json.load(f)['species']
        if not sp_list:
            print('no dot species registered yet')
        for sp in sp_list:
            e, wr, n = check_species(sp)
            report(sp, e, wr, n)
            bad = bad or bool(e)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
