"""부위판 조각 → 리그 맞춤 설정(art-src/gemini/fit/<종>.json)을 만듦. 새·개구리 설정은 손으로 쓴 것을 그대로 둠.
원칙: 그림을 뼈에 억지로 맞추지 않고, 도안 비율(짧고 굵은 다리, 큰 머리)에 뼈 길이·관절 위치를 맞춤."""
import json, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art-src', 'gemini', 'fit')
HIDE = ['muzzle', 'jaw', 'nose', 'eye', 'belly', 'chest_fluff', 'neck', 'wing', 'deco']
FAR = 0.82   # 뒤쪽 다리·귀는 살짝 어둡게

def leg_parts(P, n, up, lo, up_len, lo_len, far, thick=1.0, up_bone=62, lo_bone=70, hand=False):
    """다리 하나: 윗다리 + 정강이(조각 위 70%) + 발(조각 아래 38%, 발목에서 따로 꺾임)."""
    d = {'dark': FAR} if far else {}
    P[f'leg_{n}_up'] = {'src': up, 'length': up_len, 'rot': 90, 'thick': thick, **d}
    P[f'leg_{n}_lo'] = {'src': lo, 'crop': [0, 0, 1, 0.70], 'feather': ['bottom'], 'length': lo_len, 'rot': 90, 'thick': thick, **d}
    if hand: P[f'leg_{n}_paw'] = {'src': lo, 'crop': [0, 0.58, 1, 1], 'feather': ['top'], 'length': round(lo_len * 0.42 / 0.70), 'rot': 90, 'thick': thick, **d}
    else: P[f'leg_{n}_paw'] = {'src': lo, 'crop': [0, 0.62, 1, 1], 'feather': ['top'], 'ankle': True, 'axis': 'tall', 'length': round(lo_len * 0.38 / 0.70), 'thick': thick, **d}

def leg_bones(Bn, O, n, up_bone, lo_bone, **up_extra):
    Bn[f'leg_{n}_up'] = {'length': up_bone, **up_extra}; Bn[f'leg_{n}_lo'] = {'x': up_bone, 'length': lo_bone}; Bn[f'leg_{n}_paw'] = {'x': lo_bone}
    O[f'leg_{n}_up'] = {'x': round(up_bone / 2)}; O[f'leg_{n}_lo'] = {'x': round(lo_bone / 2)}

def quad(ear=100, tail=180, tailx=70, head=250, curl=False, horn=None, attacks=('bite', 'claw'), fan=None, up=(88, 62), lo=(80, 70), thick=1.0):
    P, Bn, O = {}, {'neck': {'length': 21}, 'head': {'x': 21}}, {'head': {'x': 40, 'y': 0}, 'ear_n': {'x': 6}, 'ear_r': {'x': 4}}
    # 몸통을 엉덩이 쪽과 가슴 쪽으로 나눠 허리(spine)에서 휘게 함
    P['body'] = {'src': 'body', 'crop': [0, 0, 0.62, 1], 'feather': ['right'], 'length': 186}; O['body'] = {'x': 48}
    P['torso_front'] = {'src': 'body', 'crop': [0.42, 0, 1, 1], 'feather': ['left'], 'length': 174}; O['torso_front'] = {'x': 68, 'y': -5}
    P['head'] = {'src': 'head', 'length': head}
    P['ear_n'] = {'src': 'ear_n', 'length': ear, 'rot': -90}; P['ear_r'] = {'src': 'ear_r', 'length': round(ear * 0.95), 'rot': -90, 'dark': 0.85}
    for n, a, b_ in (('fn', 'fup', 'flo'), ('fr', 'fup', 'flo'), ('bn', 'bup', 'blo'), ('br', 'bup', 'blo')):
        leg_parts(P, n, a, b_, up[0] + (4 if n[0] == 'b' else 0), lo[0], n[1] == 'r', thick); leg_bones(Bn, O, n, up[1], lo[1])
    if fan: P['tail'] = {'src': 'tail', 'length': fan, 'rot': -90, 'axis': 'max'}; O['tail'] = {'rope': None, 'x': 120, 'y': -10, 'rot': -50}
    elif curl: P['tail'] = {'src': 'tail', 'length': tail, 'rot': 195}; O['tail'] = {'rope': None, 'x': 60, 'y': 0}
    else: P['tail'] = {'src': 'tail', 'length': tail, 'flipV': True, 'rot': -15}; O['tail'] = {'rope': None, 'x': tailx, 'y': 0}
    hide = HIDE + ([] if horn else ['horn'])
    if horn: P['horn'] = {'src': 'horn', 'length': horn}; O['horn'] = {'x': -25, 'y': -15}
    return {'hide': hide, 'bones': Bn, 'boneScale': {}, 'over': O, 'parts': P, 'attacks': list(attacks)}

def biped(head=186, ear=64, tail=240, attacks=('claw', 'attack', 'butt'), tail_part=True, chest=1.5, pelvis=1.22, arm=1.55, leg=1.5):
    """두 발로 선 신화급(산군·웅녀): 넓은 가슴, 굵은 팔다리, 벌려 디딘 발, 앞뒤로 벌린 어깨."""
    P, O = {}, {'head': {'x': 30, 'y': 0}, 'ear_n': {'x': -4}, 'ear_r': {'x': -6}}
    Bn = {'neck': {'length': 26}, 'head': {'x': 26}}
    P['body'] = {'src': 'body', 'crop': [0, 0.5, 1, 1], 'length': 150, 'rot': -90, 'thick': pelvis}; O['body'] = {'x': 30}
    P['torso_front'] = {'src': 'body', 'crop': [0, 0, 1, 0.58], 'feather': ['bottom'], 'length': 174, 'rot': -90, 'thick': chest}; O['torso_front'] = {'x': 68, 'y': -5}
    P['head'] = {'src': 'head', 'length': head}
    P['ear_n'] = {'src': 'ear_n', 'length': ear, 'rot': -90}; P['ear_r'] = {'src': 'ear_r', 'length': round(ear * 0.95), 'rot': -90, 'dark': 0.85}
    # 팔: 가까운 팔은 어깨를 뒤에 두고 주먹을 가슴 앞에, 먼 팔은 앞으로 뻗어 발톱을 세움(도안의 자세)
    leg_parts(P, 'fn', 'aup', 'alo', 150, 124, False, arm, hand=True); leg_bones(Bn, O, 'fn', 92, 92, y=-16, rot=152)
    leg_parts(P, 'fr', 'aup', 'alo', 146, 120, True, arm, hand=True); leg_bones(Bn, O, 'fr', 92, 92, y=44, rot=128)
    for n in ('fn', 'fr'): P[f'leg_{n}_up'].update(crop=[0, 0, 1, 0.74], feather=['bottom']); P[f'leg_{n}_paw']['thick'] = arm * 0.9
    Bn['leg_fn_lo'].update(rot=-62); Bn['leg_fr_lo'].update(rot=-72)
    O['leg_fn_paw'] = {'x': 24}; O['leg_fr_paw'] = {'x': 24}
    # 다리: 앞뒤로 벌려 디딤(무게가 두 발 사이에 실림)
    leg_parts(P, 'bn', 'lup', 'llo', 128, 108, False, leg); leg_bones(Bn, O, 'bn', 74, 84, y=48)
    leg_parts(P, 'br', 'lup', 'llo', 124, 104, True, leg); leg_bones(Bn, O, 'br', 74, 84, y=-44)
    for n in ('bn', 'br'): P[f'leg_{n}_lo']['thick'] = leg * 0.86; P[f'leg_{n}_paw']['thick'] = leg * 0.86
    if tail_part: P['tail'] = {'src': 'tail', 'length': tail, 'flipV': True}; O['tail'] = {'rope': None, 'x': 100, 'y': 0}
    return {'hide': HIDE + ['horn'] + ([] if tail_part else ['tail']), 'bones': Bn, 'boneScale': {}, 'over': O, 'parts': P, 'attacks': list(attacks)}

FITS = {
 'dog': quad(105, 150, curl=True, attacks=('bite', 'claw')),
 'tiger': quad(95, 220, 95, attacks=('claw', 'bite', 'pounce')),
 'bear': quad(75, 80, 35, attacks=('claw', 'butt'), thick=1.08),
 'fox': quad(110, 220, 95, attacks=('bite', 'pounce')),
 'wolf': quad(105, 210, 90, attacks=('bite', 'claw')),
 'rabbit': quad(175, 70, 25, attacks=('butt', 'pounce')),
 'bison': quad(80, 150, 65, head=270, attacks=('butt',), thick=1.1),
 'bighorn': quad(80, 90, 35, horn=200, attacks=('butt',)),
 'fox_spirit': quad(140, head=255, fan=360, attacks=('bite', 'pounce', 'claw'), up=(100, 68), lo=(92, 78)),
 'tiger_spirit': biped(),
}
if __name__ == '__main__':
    for k, v in FITS.items(): json.dump(v, open(os.path.join(OUT, k + '.json'), 'w'), ensure_ascii=False, indent=1)
    print('fits:', ', '.join(FITS))
