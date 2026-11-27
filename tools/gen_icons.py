#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""키메라 디펜스 설치 아이콘을 크기·기기별로 뽑는다.

원본:
  art-src/icons/icon-1024.png   세 수호자 방패(48칸 이상)
  art-src/icons/icon-32.png     산군 얼굴을 키워 손본 32칸
  art-src/icons/icon-16.png     칸 단위로 다시 그린 16칸

만드는 파일은 아래 main()에 목록으로 적혀 있다.
"""
from __future__ import annotations

import os
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# When run from the repo root, ROOT is the repo. Override with env.
ROOT = Path(os.environ.get("ICON_ROOT", Path(__file__).resolve().parent.parent))
SRC_DIR = ROOT / "art-src" / "icons"
OUT_PUBLIC = ROOT / "public" / "icons"
OUT_BUILD = ROOT / "build"
OUT_ANDROID = OUT_PUBLIC / "android"
OUT_SHOTS = ROOT / "docs" / "pr-shots" / "icon"

BG_OPAQUE = (18, 24, 42, 255)  # 불투명 배경 (테마 #0b1016에 가까운 남색)
GOLD = (201, 145, 72)

FONT_B = "/usr/share/fonts/truetype/sand-box/google/Gothic A1/GothicA1-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/sand-box/google/Gothic A1/GothicA1-Medium.ttf"
FONT_K = "/usr/share/fonts/truetype/sand-box/google/Gothic A1/GothicA1-Black.ttf"


def load_src():
    full = Image.open(SRC_DIR / "icon-1024.png").convert("RGBA")
    s32 = Image.open(SRC_DIR / "icon-32.png").convert("RGBA")
    s16 = Image.open(SRC_DIR / "icon-16.png").convert("RGBA")
    if full.size != (1024, 1024):
        full = full.resize((1024, 1024), Image.Resampling.LANCZOS)
    if s32.size != (32, 32):
        raise SystemExit(f"icon-32.png must be 32x32, got {s32.size}")
    if s16.size != (16, 16):
        raise SystemExit(f"icon-16.png must be 16x16, got {s16.size}")
    return full, s32, s16


def down(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def bbox(im: Image.Image, thr: int = 16):
    a = np.array(im.split()[-1])
    ys, xs = np.where(a > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def place_on_canvas(im: Image.Image, size: int, scale: float, fill=None) -> Image.Image:
    """Scale the artwork (by its opaque bbox) to `scale` of the canvas short side and center it.
    If fill is an RGBA tuple, the canvas is opaque with that color (alpha forced to 255).
    Used for store/desktop-style square icons that are not cropped to a circle.
    """
    if fill is None:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (size, size), fill)
    x0, y0, x1, y1 = bbox(im)
    art = im.crop((x0, y0, x1, y1))
    bw, bh = art.size
    target = size * scale
    s = min(target / bw, target / bh)
    nw, nh = max(1, int(round(bw * s))), max(1, int(round(bh * s)))
    art = art.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(art, ((size - nw) // 2, (size - nh) // 2), art)
    if fill is not None:
        # flatten: no transparency
        bg = Image.new("RGBA", (size, size), fill)
        canvas = Image.alpha_composite(bg, canvas)
        canvas = canvas.convert("RGB").convert("RGBA")
        r, g, b, a = canvas.split()
        a = Image.new("L", (size, size), 255)
        canvas = Image.merge("RGBA", (r, g, b, a))
    return canvas


def art_circumradius(im: Image.Image, bg=None, thr: int = 16) -> float:
    """Max distance from the canvas center to any artwork pixel.
    For opaque images, pixels close to `bg` are treated as backdrop, not art.
    """
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    if bg is not None and int(a[..., 3].min()) == 255:
        dist = np.linalg.norm(a[..., :3].astype(int) - np.array(bg[:3]), axis=2)
        fg = dist > 12
    else:
        fg = a[..., 3] > thr
    ys, xs = np.where(fg)
    if len(xs) == 0:
        return 0.0
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    return float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())


def place_in_safe_circle(im: Image.Image, size: int, safe_diam: float = 0.80, margin: float = 0.05, fill=None) -> Image.Image:
    """Scale the shield so every opaque pixel sits inside a circle of
    diameter `safe_diam * size`, leaving `margin` (fraction of that radius)
    as a small gap. This is for maskable / round-cropped icons.
    """
    x0, y0, x1, y1 = bbox(im)
    art = im.crop((x0, y0, x1, y1))
    aa = np.array(art)
    ys, xs = np.where(aa[..., 3] > 16)
    cx, cy = (art.size[0] - 1) / 2.0, (art.size[1] - 1) / 2.0
    r = float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max())
    target_r = (safe_diam * size / 2.0) * (1.0 - margin)
    if r <= 0:
        raise SystemExit("place_in_safe_circle: empty artwork")
    s = target_r / r
    nw, nh = max(1, int(round(art.size[0] * s))), max(1, int(round(art.size[1] * s)))
    art = art.resize((nw, nh), Image.Resampling.LANCZOS)
    if fill is None:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (size, size), fill)
    canvas.paste(art, ((size - nw) // 2, (size - nh) // 2), art)
    if fill is not None:
        bg = Image.new("RGBA", (size, size), fill)
        canvas = Image.alpha_composite(bg, canvas)
        canvas = canvas.convert("RGB").convert("RGBA")
        rch, gch, bch, ach = canvas.split()
        ach = Image.new("L", (size, size), 255)
        canvas = Image.merge("RGBA", (rch, gch, bch, ach))
    # rounding can push a pixel over the line; shrink once if needed
    cap = (safe_diam * size / 2.0) * (1.0 - margin * 0.4)  # still inside the circle
    got = art_circumradius(canvas, bg=fill)
    limit = safe_diam * size / 2.0
    if got > limit and got > 0:
        fix = (limit * (1.0 - margin * 0.5)) / got
        # rebuild slightly smaller
        nw2, nh2 = max(1, int(round(nw * fix))), max(1, int(round(nh * fix)))
        art2 = im.crop((x0, y0, x1, y1)).resize((nw2, nh2), Image.Resampling.LANCZOS)
        if fill is None:
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        else:
            canvas = Image.new("RGBA", (size, size), fill)
        canvas.paste(art2, ((size - nw2) // 2, (size - nh2) // 2), art2)
        if fill is not None:
            bg = Image.new("RGBA", (size, size), fill)
            canvas = Image.alpha_composite(bg, canvas)
            canvas = canvas.convert("RGB").convert("RGBA")
            rch, gch, bch, ach = canvas.split()
            ach = Image.new("L", (size, size), 255)
            canvas = Image.merge("RGBA", (rch, gch, bch, ach))
    return canvas


def check_inside_circle(im: Image.Image, safe_diam: float, label: str, bg=None, report=None):
    size = im.size[0]
    got = art_circumradius(im, bg=bg)
    limit = safe_diam * size / 2.0
    ok = got <= limit + 0.51  # half-pixel AA
    line = (
        f"{label}: 그림 반지름 {got:.1f}  안전 원 {limit:.1f}  "
        f"여유 {limit - got:.1f}px  {'통과' if ok else '벗어남'}"
    )
    if report is not None:
        report.append(line)
    if not ok:
        raise SystemExit(line)


def flatten_rgb(im: Image.Image, fill=BG_OPAQUE) -> Image.Image:
    bg = Image.new("RGBA", im.size, fill)
    out = Image.alpha_composite(bg, im.convert("RGBA"))
    return out.convert("RGB")


def circle_mask(size: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
    return m


def squircle_mask(size: int, radius_ratio: float = 0.2237) -> Image.Image:
    """iOS-like rounded square (radius ≈ 22.37% of side)."""
    m = Image.new("L", (size, size), 0)
    r = int(round(size * radius_ratio))
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return m


def android_squircle_mask(size: int) -> Image.Image:
    """A slightly tighter squircle used by many Android launchers (~30%)."""
    return squircle_mask(size, 0.30)


def apply_mask(im: Image.Image, mask: Image.Image, bg=(240, 238, 234, 255)) -> Image.Image:
    """Composite icon through mask onto bg (to preview OS clipping)."""
    im = im.convert("RGBA").resize(mask.size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", mask.size, bg)
    cut = im.copy()
    cut.putalpha(ImageChops_min(cut.split()[-1], mask) if False else _and_alpha(im, mask))
    return Image.alpha_composite(out, cut)


def _and_alpha(im: Image.Image, mask: Image.Image) -> Image.Image:
    from PIL import ImageChops
    r, g, b, a = im.split()
    a = ImageChops.multiply(a, mask)
    return Image.merge("RGBA", (r, g, b, a))


def save_png(im: Image.Image, path: Path, flatten=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if flatten:
        im = flatten_rgb(im).convert("RGB")
        im.save(path, "PNG")
    else:
        im = im.convert("RGBA")
        im.save(path, "PNG")
    rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    print(" ", rel, im.size, im.mode)


def save_ico(sizes_imgs: list[tuple[int, Image.Image]], path: Path):
    """Write a multi-size ICO with 32-bit PNG-compressed entries where needed.
    Pillow can write ICO from a 256 image, but we pass exact frames so 16/32 stay hand-tuned.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    for s, im in sizes_imgs:
        fr = im.convert("RGBA")
        if fr.size != (s, s):
            fr = fr.resize((s, s), Image.Resampling.LANCZOS)
        frames.append(fr)
    frames[0].save(
        path,
        format="ICO",
        sizes=[(s, s) for s, _ in sizes_imgs],
        append_images=frames[1:],
    )
    print(" ", path, "entries", [s for s, _ in sizes_imgs], path.stat().st_size)


def numerical_check(im: Image.Image, name: str, min_colors: int, report: list):
    a = np.array(im.convert("RGBA"))
    al = a[..., 3]
    opaque = al > 16
    n = int(opaque.sum())
    # unique opaque colors (quantize a bit to ignore aa)
    q = (a[opaque][:, :3] // 8 * 8)
    uniq = len({tuple(p) for p in q})
    # bbox fill
    ys, xs = np.where(opaque)
    if len(xs) == 0:
        report.append(f"{name}: 빈 그림")
        return
    bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    fill = n / (bw * bh)
    # contrast: p90 vs p10 luminance of opaque
    luma = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2])
    lo, hi = np.percentile(luma[opaque], [10, 90])
    contrast = float(hi - lo)
    ok = uniq >= min_colors and contrast >= 60 and fill >= 0.55
    report.append(
        f"{name}: 칸 {im.size[0]}  색 {uniq}가지  밝은차 {contrast:.0f}  채움 {fill:.2f}  "
        f"상자 {bw}×{bh}  {'통과' if ok else '살펴보기'}"
    )


def make_comparison(full, s48, s32, s16, maskable_512, apple_180, store_512, path: Path):
    font_title = ImageFont.truetype(FONT_K, 40)
    font_h = ImageFont.truetype(FONT_B, 24)
    font_s = ImageFont.truetype(FONT_R, 18)
    font_t = ImageFont.truetype(FONT_R, 16)

    # layout
    # Row 0 title
    # Row 1: 창 아이콘 256 48 32 16 on light
    # Row 2: same on dark
    # Row 3: OS masks — Android 원 / Android 둥근네모 / 아이폰 둥근네모, each at 180, light+dark side by side? 
    # I'll do two bands for OS: light and dark, each showing 3 masks at 160px plus a "safe zone" overlay on maskable.

    sizes = [(256, full), (48, s48), (32, s32), (16, s16)]
    # For 256 use downscale of full
    icon256 = down(full, 256)

    pad = 36
    # columns for size row
    size_slots = []
    x = 0
    for s, _ in sizes:
        size_slots.append((x, s))
        x += max(s, 48) + 36
    size_row_w = x + 20
    left_label = 130
    width = max(1200, left_label + 3 * (200 + 28) + pad * 2, left_label + size_row_w + 200)
    # height
    header = 150
    row1 = 320
    row2 = 320
    os_header = 70
    os_row = 280
    height = header + row1 + row2 + os_header + os_row * 2 + 80

    page = Image.new("RGB", (width, height), (232, 228, 220))
    d = ImageDraw.Draw(page)

    title = "키mera 디펜스  설치 아이콘  최종안"
    # typo risk - use Korean only
    title = "키메라 디펜스  설치 아이콘  최종안(고침)"
    tb = d.textbbox((0, 0), title, font=font_title)
    d.text(((width - (tb[2] - tb[0])) // 2, 28), title, fill=(32, 24, 28), font=font_title)
    sub = "갤럭시·아이폰용은 방패 전체가 80% 안전 원 안에 들어가게 조금 줄임  ·  창·상점 아이콘은 그대로"
    sb = d.textbbox((0, 0), sub, font=font_s)
    d.text(((width - (sb[2] - sb[0])) // 2, 84), sub, fill=(90, 80, 78), font=font_s)

    def band(y, h, fill, label, label_fill, icons, captions, extra_start=None):
        d.rounded_rectangle([24, y, width - 24, y + h - 16], radius=20, fill=fill)
        # two-line label
        ly = y + h // 2 - 30
        for i, line in enumerate(label.split("\n")):
            d.text((40, ly + i * 28), line, fill=label_fill, font=font_h)
        x = left_label
        for (im, cap, box) in icons:
            s = box
            tile = im.convert("RGBA")
            if tile.size != (s, s):
                tile = tile.resize((s, s), Image.Resampling.LANCZOS)
            py = y + (h - 16 - s) // 2
            if tile.mode == "RGBA":
                page.paste(tile, (x, py), tile)
            else:
                page.paste(tile, (x, py))
            cb = d.textbbox((0, 0), cap, font=font_t)
            cap_c = (210, 210, 214) if fill[0] < 80 else (90, 86, 82)
            d.text((x + (s - (cb[2] - cb[0])) // 2, y + h - 36), cap, fill=cap_c, font=font_t)
            x += max(s, 48) + 36
        return x

    y0 = header
    icons_light = [
        (icon256, "256", 256),
        (s48, "48", 48),
        (s32, "32 손봄", 32),
        (s16, "16 손봄", 16),
    ]
    # also show 32 and 16 zoomed 4x nearest so the teacher can see pixels
    def zoom(im, z):
        return im.resize((im.width * z, im.height * z), Image.Resampling.NEAREST)

    d.rounded_rectangle([24, y0, width - 24, y0 + row1 - 16], radius=20, fill=(248, 246, 242))
    for i, line in enumerate(["밝은", "배경"]):
        d.text((40, y0 + row1 // 2 - 30 + i * 28), line, fill=(70, 64, 60), font=font_h)
    x = left_label
    py256 = y0 + (row1 - 16 - 256) // 2
    page.paste(icon256, (x, py256), icon256.convert("RGBA"))
    d.text((x + 256 // 2 - 12, y0 + row1 - 36), "256", fill=(90, 86, 82), font=font_t)
    x += 256 + 40
    for im, cap, s in ((s48, "48", 48), (s32, "32 손봄", 32), (s16, "16 손봄", 16)):
        col = 90
        py = y0 + (row1 - 16 - s) // 2
        page.paste(im.convert("RGBA"), (x + (col - s) // 2, py), im.convert("RGBA"))
        cb = d.textbbox((0, 0), cap, font=font_t)
        d.text((x + (col - (cb[2] - cb[0])) // 2, y0 + row1 - 36), cap, fill=(90, 86, 82), font=font_t)
        x += col + 16
    # zoomed 32 and 16
    z32 = zoom(s32, 4)
    z16 = zoom(s16, 6)
    d.text((x, y0 + 24), "32 네 배", fill=(90, 86, 82), font=font_t)
    page.paste(z32, (x, y0 + 50), z32)
    x += z32.width + 24
    d.text((x, y0 + 24), "16 여섯 배", fill=(90, 86, 82), font=font_t)
    page.paste(z16, (x, y0 + 50), z16)

    y1 = y0 + row1
    d.rounded_rectangle([24, y1, width - 24, y1 + row2 - 16], radius=20, fill=(28, 28, 32))
    for i, line in enumerate(["어두운", "배경"]):
        d.text((40, y1 + row2 // 2 - 30 + i * 28), line, fill=(220, 216, 210), font=font_h)
    x = left_label
    page.paste(icon256, (x, y1 + (row2 - 16 - 256) // 2), icon256.convert("RGBA"))
    d.text((x + 256 // 2 - 12, y1 + row2 - 36), "256", fill=(210, 210, 214), font=font_t)
    x += 256 + 40
    for im, cap, s in ((s48, "48", 48), (s32, "32 손봄", 32), (s16, "16 손봄", 16)):
        col = 90
        py = y1 + (row2 - 16 - s) // 2
        page.paste(im.convert("RGBA"), (x + (col - s) // 2, py), im.convert("RGBA"))
        cb = d.textbbox((0, 0), cap, font=font_t)
        d.text((x + (col - (cb[2] - cb[0])) // 2, y1 + row2 - 36), cap, fill=(210, 210, 214), font=font_t)
        x += col + 16
    z32 = zoom(s32, 4)
    z16 = zoom(s16, 6)
    d.text((x, y1 + 24), "32 네 배", fill=(210, 210, 214), font=font_t)
    page.paste(z32, (x, y1 + 50), z32)
    x += z32.width + 24
    d.text((x, y1 + 24), "16 여섯 배", fill=(210, 210, 214), font=font_t)
    page.paste(z16, (x, y1 + 50), z16)

    # OS mask row
    y2 = y1 + row2
    os_title = "폰 바탕화면에서 잘리는 모양  ·  빨간 원은 80% 안전 구역(방패 전체가 이 안에 들어감)"
    d.text((40, y2 + 16), os_title, fill=(50, 40, 42), font=font_h)

    # Prepare preview tiles at 180
    PS = 180
    # For mask previews, use the opaque store-style icon (shield on navy) so the mask is fair
    opaque180 = apple_180.resize((PS, PS), Image.Resampling.LANCZOS).convert("RGBA")
    # If apple is already 180 RGB
    if apple_180.size != (PS, PS):
        opaque180 = apple_180.resize((PS, PS), Image.Resampling.LANCZOS).convert("RGBA")
    else:
        opaque180 = apple_180.convert("RGBA")

    previews = [
        ("갤럭시 원", circle_mask(PS), opaque180),
        ("갤럭시 둥근네모", android_squircle_mask(PS), opaque180),
        ("아이폰 둥근네모", squircle_mask(PS, 0.2237), opaque180),
        ("안드 안전구역 표시", circle_mask(PS), None),  # special: maskable with safe ring
    ]

    def compose_preview(src, mask, bg):
        tile = src.convert("RGBA").resize((PS, PS), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (PS, PS), bg)
        cut = _and_alpha(tile, mask)
        return Image.alpha_composite(out, cut)

    def with_safe_ring(src, bg):
        # show maskable 512 downscaled, dim outside the 80% circle, draw the ring
        tile = src.convert("RGBA").resize((PS, PS), Image.Resampling.LANCZOS)
        out = Image.new("RGBA", (PS, PS), bg)
        out = Image.alpha_composite(out, tile)
        # dim pixels outside the 80% circle so the fit is obvious
        arr = np.array(out)
        yy, xx = np.ogrid[:PS, :PS]
        cx = cy = (PS - 1) / 2.0
        rad = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        safe = 0.80 * PS / 2.0
        outside = rad > safe
        arr[outside, 0] = (arr[outside, 0] * 0.45).astype(np.uint8)
        arr[outside, 1] = (arr[outside, 1] * 0.45).astype(np.uint8)
        arr[outside, 2] = (arr[outside, 2] * 0.45).astype(np.uint8)
        out = Image.fromarray(arr, "RGBA")
        ov = Image.new("RGBA", (PS, PS), (0, 0, 0, 0))
        od = ImageDraw.Draw(ov)
        m = 0.10 * PS
        od.ellipse([m, m, PS - 1 - m, PS - 1 - m], outline=(255, 80, 80, 220), width=3)
        return Image.alpha_composite(out, ov)

    y3 = y2 + os_header
    for band_i, (bg, lab, labc, capc) in enumerate((
        ((248, 246, 242, 255), "밝은\n배경", (70, 64, 60), (90, 86, 82)),
        ((28, 28, 32, 255), "어두운\n배경", (220, 216, 210), (210, 210, 214)),
    )):
        yy = y3 + band_i * os_row
        d.rounded_rectangle([24, yy, width - 24, yy + os_row - 16], radius=20, fill=bg[:3])
        for i, line in enumerate(lab.split("\n")):
            d.text((40, yy + os_row // 2 - 30 + i * 28), line, fill=labc, font=font_h)
        x = left_label
        items = [
            ("갤럭시 원", compose_preview(opaque180, circle_mask(PS), bg)),
            ("갤럭시 둥근네모", compose_preview(opaque180, android_squircle_mask(PS), bg)),
            ("아이폰 둥근네모", compose_preview(opaque180, squircle_mask(PS, 0.2237), bg)),
            ("안전 원 안에 들어감", with_safe_ring(maskable_512, bg)),
        ]
        for cap, tile in items:
            page.paste(tile.convert("RGBA"), (x, yy + 24), tile.convert("RGBA"))
            cb = d.textbbox((0, 0), cap, font=font_t)
            d.text((x + (PS - (cb[2] - cb[0])) // 2, yy + 24 + PS + 8), cap, fill=capc, font=font_t)
            x += PS + 36

    path.parent.mkdir(parents=True, exist_ok=True)
    page.save(path, "PNG")
    print("comparison", path, page.size)


def main():
    full, s32, s16 = load_src()
    s48 = down(full, 48)
    s64 = down(full, 64)
    s128 = down(full, 128)
    s192 = down(full, 192)
    s256 = down(full, 256)
    s512 = down(full, 512)

    report = []
    numerical_check(s16, "16칸 손봄", 5, report)
    numerical_check(s32, "32칸 손봄", 8, report)
    numerical_check(s48, "48칸 전체", 8, report)
    numerical_check(s256, "256칸 전체", 8, report)

    # --- build/ (Windows / later packager) ---
    save_png(full, OUT_BUILD / "icon.png")  # 1024, transparent
    save_ico(
        [
            (256, s256),
            (128, s128),
            (64, s64),
            (48, s48),
            (32, s32),
            (16, s16),
        ],
        OUT_BUILD / "icon.ico",
    )

    # --- PWA any (transparent shield, full art) ---
    save_png(s192, OUT_PUBLIC / "icon-192.png")
    save_png(s512, OUT_PUBLIC / "icon-512.png")
    save_png(s64, OUT_PUBLIC / "favicon.png")

    # --- maskable (opaque, whole shield inside the 80% safe circle + a little gap) ---
    maskable_512 = place_in_safe_circle(full, 512, safe_diam=0.80, margin=0.05, fill=BG_OPAQUE)
    maskable_192 = place_in_safe_circle(full, 192, safe_diam=0.80, margin=0.05, fill=BG_OPAQUE)
    save_png(maskable_192, OUT_PUBLIC / "icon-maskable-192.png")
    save_png(maskable_512, OUT_PUBLIC / "icon-maskable-512.png")
    check_inside_circle(maskable_512, 0.80, "마스크형 512", bg=BG_OPAQUE, report=report)
    check_inside_circle(maskable_192, 0.80, "마스크형 192", bg=BG_OPAQUE, report=report)

    # --- store 512 (opaque, no rounded corners; keep previous size, not circle-fitted) ---
    store_512 = place_on_canvas(full, 512, scale=0.86, fill=BG_OPAQUE)
    save_png(store_512, OUT_PUBLIC / "store-icon-512.png", flatten=True)

    # --- iOS apple-touch / App Store (opaque, square; phone rounds them) ---
    # Fit the whole shield inside the same 80% safe circle as the maskable icons.
    for size, name in (
        (180, "apple-touch-icon.png"),
        (167, "apple-touch-icon-167.png"),
        (152, "apple-touch-icon-152.png"),
        (120, "apple-touch-icon-120.png"),
    ):
        save_png(place_in_safe_circle(full, size, safe_diam=0.80, margin=0.05, fill=BG_OPAQUE), OUT_PUBLIC / name, flatten=True)
    # App Store 1024, no alpha — also round-cropped by the store, so same safe circle
    appstore = place_in_safe_circle(full, 1024, safe_diam=0.80, margin=0.05, fill=BG_OPAQUE)
    # ensure no alpha
    appstore_rgb = appstore.convert("RGB")
    p = OUT_PUBLIC / "appstore-1024.png"
    p.parent.mkdir(parents=True, exist_ok=True)
    appstore_rgb.save(p, "PNG")
    print(" ", p, appstore_rgb.size, appstore_rgb.mode)
    # verify no alpha
    assert appstore_rgb.mode == "RGB"

    apple_180 = Image.open(OUT_PUBLIC / "apple-touch-icon.png")

    # --- Android adaptive layers, 432px = 108dp at 4x ---
    # Official safe zone is a 66dp circle in a 108dp asset, plus a small gap.
    android_safe = 66 / 108
    fg = place_in_safe_circle(full, 432, safe_diam=android_safe, margin=0.05, fill=None)
    bg = Image.new("RGBA", (432, 432), BG_OPAQUE)
    save_png(fg, OUT_ANDROID / "ic_launcher_foreground.png")
    save_png(bg, OUT_ANDROID / "ic_launcher_background.png")
    save_png(place_in_safe_circle(full, 108, safe_diam=android_safe, margin=0.05, fill=None), OUT_ANDROID / "ic_launcher_foreground-108.png")
    save_png(Image.new("RGBA", (108, 108), BG_OPAQUE), OUT_ANDROID / "ic_launcher_background-108.png")
    check_inside_circle(fg, android_safe, "갤럭시 앞장 432", bg=None, report=report)
    apple_chk = Image.open(OUT_PUBLIC / "apple-touch-icon.png")
    check_inside_circle(apple_chk, 0.80, "아이폰 180", bg=BG_OPAQUE, report=report)
    check_inside_circle(appstore, 0.80, "앱스토어 1024", bg=BG_OPAQUE, report=report)

    make_comparison(
        full, s48, s32, s16, maskable_512, apple_180, store_512,
        OUT_SHOTS / "최종_비교_v2.png",
    )

    print("\n수치 검사")
    for line in report:
        print(" ", line)


if __name__ == "__main__":
    main()
