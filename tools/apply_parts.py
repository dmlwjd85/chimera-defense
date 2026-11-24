"""제미나이 부위판(art-src/gemini)을 리그에 입힘.

art-src/gemini/parts/<종>/*.png : 부위판에서 잘라 낸 조각(tools/cut_parts_sheet.py)
art-src/gemini/fit/<종>.json    : 조각 → 리그 부위 맞춤(tools/gen_fits.py가 만듦)
  parts.<부위>: src 조각, length(화면 길이: axis long=가로·tall=세로·max=긴 쪽), rot, flip, flipV, dark,
                crop [x0,y0,x1,y1](0~1, 조각 하나를 정강이+발, 엉덩이+가슴으로 나눠 씀), feather(잘린 변을 흐리게),
                thick(굵기 배율), ankle(발: 조각 윗변 가운데를 발목 뼈에 맞추고 발바닥 두께를 footPad로)
  hide: 숨길 벡터 부위, bones: 뼈 위치·길이(도안 비율에 뼈를 맞춤), boneScale, over: 부위 위치, attacks: 공격 동작 순서
결과: public/assets/rig/<종>/<부위>.png, public/data/rig/<종>.rig.json. tools/gen_rig_art.py 끝에서 자동으로 불림.
"""
import json, os, subprocess, glob
import numpy as np
from PIL import Image, ImageEnhance
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
G = os.path.join(ROOT, 'art-src', 'gemini')
DATA = os.path.join(ROOT, 'public', 'data', 'rig')
ART = os.path.join(ROOT, 'public', 'assets', 'rig')

def piece(sp, o):
    im = Image.open(os.path.join(G, 'parts', sp, o['src'] + '.png')).convert('RGBA')
    if o.get('crop'):
        W, H = im.size; x0, y0, x1, y1 = o['crop']; im = im.crop((round(x0 * W), round(y0 * H), round(x1 * W), round(y1 * H)))
    for side in o.get('feather', []):       # 잘린 변이 겹치는 부위 위에서 선으로 보이지 않게 투명하게 풀어 줌
        a = np.array(im.split()[3]).astype(float); H, W = a.shape; n = max(4, round((H if side in ('top', 'bottom') else W) * 0.09))
        ramp = np.clip(np.arange(n) / n, 0, 1)
        if side == 'top': a[:n, :] *= ramp[:, None]
        if side == 'bottom': a[-n:, :] *= ramp[::-1][:, None]
        if side == 'left': a[:, :n] *= ramp[None, :]
        if side == 'right': a[:, -n:] *= ramp[::-1][None, :]
        im.putalpha(Image.fromarray(a.astype(np.uint8)))
    ankle = None
    if o.get('ankle'):
        a = np.array(im.split()[3]); H, W = a.shape; top = a[: max(2, H // 5), :] > 100; xs = np.nonzero(top.any(0))[0]
        ankle = ((xs.min() + xs.max()) / 2 if len(xs) else W / 2, H * 0.24, W, H)
    if o.get('flip'): im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if o.get('flipV'): im = im.transpose(Image.FLIP_TOP_BOTTOM)
    if o.get('rot'): im = im.rotate(o['rot'], expand=True, resample=Image.BICUBIC)
    if o.get('dark', 1) != 1:
        r, g, b, a = im.split(); im = Image.merge('RGBA', (*ImageEnhance.Brightness(Image.merge('RGB', (r, g, b))).enhance(o['dark']).split(), a))
    return im, ankle

def apply(sp):
    fit = json.load(open(os.path.join(G, 'fit', sp + '.json')))
    rp = os.path.join(DATA, sp + '.rig.json'); rig = json.load(open(rp))
    for st in rig['stages'].values():
        st.setdefault('parts', {})
        for h in fit.get('hide', []): st['parts'][h] = None
        for slot in fit['parts']: st['parts'][slot] = slot
        st['boneScale'] = {**st.get('boneScale', {}), **fit.get('boneScale', {})}
    rig['slotOverrides'] = {**rig.get('slotOverrides', {}), **fit.get('over', {})}
    rig['boneOverrides'] = json.loads(json.dumps(fit.get('bones', {})))
    if fit.get('attacks'): rig['attacks'] = fit['attacks']
    rig['gemini'] = True
    json.dump(rig, open(rp, 'w'), ensure_ascii=False, indent=1)
    stage = fit.get('stage', 'spirit' if sp.endswith('_spirit') else 'adult')
    pose = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools', 'rig_pose.mjs'), rp, stage]))
    E = {e['slot']: e for e in pose['list']}; ar = pose['artRes']
    for slot, o in fit['parts'].items():
        im, ankle = piece(sp, o)
        W, H = im.size; axis = o.get('axis', 'long'); dim = W if axis == 'long' else H if axis == 'tall' else max(W, H)
        k = o['length'] / dim; th = o.get('thick', 1); kw, kh = (k, k * th) if dim == W else (k * th, k)
        e = E[slot]; sx, sy = abs(e['sx']), abs(e['sy'])
        im.resize((max(4, round(W * kw * ar / sx)), max(4, round(H * kh * ar / sy))), Image.LANCZOS).save(os.path.join(ART, rig.get('skin', sp), slot + '.png'))
        if ankle:   # 발: 조각 윗변(다리가 들어오는 곳)을 발목에 맞추고, 발목 아래 두께만큼 땅에서 띄움
            ax, ay, w0, h0 = ankle
            rig['slotOverrides'][slot] = {**rig['slotOverrides'].get(slot, {}), 'x': round((w0 / 2 - ax) * kw / sx, 1), 'y': round((h0 / 2 - ay) * kh / sy, 1)}
            lower = slot.replace('_paw', '_lo'); rig['boneOverrides'].setdefault(lower, {})['footPad'] = round((h0 - ay) * kh * 0.92, 1)
    json.dump(rig, open(rp, 'w'), ensure_ascii=False, indent=1)
    return rig.get('skin', sp), list(fit['parts'])

def main():
    mp = os.path.join(ROOT, 'public', 'assets', 'manifest.json'); man = json.load(open(mp))
    for f in sorted(glob.glob(os.path.join(G, 'fit', '*.json'))):
        sp = os.path.basename(f)[:-5]; skin, made = apply(sp)
        for slot in made: man['images'][f'rig-{skin}-{slot}'] = f'assets/rig/{skin}/{slot}.png'
        print('gemini parts:', sp, len(made))
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
