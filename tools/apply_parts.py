"""제미나이 부위판(art-src/gemini)을 리그에 입힘.

art-src/gemini/parts/<종>/*.png : 부위판에서 잘라 낸 조각(tools/cut_parts_sheet.py)
art-src/gemini/fit/<종>.json    : 조각 → 리그 부위 맞춤(목표 화면 크기, 회전, 숨길 부위, 뼈 배율, 부위 위치)
결과: public/assets/rig/<종>/<부위>.png 를 덮어쓰고 public/data/rig/<종>.rig.json 을 고침.
tools/gen_rig_art.py 끝에서 자동으로 불림(벡터 그림을 다시 만들어도 부위판 그림이 유지됨).
"""
import json, os, subprocess, glob
from PIL import Image, ImageEnhance
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
G = os.path.join(ROOT, 'art-src', 'gemini')
DATA = os.path.join(ROOT, 'public', 'data', 'rig')
ART = os.path.join(ROOT, 'public', 'assets', 'rig')

def apply(sp):
    fit = json.load(open(os.path.join(G, 'fit', sp + '.json')))
    rp = os.path.join(DATA, sp + '.rig.json'); rig = json.load(open(rp))
    for st in rig['stages'].values():
        st.setdefault('parts', {})
        for h in fit.get('hide', []): st['parts'][h] = None
        st['boneScale'] = {**st.get('boneScale', {}), **fit.get('boneScale', {})}
    rig['slotOverrides'] = {**rig.get('slotOverrides', {}), **fit.get('over', {})}
    rig['gemini'] = True
    json.dump(rig, open(rp, 'w'), ensure_ascii=False, indent=1)
    pose = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools', 'rig_pose.mjs'), rp, 'adult']))
    E = {e['slot']: e for e in pose['list']}; ar = pose['artRes']
    made = []
    for slot, o in fit['parts'].items():
        im = Image.open(os.path.join(G, 'parts', sp, o['src'] + '.png')).convert('RGBA')
        if o.get('flip'): im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if o.get('flipV'): im = im.transpose(Image.FLIP_TOP_BOTTOM)
        if o.get('rot'): im = im.rotate(o['rot'], expand=True, resample=Image.BICUBIC)
        if o.get('dark', 1) != 1:
            r, g, b, a = im.split(); im = Image.merge('RGBA', (*ImageEnhance.Brightness(Image.merge('RGB', (r, g, b))).enhance(o['dark']).split(), a))
        W, H = im.size; axis = o.get('axis', 'long')
        k = o['length'] / (W if axis == 'long' else H if axis == 'tall' else max(W, H))
        e = E[slot]; sx, sy = abs(e['sx']), abs(e['sy'])
        im.resize((max(4, round(W * k * ar / sx)), max(4, round(H * k * ar / sy))), Image.LANCZOS).save(os.path.join(ART, rig.get('skin', sp), slot + '.png'))
        made.append(slot)
    return rig.get('skin', sp), made

def main():
    mp = os.path.join(ROOT, 'public', 'assets', 'manifest.json'); man = json.load(open(mp))
    for f in sorted(glob.glob(os.path.join(G, 'fit', '*.json'))):
        sp = os.path.basename(f)[:-5]; skin, made = apply(sp)
        for slot in made: man['images'][f'rig-{skin}-{slot}'] = f'assets/rig/{skin}/{slot}.png'
        print('gemini parts:', sp, len(made))
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
