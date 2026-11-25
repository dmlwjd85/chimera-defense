#!/usr/bin/env python3
"""스프라이트를 검게 칠해 실제 전장 크기로 나란히 놓아 실루엣을 비교한다.

전장 배율 기본값은 src/rig/dotData.js 의 DOT_PX = 2 (도트 1칸 = 화면 2×2px).
숫자를 지어내지 않고, 인자로 받은 칸 크기만 쓴다.

보기:
  python3 tools/silhouette_check.py \\
    --out /tmp/sil_fox_sangun.png \\
    --px 2 \\
    --sheet public/assets/dot/fox.png --frame-w 72 --frame-h 56 --index 4 --label 여우성체 \\
    --sheet public/assets/fx/sangun-ult/char.png --frame-w 96 --frame-h 96 --index 7 --label 산군정면
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_frame(path: Path, frame_w: int | None, frame_h: int | None, index: int) -> Image.Image:
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    if frame_w and frame_h:
        cols = w // frame_w
        rows = h // frame_h
        if cols < 1 or rows < 1:
            raise SystemExit(f'{path}: 칸 크기 {frame_w}x{frame_h}가 그림 {w}x{h}보다 큼')
        if index < 0 or index >= cols * rows:
            raise SystemExit(f'{path}: 칸 번호 {index}이 범위(0..{cols * rows - 1}) 밖')
        col, row = index % cols, index // cols
        box = (col * frame_w, row * frame_h, (col + 1) * frame_w, (row + 1) * frame_h)
        return im.crop(box)
    if index != 0:
        raise SystemExit(f'{path}: 시트 칸 크기를 주지 않으면 --index 는 0만 가능')
    return im


def silhouette(im: Image.Image) -> Image.Image:
    src = im.convert('RGBA')
    out = Image.new('RGBA', src.size, (0, 0, 0, 0))
    px = src.load()
    op = out.load()
    for y in range(src.size[1]):
        for x in range(src.size[0]):
            r, g, b, a = px[x, y]
            if a >= 16:
                op[x, y] = (0, 0, 0, 255)
    return out



def _korean_font(size: int):
    candidates = [
        '/usr/share/fonts/truetype/sand-box/google/Nanum Gothic/NanumGothic-Regular.ttf',
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=max(10, size))
            except OSError:
                continue
    return ImageFont.load_default()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description='검게 칠한 실루엣을 전장 배율로 나란히 저장')
    p.add_argument('--out', required=True, help='출력 PNG 경로')
    p.add_argument('--px', type=int, default=2, help='전장 배율. 기본 2 (DOT_PX)')
    p.add_argument('--bg', default='#c8c2b4', help='배경색 #rrggbb')
    p.add_argument('--sheet', action='append', default=[], help='입력 PNG (여러 번 가능)')
    p.add_argument('--frame-w', action='append', default=[], type=int, help='시트 칸 너비')
    p.add_argument('--frame-h', action='append', default=[], type=int, help='시트 칸 높이')
    p.add_argument('--index', action='append', default=[], type=int, help='시트에서 쓸 칸 번호(0부터, 가로 우선)')
    p.add_argument('--label', action='append', default=[], help='칸 아래 이름')
    args = p.parse_args(argv)

    if not args.sheet:
        p.error(' --sheet 를 하나 이상 주세요')
    n = len(args.sheet)
    def pick(lst, i, default=None):
        return lst[i] if i < len(lst) else default

    frames = []
    for i, s in enumerate(args.sheet):
        path = Path(s)
        fw, fh = pick(args.frame_w, i), pick(args.frame_h, i)
        idx = pick(args.index, i, 0) or 0
        label = pick(args.label, i, path.stem)
        fr = load_frame(path, fw, fh, idx)
        sil = silhouette(fr)
        frames.append((label, fr, sil))

    scale = args.px
    if scale < 1:
        p.error('--px 는 1 이상')
    pad = 8 * scale
    label_h = 14 * scale
    widths = [im.size[0] * scale for _, _, im in frames]
    heights = [im.size[1] * scale for _, _, im in frames]
    cell_w = max(widths)
    cell_h = max(heights)
    cols = len(frames)
    W = pad + cols * (cell_w + pad)
    H = pad + cell_h + label_h + pad
    bg = args.bg.lstrip('#')
    rgb = tuple(int(bg[j:j + 2], 16) for j in (0, 2, 4))
    canvas = Image.new('RGB', (W, H), rgb)
    draw = ImageDraw.Draw(canvas)
    font = _korean_font(8 * scale)

    x = pad
    for (label, _color, sil), w, h in zip(frames, widths, heights):
        big = sil.resize((w, h), Image.Resampling.NEAREST)
        ox = x + (cell_w - w) // 2
        oy = pad + (cell_h - h)
        canvas.paste(big, (ox, oy), big)
        # label
        tw = draw.textlength(label, font=font)
        draw.text((x + (cell_w - tw) / 2, pad + cell_h + 2), label, fill=(20, 16, 18), font=font)
        x += cell_w + pad

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print(f'wrote {out} {canvas.size[0]}x{canvas.size[1]} scale={scale} n={cols}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
