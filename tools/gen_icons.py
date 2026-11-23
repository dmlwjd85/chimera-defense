"""App icons for the PWA / store builds: a gold-rimmed night-sky badge with the chimera (fox + crow) in front of a small globe."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

def badge(size, maskable=False):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = 0 if maskable else int(S * 0.04)
    r = int(S * 0.22) if not maskable else 0
    # night gradient
    bg = Image.new('RGBA', (S, S))
    for y in range(S):
        t = y / S
        c = (int(18 + 30 * t), int(32 + 20 * t), int(64 - 20 * t), 255)
        ImageDraw.Draw(bg).line([(0, y), (S, y)], fill=c)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, S - pad, S - pad], radius=r, fill=255)
    im.paste(bg, (0, 0), mask)
    # globe glow
    gl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    cx, cy, R = S // 2, int(S * 0.47), int(S * 0.30)
    gd.ellipse([cx - R - 30, cy - R - 30, cx + R + 30, cy + R + 30], fill=(127, 200, 255, 90))
    gl = gl.filter(ImageFilter.GaussianBlur(S * 0.03))
    im.alpha_composite(gl)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(47, 120, 196, 255))
    d.ellipse([cx - R * 0.95, cy - R * 0.95, cx + R * 0.7, cy + R * 0.7], fill=(79, 159, 224, 255))
    for (dx, dy, w, h, col) in [(-0.45, -0.25, 0.55, 0.35, (124, 194, 90)), (0.15, 0.05, 0.4, 0.55, (224, 130, 70)), (-0.1, -0.65, 0.5, 0.25, (124, 194, 90))]:
        d.ellipse([cx + dx * R, cy + dy * R, cx + (dx + w) * R, cy + (dy + h) * R], fill=col + (255,))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(212, 176, 106, 255), width=int(S * 0.018))
    # animals
    fox = Image.open(os.path.join(ROOT, 'public', 'assets', 'units', 'unit-fox.png')).convert('RGBA').resize((int(S * 0.52),) * 2, Image.LANCZOS)
    crow = Image.open(os.path.join(ROOT, 'public', 'assets', 'units', 'unit-crow.png')).convert('RGBA').resize((int(S * 0.36),) * 2, Image.LANCZOS)
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse([int(S * 0.22), int(S * 0.78), int(S * 0.74), int(S * 0.86)], fill=(0, 0, 0, 110)); sh = sh.filter(ImageFilter.GaussianBlur(S * 0.015))
    im.alpha_composite(sh)
    im.alpha_composite(crow, (int(S * 0.55), int(S * 0.14)))
    im.alpha_composite(fox, (int(S * 0.20), int(S * 0.36)))
    if not maskable:
        rim = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(rim).rounded_rectangle([pad, pad, S - pad, S - pad], radius=r, outline=(212, 176, 106, 255), width=int(S * 0.025))
        im.alpha_composite(rim)
    return im.resize((size, size), Image.LANCZOS)

for s in (192, 512):
    badge(s).save(os.path.join(OUT, f'icon-{s}.png'))
    badge(s, True).save(os.path.join(OUT, f'icon-maskable-{s}.png'))
badge(180, True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
badge(64).save(os.path.join(OUT, 'favicon.png'))
print('icons in', OUT)
