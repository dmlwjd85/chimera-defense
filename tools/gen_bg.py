"""Painted battle backgrounds (1280x720 layout, rendered at 2x) with 3D-cartoon path tiles, plus effect textures.
Layout must match src/scenes/layout.js: path centre y=330, height 120, tiles 90px from x=100 (12 tiles).
Run: python3 tools/gen_bg.py  (needs rsvg-convert and Pillow)"""
import os, json, math, random, subprocess
from PIL import ImageDraw, Image, ImageFilter, ImageEnhance

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'assets', 'bg')
FX = os.path.join(ROOT, 'public', 'assets', 'fx')
os.makedirs(OUT, exist_ok=True); os.makedirs(FX, exist_ok=True)
W, H = 1280, 720
PY, PH, X0, TILE = 340, 190, 100, 90
TOP, BOT = PY - PH // 2, PY + PH // 2  # 270..390
DEPTH = 26  # front face thickness of the path slab

def mix(a, b, t):
    a = a.lstrip('#'); b = b.lstrip('#')
    ca = [int(a[i:i + 2], 16) for i in (0, 2, 4)]; cb = [int(b[i:i + 2], 16) for i in (0, 2, 4)]
    return '#%02x%02x%02x' % tuple(int(ca[i] + (cb[i] - ca[i]) * t) for i in range(3))

def sh(c, k):
    c = c.lstrip('#'); return '#%02x%02x%02x' % tuple(max(0, min(255, int(int(c[i:i + 2], 16) * k))) for i in (0, 2, 4))

def ridge(rng, y0, amp, step=14, x0=-20, x1=W + 20, rough=0.5):
    pts, y, x = [], y0, x0
    while x <= x1:
        y += rng.uniform(-amp, amp) * rough
        y = y0 + (y - y0) * 0.92 + math.sin(x / 140.0 + rng.random()) * amp * 0.15
        pts.append((x, y)); x += step
    return pts

def poly_down(pts, bottom):
    d = f'M{pts[0][0]:.1f} {bottom} ' + ' '.join(f'L{x:.1f} {y:.1f}' for x, y in pts) + f' L{pts[-1][0]:.1f} {bottom} Z'
    return d

# ---------------------------------------------------------------- scenery pieces
def cloud(x, y, s, col='#ffffff', shade_col='#c9d6ea', op=0.95):
    out = f'<g opacity="{op}"><ellipse cx="{x+8*s}" cy="{y+22*s}" rx="{95*s}" ry="{16*s}" fill="{shade_col}" opacity="0.55" filter="url(#soft)"/>'
    for dx, dy, r in ((-60, 8, 30), (-25, -10, 42), (20, -22, 50), (62, -2, 38), (95, 10, 26), (0, 10, 40)):
        out += f'<circle cx="{x+dx*s}" cy="{y+dy*s}" r="{r*s}" fill="url(#cloudG)"/>'
    return out + '</g>'

def tree_round(x, y, s, leaf, trunk='#6b4423', rim='#d8f0a0'):
    out = f'<ellipse cx="{x}" cy="{y+4*s}" rx="{46*s}" ry="{10*s}" fill="#000" opacity="0.22" filter="url(#soft)"/>'
    out += f'<path d="M{x-7*s} {y} L{x-5*s} {y-60*s} L{x+5*s} {y-60*s} L{x+8*s} {y} Z" fill="{trunk}"/>'
    for dx, dy, r, k in ((-22, -70, 30, 0.85), (22, -72, 30, 0.85), (0, -95, 36, 1.0), (-10, -62, 26, 0.75), (16, -58, 24, 0.7)):
        out += f'<circle cx="{x+dx*s}" cy="{y+dy*s}" r="{r*s}" fill="{sh(leaf,k)}"/>'
    out += f'<path d="M{x-25*s} {y-112*s} A{36*s} {36*s} 0 0 1 {x+20*s} {y-122*s}" fill="none" stroke="{rim}" stroke-width="{5*s}" stroke-linecap="round" opacity="0.7"/>'
    return out

def pine(x, y, s, col='#2f6b4a', snow=False):
    out = f'<rect x="{x-4*s}" y="{y-14*s}" width="{8*s}" height="{14*s}" fill="#5a3b22"/>'
    for i, (w, h) in enumerate(((34, 34), (27, 30), (19, 26))):
        yy = y - 12 * s - i * 22 * s
        out += f'<path d="M{x-w*s} {yy} L{x} {yy-h*s-8*s} L{x+w*s} {yy} Z" fill="{sh(col, 0.85 + i*0.1)}"/>'
        out += f'<path d="M{x} {yy-h*s-8*s} L{x+w*s} {yy} L{x+w*0.3*s} {yy} Z" fill="{sh(col,0.65)}" opacity="0.6"/>'
        if snow: out += f'<path d="M{x-w*0.45*s} {yy-h*0.45*s} L{x} {yy-h*s-8*s} L{x+w*0.4*s} {yy-h*0.5*s} Q{x} {yy-h*0.35*s} {x-w*0.45*s} {yy-h*0.45*s} Z" fill="#f4f8ff"/>'
    return out

def house(x, y, s, wall='#f1dfc0', roof='#a1442c', lit=True):
    out = f'<ellipse cx="{x}" cy="{y+3*s}" rx="{62*s}" ry="{9*s}" fill="#000" opacity="0.25" filter="url(#soft)"/>'
    out += f'<rect x="{x-44*s}" y="{y-52*s}" width="{88*s}" height="{52*s}" fill="{wall}"/><rect x="{x-44*s}" y="{y-52*s}" width="{16*s}" height="{52*s}" fill="{sh(wall,0.85)}"/>'
    out += f'<path d="M{x-62*s} {y-48*s} Q{x} {y-74*s} {x+62*s} {y-48*s} L{x+48*s} {y-86*s} Q{x} {y-104*s} {x-48*s} {y-86*s} Z" fill="{roof}"/>'
    out += f'<path d="M{x-62*s} {y-48*s} Q{x} {y-74*s} {x+62*s} {y-48*s}" fill="none" stroke="{sh(roof,0.6)}" stroke-width="{5*s}"/>'
    for i in range(4): out += f'<path d="M{x-50*s+i*30*s} {y-90*s} L{x-56*s+i*34*s} {y-56*s}" stroke="{sh(roof,0.8)}" stroke-width="{3*s}"/>'
    wc = '#ffd36b' if lit else '#6d7b8c'
    out += f'<rect x="{x-8*s}" y="{y-30*s}" width="{16*s}" height="{30*s}" rx="{3*s}" fill="#7a4b2a"/>'
    out += f'<rect x="{x+16*s}" y="{y-38*s}" width="{16*s}" height="{14*s}" fill="{wc}"/><rect x="{x-32*s}" y="{y-38*s}" width="{14*s}" height="{14*s}" fill="{wc}"/>'
    if lit: out += f'<circle cx="{x+24*s}" cy="{y-31*s}" r="{16*s}" fill="#ffd36b" opacity="0.35" filter="url(#glow)"/>'
    return out

def lantern(x, y, s=1):
    return f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y-34*s}" stroke="#4a3524" stroke-width="{3*s}"/><ellipse cx="{x}" cy="{y-40*s}" rx="{7*s}" ry="{9*s}" fill="#ff8a3d"/><circle cx="{x}" cy="{y-40*s}" r="{18*s}" fill="#ffb35c" opacity="0.45" filter="url(#glow)"/>'

def windmill(x, y, s):
    out = f'<path d="M{x-16*s} {y} L{x-9*s} {y-80*s} L{x+9*s} {y-80*s} L{x+16*s} {y} Z" fill="#e9dcc3"/><path d="M{x-12*s} {y-80*s} Q{x} {y-96*s} {x+12*s} {y-80*s} Z" fill="#a1442c"/>'
    for a in (15, 105, 195, 285):
        r = math.radians(a); ex, ey = x + math.cos(r) * 58 * s, y - 84 * s + math.sin(r) * 58 * s
        out += f'<line x1="{x}" y1="{y-84*s}" x2="{ex}" y2="{ey}" stroke="#6b4a2e" stroke-width="{3*s}"/>'
        px, py = -math.sin(r) * 10 * s, math.cos(r) * 10 * s
        out += f'<path d="M{x+math.cos(r)*14*s} {y-84*s+math.sin(r)*14*s} L{ex} {ey} L{ex+px} {ey+py} L{x+math.cos(r)*14*s+px} {y-84*s+math.sin(r)*14*s+py} Z" fill="#f7f1e3" opacity="0.9"/>'
    return out + f'<circle cx="{x}" cy="{y-84*s}" r="{5*s}" fill="#4a3524"/>'

def reeds(x, y, s, rng):
    out = ''
    for i in range(7):
        dx = rng.uniform(-18, 18) * s; h = rng.uniform(40, 70) * s; bend = rng.uniform(-8, 8) * s
        out += f'<path d="M{x+dx} {y} Q{x+dx+bend} {y-h/2} {x+dx+bend*1.4} {y-h}" stroke="#5f8a3a" stroke-width="{3*s}" fill="none"/>'
        if i % 2 == 0: out += f'<ellipse cx="{x+dx+bend*1.3}" cy="{y-h+6*s}" rx="{4*s}" ry="{11*s}" fill="#7a4b2a"/>'
    return out

def rock(x, y, s, col='#8d8f99'):
    return (f'<path d="M{x-30*s} {y} L{x-24*s} {y-22*s} L{x-4*s} {y-34*s} L{x+20*s} {y-26*s} L{x+32*s} {y} Z" fill="{col}"/>'
            f'<path d="M{x-4*s} {y-34*s} L{x+20*s} {y-26*s} L{x+32*s} {y} L{x+6*s} {y} Z" fill="{sh(col,0.75)}"/>'
            f'<path d="M{x-24*s} {y-22*s} L{x-4*s} {y-34*s}" stroke="{sh(col,1.25)}" stroke-width="{3*s}"/>')

def flowers(rng, x0, x1, y0, y1, n, cols):
    return ''.join(f'<circle cx="{rng.uniform(x0,x1):.1f}" cy="{rng.uniform(y0,y1):.1f}" r="{rng.uniform(1.6,3.2):.1f}" fill="{rng.choice(cols)}"/>' for _ in range(n))

def grass_tufts(rng, x0, x1, y, n, col, h=14):
    out = ''
    for _ in range(n):
        x = rng.uniform(x0, x1); hh = rng.uniform(h * 0.6, h * 1.2)
        out += f'<path d="M{x-6:.1f} {y} Q{x-4:.1f} {y-hh*0.6:.1f} {x-8:.1f} {y-hh:.1f} Q{x:.1f} {y-hh*0.5:.1f} {x+1:.1f} {y-hh*1.1:.1f} Q{x+3:.1f} {y-hh*0.5:.1f} {x+9:.1f} {y-hh*0.9:.1f} Q{x+5:.1f} {y-hh*0.4:.1f} {x+6:.1f} {y} Z" fill="{col}"/>'
    return out

# ---------------------------------------------------------------- zone scenery (mid layer, y≈150..270)
def zone_mid(z, x0, x1, rng):
    cx = (x0 + x1) / 2; out = ''
    if z == 'village':
        out += f'<path d="{poly_down(ridge(rng, 230, 6, x0=x0-60, x1=x1+60), 280)}" fill="#7fae5a"/>'
        for i, (dx, s, roof) in enumerate(((-120, 0.85, '#a1442c'), (10, 1.0, '#3e5c8a'), (130, 0.8, '#8a5a2c'))):
            out += house(cx + dx, 262 - i % 2 * 6, s, roof=roof)
        out += lantern(x0 + 30, 268) + lantern(x1 - 30, 268)
        out += f'<path d="M{x0} 262 L{x1} 262" stroke="#8a6a44" stroke-width="3"/>' + ''.join(f'<rect x="{x}" y="250" width="5" height="16" fill="#9b7a50"/>' for x in range(int(x0) + 8, int(x1), 26))
        out += f'<path d="M{cx+8} 172 C {cx-4} 150 {cx+20} 136 {cx+6} 112" stroke="#e8e8e8" stroke-width="7" fill="none" opacity="0.45" filter="url(#soft)"/>'
    elif z == 'field':
        out += f'<path d="{poly_down(ridge(rng, 225, 10, x0=x0-60, x1=x1+60), 280)}" fill="#9ccc65"/>'
        out += f'<path d="{poly_down(ridge(rng, 245, 6, x0=x0-60, x1=x1+60), 280)}" fill="#8bc34a"/>'
        for k in range(5): out += f'<path d="M{x0+k*80} 280 Q{x0+k*80+40} 238 {x0+k*80+70} 280" fill="#e6c35c" opacity="0.8"/>'
        out += windmill(cx + 70, 250, 0.9)
        out += flowers(rng, x0, x1, 240, 268, 90, ['#ffffff', '#ffe066', '#ff8fb1', '#b39ddb'])
        out += tree_round(x0 + 60, 262, 0.75, '#6aa84f')
    elif z == 'forest':
        for k in range(9):
            x = x0 + 20 + k * (x1 - x0 - 40) / 8 + rng.uniform(-10, 10)
            out += tree_round(x, 268 - (k % 2) * 8, rng.uniform(0.95, 1.25), rng.choice(['#2f6b3a', '#3a7d44', '#28583a']), trunk='#4a3020', rim='#b5e48c')
        out += f'<path d="M{x0+40} 120 L{x0+120} 270 L{x0+160} 270 L{x0+80} 120 Z" fill="#fff6c8" opacity="0.10" filter="url(#soft)"/>'
        out += f'<path d="M{cx+40} 120 L{cx+110} 270 L{cx+150} 270 L{cx+70} 120 Z" fill="#fff6c8" opacity="0.10" filter="url(#soft)"/>'
        for k in range(5):
            x = rng.uniform(x0 + 10, x1 - 10)
            out += f'<path d="M{x-7} 268 L{x-5} 258 L{x+5} 258 L{x+7} 268 Z" fill="#f2e8d5"/><ellipse cx="{x}" cy="258" rx="12" ry="7" fill="#e94f4f"/><circle cx="{x-4}" cy="256" r="2" fill="#fff"/>'
    elif z == 'plains':
        out += f'<path d="M{cx-150} 210 L{cx-130} 170 L{cx-60} 168 L{cx-40} 210 Z" fill="#c98b5a" opacity="0.8"/><path d="M{cx-130} 170 L{cx-60} 168 L{cx-64} 180 L{cx-126} 182 Z" fill="#e0a877" opacity="0.8"/>'
        out += f'<path d="{poly_down(ridge(rng, 228, 5, x0=x0-60, x1=x1+60), 280)}" fill="#d9b45a"/>'
        out += f'<path d="{poly_down(ridge(rng, 250, 4, x0=x0-60, x1=x1+60), 280)}" fill="#c9a24a"/>'
        x = cx + 60
        out += f'<path d="M{x-4} 262 L{x-3} 212 L{x+3} 212 L{x+5} 262 Z" fill="#5a3b22"/><ellipse cx="{x}" cy="206" rx="52" ry="14" fill="#5f8a3a"/><ellipse cx="{x+6}" cy="198" rx="40" ry="10" fill="#76a64a"/>'
        for k in range(30):
            gx = rng.uniform(x0, x1); out += f'<path d="M{gx} 270 l-3 -12 M{gx} 270 l2 -14 M{gx} 270 l5 -10" stroke="#a8842e" stroke-width="2"/>'
    elif z == 'wetland':
        out += f'<path d="{poly_down(ridge(rng, 232, 5, x0=x0-60, x1=x1+60), 280)}" fill="#5f8f6b"/>'
        out += f'<ellipse cx="{cx}" cy="258" rx="{(x1-x0)*0.42}" ry="16" fill="url(#waterG)"/>'
        out += f'<ellipse cx="{cx-30}" cy="254" rx="60" ry="3" fill="#ffffff" opacity="0.35"/><ellipse cx="{cx+60}" cy="262" rx="40" ry="2" fill="#ffffff" opacity="0.3"/>'
        for k in range(5): out += f'<ellipse cx="{cx-120+k*55}" cy="{258+(k%2)*5}" rx="11" ry="4" fill="#4caf50"/>'
        out += f'<circle cx="{cx-65}" cy="255" r="3.5" fill="#ff8fb1"/>'
        out += reeds(x0 + 25, 270, 1.1, rng) + reeds(x1 - 30, 270, 1.0, rng) + reeds(cx + 20, 266, 0.8, rng)
        out += f'<rect x="{x0}" y="215" width="{x1-x0}" height="40" fill="#ffffff" opacity="0.18" filter="url(#mist)"/>'
        out += tree_round(x0 + 90, 250, 0.8, '#4f7c5b')
    elif z == 'mountain':
        out += f'<path d="M{x0-30} 270 L{x0+30} 190 L{x0+80} 205 L{x0+140} 150 L{x0+200} 200 L{x0+260} 180 L{x1+30} 270 Z" fill="#7d7f8a"/>'
        out += f'<path d="M{x0+140} 150 L{x0+200} 200 L{x0+170} 205 L{x0+150} 180 Z" fill="#5f616b"/>'
        out += f'<path d="M{x0+180} 175 L{x0+186} 270" stroke="#bfe6ff" stroke-width="10" opacity="0.8"/><ellipse cx="{x0+186}" cy="268" rx="22" ry="6" fill="#ffffff" opacity="0.6" filter="url(#soft)"/>'
        for k in range(6): out += pine(x0 + 30 + k * 58 + rng.uniform(-8, 8), 270 - (k % 2) * 6, rng.uniform(0.8, 1.05), '#2f5b4a', snow=k % 3 == 0)
        out += rock(x1 - 40, 270, 0.9)
    return out

# ---------------------------------------------------------------- 3D cartoon path tiles
TILE_STYLE = {
    'village': ('#c9b79c', '#8d7a62', 'cobble'), 'field': ('#9bc36b', '#7a5a3a', 'grass'), 'forest': ('#5f8f4e', '#4a3324', 'moss'),
    'plains': ('#e0c27e', '#9a7446', 'sand'), 'wetland': ('#b48a5a', '#5d4026', 'plank'), 'mountain': ('#a5a8b3', '#6a6d77', 'stone'),
}

def tile(x, z, rng, idx):
    top, side, kind = TILE_STYLE[z]
    var = rng.uniform(0.94, 1.06)
    t = sh(top, var)
    w = TILE
    gx = x + 2; gw = w - 4
    out = ''
    # front face (thickness) with bevel
    out += f'<path d="M{gx} {BOT-6} L{gx+gw} {BOT-6} L{gx+gw-2} {BOT+DEPTH} Q{gx+gw/2} {BOT+DEPTH+4} {gx+2} {BOT+DEPTH} Z" fill="url(#side_{z})"/>'
    out += f'<path d="M{gx+4} {BOT+DEPTH-6} L{gx+gw-4} {BOT+DEPTH-6}" stroke="{sh(side,0.7)}" stroke-width="2" opacity="0.6"/>'
    # top face
    out += f'<rect x="{gx}" y="{TOP}" width="{gw}" height="{PH}" rx="10" fill="{t}"/>'
    out += f'<rect x="{gx}" y="{TOP}" width="{gw}" height="{PH}" rx="10" fill="url(#topShade)"/>'
    if kind == 'cobble':
        for r in range(4):
            off = 0 if r % 2 == 0 else 14
            for c in range(4):
                sx = gx + 6 + c * 22 - off * 0.5 + rng.uniform(-2, 2); sy = TOP + 8 + r * 28 + rng.uniform(-2, 2)
                if sx < gx + 2 or sx + 18 > gx + gw - 2: continue
                cc = sh(top, rng.uniform(0.85, 1.12))
                out += f'<rect x="{sx:.1f}" y="{sy:.1f}" width="18" height="22" rx="7" fill="{cc}" stroke="{sh(top,0.7)}" stroke-width="1.5"/><path d="M{sx+3:.1f} {sy+5:.1f} q6 -4 12 0" stroke="#fff" stroke-width="2" opacity="0.5" fill="none"/>'
    elif kind == 'grass':
        out += f'<rect x="{gx}" y="{TOP+PH*0.55}" width="{gw}" height="{PH*0.45}" rx="10" fill="#b08a5a" opacity="0.45"/>'
        out += flowers(rng, gx + 6, gx + gw - 6, TOP + 8, TOP + 50, 6, ['#fff', '#ffe066', '#ff8fb1'])
        for k in range(3): out += f'<ellipse cx="{gx+rng.uniform(15,gw-15):.1f}" cy="{TOP+rng.uniform(60,105):.1f}" rx="5" ry="3" fill="#9a7a56"/>'
    elif kind == 'moss':
        for k in range(5): out += f'<ellipse cx="{gx+rng.uniform(12,gw-12):.1f}" cy="{TOP+rng.uniform(10,108):.1f}" rx="{rng.uniform(8,16):.1f}" ry="{rng.uniform(5,9):.1f}" fill="{sh(top,rng.uniform(0.8,1.15))}" opacity="0.8"/>'
        out += f'<path d="M{gx+10} {TOP+rng.uniform(40,90):.1f} q20 -10 40 4 t30 -6" stroke="#4a3324" stroke-width="4" fill="none" opacity="0.55"/>'
    elif kind == 'sand':
        out += f'<path d="M{gx+20} {TOP+30} l14 10 l-6 14 M{gx+55} {TOP+70} l-10 12 l8 10" stroke="{sh(top,0.75)}" stroke-width="2" fill="none"/>'
        for k in range(6): out += f'<circle cx="{gx+rng.uniform(8,gw-8):.1f}" cy="{TOP+rng.uniform(8,110):.1f}" r="{rng.uniform(1.5,3.5):.1f}" fill="{sh(top,0.7)}"/>'
    elif kind == 'plank':
        for r in range(5):
            y = TOP + 4 + r * 23
            out += f'<rect x="{gx+2}" y="{y}" width="{gw-4}" height="20" rx="4" fill="{sh(top, rng.uniform(0.85,1.1))}" stroke="{sh(top,0.6)}" stroke-width="1.5"/><path d="M{gx+8} {y+6} h{gw-20}" stroke="{sh(top,0.75)}" stroke-width="1" opacity="0.7"/><circle cx="{gx+8}" cy="{y+10}" r="1.6" fill="#3a2a1a"/><circle cx="{gx+gw-8}" cy="{y+10}" r="1.6" fill="#3a2a1a"/>'
    elif kind == 'stone':
        out += f'<path d="M{gx+15} {TOP+20} l20 25 l-10 30 M{gx+60} {TOP+15} l-8 40" stroke="{sh(top,0.7)}" stroke-width="2.5" fill="none"/>'
        if idx % 3 == 0: out += f'<ellipse cx="{gx+30}" cy="{TOP+90}" rx="14" ry="5" fill="#f4f8ff" opacity="0.8"/>'
    # bevel highlights (3D toon)
    out += f'<path d="M{gx+8} {TOP+3} H{gx+gw-8}" stroke="#ffffff" stroke-width="3" opacity="0.55" stroke-linecap="round"/>'
    out += f'<path d="M{gx+3} {TOP+10} V{BOT-10}" stroke="#ffffff" stroke-width="2" opacity="0.25" stroke-linecap="round"/>'
    out += f'<rect x="{gx}" y="{TOP}" width="{gw}" height="{PH}" rx="10" fill="none" stroke="{sh(top,0.6)}" stroke-width="2"/>'
    return out

# ---------------------------------------------------------------- whole scene
SKY = {
    'forest-1': dict(top='#5fa8e8', mid='#a9d6f5', hor='#ffe9c4', sun=('#fff6d5', 1050, 95, 34), far=['#9cc3d9', '#7fae9f'], ground='#5c8f45', tint=None),
    'forest-2': dict(top='#3d5a99', mid='#e8a06a', hor='#ffd27a', sun=('#ffcf6b', 820, 150, 48), far=['#b98aa0', '#8a7a8f'], ground='#7d8a3e', tint=None),
    'forest-3': dict(top='#1c1f45', mid='#5b4a8a', hor='#d98ab8', sun=('#f4f1ff', 300, 80, 26), far=['#5c5a8a', '#454a72'], ground='#3f5a45', tint='#2b2350'),
}

def defs(stage, zones):
    sk = SKY[stage]
    d = f'''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sk['top']}"/><stop offset="0.55" stop-color="{sk['mid']}"/><stop offset="1" stop-color="{sk['hor']}"/></linearGradient>
<radialGradient id="cloudG" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="{mix('#ffffff', sk['mid'], 0.35)}"/></radialGradient>
<linearGradient id="waterG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7ec8e3"/><stop offset="1" stop-color="#3e7fa0"/></linearGradient>
<linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/></linearGradient>
<linearGradient id="fore" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sk['ground']}"/><stop offset="0.5" stop-color="{sh(sk['ground'],0.6)}"/><stop offset="1" stop-color="#10161c"/></linearGradient>
<linearGradient id="uiFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1016" stop-opacity="0"/><stop offset="0.45" stop-color="#0b1016" stop-opacity="0.35"/><stop offset="1" stop-color="#0b1016" stop-opacity="0.8"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
<radialGradient id="portal" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#e0b3ff"/><stop offset="0.45" stop-color="#7b3fbf"/><stop offset="1" stop-color="#1c0f2e" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="mist" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="12"/></filter>
<filter id="far" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="1.5"/></filter>
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.06"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter>'''
    for z in set(zones):
        top, side, _ = TILE_STYLE[z]
        d += f'<linearGradient id="side_{z}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{side}"/><stop offset="1" stop-color="{sh(side,0.55)}"/></linearGradient>'
    for i in range(3):
        x0 = X0 + i * 360
        d += f'<linearGradient id="zm{i}" x1="{x0-60}" y1="0" x2="{x0+420}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="{0 if i else 1}"/><stop offset="0.125" stop-color="#fff" stop-opacity="1"/><stop offset="0.875" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="{0 if i < 2 else 1}"/></linearGradient>'
        d += f'<mask id="zmask{i}" maskUnits="userSpaceOnUse" x="-100" y="0" width="1500" height="720"><rect x="{(x0-60) if i else -100}" y="0" width="{(480 if 0 < i < 2 else 600)}" height="720" fill="url(#zm{i})"/></mask>'
    return d

def scene(stage, zones, seed, overlay=False, guide=False):
    rng = random.Random(seed)
    sk = SKY[stage]
    if overlay: return overlay_svg(stage, zones, rng, sk)
    out = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    col, sx, sy, sr = sk['sun']
    out += f'<circle cx="{sx}" cy="{sy}" r="{sr*3}" fill="{col}" opacity="0.35" filter="url(#glow)"/><circle cx="{sx}" cy="{sy}" r="{sr}" fill="{col}"/>'
    if stage == 'forest-3':
        out += ''.join(f'<circle cx="{rng.uniform(0,W):.0f}" cy="{rng.uniform(0,150):.0f}" r="{rng.uniform(0.8,2):.1f}" fill="#fff" opacity="{rng.uniform(0.4,0.9):.2f}"/>' for _ in range(90))
    for x, y, s in ((200, 70, 0.9), (560, 110, 0.7), (900, 60, 1.0), (1180, 140, 0.6)):
        out += cloud(x, y, s, op=0.6 if stage == 'forest-3' else 0.92)
    peaks = ''.join(f'<path d="M{px-150} 240 L{px} {ph} L{px+150} 240 Z" fill="{mix(sk["far"][0], sk["mid"], 0.45)}"/><path d="M{px-38} {ph+50} L{px} {ph} L{px+40} {ph+52} L{px+16} {ph+40} L{px} {ph+56} L{px-14} {ph+42} Z" fill="#f4f8ff" opacity="0.85"/>' for px, ph in ((380, 120), (700, 95), (1010, 130)))
    out += f'<g filter="url(#far)" opacity="0.9">{peaks}</g>'
    for i, c in enumerate(sk['far']):
        out += f'<path d="{poly_down(ridge(rng, 175 + i * 25, 18, step=12, rough=0.8), 300)}" fill="{c}" filter="url(#far)"/>'
    for i, z in enumerate(zones):
        x0 = X0 + i * 360
        out += f'<g mask="url(#zmask{i})">{zone_mid(z, x0 - 60 if i else -60, x0 + 420 if i < 2 else W + 60, rng)}</g>'
    # ground band behind path
    out += f'<rect x="0" y="258" width="{W}" height="20" fill="{sk["ground"]}"/>'
    # foreground: rolling meadow layers per zone, then a dark fade for the UI
    out += f'<rect x="0" y="{BOT}" width="{W}" height="{H-BOT}" fill="url(#fore)"/>'
    for i, z in enumerate(zones):
        x0 = X0 + i * 360
        gc = {'village': '#7fae5a', 'field': '#8bc34a', 'forest': '#3a7d44', 'plains': '#c9a24a', 'wetland': '#5f8f6b', 'mountain': '#6f8a6a'}[z]
        lay = ''
        for k, (yy, kk) in enumerate(((BOT + 40, 0.95), (BOT + 95, 0.8), (BOT + 170, 0.62))):
            lay += f'<path d="{poly_down(ridge(rng, yy, 9, step=16, x0=x0-80, x1=x0+440), 740)}" fill="{sh(gc, kk)}"/>'
            lay += grass_tufts(rng, x0 - 40, x0 + 400, yy + 8, 26, sh(gc, kk * 0.85), 16 + k * 4)
        if z == 'wetland':
            lay += f'<ellipse cx="{x0+180}" cy="{BOT+75}" rx="150" ry="22" fill="url(#waterG)" opacity="0.9"/><ellipse cx="{x0+150}" cy="{BOT+70}" rx="70" ry="3" fill="#fff" opacity="0.4"/>'
            lay += ''.join(f'<ellipse cx="{x0+90+k*45}" cy="{BOT+78+(k%2)*6}" rx="12" ry="4" fill="#4caf50"/>' for k in range(5))
        if z == 'village':
            lay += ''.join(f'<rect x="{x0+20+k*34}" y="{BOT+28}" width="6" height="26" fill="#9b7a50"/>' for k in range(10)) + f'<path d="M{x0+20} {BOT+34} H{x0+340} M{x0+20} {BOT+46} H{x0+340}" stroke="#8a6a44" stroke-width="4"/>'
            lay += tree_round(x0 + 320, BOT + 120, 0.9, '#6aa84f')
        if z == 'field':
            lay += flowers(rng, x0 - 40, x0 + 400, BOT + 50, BOT + 200, 140, ['#fff', '#ffe066', '#ff8fb1', '#b39ddb', '#ffab40'])
            lay += f'<g transform="translate({x0+260} {BOT+110})"><line x1="0" y1="0" x2="0" y2="-60" stroke="#6b4a2e" stroke-width="5"/><line x1="-26" y1="-42" x2="26" y2="-42" stroke="#6b4a2e" stroke-width="5"/><circle cx="0" cy="-68" r="12" fill="#f2d49b"/><path d="M-16 -74 L16 -74 L0 -92 Z" fill="#c9a24a"/><path d="M-14 -40 L14 -40 L10 -12 L-10 -12 Z" fill="#c0392b"/></g>'
        if z == 'forest':
            lay += ''.join(tree_round(x0 + 40 + k * 140, BOT + 150 + (k % 2) * 20, 1.2, '#2c5e36', trunk='#3e2a1a', rim='#9ccc65') for k in range(3))
            lay += ''.join(f'<path d="M{x0+rng.uniform(0,360):.0f} {BOT+rng.uniform(60,140):.0f} q-14 -20 -26 -6 q12 -26 26 -10 q4 -26 18 -18 q-6 18 -18 34 Z" fill="#4f8f3a"/>' for _ in range(6))
        if z == 'plains':
            lay += ''.join(f'<path d="M{gx:.0f} {BOT+rng.uniform(50,160):.0f} l-4 -18 M{gx:.0f} {BOT+rng.uniform(50,160):.0f} l3 -20" stroke="#a8842e" stroke-width="2.5"/>' for gx in [rng.uniform(x0, x0+360) for _ in range(40)])
            lay += rock(x0 + 300, BOT + 120, 1.0, '#b08a5a')
        if z == 'mountain':
            lay += rock(x0 + 60, BOT + 110, 1.4, '#7d7f8a') + rock(x0 + 250, BOT + 140, 1.1, '#6d6f7a') + pine(x0 + 330, BOT + 170, 1.3, '#2f5b4a', True)
        out += f'<g mask="url(#zmask{i})">{lay}</g>'
    if not guide: out += f'<rect x="0" y="{BOT+40}" width="{W}" height="{H-BOT-40}" fill="url(#uiFade)"/>'
    if guide:
        out += road_svg(zones, rng, seams=False)
        pl = path_layer(zones, random.Random(5)); out += pl[:pl.index('<!--tiles-->')]
    else: out += path_layer(zones, rng)
    if sk['tint']: out += f'<rect width="{W}" height="{H}" fill="{sk["tint"]}" opacity="0.22"/>'
    if not guide:
        out += f'<rect width="{W}" height="{H}" fill="url(#vig)"/>'
        out += f'<rect width="{W}" height="{H}" filter="url(#grain)" fill="#808080"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*2}" height="{H*2}"><defs>{defs(stage, zones)}</defs>{out}</svg>'

def path_layer(zones, rng):
    out = ''
    # home gate (left) and enemy portal (right), anchored to the road band
    gt, gb = TOP - 30, BOT + 6
    out += f'<rect x="20" y="{gt}" width="70" height="{gb-gt}" rx="8" fill="#6b4a2e"/><path d="M12 {gt+6} Q55 {gt-40} 98 {gt+6} Z" fill="#a1442c"/><rect x="34" y="{gt+80}" width="42" height="{gb-gt-80}" rx="20" fill="#3a2716"/>'
    out += f'<rect x="20" y="{gt}" width="8" height="{gb-gt}" fill="#4a3220"/><rect x="82" y="{gt}" width="8" height="{gb-gt}" fill="#4a3220"/>'
    out += lantern(24, gt + 70, 0.9) + lantern(86, gt + 70, 0.9)
    out += f'<ellipse cx="1232" cy="{PY}" rx="100" ry="{PH*0.9:.0f}" fill="url(#portal)" opacity="0.9" filter="url(#soft)"/>'
    out += f'<ellipse cx="1232" cy="{PY}" rx="44" ry="{PH*0.55:.0f}" fill="#1a0b2b" stroke="#c48bff" stroke-width="5"/><ellipse cx="1232" cy="{PY}" rx="30" ry="{PH*0.42:.0f}" fill="none" stroke="#7b3fbf" stroke-width="4" stroke-dasharray="14 10"/>'
    out += f'<path d="M1190 {PY-PH*0.55:.0f} L1202 {PY-PH*0.72:.0f} L1214 {PY-PH*0.56:.0f} M1252 {PY-PH*0.56:.0f} L1266 {PY-PH*0.74:.0f} L1278 {PY-PH*0.55:.0f}" stroke="#4d4a5b" stroke-width="10" stroke-linecap="round"/>'
    out += rock(1196, BOT + 14, 1.1, '#5d5a6b') + rock(1262, BOT + 6, 0.9, '#4d4a5b')
    # path tiles
    out += '<!--tiles-->'
    out += f'<rect x="{X0-6}" y="{BOT+DEPTH-4}" width="{12*TILE+12}" height="22" fill="#000" opacity="0.35" filter="url(#soft)"/>'
    for t in range(12):
        z = zones[t // 4]
        out += tile(X0 + t * TILE, z, rng, t)
    # grass tufts over the top edge and in the foreground
    for i, z in enumerate(zones):
        x0 = X0 + i * 360
        gc = {'village': '#7fae5a', 'field': '#8bc34a', 'forest': '#3a7d44', 'plains': '#c9a24a', 'wetland': '#5f8f6b', 'mountain': '#6f8a6a'}[z]
        out += grass_tufts(rng, x0, x0 + 360, TOP + 4, 14, gc, 12)
        out += grass_tufts(rng, x0, x0 + 360, BOT + DEPTH + 10, 22, sh(gc, 0.85), 18)
        if z == 'field': out += flowers(rng, x0, x0 + 360, BOT + 40, BOT + 90, 40, ['#fff', '#ffe066', '#ff8fb1'])
        if z == 'wetland': out += reeds(x0 + 40, BOT + 60, 1.2, rng) + reeds(x0 + 300, BOT + 70, 1.0, rng)
        if z in ('forest', 'mountain'): out += rock(x0 + 80, BOT + 70, 0.8, '#6d7068') + rock(x0 + 280, BOT + 60, 0.6, '#77786f')
    return out

ROAD = {'village': '#c8a878', 'field': '#b89a62', 'forest': '#8a6a46', 'plains': '#d0b070', 'wetland': '#7f8a64', 'mountain': '#9a9490'}
GRASS = {'village': '#7fae5a', 'field': '#8bc34a', 'forest': '#3a7d44', 'plains': '#c9a24a', 'wetland': '#5f8f6b', 'mountain': '#6f8a6a'}

def road_svg(zones, rng, alpha=0.92, seams=True, tufts=True):
    out = f'<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.1"/><feComposite in="SourceGraphic" operator="in"/></filter>'
    out += '<filter id="rough2"><feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="21"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 1.2"/><feComposite in="SourceGraphic" operator="in"/></filter>'
    out += '<filter id="feather"><feGaussianBlur stdDeviation="7"/></filter>'
    # contact shadow + organic road bed (wobbly edges, painted texture)
    def edge(y, amp):
        pts = []
        for k in range(0, 12 * TILE + 41, 18):
            pts.append((X0 - 20 + k, y + rng.uniform(-amp, amp) + math.sin(k / 70) * amp * 0.6))
        return pts
    topE, botE = edge(TOP + 2, 6), edge(BOT - 2, 6)
    poly = 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in topE) + ' L' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in reversed(botE)) + ' Z'
    out += f'<path d="{poly}" transform="translate(0 8)" fill="#1a1208" opacity="0.35" filter="url(#feather)"/>'
    out += '<linearGradient id="roadG" x1="0" y1="0" x2="1" y2="0">' + ''.join(f'<stop offset="{(i*4*TILE + 2*TILE + 20)/(12*TILE+40):.3f}" stop-color="{ROAD[z]}"/>' for i, z in enumerate(zones)) + '</linearGradient>'
    out += '<linearGradient id="roadV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2d0" stop-opacity="0.35"/><stop offset="0.25" stop-color="#fff2d0" stop-opacity="0"/><stop offset="0.8" stop-color="#2a1a08" stop-opacity="0"/><stop offset="1" stop-color="#2a1a08" stop-opacity="0.35"/></linearGradient>'
    out += f'<path d="{poly}" fill="url(#roadG)" opacity="{alpha}" filter="url(#feather)"/>'
    out += '<linearGradient id="roadD" x1="0" y1="0" x2="1" y2="0">' + ''.join(f'<stop offset="{(i*4*TILE + 2*TILE + 20)/(12*TILE+40):.3f}" stop-color="{sh(ROAD[z], 0.68)}"/>' for i, z in enumerate(zones)) + '</linearGradient>'
    out += '<linearGradient id="roadL" x1="0" y1="0" x2="1" y2="0">' + ''.join(f'<stop offset="{(i*4*TILE + 2*TILE + 20)/(12*TILE+40):.3f}" stop-color="{sh(ROAD[z], 1.22)}"/>' for i, z in enumerate(zones)) + '</linearGradient>'
    out += f'<clipPath id="roadClip"><path d="{poly}"/></clipPath>'
    out += f'<g clip-path="url(#roadClip)" opacity="{alpha*0.55:.2f}"><rect x="0" y="{TOP-10}" width="{W}" height="{PH+20}" fill="url(#roadD)" filter="url(#rough)"/></g>'
    out += f'<g clip-path="url(#roadClip)" opacity="{alpha*0.35:.2f}"><rect x="0" y="{TOP-10}" width="{W}" height="{PH+20}" fill="url(#roadL)" filter="url(#rough2)"/></g>'
    out += f'<path d="{poly}" fill="url(#roadV)" opacity="{min(1, alpha*1.2)}" filter="url(#feather)"/>'
    for i, z in enumerate(zones):
        x0 = X0 + i * 4 * TILE
        c = ROAD[z]
        out += f'<path d="M{x0+6} {TOP+38} q{TILE} {rng.uniform(-6,6):.0f} {4*TILE-12} 0 M{x0+6} {BOT-36} q{TILE*2} {rng.uniform(-6,6):.0f} {4*TILE-12} 0" stroke="{sh(c,0.65)}" stroke-width="9" fill="none" opacity="{0.14*alpha:.2f}" filter="url(#feather)"/>'
    # tile seams (placement grid) and zone borders
    for t in range(1, 12 if seams else 1):
        x = X0 + t * TILE
        zb = t % 4 == 0
        out += f'<path d="M{x} {TOP+10} V{BOT-10}" stroke="{"#fff3d6" if zb else "#3a2a18"}" stroke-width="{2.5 if zb else 1.5}" stroke-dasharray="{"" if zb else "5 9"}" opacity="{0.35 if zb else 0.2}" stroke-linecap="round"/>'
    out += f'<path d="M{X0+10} {TOP+4} H{X0+12*TILE-10}" stroke="#fff6dd" stroke-width="3" opacity="0.35" stroke-linecap="round" filter="url(#soft)"/>'
    # grass lips over both edges
    for i, z in enumerate(zones if tufts else []):
        x0 = X0 + i * 4 * TILE
        out += grass_tufts(rng, x0 - 6, x0 + 4 * TILE + 6, TOP + 6, 22, GRASS[z], 13)
        out += grass_tufts(rng, x0 - 6, x0 + 4 * TILE + 6, BOT + 4, 26, sh(GRASS[z], 0.82), 16)
        if z == 'field': out += flowers(rng, x0, x0 + 360, BOT - 2, BOT + 14, 18, ['#fff', '#ffe066', '#ff8fb1'])
        if z == 'wetland': out += reeds(x0 + 30, BOT + 12, 0.9, rng) + reeds(x0 + 320, BOT + 16, 0.8, rng)
    return out

def seams_svg(stage, zones):
    out = f'<rect x="0" y="{BOT+50}" width="{W}" height="{H-BOT-50}" fill="url(#uiFade)"/>'
    for t in range(1, 12):
        x = X0 + t * TILE; zb = t % 4 == 0
        out += f'<path d="M{x} {TOP+14} V{BOT-14}" stroke="{"#fff3d6" if zb else "#2a1a08"}" stroke-width="{2.5 if zb else 1.5}" stroke-dasharray="{"" if zb else "5 10"}" opacity="{0.32 if zb else 0.16}" stroke-linecap="round"/>'
    out += f'<rect width="{W}" height="{H}" fill="url(#vig)"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*2}" height="{H*2}"><defs>{defs(stage, zones)}</defs>{out}</svg>'

def overlay_svg(stage, zones, rng, sk):
    out = f'<rect x="0" y="{BOT+70}" width="{W}" height="{H-BOT-70}" fill="url(#uiFade)"/>'
    out += road_svg(zones, rng, alpha=0.88, tufts=False)
    # gate + portal from the classic layer
    g = path_layer(zones, random.Random(5))
    g = g[:g.index('<!--tiles-->')] if '<!--tiles-->' in g else g
    out += g
    if sk['tint']: out += f'<rect x="0" y="{TOP-30}" width="{W}" height="{PH+60}" fill="{sk["tint"]}" opacity="0.14"/>'
    out += f'<rect width="{W}" height="{H}" fill="url(#vig)"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*2}" height="{H*2}"><defs>{defs(stage, zones)}</defs>{out}</svg>'

def ai_composite(svg, ai_path, name, q=88, night=False, light=True):
    """Fit the AI scenery to 2560x1440 (cover), soften/grade it a touch, then lay the path overlay on top."""
    tmp = os.path.join(OUT, name + '.svg'); png = os.path.join(OUT, name + '_ov.png')
    open(tmp, 'w').write(svg)
    subprocess.run(['rsvg-convert', tmp, '-o', png], check=True)
    ov = Image.open(png).convert('RGBA')
    ai = Image.open(ai_path).convert('RGB')
    sc = max(ov.width / ai.width, ov.height / ai.height)
    ai = ai.resize((round(ai.width * sc), round(ai.height * sc)), Image.LANCZOS)
    l, t = (ai.width - ov.width) // 2, (ai.height - ov.height) // 2
    ai = ai.crop((l, t, l + ov.width, t + ov.height))
    ai = ImageEnhance.Color(ai).enhance(1.05)
    # light-match: darken/cool the overlay to the painting's light around the road
    from PIL import ImageStat
    band = ai.convert('L')
    lum = ImageStat.Stat(band).mean[0] / 255
    k = max(0.5, min(1.0, 0.15 + lum / 0.5 * 0.85)) * (0.8 if night else 1)
    if light and k < 0.99:
        r_, g_, b_, a_ = ov.split()
        cool = 1 + (1 - k) * 0.35
        ov = Image.merge('RGBA', (r_.point(lambda v: int(v * k)), g_.point(lambda v: int(v * k)), b_.point(lambda v: min(255, int(v * k * cool))), a_))
    print(name, 'band lum', round(lum, 2), 'overlay k', round(k, 2))
    im = Image.alpha_composite(ai.convert('RGBA'), ov).convert('RGB')
    im.save(os.path.join(OUT, name + '.jpg'), quality=q, optimize=True)
    os.remove(tmp); os.remove(png)
    return im

def to_jpg(svg, name, q=88):
    tmp = os.path.join(OUT, name + '.svg'); png = os.path.join(OUT, name + '.png')
    open(tmp, 'w').write(svg)
    subprocess.run(['rsvg-convert', tmp, '-o', png], check=True)
    im = Image.open(png).convert('RGB')
    im.save(os.path.join(OUT, name + '.jpg'), quality=q, optimize=True)
    os.remove(tmp); os.remove(png)
    return im

# ---------------------------------------------------------------- effect textures
def fx_png(name, size, body):
    tmp = os.path.join(FX, name + '.svg')
    open(tmp, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-size/2} {-size/2} {size} {size}" width="{size*2}" height="{size*2}"><defs><radialGradient id="r" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="1.2"/></filter></defs>{body}</svg>')
    subprocess.run(['rsvg-convert', tmp, '-o', os.path.join(FX, name + '.png')], check=True)
    os.remove(tmp)

def make_fx():
    star = ' '.join(f'{math.cos(math.radians(-90+i*36))*(14 if i%2==0 else 6):.1f},{math.sin(math.radians(-90+i*36))*(14 if i%2==0 else 6):.1f}' for i in range(10))
    fx_png('flare', 64, '<circle r="32" fill="url(#r)"/>')
    fx_png('spark', 32, '<path d="M0 -15 L3 -3 L15 0 L3 3 L0 15 L-3 3 L-15 0 L-3 -3 Z" fill="#fff"/>')
    fx_png('star', 32, f'<polygon points="{star}" fill="#ffe066" stroke="#b8860b" stroke-width="1.5"/>')
    fx_png('ring', 128, '<circle r="56" fill="none" stroke="#fff" stroke-width="7"/><circle r="56" fill="none" stroke="#fff" stroke-width="16" opacity="0.25" filter="url(#b)"/>')
    fx_png('puff', 64, '<g opacity="0.9"><circle cx="-8" cy="4" r="16" fill="#fff"/><circle cx="8" cy="-2" r="18" fill="#fff"/><circle cx="2" cy="10" r="14" fill="#fff"/></g>')
    fx_png('shard', 32, '<path d="M-4 -14 L8 -4 L2 14 L-8 4 Z" fill="#fff" stroke="#c9a6ff" stroke-width="1.5"/>')
    fx_png('leaf', 32, '<path d="M-12 0 Q0 -10 12 0 Q0 10 -12 0 Z" fill="#fff"/><path d="M-10 0 H10" stroke="#ccc" stroke-width="1.2"/>')
    fx_png('coin', 32, '<circle r="12" fill="#ffd84d" stroke="#b8860b" stroke-width="2.5"/><circle r="7" fill="none" stroke="#fff3b0" stroke-width="2"/>')
    fx_png('heart', 32, '<path d="M0 12 C -16 0 -12 -12 -5 -12 C -2 -12 0 -9 0 -7 C 0 -9 2 -12 5 -12 C 12 -12 16 0 0 12 Z" fill="#ff6b9a" stroke="#c2185b" stroke-width="1.5"/>')
    fx_png('bubble', 32, '<circle r="11" fill="#fff" opacity="0.85"/><circle cx="-4" cy="-4" r="3" fill="#fff"/>')
    fx_png('snow', 32, ''.join(f'<path d="M0 0 L{math.cos(math.radians(a))*13:.1f} {math.sin(math.radians(a))*13:.1f}" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>' for a in range(0, 360, 60)))
    fx_png('slash', 96, '<path d="M-40 20 Q0 -30 44 -18 Q4 -18 -36 26 Z" fill="#fff"/>')
    fx_png('bolt', 64, '<path d="M4 -30 L-12 2 L0 2 L-6 30 L14 -6 L2 -6 Z" fill="#fff6a0" stroke="#fff" stroke-width="2"/>')
    fx_png('note', 32, '<path d="M-4 8 V-12 L10 -14 V4" stroke="#fff" stroke-width="3" fill="none"/><ellipse cx="-7" cy="9" rx="5" ry="4" fill="#fff"/><ellipse cx="7" cy="5" rx="5" ry="4" fill="#fff"/>')
    fx_png('stone', 24, '<path d="M-8 4 L-6 -6 L4 -8 L9 0 L4 8 Z" fill="#9a9a9a" stroke="#4a4a4a" stroke-width="1.5"/>')
    fx_png('orb', 32, '<circle r="14" fill="url(#r)"/><circle r="6" fill="#fff"/>')
    fx_png('feather', 32, '<path d="M-14 2 Q0 -10 14 -2 Q0 6 -14 2 Z" fill="#fff"/><path d="M-14 2 L14 -2" stroke="#bbb" stroke-width="1"/>')
    fx_png('beam', 64, '<rect x="-12" y="-32" width="24" height="64" fill="url(#r)"/>')

def make_pass2():
    """Composite (painting + road/gate/portal overlay, no UI fade) at 1344x768 for the 리코스 repaint pass."""
    stages = json.load(open(os.path.join(ROOT, 'public', 'data', 'stages.json')))
    gd = os.path.join(ROOT, 'art-src', 'guides')
    for i, st in enumerate(stages):
        ai = os.path.join(ROOT, 'art-src', 'recos', f'{st["id"]}.png')
        im = ai_composite(scene(st['id'], st['zones'], 100 + i, overlay=True), ai, 'p2tmp', night=bool(SKY[st['id']]['tint']))
        os.remove(os.path.join(OUT, 'p2tmp.jpg'))
        im.resize((1344, 768), Image.LANCZOS).save(os.path.join(gd, f'pass2_{st["id"]}.png'))

def make_guides():
    stages = json.load(open(os.path.join(ROOT, 'public', 'data', 'stages.json')))
    gd = os.path.join(ROOT, 'art-src', 'guides'); os.makedirs(gd, exist_ok=True)
    for i, st in enumerate(stages):
        im = to_jpg(scene(st['id'], st['zones'], 100 + i, guide=True), 'guide_tmp')
        # read as a ground plane: squeeze the scenery up, lay a receding meadow between it and the road
        g = im.copy(); Wd = g.width
        top = im.crop((0, 0, Wd, (TOP - 8) * 2)).resize((Wd, 190 * 2), Image.LANCZOS); g.paste(top, (0, 0))
        gc = {'forest-1': (120, 176, 84), 'forest-2': (184, 160, 84), 'forest-3': (70, 104, 92)}.get(st['id'], (120, 176, 84))
        far = tuple(int(c * 0.82 + 255 * 0.12) for c in gc)
        for y in range(190 * 2, (TOP + 4) * 2):
            t = (y - 380) / ((TOP + 4) * 2 - 380)
            g.paste(tuple(int(far[k] * (1 - t) + gc[k] * t) for k in range(3)), (0, y, Wd, y + 1))
        r = random.Random(3); d = ImageDraw.Draw(g)
        for _ in range(500):
            x, y = r.uniform(0, Wd), r.uniform(392, (TOP + 2) * 2); sz = 1 + (y - 380) / 40
            d.ellipse((x, y, x + sz * 2, y + sz), fill=tuple(int(c * r.uniform(0.75, 1.1)) for c in gc))
        # textured foreground so the painter keeps adding grass and flowers down to the bottom
        near = tuple(int(c * 0.8) for c in gc)
        for _ in range(1600):
            x, y = r.uniform(0, Wd), r.uniform((BOT + 30) * 2, H * 2); sz = 3 + (y - BOT * 2) / 60
            col = tuple(int(c * r.uniform(0.7, 1.25)) for c in near) if r.random() > 0.06 else r.choice([(250, 240, 220), (240, 120, 90), (250, 210, 90), (190, 150, 230)])
            d.line((x, y, x + r.uniform(-sz, sz), y - sz * 2.5), fill=col, width=max(2, int(sz / 2)))
        g.resize((1344, 768), Image.LANCZOS).save(os.path.join(gd, f'guide_{st["id"]}.png'))
        os.remove(os.path.join(OUT, 'guide_tmp.jpg'))

def main():
    stages = json.load(open(os.path.join(ROOT, 'public', 'data', 'stages.json')))
    images = {}
    for i, st in enumerate(stages):
        ai = os.path.join(ROOT, 'art-src', 'recos', f'{st["id"]}.png')
        fin = os.path.join(ROOT, 'art-src', 'recos', f'{st["id"]}_final.png')
        if os.path.exists(ai):
            Image.open(ai).convert('RGB').resize((1280, 720), Image.LANCZOS).save(os.path.join(OUT, f'story-{st["id"]}.jpg'), quality=84, optimize=True)
            images['story-' + st['id']] = f'assets/bg/story-{st["id"]}.jpg'
        if os.path.exists(fin): im = ai_composite(seams_svg(st['id'], st['zones']), fin, 'bg-' + st['id'], light=False)
        elif os.path.exists(ai): im = ai_composite(scene(st['id'], st['zones'], 100 + i, overlay=True), ai, 'bg-' + st['id'], night=bool(SKY[st['id']]['tint']))
        else: im = to_jpg(scene(st['id'], st['zones'], 100 + i), 'bg-' + st['id'])
        images['bg-' + st['id']] = f'assets/bg/bg-{st["id"]}.jpg'
        if i == 0:
            t = im.filter(ImageFilter.GaussianBlur(6)); t = ImageEnhance.Brightness(t).enhance(0.6)
            t.save(os.path.join(OUT, 'bg-title.jpg'), quality=85); images['bg-title'] = 'assets/bg/bg-title.jpg'
        thumb = im.crop((X0 * 2 - 40, 140, (X0 + 1080) * 2 + 40, 860)).resize((560, 260))
        thumb.save(os.path.join(OUT, f'thumb-{st["id"]}.jpg'), quality=85); images['thumb-' + st['id']] = f'assets/bg/thumb-{st["id"]}.jpg'
    make_fx()
    for f in sorted(os.listdir(FX)):
        if f.endswith('.png'): images['fx-' + f[:-4]] = f'assets/fx/{f}'
    mp = os.path.join(ROOT, 'public', 'assets', 'manifest.json')
    m = json.load(open(mp)); m['images'].update(images)
    json.dump(m, open(mp, 'w'), ensure_ascii=False, indent=2)
    print('bg + fx images:', len(images))

if __name__ == '__main__':
    import sys
    make_guides() if 'guides' in sys.argv else make_pass2() if 'pass2' in sys.argv else main()
