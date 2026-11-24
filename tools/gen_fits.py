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
    P[f'leg_{n}_lo'] = {'src': lo, 'crop': [0, 0, 1, 0.70], 'length': lo_len, 'rot': 90, 'thick': thick, **d}
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

def arm_parts(P, Bn, O, n, src, far, thick, y, rot, lo_rot, up=(140, 92), lo=(112, 80)):
    """팔 하나(조각 하나가 어깨~손 전체): 위팔(위 50%) + 아래팔(42~80%) + 손(70% 아래). 손은 손목에서 따로 꺾임."""
    d = {'dark': 0.88} if far else {}
    P[f'leg_{n}_up'] = {'src': src, 'crop': [0, 0, 1, 0.54], 'feather': ['bottom'], 'length': up[0], 'rot': 90, 'thick': thick, **d}
    P[f'leg_{n}_lo'] = {'src': src, 'crop': [0, 0.40, 1, 0.80], 'feather': ['top'], 'length': lo[0], 'rot': 90, 'thick': thick, **d}
    P[f'leg_{n}_paw'] = {'src': src, 'crop': [0, 0.70, 1, 1], 'feather': ['top'], 'length': round(lo[0] * 0.30 / 0.40), 'rot': 90, 'thick': thick, **d}
    leg_bones(Bn, O, n, up[1], lo[1], y=y, rot=rot); Bn[f'leg_{n}_lo'].update(rot=lo_rot)
    O[f'leg_{n}_up'] = {'x': round(up[1] * 0.42)}; O[f'leg_{n}_paw'] = {'x': round(lo[0] * 0.30 / 0.40 * 0.36)}

def biped(head=204, ear=66, tail=240, attacks=('claw', 'attack', 'butt'), tail_part=True, torso=1.4, arm=1.25, leg=1.28, split=False):
    """두 발로 선 신화급(산군·웅녀): 넓은 가슴, 솟은 목덜미·등, 굵은 팔다리. 엉덩이 관절은 모으고 발만 벌려 딛음(걸을 땐 두 발이 교차)."""
    P, O = {}, {'head': {'x': 26, 'y': 4}, 'ear_n': {'x': -4}, 'ear_r': {'x': -14}}
    Bn = {'neck': {'length': 14}, 'head': {'x': 14}, 'ear_r': {'x': 46, 'y': -56, 'rot': -72}}   # 먼 귀는 머리 위 앞쪽으로 살짝 보임(도안)
    # 몸통: 가슴(위 60%) 위에 허리띠·골반(아래 50%)을 얹어 이음매가 띠 밑으로 숨음
    if split:   # 부위판에 윗몸통(솟은 목덜미·어깨 포함)과 허리띠 골반이 따로 있음
        P['torso_front'] = {'src': 'torso', 'length': 246, 'rot': -90, 'thick': torso * 0.82}; O['torso_front'] = {'x': 56, 'y': -8}
        P['body'] = {'src': 'pelvis', 'crop': [0, 0.24, 1, 1], 'length': 133, 'rot': -90, 'thick': torso * 0.82}; O['body'] = {'x': 8, 'z': 5}   # 위 테두리(그릇 입구)는 잘라 가슴 밑이 띠 속으로 들어간 것처럼
    else:
        P['torso_front'] = {'src': 'body', 'crop': [0, 0, 1, 0.60], 'length': 180, 'rot': -90, 'thick': torso}; O['torso_front'] = {'x': 66, 'y': -5}
        P['body'] = {'src': 'body', 'crop': [0, 0.46, 1, 1], 'length': 162, 'rot': -90, 'thick': torso}; O['body'] = {'x': 36, 'z': 5}
        # 목덜미·등 근육 임시: 허벅지 조각을 빌려 등에 얹음
        P['chest_fluff'] = {'src': 'lup', 'length': 176, 'rot': -90, 'thick': 1.0, 'feather': ['right', 'bottom']}; O['chest_fluff'] = {'x': -40, 'y': -46}
    P['head'] = {'src': 'head', 'length': head}
    P['ear_n'] = {'src': 'ear_n', 'length': ear, 'rot': -90}; P['ear_r'] = {'src': 'ear_r', 'length': round(ear * 0.95), 'rot': -90, 'dark': 0.85}
    # 팔: 두 손 모두 손등이 보이는 주먹 조각(손바닥이 바깥을 향해 보이면 어색함)
    arm_parts(P, Bn, O, 'fn', 'aup', False, arm, y=-14, rot=162, lo_rot=-58)
    arm_parts(P, Bn, O, 'fr', 'aup', True, arm, y=46, rot=142, lo_rot=-58)
    # 다리
    leg_parts(P, 'bn', 'lup', 'llo', 128, 108, False, leg); leg_bones(Bn, O, 'bn', 74, 84, y=18)
    leg_parts(P, 'br', 'lup', 'llo', 124, 104, True, leg); leg_bones(Bn, O, 'br', 74, 84, y=-16)
    for n in ('bn', 'br'): P[f'leg_{n}_lo']['thick'] = leg * 0.9; P[f'leg_{n}_paw']['thick'] = leg * 0.9
    for n in ('br',): [P[f'leg_{n}_{k}'].update(dark=0.88) for k in ('up', 'lo', 'paw')]
    if tail_part: P['tail'] = {'src': 'tail', 'length': tail, 'flipV': True}; O['tail'] = {'rope': None, 'x': 100, 'y': 0}
    hide = [h for h in HIDE if split or h != 'chest_fluff'] + ['horn'] + ([] if tail_part else ['tail'])
    return {'hide': hide, 'bones': Bn, 'boneScale': {}, 'over': O, 'parts': P, 'attacks': list(attacks), 'stance': {'bn': 44, 'br': -40}}

def cerberus():
    """케르베로스: 불꽃 갈기 시바. 나머지 머리 둘은 한 조각(wing 칸)으로 목에 붙여 본래 머리 뒤에 둠."""
    f = quad(100, 150, curl=True, head=240, attacks=('bite', 'pounce', 'claw'), up=(96, 66), lo=(90, 74), thick=1.1)
    f['parts']['wing'] = {'src': 'heads', 'length': 430}
    f['hide'] = [h for h in f['hide'] if h != 'wing']
    f['over']['wing'] = {'bone': 'neck', 'x': 10, 'y': -60, 'rot': 55, 'z': 4.8}   # 목의 기울기를 되돌려 곧게, 본래 머리 뒤 위로
    return f

def ungnyeo():
    """웅녀: 산군과 같은 두 발 골격, 저고리 윗몸통·마늘 목걸이, 앞손에 쑥 한 다발. 꼬리는 짧아서 숨김."""
    f = biped(head=240, ear=62, attacks=('attack', 'butt', 'claw'), tail_part=False, torso=1.3, arm=1.2, leg=1.22, split=True)
    f['parts']['torso_front'].update(crop=[0.02, 0.07, 0.86, 1], length=232)   # 앞소매 토막·목 테두리는 잘라냄(팔이 그 자리를 덮음)
    f['over']['torso_front'].update(x=44, y=10)   # 저고리 앞섶·마늘 목걸이가 가슴 앞에 오게
    f['bones']['leg_fr_up']['y'] = 22   # 먼 팔은 몸통 뒤로 숨겨 등 뒤로 소매가 삐져나오지 않게
    f['parts']['deco'] = {'src': 'mugwort', 'length': 118, 'rot': -60}
    f['hide'] = [h for h in f['hide'] if h != 'deco']
    f['over']['deco'] = {'bone': 'leg_fn_paw', 'x': 18, 'y': -6, 'z': 8.1}
    return f

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
 'tiger_spirit': biped(split=True),
 'dog_spirit': cerberus(),
 'bear_spirit': ungnyeo(),
}
if __name__ == '__main__':
    for k, v in FITS.items(): json.dump(v, open(os.path.join(OUT, k + '.json'), 'w'), ensure_ascii=False, indent=1)
    print('fits:', ', '.join(FITS))
