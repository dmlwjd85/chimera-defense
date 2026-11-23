"""Code-drawn chibi art for Chimera Defense (placeholder until Grok art). Writes SVG + PNG (256px)."""
import os, subprocess, json

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'units')
os.makedirs(OUT, exist_ok=True)
INK = '#2b1d16'
SW = 7

def shade(hexc, k):
    h = hexc.lstrip('#'); r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    f = lambda v: max(0, min(255, int(v * k)))
    return '#%02x%02x%02x' % (f(r), f(g), f(b))

def grad(id_, c):
    return f'<linearGradient id="{id_}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{shade(c,1.12)}"/><stop offset="0.6" stop-color="{c}"/><stop offset="1" stop-color="{shade(c,0.78)}"/></linearGradient>'

def svg(body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{defs}</defs>{body}</svg>'

S = lambda: f'stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round" stroke-linecap="round"'

def shadow(cx=256, cy=470, rx=150, ry=22):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#000" opacity="0.22"/>'

def eye(x, y, s=1.0, col='#3a2414', angry=False):
    r = 22 * s
    out = f'<ellipse cx="{x}" cy="{y}" rx="{r*0.82}" ry="{r}" fill="#fff" {S()}/>'
    out += f'<ellipse cx="{x+4*s}" cy="{y+3*s}" rx="{r*0.55}" ry="{r*0.72}" fill="{col}"/>'
    out += f'<ellipse cx="{x+6*s}" cy="{y+6*s}" rx="{r*0.3}" ry="{r*0.4}" fill="#111"/>'
    out += f'<circle cx="{x-2*s}" cy="{y-7*s}" r="{r*0.28}" fill="#fff"/><circle cx="{x+10*s}" cy="{y+10*s}" r="{r*0.12}" fill="#fff"/>'
    if angry:
        out += f'<path d="M{x-r} {y-r-10} L{x+r} {y-r+2}" {S()} fill="none"/>'
    return out

def blush(x, y):
    return f'<ellipse cx="{x}" cy="{y}" rx="16" ry="9" fill="#ff7b8a" opacity="0.55"/>'

# ---------------- quadrupeds ----------------
def quad(p):
    c, dark, belly = p['c'], p.get('dark', shade(p['c'], 0.7)), p.get('belly', '#f6e7cf')
    d = grad('gb', c) + grad('gh', c)
    b = shadow()
    # tail
    t = p.get('tail', 'fluffy')
    if t == 'fluffy':
        b += f'<path d="M150 330 C 60 330 40 230 90 180 C 110 250 150 270 175 290 Z" fill="url(#gb)" {S()}/>'
        if p.get('tailTip'): b += f'<path d="M90 180 C 70 205 72 230 84 248 C 98 230 104 205 90 180 Z" fill="{p["tailTip"]}" {S()}/>'
    elif t == 'thin':
        b += f'<path d="M150 320 C 90 300 80 230 110 210" fill="none" stroke="{INK}" stroke-width="22" stroke-linecap="round"/><path d="M150 320 C 90 300 80 230 110 210" fill="none" stroke="{c}" stroke-width="10" stroke-linecap="round"/>'
    elif t == 'stub':
        b += f'<circle cx="140" cy="300" r="26" fill="{p.get("tailCol", belly)}" {S()}/>'
    elif t == 'tuft':
        b += f'<path d="M150 320 C 100 330 90 290 100 260" fill="none" stroke="{INK}" stroke-width="18" stroke-linecap="round"/><path d="M150 320 C 100 330 90 290 100 260" fill="none" stroke="{dark}" stroke-width="7" stroke-linecap="round"/><ellipse cx="100" cy="255" rx="16" ry="22" fill="{dark}" {S()}/>'
    # back legs
    for x in (175, 300):
        b += f'<rect x="{x}" y="360" width="46" height="92" rx="22" fill="{dark}" {S()}/>'
    # body
    b += f'<ellipse cx="250" cy="340" rx="{p.get("bodyW",125)}" ry="{p.get("bodyH",88)}" fill="url(#gb)" {S()}/>'
    b += f'<ellipse cx="275" cy="372" rx="85" ry="42" fill="{belly}" opacity="0.9"/>'
    if p.get('hump'):
        b += f'<path d="M190 300 C 200 210 300 200 330 270 Z" fill="{p["hump"]}" {S()}/>'
    for s_ in p.get('stripes', []):
        b += f'<path d="{s_}" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
    # front legs
    for x in (215, 330):
        b += f'<rect x="{x}" y="368" width="48" height="96" rx="22" fill="url(#gb)" {S()}/>'
        b += f'<ellipse cx="{x+24}" cy="460" rx="28" ry="12" fill="{p.get("paw", shade(c,0.85))}" {S()}/>'
    hx, hy, hr = 330, 215, p.get('headR', 108)
    # ears (behind head)
    e = p.get('ears', 'point')
    if e == 'point':
        for (x1, x2, x3) in ((250, 280, 315), (330, 370, 400)):
            b += f'<path d="M{x1} {hy-40} L{x2} {hy-hr-50} L{x3} {hy-hr+20} Z" fill="url(#gh)" {S()}/>'
            b += f'<path d="M{x1+15} {hy-48} L{x2} {hy-hr-25} L{x3-12} {hy-hr+28} Z" fill="{p.get("earIn", "#ffd2c4")}"/>'
    elif e == 'round':
        for x in (262, 392):
            b += f'<circle cx="{x}" cy="{hy-hr+18}" r="38" fill="url(#gh)" {S()}/><circle cx="{x}" cy="{hy-hr+22}" r="20" fill="{p.get("earIn", "#e8b9a3")}"/>'
    elif e == 'long':
        for (x, rot) in ((285, -12), (355, 10)):
            b += f'<g transform="rotate({rot} {x} {hy-hr})"><ellipse cx="{x}" cy="{hy-hr-55}" rx="30" ry="90" fill="url(#gh)" {S()}/><ellipse cx="{x}" cy="{hy-hr-50}" rx="14" ry="66" fill="#ffc1cc"/></g>'
    elif e == 'small':
        for x in (270, 385):
            b += f'<ellipse cx="{x}" cy="{hy-hr+25}" rx="30" ry="22" fill="url(#gh)" {S()}/>'
    # horns (behind head front)
    h = p.get('horns')
    if h == 'curl':
        b += f'<path d="M285 140 C 210 110 170 190 220 240 C 250 265 290 240 270 210" fill="none" stroke="{INK}" stroke-width="44" stroke-linecap="round"/><path d="M285 140 C 210 110 170 190 220 240 C 250 265 290 240 270 210" fill="none" stroke="#d9c49a" stroke-width="30" stroke-linecap="round"/>'
    # head
    b += f'<circle cx="{hx}" cy="{hy}" r="{hr}" fill="url(#gh)" {S()}/>'
    if p.get('mane'):
        b += f'<path d="M{hx-hr+10} {hy+20} C {hx-hr-30} {hy-60} {hx-40} {hy-hr-30} {hx+20} {hy-hr+5}" fill="none" stroke="{p["mane"]}" stroke-width="34" stroke-linecap="round"/>'
    for s_ in p.get('headStripes', []):
        b += f'<path d="{s_}" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>'
    if p.get('face'):
        b += f'<path d="{p["face"]}" fill="{belly}"/>'
    if h == 'short':
        b += f'<path d="M{hx-60} {hy-hr+30} C {hx-90} {hy-hr-10} {hx-70} {hy-hr-40} {hx-40} {hy-hr-30}" fill="none" stroke="{INK}" stroke-width="26" stroke-linecap="round"/><path d="M{hx-60} {hy-hr+30} C {hx-90} {hy-hr-10} {hx-70} {hy-hr-40} {hx-40} {hy-hr-30}" fill="none" stroke="#efe6cf" stroke-width="14" stroke-linecap="round"/>'
        b += f'<path d="M{hx+40} {hy-hr+25} C {hx+70} {hy-hr-15} {hx+60} {hy-hr-40} {hx+30} {hy-hr-35}" fill="none" stroke="{INK}" stroke-width="26" stroke-linecap="round"/><path d="M{hx+40} {hy-hr+25} C {hx+70} {hy-hr-15} {hx+60} {hy-hr-40} {hx+30} {hy-hr-35}" fill="none" stroke="#efe6cf" stroke-width="14" stroke-linecap="round"/>'
    if h == 'antler':
        for x, sgn in ((hx - 40, -1), (hx + 30, 1)):
            b += f'<path d="M{x} {hy-hr+10} L{x+sgn*10} {hy-hr-60} M{x+sgn*6} {hy-hr-25} L{x+sgn*35} {hy-hr-45} M{x+sgn*9} {hy-hr-48} L{x-sgn*15} {hy-hr-80}" stroke="{INK}" stroke-width="20" stroke-linecap="round" fill="none"/><path d="M{x} {hy-hr+10} L{x+sgn*10} {hy-hr-60} M{x+sgn*6} {hy-hr-25} L{x+sgn*35} {hy-hr-45} M{x+sgn*9} {hy-hr-48} L{x-sgn*15} {hy-hr-80}" stroke="#c49a6c" stroke-width="9" stroke-linecap="round" fill="none"/>'
    # snout
    sn = p.get('snout', 'long')
    if sn == 'long':
        b += f'<path d="M{hx+40} {hy+5} C {hx+130} {hy-5} {hx+150} {hy+40} {hx+120} {hy+62} C {hx+90} {hy+80} {hx+40} {hy+70} {hx+30} {hy+50} Z" fill="{p.get("snoutCol", belly)}" {S()}/>'
        b += f'<ellipse cx="{hx+132}" cy="{hy+22}" rx="16" ry="12" fill="{INK}"/>'
        b += f'<path d="M{hx+80} {hy+60} C {hx+95} {hy+68} {hx+108} {hy+62} {hx+115} {hy+55}" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
    elif sn == 'round':
        b += f'<ellipse cx="{hx+70}" cy="{hy+45}" rx="58" ry="42" fill="{p.get("snoutCol", belly)}" {S()}/><ellipse cx="{hx+105}" cy="{hy+30}" rx="18" ry="13" fill="{INK}"/>'
        b += f'<path d="M{hx+70} {hy+70} C {hx+85} {hy+80} {hx+100} {hy+74} {hx+105} {hy+65}" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
    elif sn == 'bunny':
        b += f'<ellipse cx="{hx+80}" cy="{hy+45}" rx="34" ry="26" fill="{belly}" {S()}/><path d="M{hx+98} {hy+30} l12 0 l-6 9 z" fill="#ff8fa3" {S()}/>'
    # eyes
    b += eye(hx + 30, hy - 15, 0.8, p.get('eyeCol', '#3a2414'))
    b += eye(hx + 85, hy - 18, 1.05, p.get('eyeCol', '#3a2414'), p.get('angry', False))
    b += blush(hx + 55, hy + 35)
    b += p.get('extra', '')
    return svg(b, d)

# ---------------- birds ----------------
def bird(p):
    c = p['c']; d = grad('gb', c)
    b = shadow(256, 470, 120, 20)
    b += f'<path d="M150 300 C 70 260 60 170 110 150 C 120 210 160 240 190 260 Z" fill="{p.get("tailCol", shade(c,0.8))}" {S()}/>'
    if p.get('tailExtra'): b += p['tailExtra']
    for x in (225, 290):
        b += f'<path d="M{x} 400 L{x} 455 M{x-18} 458 L{x+22} 458" stroke="{INK}" stroke-width="16" stroke-linecap="round"/><path d="M{x} 400 L{x} 455 M{x-18} 458 L{x+22} 458" stroke="#f2b134" stroke-width="7" stroke-linecap="round"/>'
    b += f'<ellipse cx="255" cy="320" rx="120" ry="100" fill="url(#gb)" {S()}/>'
    b += f'<ellipse cx="290" cy="350" rx="70" ry="55" fill="{p.get("belly", shade(c,1.25))}" opacity="0.9"/>'
    b += f'<path d="M180 290 C 190 360 260 390 300 360 C 250 350 220 320 210 280 Z" fill="{shade(c,0.75)}" {S()}/>'
    hx, hy = 330, 205
    if p.get('comb'): b += f'<path d="M290 120 C 290 80 320 90 320 110 C 330 75 360 85 355 115 C 375 95 395 115 375 140 Z" fill="#e53935" {S()}/>'
    b += f'<circle cx="{hx}" cy="{hy}" r="92" fill="{p.get("headCol", c)}" {S()}/>'
    if p.get('crest'): b += p['crest']
    b += f'<path d="M{hx+75} {hy-10} C {hx+150} {hy} {hx+150} {hy+30} {hx+80} {hy+40} Z" fill="{p.get("beak", "#f2b134")}" {S()}/>'
    if p.get('hook'): b += f'<path d="M{hx+125} {hy+10} C {hx+150} {hy+25} {hx+135} {hy+50} {hx+120} {hy+42}" fill="{p.get("beak")}" {S()}/>'
    if p.get('wattle'): b += f'<ellipse cx="{hx+80}" cy="{hy+70}" rx="16" ry="26" fill="#e53935" {S()}/>'
    b += eye(hx + 20, hy - 15, 0.75)
    b += eye(hx + 70, hy - 20, 1.0, '#3a2414', p.get('angry', False))
    b += blush(hx + 40, hy + 35)
    b += p.get('extra', '')
    return svg(b, d)

# ---------------- frog / grasshopper ----------------
def frog(c='#5fae4a', belly='#e6f2b0', extra='', horns=False):
    d = grad('gb', c)
    b = shadow(256, 470, 160, 22)
    b += f'<path d="M110 420 C 60 420 70 350 130 340 L170 400 Z" fill="{shade(c,0.85)}" {S()}/><path d="M402 420 C 452 420 442 350 382 340 L342 400 Z" fill="{shade(c,0.85)}" {S()}/>'
    b += f'<ellipse cx="256" cy="330" rx="170" ry="130" fill="url(#gb)" {S()}/>'
    b += f'<ellipse cx="270" cy="380" rx="110" ry="70" fill="{belly}"/>'
    if horns:
        b += f'<path d="M150 230 C 100 200 100 150 130 140" fill="none" stroke="{INK}" stroke-width="26" stroke-linecap="round"/><path d="M150 230 C 100 200 100 150 130 140" fill="none" stroke="#efe6cf" stroke-width="13" stroke-linecap="round"/>'
        b += f'<path d="M362 230 C 412 200 412 150 382 140" fill="none" stroke="{INK}" stroke-width="26" stroke-linecap="round"/><path d="M362 230 C 412 200 412 150 382 140" fill="none" stroke="#efe6cf" stroke-width="13" stroke-linecap="round"/>'
    for x, s_ in ((190, 0.9), (325, 1.05)):
        b += f'<circle cx="{x}" cy="215" r="{55*s_}" fill="url(#gb)" {S()}/>'
        b += eye(x + 5, 212, 1.4 * s_)
    b += f'<path d="M190 330 C 230 365 300 365 350 325" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>'
    b += blush(170, 305) + blush(355, 305)
    for x in (200, 300):
        b += f'<ellipse cx="{x}" cy="455" rx="38" ry="16" fill="{shade(c,0.9)}" {S()}/>'
    b += extra
    return svg(b, d)

def grasshopper():
    c = '#7ccf4f'; d = grad('gb', c)
    b = shadow(256, 470, 140, 20)
    b += f'<path d="M150 330 L120 240 L150 450" fill="none" stroke="{INK}" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/><path d="M150 330 L120 240 L150 450" fill="none" stroke="{shade(c,0.8)}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>'
    b += f'<path d="M140 280 C 120 200 230 190 300 250 Z" fill="#cfe9a8" opacity="0.85" {S()}/>'
    b += f'<ellipse cx="220" cy="340" rx="110" ry="72" fill="url(#gb)" {S()}/>'
    for x in (215, 265):
        b += f'<path d="M{x} 390 L{x-10} 455" stroke="{INK}" stroke-width="18" stroke-linecap="round"/><path d="M{x} 390 L{x-10} 455" stroke="{shade(c,0.85)}" stroke-width="8" stroke-linecap="round"/>'
    hx, hy = 330, 225
    b += f'<path d="M{hx-10} {hy-75} C {hx-40} {hy-170} {hx+10} {hy-200} {hx+30} {hy-190}" fill="none" stroke="{INK}" stroke-width="8"/><path d="M{hx+30} {hy-80} C {hx+40} {hy-170} {hx+90} {hy-190} {hx+105} {hy-175}" fill="none" stroke="{INK}" stroke-width="8"/>'
    b += f'<ellipse cx="{hx}" cy="{hy}" rx="88" ry="96" fill="url(#gb)" {S()}/>'
    b += eye(hx + 15, hy - 15, 1.0) + eye(hx + 65, hy - 20, 1.15)
    b += f'<path d="M{hx+40} {hy+45} C {hx+55} {hy+60} {hx+70} {hy+55} {hx+78} {hy+45}" fill="none" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'
    b += blush(hx + 40, hy + 30)
    # tiny guitar
    b += f'<g transform="rotate(-30 360 360)"><ellipse cx="350" cy="370" rx="45" ry="38" fill="#c8833f" {S()}/><circle cx="350" cy="370" r="12" fill="{INK}"/><rect x="390" y="362" width="80" height="16" fill="#8b5a2b" {S()}/></g>'
    b += f'<text x="440" y="200" font-size="56" fill="{INK}" font-family="sans-serif">♪</text>'
    return svg(b, d)

# ---------------- enemies ----------------
def imp(c, w=1.0, extra='', horns=True, eyes='#ffde59'):
    d = grad('gb', c)
    b = shadow(256, 470, 120 * w, 20)
    for x in (210, 290):
        b += f'<rect x="{x}" y="390" width="40" height="70" rx="18" fill="{shade(c,0.7)}" {S()}/>'
    b += f'<path d="M150 260 C 130 380 380 380 360 260 C 350 150 160 150 150 260 Z" transform="scale({w} 1) translate({(1-w)*256/w} 0)" fill="url(#gb)" {S()}/>'
    if horns:
        b += f'<path d="M190 175 L165 100 L225 160 Z" fill="#ece3d0" {S()}/><path d="M320 160 L355 95 L340 180 Z" fill="#ece3d0" {S()}/>'
    # facing left (enemies walk left): eyes on left
    b += f'<ellipse cx="205" cy="255" rx="26" ry="20" fill="{eyes}" {S()}/><ellipse cx="268" cy="255" rx="22" ry="17" fill="{eyes}" {S()}/>'
    b += f'<circle cx="198" cy="257" r="8" fill="{INK}"/><circle cx="262" cy="257" r="7" fill="{INK}"/>'
    b += f'<path d="M185 228 L225 242 M290 240 L250 232" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>'
    b += f'<path d="M195 310 C 215 300 245 300 265 312 L255 322 L245 312 L232 324 L220 312 L208 322 Z" fill="#fff" {S()}/>'
    b += extra
    return svg(b, d)

def boar(c, size=1.0, extra=''):
    d = grad('gb', c)
    b = shadow(256, 470, 180, 24)
    for x in (300, 380):
        b += f'<rect x="{x}" y="360" width="50" height="100" rx="20" fill="{shade(c,0.7)}" {S()}/>'
    b += f'<ellipse cx="300" cy="320" rx="170" ry="115" fill="url(#gb)" {S()}/>'
    b += f'<path d="M200 220 L220 170 L240 215 L260 160 L280 212 L300 155 L320 210 L345 165 L360 215" fill="{shade(c,0.6)}" {S()}/>'
    for x in (160, 240):
        b += f'<rect x="{x}" y="370" width="50" height="95" rx="20" fill="url(#gb)" {S()}/>'
    b += f'<circle cx="170" cy="270" r="95" fill="url(#gb)" {S()}/>'
    b += f'<ellipse cx="95" cy="300" rx="45" ry="38" fill="#e8a3a3" {S()}/><circle cx="82" cy="298" r="8" fill="{INK}"/><circle cx="104" cy="298" r="8" fill="{INK}"/>'
    b += f'<path d="M120 330 C 90 330 70 300 80 280" fill="none" stroke="{INK}" stroke-width="24" stroke-linecap="round"/><path d="M120 330 C 90 330 70 300 80 280" fill="none" stroke="#fffbe8" stroke-width="12" stroke-linecap="round"/>'
    b += f'<ellipse cx="150" cy="240" rx="18" ry="14" fill="#ff5a3c" {S()}/><path d="M125 215 L175 228" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>'
    b += f'<path d="M210 190 L240 140 L250 200 Z" fill="{shade(c,0.8)}" {S()}/>'
    b += extra
    return svg(b, d)

def bat(c='#3b3355', king=False):
    d = grad('gb', c)
    b = ''
    wing = f'<path d="M256 250 C 180 150 80 140 30 200 C 70 210 80 240 70 270 C 110 250 130 270 135 300 C 170 270 210 280 230 300 Z" fill="{shade(c,0.8)}" {S()}/>'
    b += wing + f'<g transform="translate(512 0) scale(-1 1)">{wing}</g>'
    b += f'<ellipse cx="256" cy="280" rx="80" ry="90" fill="url(#gb)" {S()}/>'
    b += f'<path d="M200 210 L190 140 L235 195 Z" fill="url(#gb)" {S()}/><path d="M312 210 L322 140 L277 195 Z" fill="url(#gb)" {S()}/>'
    b += f'<ellipse cx="225" cy="265" rx="20" ry="16" fill="#ff4d4d" {S()}/><ellipse cx="285" cy="265" rx="20" ry="16" fill="#ff4d4d" {S()}/>'
    b += f'<path d="M235 315 L245 335 L255 315 L265 335 L275 315" fill="#fff" {S()}/>'
    if king:
        b += f'<path d="M205 175 L215 120 L240 150 L256 105 L272 150 L297 120 L307 175 Z" fill="#ffd84d" {S()}/><circle cx="256" cy="140" r="8" fill="#e53935"/>'
        b += f'<path d="M200 360 C 220 420 290 420 312 360" fill="#7b1f2e" {S()}/>'
    return svg(b, d)

def mushroom():
    d = grad('gb', '#e94f4f')
    b = shadow(256, 470, 110, 18)
    b += f'<path d="M200 300 C 190 400 200 450 256 455 C 312 450 322 400 312 300 Z" fill="#f6ead2" {S()}/>'
    b += f'<path d="M110 300 C 100 150 412 150 402 300 Z" fill="url(#gb)" {S()}/>'
    for (x, y, r) in ((180, 230, 22), (260, 200, 26), (340, 240, 20), (220, 280, 14), (310, 285, 15)):
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff8ec"/>'
    b += f'<ellipse cx="230" cy="350" rx="14" ry="18" fill="{INK}"/><ellipse cx="280" cy="350" rx="14" ry="18" fill="{INK}"/><circle cx="226" cy="344" r="5" fill="#fff"/><circle cx="276" cy="344" r="5" fill="#fff"/>'
    b += f'<path d="M150 360 L120 260" stroke="{INK}" stroke-width="16" stroke-linecap="round"/><path d="M150 360 L120 260" stroke="#8b5a2b" stroke-width="7" stroke-linecap="round"/><circle cx="118" cy="252" r="20" fill="#7CFC9A" {S()}/>'
    b += f'<text x="80" y="210" font-size="44" fill="#58d68d" font-family="sans-serif">+</text>'
    return svg(b, d)

def beetle():
    c = '#8e3b46'; d = grad('gb', c)
    b = shadow(256, 450, 130, 20)
    for x in (180, 250, 320):
        b += f'<path d="M{x} 380 L{x-25} 440" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>'
    b += f'<ellipse cx="280" cy="330" rx="140" ry="95" fill="url(#gb)" {S()}/><path d="M280 240 L280 420" stroke="{INK}" stroke-width="6"/>'
    b += f'<circle cx="150" cy="320" r="60" fill="{shade(c,0.6)}" {S()}/><circle cx="130" cy="305" r="12" fill="#ffde59"/><circle cx="160" cy="300" r="10" fill="#ffde59"/>'
    b += f'<path d="M110 270 C 90 230 70 220 60 230 M150 262 C 150 220 140 200 125 200" fill="none" stroke="{INK}" stroke-width="7"/>'
    return svg(b, d)

def moth():
    c = '#4b4f7a'; d = grad('gb', c)
    b = ''
    w = f'<path d="M256 260 C 200 150 70 130 60 210 C 55 280 150 300 230 290 Z" fill="#6f74b8" {S()}/><circle cx="150" cy="215" r="28" fill="#ffd84d" opacity="0.8"/>'
    b += w + f'<g transform="translate(512 0) scale(-1 1)">{w}</g>'
    b += f'<ellipse cx="256" cy="290" rx="45" ry="95" fill="url(#gb)" {S()}/>'
    b += f'<circle cx="236" cy="225" r="14" fill="#ff5a5a"/><circle cx="276" cy="225" r="14" fill="#ff5a5a"/>'
    b += f'<path d="M240 200 C 220 150 200 140 185 150 M272 200 C 292 150 312 140 327 150" fill="none" stroke="{INK}" stroke-width="7"/>'
    return svg(b, d)

def golem():
    c = '#8a8f96'; d = grad('gb', c)
    b = shadow(256, 470, 160, 22)
    for x in (180, 290):
        b += f'<rect x="{x}" y="380" width="60" height="80" rx="14" fill="{shade(c,0.7)}" {S()}/>'
    b += f'<path d="M120 380 L100 230 L180 140 L340 140 L410 240 L390 380 Z" fill="url(#gb)" {S()}/>'
    b += f'<path d="M180 210 L230 250 M300 300 L340 330 M150 320 L200 300" stroke="{shade(c,0.6)}" stroke-width="8" stroke-linecap="round"/>'
    b += f'<rect x="165" y="230" width="44" height="22" fill="#ffb347" {S()}/><rect x="235" y="230" width="44" height="22" fill="#ffb347" {S()}/>'
    b += f'<path d="M200 205 L280 215" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
    b += f'<path d="M150 180 C 160 150 190 150 200 170 Z" fill="#5fae4a" {S()}/>'
    return svg(b, d)

def weasel():
    c = '#c77b3a'; d = grad('gb', c)
    b = shadow(256, 470, 170, 18)
    b += f'<path d="M380 360 C 460 340 480 280 450 250" fill="none" stroke="{INK}" stroke-width="28" stroke-linecap="round"/><path d="M380 360 C 460 340 480 280 450 250" fill="none" stroke="{c}" stroke-width="16" stroke-linecap="round"/>'
    b += f'<ellipse cx="290" cy="360" rx="130" ry="55" fill="url(#gb)" {S()}/>'
    for x in (200, 250, 330, 380):
        b += f'<path d="M{x} 395 L{x - 30} 450" stroke="{INK}" stroke-width="20" stroke-linecap="round"/><path d="M{x} 395 L{x - 30} 450" stroke="{shade(c,0.8)}" stroke-width="9" stroke-linecap="round"/>'
    b += f'<circle cx="160" cy="320" r="70" fill="url(#gb)" {S()}/><path d="M130 260 L140 225 L165 255 Z" fill="url(#gb)" {S()}/>'
    b += f'<path d="M100 330 C 60 330 70 300 100 300 Z" fill="#f6e7cf" {S()}/><circle cx="70" cy="312" r="8" fill="{INK}"/>'
    b += f'<ellipse cx="130" cy="305" rx="14" ry="11" fill="#ffde59" {S()}/><circle cx="125" cy="306" r="5" fill="{INK}"/>'
    b += f'<path d="M420 300 L470 300 M420 330 L480 330 M430 360 L475 365" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.7"/>'
    return svg(b, d)

def shadow_boss():
    d = '<radialGradient id="gs" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#4a3b6b"/><stop offset="1" stop-color="#14101f"/></radialGradient>'
    b = shadow(256, 475, 170, 22)
    b += f'<path d="M110 470 C 90 380 80 250 150 170 C 200 110 320 110 370 170 C 440 250 430 380 400 470 C 380 440 360 470 340 440 C 320 470 300 440 280 470 C 260 440 240 470 220 440 C 200 470 180 440 160 470 C 140 440 125 470 110 470 Z" fill="url(#gs)" {S()}/>'
    b += f'<path d="M150 170 L120 80 L190 140 M362 170 L400 70 L320 140" stroke="#2a1f40" stroke-width="22" stroke-linecap="round" fill="none"/>'
    b += f'<path d="M170 250 L230 270 L170 290 Z" fill="#b388ff"/><path d="M330 250 L270 270 L330 290 Z" fill="#b388ff"/>'
    b += f'<path d="M210 350 C 240 330 280 330 310 350" fill="none" stroke="#b388ff" stroke-width="8" stroke-linecap="round"/>'
    for (x, y) in ((90, 200), (420, 240), (130, 120), (400, 130)):
        b += f'<circle cx="{x}" cy="{y}" r="8" fill="#b388ff" opacity="0.6"/>'
    return svg(b, d)

# ---------------- species definitions ----------------
FUR = {
 'fox': dict(c='#e8823a', ears='point', snout='long', tail='fluffy', tailTip='#fff4e6', face='M330 230 C 380 240 420 250 450 240 C 430 300 360 320 330 290 Z'),
 'wolf': dict(c='#8e9aa8', dark='#5d6773', ears='point', snout='long', tail='fluffy', tailTip='#e9edf2', eyeCol='#d4a017', earIn='#c9b8b8'),
 'bear': dict(c='#8b5a2b', ears='round', snout='round', tail='stub', tailCol='#6b4420', snoutCol='#d9b38c', headR=112, bodyW=135, bodyH=95),
 'tiger': dict(c='#f2a33a', ears='round', snout='round', tail='thin', earIn='#fff2df', snoutCol='#fff8ec',
               stripes=['M210 270 L230 300', 'M250 260 L265 295', 'M300 265 L305 300', 'M180 320 L205 330'],
               headStripes=['M300 125 L310 150', 'M330 120 L332 148', 'M360 125 L352 150', 'M240 200 L265 205', 'M240 230 L262 228']),
 'rabbit': dict(c='#f4f1ea', dark='#d8d1c3', belly='#ffffff', ears='long', snout='bunny', tail='stub', tailCol='#ffffff', eyeCol='#c2185b', bodyW=110, bodyH=80),
 'bison': dict(c='#6d4c35', dark='#4a3222', ears='small', snout='round', tail='tuft', horns='short', hump='#4a3222', snoutCol='#3a2a20', bodyW=140, bodyH=95),
 'bighorn': dict(c='#b08d6a', dark='#8a6b4e', ears='small', snout='long', tail='stub', tailCol='#f6e7cf', horns='curl', snoutCol='#f1e3cc'),
}
BIRD = {
 'rooster': dict(c='#fffaf0', headCol='#fffaf0', belly='#ffffff', comb=True, wattle=True, tailCol='#2e7d32',
                 tailExtra='<path d="M150 290 C 60 200 90 130 130 120 C 120 190 150 240 190 260 Z" fill="#c62828" stroke="#2b1d16" stroke-width="7"/>'),
 'crow': dict(c='#2f3542', headCol='#2f3542', belly='#4b5263', beak='#3a3a3a', tailCol='#1f232c'),
 'eagle': dict(c='#7a4a2a', headCol='#fbfbf7', belly='#9a6a45', beak='#f2b134', hook=True, angry=True, tailCol='#fbfbf7'),
}

def write(name, s):
    sp = os.path.join(OUT, name + '.svg')
    open(sp, 'w').write(s)
    subprocess.run(['rsvg-convert', '-w', '256', '-h', '256', sp, '-o', os.path.join(OUT, name + '.png')], check=True)
    os.remove(sp)

ART = {}
for k, v in FUR.items(): ART[k] = quad(v)
for k, v in BIRD.items(): ART[k] = bird(v)
ART['frog'] = frog()
ART['grasshopper'] = grasshopper()

# chimeras
cheese = '<path d="M380 250 L450 230 L440 290 Z" fill="#ffd54f" stroke="#2b1d16" stroke-width="6"/><circle cx="420" cy="255" r="7" fill="#e6b800"/>'
crow_wing = '<path d="M210 300 C 150 200 80 210 70 250 C 110 250 120 270 110 300 C 150 290 170 320 230 330 Z" fill="#2f3542" stroke="#2b1d16" stroke-width="7"/>'
ART['cheese_thief'] = quad(dict(FUR['fox'], extra=crow_wing + cheese, eyeCol='#222'))
mugwort = '<path d="M230 150 C 300 110 380 110 430 150" fill="none" stroke="#2b1d16" stroke-width="22" stroke-linecap="round"/><path d="M230 150 C 300 110 380 110 430 150" fill="none" stroke="#6aa84f" stroke-width="12" stroke-linecap="round"/><path d="M240 150 C 220 120 200 130 205 150 Z" fill="#6aa84f" stroke="#2b1d16" stroke-width="5"/>'
ART['bear_tiger'] = quad(dict(FUR['bear'], c='#b0702e', stripes=FUR['tiger']['stripes'], headStripes=FUR['tiger']['headStripes'][:3], extra=mugwort))
wool = ''.join(f'<circle cx="{x}" cy="{y}" r="38" fill="#fbfbf7" stroke="#2b1d16" stroke-width="6"/>' for x, y in ((170, 300), (220, 270), (280, 265), (330, 290), (180, 350), (240, 360), (300, 355)))
ART['wolf_in_sheep'] = quad(dict(FUR['wolf'], extra='', angry=True, bodyW=10, bodyH=10)).replace('<circle cx="330" cy="215"', wool + '<circle cx="330" cy="215"', 1)
ART['bullfrog'] = frog(c='#7c8b3a', belly='#e8dfb0', horns=True)
ART['jackalope'] = quad(dict(FUR['rabbit'], c='#c9a27e', dark='#a07e5c', belly='#f6e7cf', horns='antler', ears='small'))
bolt = '<path d="M150 230 L190 230 L165 270 L205 270 L140 340 L160 285 L125 285 Z" fill="#ffe94d" stroke="#2b1d16" stroke-width="5"/>'
ART['thunderbird'] = bird(dict(c='#2e5c8a', headCol='#2e5c8a', belly='#4a86c0', beak='#f2b134', hook=True, angry=True, tailCol='#1d3c5c', extra=bolt))
flame = '<path d="M150 290 C 40 230 60 120 120 100 C 110 160 140 190 160 200 C 150 150 190 110 220 120 C 190 170 200 230 200 260 Z" fill="#ff9800" stroke="#2b1d16" stroke-width="7"/><path d="M150 270 C 100 230 100 170 130 150 C 130 200 160 220 180 240 Z" fill="#ffe082"/>'
ART['phoenix'] = bird(dict(c='#e53935', headCol='#ef5350', belly='#ffb74d', comb=True, beak='#ffd54f', hook=True, tailCol='#ff7043', tailExtra=flame))

# enemies (face left = walk toward defense line)
ART['enemy-normal'] = imp('#6b4fa0')
ART['enemy-fast'] = weasel()
ART['enemy-tough'] = golem()
ART['enemy-swarm'] = beetle()
ART['enemy-flying'] = moth()
ART['enemy-healer'] = mushroom()
ART['enemy-miniboss'] = boar('#8a5a3c')
ART['enemy-boss_boar'] = boar('#5b3a29', extra='<path d="M235 140 L255 90 L275 140" fill="#ffd84d" stroke="#2b1d16" stroke-width="6"/>')
ART['enemy-bat'] = bat()
ART['enemy-boss_bat'] = bat('#2a2440', king=True)
ART['enemy-boss_shadow'] = shadow_boss()

manifest = {}
for k, s in ART.items():
    fname = k if k.startswith('enemy-') else 'unit-' + k
    write(fname, s)
    manifest[fname] = f'assets/units/{fname}.png'

mp = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'manifest.json')
m = json.load(open(mp)); m['images'] = manifest
json.dump(m, open(mp, 'w'), ensure_ascii=False, indent=2)
print(len(manifest), 'images')
