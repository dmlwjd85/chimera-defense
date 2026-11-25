# 동작 주문서 — 다시 뽑지 않게 여기서만 고친다. (docs/동작_주문_규칙.md)
# 작업 폴더(PixelLab 작업 자리)에서 쓰는 법: PIXELLAB_API_TOKEN=... python3 run_motions.py <종,종> [동작,..] [단계,..]
#   final/<종>_<단계>.png = art-src/pixellab 확정 원화, 결과 anim/<종>_<단계>_<동작>/ → art-src/pixellab/anim 으로 복사 → tools/build_pixellab_motions.py
# 첫 장 = 확정 원화(final/<종>_<단계>.png, 오른쪽을 봄). PixelLab animate-with-text-v3가 몸 전체를 통째로 다시 그림(잘라 붙이기·늘리기·사이 장 합성 없음).
# 투사체·이펙트·화면 흔들림은 코드로 그림 → 동작 주문에 '날아가는 물체'를 넣지 않는다.

STAGE_KEYS = {'young': 'baby', 'teen': 'teen', 'adult': 'adult', 'spirit': 'myth'}
CANVAS = {'baby': 96, 'teen': 112, 'adult': 128, 'myth': 160}

# 단계별 동작(공격 기술 묶음과 같음): 어린 기본1, 성장기 기본1·2, 성체 +속성, 신화급 +필살기
MOTIONS = {
    'baby':  ['idle', 'walk', 'a1', 'hit', 'down'],
    'teen':  ['idle', 'walk', 'a1', 'a2', 'hit', 'down'],
    'adult': ['idle', 'walk', 'a1', 'a2', 'el', 'hit', 'down'],
    'myth':  ['idle', 'walk', 'a1', 'a2', 'el', 'ult', 'hit', 'down'],
}
FRAMES = {'idle': 4, 'walk': 8, 'a1': 8, 'a2': 8, 'el': 8, 'ult': 16, 'hit': 4, 'down': 8}

# 2026-11-26 곰·독수리 시안에서 배운 것:
#  - 반복(대기·걷기)은 첫 장 = 끝 장(last_frame)으로 줘야 이음매가 안 끊김
#  - 나는 새(독수리·까마귀)의 아기·성장기·성체는 서 있는 원화가 아니라 '날개 편 나는 자세'를 첫 장으로(하늘에 떠서 싸움).
#    나는 자세 = 1차 걷기(날기) 결과 중 날개를 가장 크게 편 장(anim_v1/<종>_<단계>_walk). 공격·맞기도 그 자세로 돌아오게 last_frame.
FLYERS = {'eagle', 'crow'}
LAST = {'idle', 'walk'}
LAST_FLY = {'idle', 'walk', 'a1', 'a2', 'el', 'hit'}

# 나는 자세 첫 장을 사람이 고른 것(자동으로 고르면 눈 감은 장이 걸릴 수 있음 → 첫 장은 반드시 눈 뜬 장)
BASE_PICK = {('eagle', 'teen'): 'anim_v1/eagle_teen_walk/f04.png'}

def base(sp, stage):
    import glob
    from PIL import Image
    if (sp, stage) in BASE_PICK: return BASE_PICK[(sp, stage)]
    if sp in FLYERS and stage != 'myth':
        fs = sorted(glob.glob(f'anim_v1/{sp}_{stage}_walk/f0[5-8].png'))
        def area(f):
            b = Image.open(f).getbbox(); return (b[2] - b[0]) * (b[3] - b[1])
        return max(fs, key=area)
    return f'final/{sp}_{stage}.png'

def use_last(sp, stage, motion):
    return motion in (LAST_FLY if sp in FLYERS and stage != 'myth' else LAST)

COMMON = ("Side view facing right. Same character, same colors, same size and proportions in every frame; "
          "feet stay on the same ground line unless jumping. No projectiles, no effects, no background, no props added.")

# 종마다: 몸 설명(기본), 단계별 동작 문장. {who}는 단계 설명으로 바뀜.
SPECIES = {
    'bear': {
        'who': {'baby': 'a chibi black bear cub on four legs', 'teen': 'a chibi young black bear on four legs',
                'adult': 'a chibi big black bear on four legs',
                'myth': 'Ungnyeo, an upright chibi bear woman in a green hanbok with a red headband, holding a mugwort sprig in her right paw'},
        'idle': '{who} breathing calmly, chest rises and falls, ears twitch',
        'walk': '{who} walking forward with a steady heavy gait, body bobs gently',
        'walk_myth': '{who} walking forward on two legs, hanbok skirt sways',
        'a1': '{who} rears up slightly and swipes forward with one front paw (claw swipe), then returns to the start pose',
        'a1_myth': '{who} steps forward and swings her free paw in a strong forward slap, then returns to the start pose',
        'a2': '{who} crouches, then charges forward and bumps the enemy with its shoulder (body slam), then steps back to the start pose',
        'a2_myth': '{who} crouches and rams forward shoulder-first in a body slam, then steps back to the start pose',
        'el': '{who} rears up on hind legs and stomps both front paws down hard on the ground, then returns to the start pose',
        'el_myth': '{who} raises both paws and stamps one foot hard on the ground, then returns to the start pose',
        'ult': '{who} closes her eyes and prays holding the mugwort to her chest, jumps up, and smashes down with both paws in a powerful ground slam, ending in a firm standing pose',
    },
    'eagle': {
        'who': {'baby': 'a chibi fluffy eaglet flying with its small wings spread', 'teen': 'a chibi young bald eagle flying with wings spread',
                'adult': 'a chibi bald eagle flying with wings spread',
                'myth': 'Aquila, an upright chibi bald eagle warrior in golden armor with big brown wings folded behind, holding a yellow lightning bolt in the right hand'},
        'idle': '{who}, hovering in place, wings flap down and back up in one smooth cycle, body bobs slightly',
        'idle_myth': '{who} standing proudly and breathing, wings stay folded behind the back, tiny bob',
        'walk': '{who}, flying forward with one strong wing flap down and back up',
        'walk_myth': '{who} walking forward on two legs, wings stay folded behind',
        'a1': '{who}, while hovering, sweeps both wings forward hard once (throwing feathers), then back to the same flying pose',
        'a1_myth': '{who} sweeps one big wing forward hard (throwing feathers), then returns to the start pose',
        'a2': '{who}, while hovering, sweeps the wings forward twice quickly, then back to the same flying pose',
        'a2_myth': '{who} sweeps both wings forward twice quickly in a row, then returns to the start pose',
        'el': '{who}, rises a little and beats the wings down hard once making a gust, then back to the same flying pose',
        'el_myth': '{who} spreads both wings wide and beats them down hard once, then returns to the start pose',
        'ult': '{who} raises the lightning bolt high above the head, leaps into the air with wings spread, and hurls the bolt forward-down, landing in a heroic standing pose',
        'down_fly': '{who} gets knocked out: tumbles out of the air, falls onto the ground and lies still on its side with dizzy closed eyes',    },
}
HIT = '{who} flinches backward from a hit, eyes squeezed shut, then recovers to the start pose'
DOWN = '{who} gets knocked out: staggers, falls over onto its side and lies still with dizzy closed eyes'
DOWN_MYTH = '{who} gets knocked out: staggers and sits down heavily, then slumps over with dizzy closed eyes'


def action(sp, stage, motion):
    s = SPECIES[sp]; who = s['who'][stage]
    if motion == 'hit': t = HIT
    elif motion == 'down': t = DOWN_MYTH if stage == 'myth' else s.get('down_fly') if sp in FLYERS else DOWN
    else: t = s.get(f'{motion}_{stage}') or s[motion]
    return t.format(who=who) + '. ' + COMMON


def jobs(species):
    for sp in species:
        for stage, ms in MOTIONS.items():
            for m in ms:
                yield sp, stage, m
