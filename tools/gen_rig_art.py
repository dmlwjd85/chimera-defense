"""Part-separated art for the in-house rig engine (src/rig). One PNG per slot, drawn in the slot's local frame.

Writes:
  public/data/rig/{quadruped,bird,frog,bug}.template.json   skeletons (all share the quadruped bone names → one anims file)
  public/data/rig/<id>.rig.json                             per species/chimera skin: colors, slot sizes, stage proportions
  public/assets/rig/<id>/<slot>.png                         art (2 px per rig unit)
  public/data/rig/index.json                                list of rigs for the game
  public/assets/manifest.json                               texture keys rig-<id>-<slot>
Run: python3 tools/gen_rig_art.py   (needs rsvg-convert)
"""
import os, json, subprocess, math, copy

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'public', 'data', 'rig')
ART = os.path.join(ROOT, 'public', 'assets', 'rig')
RES = 2
INK = '#2b1d16'

def shade(c, k):
    c = c.lstrip('#'); r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    f = lambda v: max(0, min(255, int(v * k)))
    return '#%02x%02x%02x' % (f(r), f(g), f(b))

def st(w=6):
    return f'stroke="{INK}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"'

def grad(c, gid='g', vertical=True):
    x2, y2 = (0, 1) if vertical else (1, 0)
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{shade(c,1.15)}"/><stop offset="0.55" stop-color="{c}"/><stop offset="1" stop-color="{shade(c,0.75)}"/></linearGradient>'

def render(path, w, h, body, defs=''):
    """body is drawn in a frame whose origin is the image centre, x right, y down, units = rig units."""
    pad = 8
    W, H = w + pad * 2, h + pad * 2
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-W/2} {-H/2} {W} {H}" width="{int(W*RES)}" height="{int(H*RES)}"><defs>{defs}</defs>{body}</svg>'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path[:-4] + '.svg'
    open(tmp, 'w').write(svg)
    subprocess.run(['rsvg-convert', tmp, '-o', path], check=True)
    os.remove(tmp)

# ------------------------------------------------------------------ templates
def b(name, parent, x, y, rot=0, length=0, **k):
    d = {'name': name, 'x': x, 'y': y}
    if parent: d = {'name': name, 'parent': parent, 'x': x, 'y': y}
    if rot: d['rot'] = rot
    if length: d['length'] = length
    d.update(k); return d

def legs(par_front, par_back, fy, by, up=105, lo=118, rot=90, fx=(0, 15), bx=(10, 5)):
    out = []
    for side, dx, par, (x0, y0) in (('fr', -30, par_front, (fx[0], fy)), ('fn', fx[1], par_front, (0, fy)), ('br', -30, par_back, (bx[0], by)), ('bn', bx[1], par_back, (bx[0], by))):
        out.append(b(f'leg_{side}_up', par, x0 + dx, y0, rot=rot, length=up))
        out.append(b(f'leg_{side}_lo', f'leg_{side}_up', up, 0, rot=0, length=lo, foot=True))
    return out

def slot(name, bone, x=0, y=0, z=0, w=40, h=40, rot=0, **k):
    d = {'name': name, 'bone': bone, 'x': x, 'y': y, 'z': z, 'color': 'fur', 'ph': {'shape': 'ellipse', 'w': w, 'h': h}}
    if rot: d['rot'] = rot
    d.update(k); return d

def quad_template():
    B = [b('root', None, 0, 0), b('hips', 'root', -95, -250, length=200), b('chest', 'hips', 200, -12, length=60),
         b('neck', 'chest', 50, -40, rot=-55, length=70), b('head', 'neck', 70, 0, rot=55, length=90),
         b('jaw', 'head', 55, 30, rot=10, length=55), b('ear_r', 'head', -25, -55, rot=-110, length=70),
         b('ear_n', 'head', 5, -60, rot=-80, length=75), b('eye', 'head', 48, -14), b('horn', 'head', -5, -40),
         b('tail_1', 'hips', -45, -15, rot=195, length=75), b('tail_2', 'tail_1', 75, 0, rot=-12, length=75),
         b('tail_3', 'tail_2', 75, 0, rot=-14, length=70)]
    B += legs('chest', 'hips', 40, 45, up=82, lo=92)
    B += [b('wing', 'chest', -40, -10, rot=200, length=90), b('deco', 'chest', 20, 10)]
    S = [slot('leg_fr_lo', 'leg_fr_lo', 46, 0, 0, 124, 38), slot('leg_fr_up', 'leg_fr_up', 41, 0, 1, 128, 50),
         slot('leg_br_lo', 'leg_br_lo', 46, 0, 0, 124, 38), slot('leg_br_up', 'leg_br_up', 41, 0, 1, 140, 62),
         {'name': 'tail', 'bone': 'tail_1', 'z': 2, 'color': 'fur', 'rope': ['tail_1', 'tail_2', 'tail_3'], 'ropeSegments': 5, 'ph': {'shape': 'tail', 'w': 220, 'h': 90}},
         slot('ear_r', 'ear_r', 35, 0, 3, 80, 48), slot('wing', 'wing', 45, 0, 3.5, 120, 70, part=None),
         slot('body', 'hips', 105, -5, 4, 300, 165), slot('belly', 'hips', 120, 35, 5, 210, 70), slot('chest_fluff', 'chest', 15, 10, 6, 120, 140),
         slot('leg_bn_up', 'leg_bn_up', 41, 0, 7, 144, 66), slot('leg_bn_lo', 'leg_bn_lo', 46, 0, 7, 128, 42),
         slot('leg_fn_up', 'leg_fn_up', 41, 0, 8, 132, 54), slot('leg_fn_lo', 'leg_fn_lo', 46, 0, 8, 128, 42),
         slot('neck', 'neck', 35, 0, 9, 95, 85), slot('jaw', 'jaw', 28, 0, 10, 70, 30), slot('head', 'head', 30, -5, 11, 150, 120),
         slot('horn', 'horn', 0, 0, 11.5, 120, 80, part=None), slot('muzzle', 'head', 85, 15, 12, 85, 48, rot=10), slot('nose', 'head', 125, 10, 13, 22, 18),
         slot('ear_n', 'ear_n', 38, 0, 12, 85, 52), slot('eye', 'eye', 0, 0, 14, 34, 40), slot('deco', 'deco', 0, 0, 15, 10, 10, part=None)]
    return {'id': 'quadruped', 'canvas': 1024, 'baseline': 922,
            'notes': 'Rig space: feet on y=0, facing right, degrees clockwise positive. Child x/y are in the parent local space.',
            'bones': B, 'slots': S,
            'procedural': {'breath': {'slots': ['body', 'belly', 'chest_fluff'], 'period': 2.6, 'scaleY': 0.03},
                           'blink': {'slot': 'eye', 'min': 3, 'max': 6, 'close': 0.12},
                           'springs': [{'bones': ['tail_1', 'tail_2', 'tail_3'], 'stiffness': 60, 'damping': 8, 'limit': 35, 'sway': 0.12},
                                       {'bones': ['ear_n', 'ear_r'], 'stiffness': 120, 'damping': 12, 'limit': 20, 'sway': 0.05},
                                       {'bones': ['wing'], 'stiffness': 90, 'damping': 9, 'limit': 25, 'sway': 0.08}]}}

def bird_template():
    T = quad_template(); T['id'] = 'bird'
    B = [b('root', None, 0, 0), b('hips', 'root', -40, -175, length=140), b('chest', 'hips', 130, -10, length=40),
         b('neck', 'chest', 10, -40, rot=-70, length=40), b('head', 'neck', 40, 0, rot=70, length=80),
         b('jaw', 'head', 62, 16, rot=8, length=45), b('ear_r', 'head', -45, -35, rot=-150, length=60),
         b('ear_n', 'head', -5, -62, rot=-90, length=60), b('eye', 'head', 32, -12), b('horn', 'head', 0, -40),
         b('tail_1', 'hips', -55, -20, rot=205, length=60), b('tail_2', 'tail_1', 60, 0, rot=-15, length=55), b('tail_3', 'tail_2', 55, 0, rot=-15, length=50)]
    B += legs('hips', 'hips', 80, 80, up=45, lo=55, fx=(60, 60), bx=(20, 20))
    B += [b('wing', 'hips', 110, -20, rot=170, length=110), b('deco', 'chest', 0, 10)]
    T['bones'] = B
    over = {'leg_fr_lo': None, 'leg_fr_up': None, 'leg_br_lo': None, 'leg_br_up': None, 'neck': None, 'chest_fluff': None}
    S = []
    for s in T['slots']:
        if s['name'] in over: continue
        s = dict(s)
        geo = {'leg_bn_up': (22, 0, 70, 22), 'leg_bn_lo': (27, 0, 80, 16), 'leg_fn_up': (22, 0, 70, 22), 'leg_fn_lo': (27, 0, 80, 16),
               'body': (70, 0, 270, 210), 'belly': (95, 35, 170, 120), 'wing': (55, 0, 140, 90), 'head': (0, 0, 165, 155),
               'muzzle': (88, 0, 80, 46), 'jaw': (25, 0, 55, 24), 'nose': None, 'ear_n': (30, 0, 70, 60), 'ear_r': (30, 0, 70, 40),
               'eye': (0, 0, 36, 42)}.get(s['name'], 'keep')
        if geo is None: continue
        if geo != 'keep':
            s['x'], s['y'], w, h = geo; s['ph'] = {'shape': 'ellipse', 'w': w, 'h': h}; s.pop('rot', None)
        if s['name'] == 'wing': s['z'] = 6; s.pop('part', None)
        if s['name'] in ('leg_bn_up', 'leg_bn_lo'): s['z'] = 0.5
        if s['name'] == 'muzzle': s['z'] = 12
        S.append(s)
    T['slots'] = S
    T['procedural']['breath']['slots'] = ['body', 'belly']
    return T

def frog_template():
    T = quad_template(); T['id'] = 'frog'
    B = [b('root', None, 0, 0), b('hips', 'root', -60, -120, length=160), b('chest', 'hips', 150, -5, length=30),
         b('neck', 'chest', 0, -20, length=10), b('head', 'neck', 10, -60, length=100),
         b('jaw', 'head', 0, 52, length=120), b('ear_r', 'head', -55, -70, rot=-90, length=40),
         b('ear_n', 'head', 30, -78, rot=-90, length=45), b('eye', 'head', 36, -92), b('horn', 'head', -10, -60),
         b('tail_1', 'hips', -40, 0, rot=180, length=10), b('tail_2', 'tail_1', 10, 0, length=10), b('tail_3', 'tail_2', 10, 0, length=10),
         b('leg_fr_up', 'chest', -20, 55, rot=100, length=35), b('leg_fr_lo', 'leg_fr_up', 35, 0, rot=-10, length=35, foot=True),
         b('leg_fn_up', 'chest', 10, 55, rot=100, length=35), b('leg_fn_lo', 'leg_fn_up', 35, 0, rot=-10, length=35, foot=True),
         b('leg_br_up', 'hips', -5, 40, rot=40, length=70), b('leg_br_lo', 'leg_br_up', 70, 0, rot=95, length=50, foot=True),
         b('leg_bn_up', 'hips', 20, 40, rot=40, length=70), b('leg_bn_lo', 'leg_bn_up', 70, 0, rot=95, length=50, foot=True),
         b('wing', 'chest', 0, 0, length=10), b('deco', 'chest', 20, 10)]
    T['bones'] = B
    geo = {'leg_fr_lo': (17, 0, 60, 26), 'leg_fr_up': (17, 0, 55, 30), 'leg_br_up': (35, 0, 110, 70), 'leg_br_lo': (25, 0, 75, 28),
           'leg_bn_up': (35, 0, 115, 75), 'leg_bn_lo': (25, 0, 78, 30), 'leg_fn_up': (17, 0, 58, 32), 'leg_fn_lo': (17, 0, 62, 28),
           'body': (90, 0, 330, 210), 'belly': (110, 40, 230, 120), 'head': (0, 0, 240, 170), 'jaw': (10, 0, 150, 34),
           'ear_n': (12, 0, 74, 74), 'ear_r': (12, 0, 62, 62), 'eye': (0, 0, 46, 52)}
    S = []
    for s in T['slots']:
        if s['name'] in ('tail', 'neck', 'chest_fluff', 'muzzle', 'nose', 'wing'): continue
        s = dict(s)
        if s['name'] in geo:
            s['x'], s['y'], w, h = geo[s['name']]; s['ph'] = {'shape': 'ellipse', 'w': w, 'h': h}; s.pop('rot', None)
        if s['name'] in ('ear_n', 'ear_r'): s['z'] = 12.5 if s['name'] == 'ear_n' else 10.5
        S.append(s)
    T['slots'] = S
    T['procedural']['breath']['slots'] = ['body', 'belly']
    T['procedural']['springs'] = [{'bones': ['ear_n', 'ear_r'], 'stiffness': 140, 'damping': 12, 'limit': 12, 'sway': 0.04}]
    return T

def bug_template():
    T = bird_template(); T['id'] = 'bug'
    for bn in T['bones']:
        if bn['name'] == 'hips': bn.update(x=-40, y=-150, length=170)
        if bn['name'] == 'ear_n': bn.update(x=10, y=-60, rot=-75, length=110)
        if bn['name'] == 'ear_r': bn.update(x=-20, y=-60, rot=-100, length=110)
        if bn['name'] in ('leg_bn_up', 'leg_br_up'): bn.update(x=20, y=30, rot=-40, length=90)
        if bn['name'] in ('leg_bn_lo', 'leg_br_lo'): bn.update(rot=150, length=135)
        if bn['name'] in ('leg_fn_up', 'leg_fr_up'): bn.update(x=150, y=50, rot=100, length=50)
        if bn['name'] in ('leg_fn_lo', 'leg_fr_lo'): bn.update(length=58)
        if bn['name'] == 'wing': bn.update(x=120, y=-40, rot=185, length=150)
        if bn['name'] == 'deco': bn.update(x=50, y=55)
    for s in T['slots']:
        if s['name'] == 'body': s.update(x=85, y=0); s['ph'] = {'shape': 'ellipse', 'w': 270, 'h': 140}
        if s['name'] == 'belly': s.update(x=95, y=30); s['ph'] = {'shape': 'ellipse', 'w': 190, 'h': 70}
        if s['name'] in ('ear_n', 'ear_r'): s.update(x=55, y=0); s['ph'] = {'shape': 'ellipse', 'w': 120, 'h': 30}
        if s['name'] == 'leg_bn_up': s.update(x=45, z=7.2); s['ph'] = {'shape': 'ellipse', 'w': 120, 'h': 48}
        if s['name'] == 'leg_bn_lo': s.update(x=67, z=7.1); s['ph'] = {'shape': 'ellipse', 'w': 150, 'h': 22}
        if s['name'] == 'wing': s.update(x=75, z=4.5); s['ph'] = {'shape': 'ellipse', 'w': 170, 'h': 60}
        if s['name'] == 'tail': s['part'] = None
        if s['name'] == 'muzzle': s.update(x=70, y=25); s['ph'] = {'shape': 'ellipse', 'w': 40, 'h': 30}
        if s['name'] == 'deco': s.pop('part', None); s['ph'] = {'shape': 'ellipse', 'w': 120, 'h': 110}
    return T

# ------------------------------------------------------------------ shading helpers (cel shade + rim light + fur)
_cid = [0]
def cel(shape, c, w, h, fill='url(#g)', light=True, sw=6):
    """shape: an SVG element string WITHOUT fill/stroke (e.g. '<ellipse cx=.. />'). Adds cel shadow, highlight and outline."""
    _cid[0] += 1; cid = f'c{_cid[0]}'
    base = shape.replace('/>', f' fill="{fill}"/>')
    out = f'<clipPath id="{cid}">{shape}</clipPath>' + base
    out += f'<g clip-path="url(#{cid})"><ellipse cx="{w*0.12}" cy="{h*0.38}" rx="{w*0.62}" ry="{h*0.42}" fill="{shade(c,0.7)}" opacity="0.55"/>'
    if light: out += f'<ellipse cx="{-w*0.18}" cy="{-h*0.26}" rx="{w*0.26}" ry="{h*0.16}" fill="#ffffff" opacity="0.32"/>'
    out += '</g>' + shape.replace('/>', f' fill="none" {st(sw)}/>')
    return out

def fur(w, h, c, n=7, seed=1):
    import random as _r
    r = _r.Random(seed); out = ''
    for _ in range(n):
        x, y = r.uniform(-w*0.38, w*0.3), r.uniform(-h*0.38, h*0.1)
        out += f'<path d="M{x:.1f} {y:.1f} q{4:.1f} {6:.1f} {1:.1f} {12:.1f}" fill="none" stroke="{shade(c,0.72)}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>'
    return out

FURRY = {'dog', 'monkey', 'dog_spirit', 'monkey_spirit', 'fox_spirit', 'wolf_spirit', 'bear_spirit', 'rabbit_spirit', 'bison_spirit', 'bighorn_spirit', 'tiger_spirit', 'fox', 'wolf', 'bear', 'rabbit', 'bison', 'bighorn', 'cheese_thief', 'wolf_in_sheep', 'bear_tiger', 'jackalope', 'tiger'}

# ------------------------------------------------------------------ slot painters (local frame, centred)
def eye_art(w, h, iris='#3a2414', angry=False, lash=False):
    r = h / 2
    out = f'<ellipse cx="0" cy="0" rx="{w/2-2}" ry="{h/2-2}" fill="#fff" {st(5)}/>'
    out += f'<ellipse cx="{w*0.08}" cy="{h*0.05}" rx="{w*0.32}" ry="{h*0.36}" fill="{iris}"/><ellipse cx="{w*0.12}" cy="{h*0.1}" rx="{w*0.17}" ry="{h*0.2}" fill="#111"/>'
    out += f'<ellipse cx="{w*0.08}" cy="{h*0.2}" rx="{w*0.22}" ry="{h*0.1}" fill="#ffffff" opacity="0.25"/>'
    out += f'<circle cx="{-w*0.08}" cy="{-h*0.14}" r="{w*0.13}" fill="#fff"/><circle cx="{w*0.2}" cy="{h*0.22}" r="{w*0.06}" fill="#fff"/>'
    out += f'<path d="M{-w*0.42} {-h*0.3} Q0 {-h*0.62} {w*0.44} {-h*0.34}" fill="none" stroke="{INK}" stroke-width="{max(3,w*0.09)}" stroke-linecap="round"/>'
    if angry: out += f'<path d="M{-w/2} {-h/2-2} L{w/2} {-h/2+8}" {st(7)} fill="none"/>'
    if lash: out += f'<path d="M{w*0.3} {-h*0.42} l10 -8" {st(4)}/>'
    return out

def capsule(w, h, c, end=None, taper=1.0):
    """Horizontal limb along +x; `end` paints a paw/foot at +x."""
    r0, r1 = h / 2, h / 2 * taper
    x0, x1 = -w / 2 + r0, w / 2 - r1
    d = f'M{x0} {-r0} L{x1} {-r1} A{r1} {r1} 0 0 1 {x1} {r1} L{x0} {r0} A{r0} {r0} 0 0 1 {x0} {-r0} Z'
    out = cel(f'<path d="{d}"/>', c, w, h)
    if end:
        px = w / 2 - r1 * 0.9
        out += f'<ellipse cx="{px}" cy="0" rx="{r1*0.95}" ry="{r1*1.15}" fill="{end}" {st(5)}/>'
        out += f'<path d="M{px+r1*0.2} {-r1*0.45} l{r1*0.55} 0 M{px+r1*0.25} {r1*0.4} l{r1*0.5} 0" stroke="{shade(end,0.6)}" stroke-width="3" stroke-linecap="round"/>'
    return out, grad(c, vertical=False)

def paint_quad(sp, s, w, h):
    c, dark, belly = sp['c'], sp.get('dark', shade(sp['c'], 0.72)), sp.get('belly', '#f6e7cf')
    n = s
    if n.startswith('leg_'):
        far = n[4] == 'f' and n[5] == 'r' or n[4:6] == 'br'
        col = dark if far else c
        lo = n.endswith('_lo')
        body, g = capsule(w, h, col, end=(sp.get('paw', shade(col, 0.85)) if lo else None), taper=0.85 if lo else 0.8)
        if sp.get('stripes') and not lo: body += f'<path d="M-10 {-h/2+4} l8 {h*0.5} M20 {-h/2+4} l6 {h*0.45}" {st(6)} fill="none"/>'
        if sp.get('sock') and lo: body += f'<ellipse cx="{w*0.25}" cy="0" rx="{w*0.22}" ry="{h*0.45}" fill="{sp["sock"]}" opacity="0.9"/>'
        return body, g
    if n == 'body':
        out = cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h)
        if sp.get('id') in FURRY: out += fur(w, h, c, 9, len(sp.get('id', '')))
        if sp.get('hump'): out += f'<path d="M{-w*0.05} {-h*0.3} C {w*0.05} {-h*0.75} {w*0.4} {-h*0.7} {w*0.42} {-h*0.2} Z" fill="{sp["hump"]}" {st()}/>'
        for i in range(4 if sp.get('stripes') else 0):
            x = -w * 0.3 + i * w * 0.17
            out += f'<path d="M{x} {-h/2+6} C {x+14} {-h*0.2} {x-4} {-h*0.05} {x+8} {h*0.08}" fill="none" {st(10)}/>'
        if sp.get('spots'): out += ''.join(f'<ellipse cx="{x}" cy="{y}" rx="14" ry="10" fill="{shade(c,0.7)}"/>' for x, y in sp['spots'])
        if sp.get('wool'): out += ''.join(f'<circle cx="{-w*0.38 + i*w*0.15}" cy="{-h*0.05 + (i%2)*h*0.18}" r="{h*0.32}" fill="#fbfbf7" {st(5)}/>' for i in range(6))
        return out, grad(c)
    if n == 'belly':
        return f'<ellipse cx="0" cy="0" rx="{w/2-2}" ry="{h/2-2}" fill="{belly}" opacity="0.95"/>', ''
    if n == 'chest_fluff':
        pts = ' '.join(f'{(w/2-4)*math.cos(a/12*math.pi*2):.1f},{(h/2-4)*math.sin(a/12*math.pi*2)*(1 if a%2 else 0.86):.1f}' for a in range(12))
        return f'<polygon points="{pts}" fill="{sp.get("fluff", belly)}" {st(5)}/>', ''
    if n == 'neck':
        return cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h, light=False) + (f'<path d="M{-w*0.45} {-h*0.2} C {-w*0.6} {-h*0.9} {w*0.2} {-h*0.9} {w*0.35} {-h*0.4}" fill="none" stroke="{sp["mane"]}" stroke-width="26" stroke-linecap="round"/>' if sp.get('mane') else ''), grad(c)
    if n == 'head':
        out = ''
        if sp.get('id') in FURRY and sp.get('ears') != 'long':
            out += f'<path d="M{-w*0.42} {h*0.05} L{-w*0.56} {h*0.22} L{-w*0.4} {h*0.2} L{-w*0.5} {h*0.36} L{-w*0.28} {h*0.3} Z" fill="{shade(c,0.9)}" {st(5)}/>'
        out += cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h)
        out += f'<path d="M{w*0.02} {-h*0.34} q{w*0.08} {-h*0.06} {w*0.16} {-h*0.01}" fill="none" stroke="{shade(c,0.55)}" stroke-width="4" stroke-linecap="round"/>'
        if sp.get('faceMask'): out += f'<path d="M{w*0.05} {h*0.02} C {w*0.3} {-h*0.1} {w*0.5} {h*0.05} {w*0.48} {h*0.2} C {w*0.3} {h*0.48} {w*0.0} {h*0.45} {w*0.05} {h*0.02} Z" fill="{belly}"/>'
        for i in range(3 if sp.get('stripes') else 0):
            x = -w * 0.15 + i * w * 0.14
            out += f'<path d="M{x} {-h/2+5} l{4} {h*0.18}" {st(8)} fill="none"/>'
        if sp.get('stripes'): out += f'<path d="M{-w*0.42} {-h*0.05} l{w*0.12} {h*0.03} M{-w*0.42} {h*0.12} l{w*0.12} {-h*0.02}" {st(7)} fill="none"/>'
        out += eye_art(w * 0.13, h * 0.24, sp.get('eyeCol', '#3a2414')).replace('<ellipse cx="0" cy="0"', f'<ellipse cx="{w*0.05}" cy="{-h*0.12}"', 1).replace('cx="', 'cx="', 0) if False else ''
        # far eye (static, smaller)
        fx, fy = w * 0.02, -h * 0.1
        out += f'<g transform="translate({fx} {fy}) scale(0.72)">{eye_art(34, 40, sp.get("eyeCol", "#3a2414"))}</g>'
        out += f'<ellipse cx="{w*0.2}" cy="{h*0.22}" rx="15" ry="8" fill="#ff7b8a" opacity="0.55"/>'
        if sp.get('headband'): out += f'<path d="M{-w*0.45} {-h*0.18} C {-w*0.1} {-h*0.5} {w*0.25} {-h*0.48} {w*0.42} {-h*0.25}" fill="none" stroke="{INK}" stroke-width="18" stroke-linecap="round"/><path d="M{-w*0.45} {-h*0.18} C {-w*0.1} {-h*0.5} {w*0.25} {-h*0.48} {w*0.42} {-h*0.25}" fill="none" stroke="#6aa84f" stroke-width="10" stroke-linecap="round"/>'
        return out, grad(c)
    if n == 'muzzle':
        kind = sp.get('snout', 'long')
        col = sp.get('snoutCol', belly)
        if kind == 'round':
            return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{col}" {st()}/><ellipse cx="{w*0.28}" cy="{-h*0.15}" rx="{w*0.15}" ry="{h*0.18}" fill="{INK}"/><path d="M{-w*0.1} {h*0.22} q{w*0.15} {h*0.15} {w*0.3} 0" fill="none" {st(4)}/>', ''
        if kind == 'bunny':
            return f'<ellipse cx="0" cy="0" rx="{w/2-6}" ry="{h/2-4}" fill="{col}" {st(5)}/><path d="M{w*0.2} {-h*0.25} l{w*0.14} 0 l{-w*0.07} {h*0.22} z" fill="#ff8fa3" {st(4)}/>', ''
        return f'<path d="M{-w/2+4} {-h*0.3} C {w*0.2} {-h*0.5} {w/2} {-h*0.2} {w/2-4} {h*0.05} C {w*0.3} {h/2-2} {-w*0.2} {h/2-2} {-w/2+4} {h*0.25} Z" fill="{col}" {st()}/><ellipse cx="{w*0.36}" cy="{-h*0.12}" rx="{w*0.12}" ry="{h*0.17}" fill="{INK}"/>', ''
    if n == 'nose':
        return '', ''
    if n == 'jaw':
        return f'<path d="M{-w/2+3} {-h/2+3} L{w/2-3} {-h/2+5} C {w*0.3} {h/2} {-w*0.3} {h/2} {-w/2+3} {-h/2+3} Z" fill="{sp.get("mouth", "#9b3b3b")}" {st(5)}/><path d="M{-w*0.2} {-h*0.05} q{w*0.2} {h*0.25} {w*0.4} 0" fill="#ff8fa3"/>', ''
    if n in ('ear_n', 'ear_r'):
        kind = sp.get('ears', 'point')
        col = c if n == 'ear_n' else dark
        inner = sp.get('earIn', '#ffd2c4')
        if kind == 'round':
            return f'<circle cx="0" cy="0" r="{min(w,h)/2-3}" fill="{col}" {st()}/><circle cx="2" cy="0" r="{min(w,h)/4}" fill="{inner}"/>', ''
        if kind == 'long':
            return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{col}" {st()}/><ellipse cx="4" cy="0" rx="{w*0.36}" ry="{h*0.22}" fill="{inner}"/>', ''
        if kind == 'small':
            return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{col}" {st()}/><ellipse cx="3" cy="0" rx="{w*0.25}" ry="{h*0.2}" fill="{inner}"/>', ''
        return f'<path d="M{-w/2+3} {-h/2+3} L{w/2-3} 0 L{-w/2+3} {h/2-3} Z" fill="{col}" {st()}/><path d="M{-w/2+14} {-h*0.22} L{w*0.25} 0 L{-w/2+14} {h*0.22} Z" fill="{inner}"/>', ''
    if n == 'eye':
        return eye_art(w, h, sp.get('eyeCol', '#3a2414'), sp.get('angry', False)), ''
    if n == 'tail':
        kind = sp.get('tail', 'fluffy')
        tip = sp.get('tailTip')
        if kind == 'fluffy':
            pts_top = ' '.join(f'L{x:.1f} {-(h/2-6)*math.sin(math.pi*min(1, 0.22 + (x+w/2)/w*0.85))-4:.1f}' for x in [(-w/2 + i * w / 20) for i in range(21)])
            pts_bot = ' '.join(f'L{x:.1f} {(h/2-6)*math.sin(math.pi*min(1, 0.22 + (x+w/2)/w*0.85))+4:.1f}' for x in [(w/2 - i * w / 20) for i in range(21)])
            d = f'M{-w/2} 0 {pts_top} {pts_bot} Z'
            out = f'<path d="{d}" fill="url(#g)" {st()}/>'
            out += ''.join(f'<path d="M{x:.0f} {-h*0.18:.0f} q8 6 18 2" fill="none" stroke="{shade(c,0.7)}" stroke-width="3" opacity="0.7"/>' for x in (-w*0.25, -w*0.05, w*0.15))
            if tip: out += f'<clipPath id="tc"><path d="{d}"/></clipPath><rect x="{w*0.25}" y="{-h/2}" width="{w*0.3}" height="{h}" fill="{tip}" clip-path="url(#tc)"/><path d="{d}" fill="none" {st()}/>'
            return out, grad(c)
        if kind == 'thin':
            out = f'<path d="M{-w/2+6} 0 C {-w*0.1} {-h*0.05} {w*0.2} {h*0.05} {w/2-10} 0" fill="none" stroke="{INK}" stroke-width="{h*0.32}" stroke-linecap="round"/><path d="M{-w/2+6} 0 C {-w*0.1} {-h*0.05} {w*0.2} {h*0.05} {w/2-10} 0" fill="none" stroke="{c}" stroke-width="{h*0.2}" stroke-linecap="round"/>'
            if sp.get('stripes'): out += ''.join(f'<path d="M{x} {-h*0.12} l0 {h*0.24}" {st(6)}/>' for x in (-w*0.1, w*0.12, w*0.32))
            return out, ''
        if kind == 'tuft':
            return f'<path d="M{-w/2+6} 0 L{w*0.1} 0" stroke="{INK}" stroke-width="16" stroke-linecap="round"/><path d="M{-w/2+6} 0 L{w*0.1} 0" stroke="{dark}" stroke-width="7" stroke-linecap="round"/><ellipse cx="{w*0.18}" cy="0" rx="22" ry="16" fill="{dark}" {st(5)}/>', ''
        # stub: a puff at the base only
        return f'<circle cx="{-w/2+30}" cy="0" r="28" fill="{sp.get("tailCol", belly)}" {st(5)}/>', ''
    if n == 'horn':
        kind = sp.get('horns')
        if kind == 'short':
            one = lambda x, sgn: f'<path d="M{x} 20 C {x+sgn*-30} -10 {x+sgn*-10} -40 {x+sgn*15} -35" fill="none" stroke="{INK}" stroke-width="24" stroke-linecap="round"/><path d="M{x} 20 C {x+sgn*-30} -10 {x+sgn*-10} -40 {x+sgn*15} -35" fill="none" stroke="#efe6cf" stroke-width="12" stroke-linecap="round"/>'
            return one(-30, 1) + one(30, -1), ''
        if kind == 'curl':
            return f'<path d="M10 -20 C -50 -40 -60 30 -10 40 C 20 45 30 20 10 10" fill="none" stroke="{INK}" stroke-width="36" stroke-linecap="round"/><path d="M10 -20 C -50 -40 -60 30 -10 40 C 20 45 30 20 10 10" fill="none" stroke="#d9c49a" stroke-width="22" stroke-linecap="round"/>', ''
        if kind == 'antler':
            one = lambda x, sgn: (f'<path d="M{x} 35 L{x+sgn*5} -30 M{x+sgn*3} 0 L{x+sgn*28} -18 M{x+sgn*5} -22 L{x-sgn*15} -38" stroke="{INK}" stroke-width="16" stroke-linecap="round" fill="none"/>'
                                  f'<path d="M{x} 35 L{x+sgn*5} -30 M{x+sgn*3} 0 L{x+sgn*28} -18 M{x+sgn*5} -22 L{x-sgn*15} -38" stroke="#c49a6c" stroke-width="7" stroke-linecap="round" fill="none"/>')
            return one(-25, -1) + one(25, 1), ''
        return '', ''
    if n == 'wing':
        col = sp.get('wingCol', '#2f3542')
        return f'<path d="M{-w/2+4} {-h*0.3} C {0} {-h/2} {w*0.4} {-h*0.3} {w/2-4} 0 C {w*0.2} {h*0.1} {w*0.1} {h*0.4} {-w*0.05} {h*0.25} C {-w*0.15} {h/2-4} {-w*0.35} {h*0.2} {-w/2+4} {-h*0.3} Z" fill="{col}" {st()}/>', ''
    if n == 'deco':
        return sp.get('decoArt', ''), ''
    return '', ''

def paint_bird(sp, s, w, h):
    c = sp['c']
    if s.startswith('leg_'):
        lo = s.endswith('_lo')
        out = f'<path d="M{-w/2+4} 0 L{w/2-8} 0" stroke="{INK}" stroke-width="{h}" stroke-linecap="round"/><path d="M{-w/2+4} 0 L{w/2-8} 0" stroke="#f2b134" stroke-width="{h-8}" stroke-linecap="round"/>'
        if lo: out += f'<path d="M{w/2-8} 0 l14 -16 M{w/2-8} 0 l18 0 M{w/2-8} 0 l14 16" stroke="{INK}" stroke-width="9" stroke-linecap="round"/><path d="M{w/2-8} 0 l14 -16 M{w/2-8} 0 l18 0 M{w/2-8} 0 l14 16" stroke="#f2b134" stroke-width="4" stroke-linecap="round"/>'
        return out, ''
    if s == 'body':
        sc = ''.join(f'<path d="M{x:.0f} {y:.0f} q8 10 16 0" fill="none" stroke="{shade(c,0.75)}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>' for x in (-w*0.2, 0, w*0.2, -w*0.1, w*0.1) for y in ((-h*0.15,) if x in (-w*0.2, 0, w*0.2) else (h*0.05,)))
        return cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h) + sc + sp.get('bodyArt', ''), grad(c)
    if s == 'belly':
        return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{sp.get("belly", shade(c,1.25))}" opacity="0.9"/>', ''
    if s == 'wing':
        col = sp.get('wingCol', shade(c, 0.75))
        out = f'<path d="M{-w/2+4} {-h*0.25} C {-w*0.1} {-h/2} {w*0.35} {-h*0.4} {w/2-4} {-h*0.05} C {w*0.3} {h*0.15} {w*0.15} {h*0.3} {w*0.02} {h*0.2} C {-w*0.1} {h/2-4} {-w*0.3} {h*0.25} {-w/2+4} {-h*0.25} Z" fill="{col}" {st()}/>'
        out += ''.join(f'<path d="M{x} {-h*0.12} q{w*0.08} {h*0.18} {w*0.02} {h*0.32}" fill="none" stroke="{shade(col,0.7)}" stroke-width="5" stroke-linecap="round"/>' for x in (-w*0.05, w*0.12, w*0.28))
        return out + sp.get('wingArt', ''), ''
    if s == 'head':
        hc = sp.get('headCol', c)
        out = cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', hc, w, h)
        out += f'<g transform="translate({-w*0.02} {-h*0.08}) scale(0.7)">{eye_art(36, 42)}</g>'
        out += f'<ellipse cx="{w*0.12}" cy="{h*0.22}" rx="14" ry="8" fill="#ff7b8a" opacity="0.55"/>'
        if sp.get('crestArt'): out += sp['crestArt']
        return out, grad(hc)
    if s == 'muzzle':
        bk = sp.get('beak', '#f2b134')
        out = f'<path d="M{-w/2+4} {-h/2+4} C {w*0.2} {-h/2} {w/2} {-h*0.1} {w/2-4} {h*0.15} C {w*0.2} {h*0.25} {-w*0.2} {h*0.3} {-w/2+4} {h*0.2} Z" fill="{bk}" {st()}/>'
        if sp.get('hook'): out += f'<path d="M{w*0.35} {-h*0.05} C {w/2} {h*0.2} {w*0.42} {h*0.45} {w*0.28} {h*0.3}" fill="{bk}" {st(5)}/>'
        return out, ''
    if s == 'jaw':
        return f'<path d="M{-w/2+3} {-h/2+3} L{w/2-3} {-h/2+3} C {w*0.1} {h/2-2} {-w*0.3} {h/2-2} {-w/2+3} {-h/2+3} Z" fill="{shade(sp.get("beak", "#f2b134"),0.85)}" {st(5)}/>', ''
    if s == 'ear_n':
        if sp.get('comb'):
            return f'<path d="M{-w/2+4} {h*0.3} C {-w*0.4} {-h*0.5} {-w*0.1} {-h*0.4} {-w*0.05} {-h*0.1} C {0} {-h/2} {w*0.3} {-h*0.45} {w*0.2} {-h*0.05} C {w*0.45} {-h*0.3} {w/2} {h*0.1} {w*0.3} {h*0.35} Z" fill="#e53935" {st()}/>', ''
        return '', ''
    if s == 'ear_r':
        if sp.get('crest'):
            col = sp['crest']
            return f'<path d="M{-w/2+4} 0 L{w/2-4} {-h*0.35} L{w*0.1} 0 L{w/2-4} {h*0.35} Z" fill="{col}" {st(5)}/>', ''
        return '', ''
    if s == 'eye':
        return eye_art(w, h, sp.get('eyeCol', '#3a2414'), sp.get('angry', False)), ''
    if s == 'tail':
        col = sp.get('tailCol', shade(c, 0.8))
        out = ''
        for i, k in enumerate((-0.32, 0, 0.32)):
            out += f'<path d="M{-w/2+4} 0 C {-w*0.1} {h*k*0.6} {w*0.25} {h*k} {w/2-6} {h*k*1.1}" fill="none" stroke="{INK}" stroke-width="{h*0.36}" stroke-linecap="round"/>'
        for i, k in enumerate((-0.32, 0, 0.32)):
            out += f'<path d="M{-w/2+4} 0 C {-w*0.1} {h*k*0.6} {w*0.25} {h*k} {w/2-6} {h*k*1.1}" fill="none" stroke="{col if i != 1 else sp.get("tailCol2", col)}" stroke-width="{h*0.24}" stroke-linecap="round"/>'
        return out, ''
    if s == 'deco':
        return sp.get('decoArt', ''), ''
    return '', ''

def paint_frog(sp, s, w, h):
    c, belly = sp['c'], sp.get('belly', '#e6f2b0')
    if s.startswith('leg_'):
        lo = s.endswith('_lo'); far = s[4:6] in ('fr', 'br')
        col = shade(c, 0.8) if far else c
        if lo:
            out = f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{col}" {st()}/>'
            out += ''.join(f'<circle cx="{w/2-8}" cy="{y}" r="7" fill="{shade(col,1.1)}" {st(4)}/>' for y in (-h*0.3, 0, h*0.3))
            return out, ''
        return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="url(#g)" {st()}/>', grad(col)
    if s == 'body':
        out = cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h)
        out += ''.join(f'<ellipse cx="{x}" cy="{y}" rx="13" ry="9" fill="{shade(c,0.8)}"/>' for x, y in ((-w*0.2, -h*0.25), (-w*0.32, 0), (0, -h*0.33)))
        if sp.get('hump'): out += f'<path d="M{-w*0.3} {-h*0.25} C {-w*0.2} {-h*0.65} {w*0.15} {-h*0.62} {w*0.2} {-h*0.25} Z" fill="{sp["hump"]}" {st()}/>'
        return out, grad(c)
    if s == 'belly':
        return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{belly}"/>', ''
    if s == 'head':
        out = cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h)
        out += f'<path d="M{-w*0.3} {h*0.18} C {-w*0.05} {h*0.42} {w*0.25} {h*0.4} {w*0.42} {h*0.1}" fill="none" {st(7)}/>'
        out += f'<ellipse cx="{-w*0.2}" cy="{h*0.05}" rx="15" ry="8" fill="#ff7b8a" opacity="0.55"/><ellipse cx="{w*0.3}" cy="{h*0.05}" rx="15" ry="8" fill="#ff7b8a" opacity="0.55"/>'
        out += f'<circle cx="{w*0.4}" cy="{-h*0.1}" r="4" fill="{INK}"/><circle cx="{w*0.44}" cy="{-h*0.14}" r="4" fill="{INK}"/>'
        return out, grad(c)
    if s == 'jaw':
        return f'<path d="M{-w/2+6} {-h/2+4} L{w/2-6} {-h/2+4} C {w*0.25} {h/2-2} {-w*0.25} {h/2-2} {-w/2+6} {-h/2+4} Z" fill="#b84a4a" {st(5)}/><ellipse cx="0" cy="{h*0.05}" rx="{w*0.15}" ry="{h*0.2}" fill="#ff8fa3"/>', ''
    if s in ('ear_n', 'ear_r'):
        out = f'<circle cx="0" cy="0" r="{min(w,h)/2-3}" fill="url(#g)" {st()}/>'
        if s == 'ear_r': out += f'<g transform="scale(0.8)">{eye_art(40, 46)}</g>'
        return out, grad(c)
    if s == 'eye':
        return eye_art(w, h), ''
    if s == 'horn':
        if sp.get('horns'):
            one = lambda x, sgn: f'<path d="M{x} 25 C {x+sgn*-40} 0 {x+sgn*-35} -35 {x+sgn*-10} -40" fill="none" stroke="{INK}" stroke-width="24" stroke-linecap="round"/><path d="M{x} 25 C {x+sgn*-40} 0 {x+sgn*-35} -35 {x+sgn*-10} -40" fill="none" stroke="#efe6cf" stroke-width="12" stroke-linecap="round"/>'
            return one(-25, 1) + one(25, -1), ''
        return '', ''
    return '', ''

def paint_bug(sp, s, w, h):
    c = sp['c']
    if s.startswith('leg_'):
        lo = s.endswith('_lo'); col = shade(c, 0.85)
        if s.startswith('leg_bn_up'):
            return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="url(#g)" {st()}/><path d="M{-w*0.3} 0 L{w*0.3} 0" stroke="{shade(c,0.7)}" stroke-width="5"/>', grad(c)
        return f'<path d="M{-w/2+4} 0 L{w/2-4} 0" stroke="{INK}" stroke-width="{h}" stroke-linecap="round"/><path d="M{-w/2+4} 0 L{w/2-4} 0" stroke="{col}" stroke-width="{max(3,h-9)}" stroke-linecap="round"/>', ''
    if s == 'body':
        out = cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h)
        out += ''.join(f'<path d="M{x} {-h*0.4} q6 {h*0.4} 0 {h*0.8}" fill="none" stroke="{shade(c,0.75)}" stroke-width="5"/>' for x in (-w*0.3, -w*0.15, 0))
        return out, grad(c)
    if s == 'belly':
        return f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}" fill="{shade(c,1.3)}" opacity="0.8"/>', ''
    if s == 'wing':
        if sp.get('noWing'): return '', ''
        return f'<path d="M{-w/2+4} 0 C {-w*0.2} {-h/2} {w*0.3} {-h/2} {w/2-4} {-h*0.1} C {w*0.3} {h*0.3} {-w*0.2} {h/2-4} {-w/2+4} 0 Z" fill="#cfe9a8" opacity="0.9" {st(5)}/><path d="M{-w*0.4} 0 L{w*0.4} {-h*0.1}" stroke="#9cc27a" stroke-width="4"/>', ''
    if s == 'head':
        out = cel(f'<ellipse cx="0" cy="0" rx="{w/2-3}" ry="{h/2-3}"/>', c, w, h)
        out += f'<g transform="translate({-w*0.05} {-h*0.08}) scale(0.75)">{eye_art(40, 48)}</g>'
        out += f'<path d="M{w*0.05} {h*0.28} C {w*0.15} {h*0.38} {w*0.28} {h*0.35} {w*0.33} {h*0.25}" fill="none" {st(5)}/><ellipse cx="{w*0.1}" cy="{h*0.18}" rx="13" ry="7" fill="#ff7b8a" opacity="0.55"/>'
        return out, grad(c)
    if s in ('ear_n', 'ear_r'):
        return f'<path d="M{-w/2+4} 0 C {-w*0.1} {-h*0.2} {w*0.2} {h*0.1} {w/2-10} {-h*0.1}" fill="none" stroke="{INK}" stroke-width="6" stroke-linecap="round"/><circle cx="{w/2-10}" cy="{-h*0.1}" r="6" fill="{INK}"/>', ''
    if s == 'eye':
        return eye_art(w, h), ''
    if s == 'muzzle':
        return f'<ellipse cx="0" cy="0" rx="{w/2-4}" ry="{h/2-4}" fill="{shade(c,0.85)}" {st(5)}/>', ''
    if s == 'jaw':
        return '', ''
    if s == 'deco':
        if sp.get('decoArt'): return sp['decoArt'], ''
        return (f'<g transform="rotate(-35)"><ellipse cx="-10" cy="10" rx="{w*0.3}" ry="{h*0.3}" fill="#c8833f" {st(5)}/><circle cx="-10" cy="10" r="10" fill="{INK}"/>'
                f'<rect x="{w*0.15}" y="2" width="{w*0.35}" height="14" fill="#8b5a2b" {st(4)}/></g>'), ''
    return '', ''

PAINT = {'quadruped': paint_quad, 'bird': paint_bird, 'frog': paint_frog, 'bug': paint_bug}

# ------------------------------------------------------------------ skins
YOUNG = {'head': 1.6, 'eye': 1.25, 'ear_n': 1.1, 'ear_r': 1.1, 'tail_1': 0.85, **{f'leg_{s}_{p}': 0.82 for s in ('fr', 'fn', 'br', 'bn') for p in ('up', 'lo')}}
TEEN = {'head': 1.45, 'eye': 1.14, 'tail_1': 0.95}

SKINS = {
 'fox': dict(t='quadruped', c='#e8823a', ears='point', snout='long', tail='fluffy', tailTip='#fff4e6', faceMask=True, sock='#3a2a20', fluff='#fff4e6'),
 'wolf': dict(t='quadruped', c='#8e9aa8', dark='#5d6773', ears='point', snout='long', tail='fluffy', tailTip='#e9edf2', eyeCol='#d4a017', earIn='#c9b8b8', faceMask=True, fluff='#e9edf2'),
 'bear': dict(t='quadruped', c='#8b5a2b', ears='round', snout='round', tail='stub', tailCol='#6b4420', snoutCol='#d9b38c', earIn='#d9b38c', fluff='#a7744a', over={'head': {'w': 165, 'h': 140}, 'body': {'w': 320, 'h': 180}, 'ear_n': {'x': 18, 'w': 56, 'h': 56}, 'ear_r': {'x': 18, 'w': 52, 'h': 52}}),
 'tiger': dict(t='quadruped', c='#f2a33a', ears='round', snout='round', tail='thin', stripes=True, earIn='#fff2df', snoutCol='#fff8ec', fluff='#fff8ec', over={'head': {'w': 160, 'h': 132}, 'ear_n': {'x': 18, 'w': 50, 'h': 50}, 'ear_r': {'x': 18, 'w': 46, 'h': 46}}),
 'rabbit': dict(t='quadruped', c='#f4f1ea', dark='#d8d1c3', belly='#ffffff', ears='long', snout='bunny', tail='stub', tailCol='#ffffff', eyeCol='#c2185b', earIn='#ffc1cc', fluff='#ffffff',
                over={'ear_n': {'x': 70, 'w': 150, 'h': 50}, 'ear_r': {'x': 65, 'w': 140, 'h': 46}, 'body': {'w': 270, 'h': 150}, 'muzzle': {'x': 80, 'y': 20, 'w': 60, 'h': 46}}),
 'bison': dict(t='quadruped', c='#6d4c35', dark='#4a3222', ears='small', snout='round', tail='tuft', horns='short', hump='#4a3222', snoutCol='#3a2a20', fluff='#4a3222', mane='#4a3222',
               over={'body': {'w': 330, 'h': 185}, 'horn': {'y': -15, 'w': 130, 'h': 90}, 'ear_n': {'w': 55, 'h': 36}, 'ear_r': {'w': 50, 'h': 34}}),
 'bighorn': dict(t='quadruped', c='#b08d6a', dark='#8a6b4e', ears='small', snout='long', tail='stub', tailCol='#f6e7cf', horns='curl', snoutCol='#f1e3cc', fluff='#f1e3cc',
                 over={'horn': {'x': -30, 'y': 5, 'w': 120, 'h': 110}, 'ear_n': {'w': 50, 'h': 34}, 'ear_r': {'w': 46, 'h': 32}}),
 'rooster': dict(t='bird', c='#fffaf0', belly='#ffffff', comb=True, beak='#f2b134', tailCol='#2e7d32', tailCol2='#c62828', wingCol='#f1e4cf',
                 decoArt='', over={'deco': {'x': 75, 'y': -60, 'w': 30, 'h': 45}}),
 'crow': dict(t='bird', c='#2f3542', belly='#4b5263', beak='#3a3a3a', tailCol='#1f232c', wingCol='#1f232c'),
 'eagle': dict(t='bird', c='#7a4a2a', headCol='#fbfbf7', belly='#9a6a45', beak='#f2b134', hook=True, angry=True, tailCol='#fbfbf7', wingCol='#5b361e', crest='#fbfbf7'),
 'frog': dict(t='frog', c='#5fae4a', belly='#e6f2b0'),
 'grasshopper': dict(t='bug', c='#7ccf4f'),
 'ant': dict(t='bug', c='#8a4b32', noWing=True, eyeCol='#2b1d16',
             decoArt='<g transform="rotate(-20)"><rect x="-28" y="-26" width="56" height="52" rx="10" fill="#fff6dd" stroke="#2b1d16" stroke-width="5"/><path d="M-14 -10 h28 M-14 6 h20" stroke="#e3d2a4" stroke-width="5"/></g>'),
 'dog': dict(t='quadruped', c='#e0a868', dark='#b8834a', belly='#fff6e6', ears='point', snout='round', tail='fluffy', tailTip='#fff6e6', snoutCol='#fff6e6', earIn='#f2c9a0', sock='#fff6e6', fluff='#fff6e6',
             over={'head': {'w': 158, 'h': 134}}),
 'monkey': dict(t='quadruped', c='#a8744a', dark='#7d5433', belly='#f2d3b0', ears='round', snout='round', tail='thin', snoutCol='#f2d3b0', earIn='#f2d3b0', faceMask=True, fluff='#c79a6e',
                over={'ear_n': {'x': 10, 'w': 60, 'h': 60}, 'ear_r': {'x': 10, 'w': 56, 'h': 56}, 'body': {'w': 260, 'h': 150}}),
 # chimeras (all born adult)
 'cheese_thief': dict(t='quadruped', c='#e8823a', ears='point', snout='long', tail='fluffy', tailTip='#2f3542', faceMask=True, sock='#2f3542', fluff='#fff4e6', wingCol='#2f3542', eyeCol='#222',
                      decoArt='<path d="M-40 -20 L40 -40 L30 30 Z" fill="#ffd54f" stroke="#2b1d16" stroke-width="5"/><circle cx="10" cy="-10" r="7" fill="#e6b800"/>', parts={'wing': 'wing', 'deco': 'deco'},
                      over={'deco': {'x': 165, 'y': -82, 'w': 70, 'h': 62}}),
 'bear_tiger': dict(t='quadruped', c='#b0702e', ears='round', snout='round', tail='thin', stripes=True, headband=True, snoutCol='#f2dcb8', earIn='#f2dcb8', fluff='#f2dcb8',
                    over={'head': {'w': 165, 'h': 140}, 'body': {'w': 320, 'h': 180}, 'ear_n': {'x': 18, 'w': 56, 'h': 56}, 'ear_r': {'x': 18, 'w': 52, 'h': 52}}),
 'wolf_in_sheep': dict(t='quadruped', c='#8e9aa8', dark='#5d6773', ears='point', snout='long', tail='stub', tailCol='#fbfbf7', wool=True, angry=True, eyeCol='#d4a017', faceMask=True, fluff='#fbfbf7'),
 'jackalope': dict(t='quadruped', c='#c9a27e', dark='#a07e5c', ears='long', snout='bunny', tail='stub', tailCol='#ffffff', horns='antler', earIn='#ffc1cc', fluff='#f6e7cf',
                   over={'ear_n': {'x': 60, 'w': 125, 'h': 44}, 'ear_r': {'x': 55, 'w': 115, 'h': 40}, 'horn': {'y': -30, 'w': 120, 'h': 100}, 'muzzle': {'x': 80, 'y': 20, 'w': 60, 'h': 46}}),
 'thunderbird': dict(t='bird', c='#2e5c8a', belly='#4a86c0', beak='#f2b134', hook=True, angry=True, tailCol='#1d3c5c', wingCol='#1d3c5c', crest='#ffe94d',
                     wingArt='<path d="M-20 -25 L10 -25 L-5 0 L20 0 L-25 40 L-12 8 L-32 8 Z" fill="#ffe94d" stroke="#2b1d16" stroke-width="4"/>'),
 'phoenix': dict(t='bird', c='#e53935', belly='#ffb74d', comb=True, beak='#ffd54f', hook=True, tailCol='#ff9800', tailCol2='#ffe082', wingCol='#ff7043', crest='#ffd54f'),
 'bullfrog': dict(t='frog', c='#7c8b3a', belly='#e8dfb0', horns=True, hump='#5a6528'),
}
# 신화급 전용 모습: 같은 뼈대에 신화 속 빛깔과 장식
SPIRIT = {
 'fox': dict(c='#fbf6ee', tailTip='#ff8fb1', sock='#c62828', earIn='#ff8fb1', fluff='#ffffff', eyeCol='#c2185b'),
 'tiger': dict(c='#f6f3ea', earIn='#ffe9ef', snoutCol='#ffffff', fluff='#ffffff', eyeCol='#2e86de'),
 'bear': dict(c='#a9785a', headband=True, snoutCol='#f2dcb8', earIn='#f2dcb8', fluff='#d9b38c'),
 'rabbit': dict(c='#cdeee0', dark='#9fd6c0', belly='#f4fffa', earIn='#8fd9c0', tailCol='#f4fffa', fluff='#f4fffa', eyeCol='#00897b'),
 'rooster': dict(c='#ffd54f', belly='#fff3b0', tailCol='#ff9800', tailCol2='#fff59d', wingCol='#ffb300', beak='#ff7043'),
 'crow': dict(c='#1c1c28', belly='#c62828', beak='#ffd54f', tailCol='#3a1a1a', wingCol='#3a1a1a', crest='#ffb300'),
 'bison': dict(c='#4a86c0', dark='#2e5c8a', hump='#2e5c8a', snoutCol='#1d3c5c', fluff='#2e5c8a', mane='#2e5c8a'),
 'wolf': dict(c='#3c4452', dark='#1f232c', tailTip='#9fb3c8', eyeCol='#ff5252', angry=True, earIn='#5d6773', fluff='#9fb3c8'),
 'eagle': dict(c='#c9a227', headCol='#fffbe6', belly='#e6c65a', wingCol='#8a6d1a', tailCol='#fffbe6', crest='#ffe94d',
               wingArt='<path d="M-20 -25 L10 -25 L-5 0 L20 0 L-25 40 L-12 8 L-32 8 Z" fill="#ffe94d" stroke="#2b1d16" stroke-width="4"/>'),
 'bighorn': dict(c='#f2c94c', dark='#c99a1e', snoutCol='#fff6d6', tailCol='#fff6d6', fluff='#fff6d6'),
 'frog': dict(c='#e6b422', belly='#fff3b0'),
 'grasshopper': dict(c='#b9a36a'),
 'ant': dict(c='#b87333'),
 'dog': dict(c='#e2522b', dark='#a8321a', tailTip='#ffd54f', sock='#ffb300', eyeCol='#ffd54f', earIn='#ffb300', fluff='#ffb300', snoutCol='#ffe0b2'),
 'monkey': dict(c='#d4a017', dark='#a67c00', headband=True, snoutCol='#ffe8c2', earIn='#ffe8c2', fluff='#ffe08a'),
}
for _k, _v in SPIRIT.items(): SKINS[_k + '_spirit'] = {**SKINS[_k], **_v}

STAGE_OF = {'young': ('어린', 0.62, 1.15, 1.2, YOUNG), 'teen': ('성장기', 0.82, 1.05, 1.08, TEEN), 'adult': ('성체', 1.0, 1.0, 1.0, {'head': 1.32, 'eye': 1.08}), 'spirit': ('영물', 1.12, 1.0, 1.0, {'head': 1.34, 'eye': 1.08})}

def main():
    templates = {'quadruped': quad_template(), 'bird': bird_template(), 'frog': frog_template(), 'bug': bug_template()}
    for k, T in templates.items():
        json.dump(T, open(os.path.join(DATA, f'{k}.template.json'), 'w'), ensure_ascii=False, indent=1)
    manifest_path = os.path.join(ROOT, 'public', 'assets', 'manifest.json')
    manifest = json.load(open(manifest_path))
    images = {k: v for k, v in manifest['images'].items() if not k.startswith('rig-')}
    index = []
    for sid, sp in SKINS.items():
        sp = {**sp, 'id': sid}
        T = templates[sp['t']]
        over = sp.get('over', {})
        parts = {}
        for s in T['slots']:
            if s.get('part', 'x') is None and s['name'] not in sp.get('parts', {}):
                if not (s['name'] == 'horn' and sp.get('horns')) and not (s['name'] == 'wing' and sp['t'] != 'quadruped'):
                    continue
            geo = {**s.get('ph', {}), **{k2: v for k2, v in over.get(s['name'], {}).items() if k2 in ('w', 'h')}}
            w, h = geo.get('w', 40), geo.get('h', 40)
            body, defs = PAINT[sp['t']](sp, s['name'], w, h)
            if not body: parts[s['name']] = None; continue
            path = os.path.join(ART, sid, s['name'] + '.png')
            render(path, w, h, body, defs)
            images[f'rig-{sid}-{s["name"]}'] = f'assets/rig/{sid}/{s["name"]}.png'
            if s.get('part', 'x') is None: parts[s['name']] = s['name']
        slot_over = {}
        for name, o in over.items():
            d = {k2: v for k2, v in o.items() if k2 in ('x', 'y', 'rot', 'z')}
            if 'w' in o or 'h' in o:
                base = next((s for s in T['slots'] if s['name'] == name), None)
                if base: d['ph'] = {**base.get('ph', {}), **{k2: o[k2] for k2 in ('w', 'h') if k2 in o}}
            if d: slot_over[name] = d
        stages = {}
        for stg, (label, scale, speed, amp, bs) in STAGE_OF.items():
            stages[stg] = {'label': label, 'scale': scale, 'speed': speed, 'amp': amp, 'boneScale': bs, 'parts': dict(parts)}
        rig = {'species': sid, 'skin': sid, 'template': sp['t'], 'anims': 'quadruped', 'artRes': RES,
               'palette': {'fur': sp['c'], 'furDark': shade(sp['c'], 0.72), 'belly': sp.get('belly', '#f6e7cf'), 'ink': INK, 'accent': '#ffd36b'},
               'slotOverrides': slot_over, 'stages': stages, 'skins': {'default': {'parts': {}}}}
        json.dump(rig, open(os.path.join(DATA, f'{sid}.rig.json'), 'w'), ensure_ascii=False, indent=1)
        index.append(sid)
    json.dump({'rigs': index, 'templates': list(templates), 'anims': ['quadruped', 'sprite']}, open(os.path.join(DATA, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    manifest['images'] = images
    json.dump(manifest, open(manifest_path, 'w'), ensure_ascii=False, indent=2)
    print(len(index), 'rigs,', sum(1 for k in images if k.startswith('rig-')), 'part images')

if __name__ == '__main__':
    main()
