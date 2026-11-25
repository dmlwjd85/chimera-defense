#!/usr/bin/env python3
"""낱장 도트 PNG를 가로 한 줄 스프라이트 시트로 묶음(칸 크기는 첫 장 기준, 모두 같아야 함).
사용: python3 tools/pack_dot_sheet.py public/assets/dot/fox.png a.png b.png ...
묶은 뒤 python3 tools/check_dot.py <종> 으로 규격 검사."""
import sys
from PIL import Image

out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGBA') for f in files]
w, h = ims[0].size
for f, im in zip(files, ims):
    if im.size != (w, h):
        sys.exit('%s: size %s != %s' % (f, im.size, (w, h)))
sheet = Image.new('RGBA', (w * len(ims), h), (0, 0, 0, 0))
for i, im in enumerate(ims):
    sheet.paste(im, (i * w, 0))
sheet.save(out, optimize=True)
print('%s: %d frames %dx%d' % (out, len(ims), w, h))
