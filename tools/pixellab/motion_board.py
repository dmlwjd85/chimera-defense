# 동작 표 GIF: 줄 = 단계, 칸 = 동작. 정리된 게임 시트(public/assets/dotm)에서 바로 그림 → 게임에 들어가는 그대로
import json, sys
from PIL import Image, ImageDraw, ImageFont
import os; R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public') + '/'
sp, out = sys.argv[1], sys.argv[2]; Z = 2
NAMES = [('idle', '대기'), ('move', '걷기/날기'), ('attack', '기본1'), ('attack2', '기본2'), ('skill', '속성'), ('ult', '필살기'), ('hit', '맞기'), ('down', '쓰러짐')]
rows = []
for key in (sp, sp + '_spirit'):
    d = json.load(open(R + f'data/dotm/{key}.dot.json')); S = Image.open(R + d['file']).convert('RGBA')
    for st, set_ in d['sets'].items(): rows.append((st, d, S, set_))
CW = max(d['frameW'] for _, d, _, _ in rows) + 8; CH = max(d['frameH'] for _, d, _, _ in rows) + 8
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 12) if __import__('os').path.exists('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc') else None
LBL = 50; HEAD = 18
T = 2.4; dt = 0.06; frames = []
for k in range(int(T / dt)):
    t = k * dt
    im = Image.new('RGBA', (LBL + CW * len(NAMES), HEAD + CH * len(rows)), (214, 226, 205, 255)); dr = ImageDraw.Draw(im)
    for c, (_, nm) in enumerate(NAMES): dr.text((LBL + c * CW + 4, 2), nm, fill=(30, 30, 30, 255), font=font)
    for r, (st, d, S, set_) in enumerate(rows):
        dr.text((4, HEAD + r * CH + CH // 2), {'baby': '아기', 'teen': '성장기', 'adult': '성체', 'myth': '신화급'}[st], fill=(30, 30, 30, 255), font=font)
        for c, (m, _) in enumerate(NAMES):
            clip = set_.get(m)
            if not clip: continue
            durs = clip['durs']; tot = sum(durs) + (clip.get('hold') or {}).get('sec', 0)
            tt = t % (tot + 0.35) if not clip.get('loop') else t % tot
            acc = 0; i = len(durs) - 1
            for j, du in enumerate(durs):
                acc += du + ((clip.get('hold') or {}).get('sec', 0) if (clip.get('hold') or {}).get('frame') == j else 0)
                if tt < acc: i = j; break
            x, y, w, h, lx, ty = d['rects'][clip['frames'][i]]
            fr = S.crop((x, y, x + w, y + h))
            ax = LBL + c * CW + CW // 2; fy = HEAD + r * CH + CH - 6
            im.alpha_composite(fr, (ax + lx, fy + ty))
    frames.append(im.resize((im.width * Z, im.height * Z), Image.NEAREST).convert('RGB'))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=int(dt * 1000), loop=0)
print(out, frames[0].size)
