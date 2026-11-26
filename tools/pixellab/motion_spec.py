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
BASE_PICK = {('eagle', 'teen'): 'anim_v1/eagle_teen_walk/f04.png',
             ('crow', 'baby'): 'anim_v1/crow_baby_walk/f04.png', ('crow', 'teen'): 'anim_v1/crow_teen_walk/f04.png', ('crow', 'adult'): 'anim_v1/crow_adult_walk/f05.png'}

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
                if (sp, stage, m) not in SKIP: yield sp, stage, m


# ---- 2026-11-26 나머지 13종 (확정 원화를 보고 적음) ----
def _who(baby, teen, adult, myth):
    return {'baby': baby, 'teen': teen, 'adult': adult, 'myth': myth}

def _quad(name, myth, a1, a2, el, m_a1, m_a2, m_el, ult, walk='walking forward on four legs with a bouncy gait', idle='breathing calmly, ears and tail move a little'):
    return {
        'who': _who(f'a chibi baby {name} on four legs', f'a chibi young {name} on four legs', f'a chibi {name} on four legs', myth),
        'idle': '{who} ' + idle, 'idle_myth': '{who} standing and breathing calmly, small idle sway',
        'walk': '{who} ' + walk, 'walk_myth': '{who} walking forward on two legs',
        'a1': '{who} ' + a1 + ', then returns to the start pose', 'a1_myth': '{who} ' + m_a1 + ', then returns to the start pose',
        'a2': '{who} ' + a2 + ', then returns to the start pose', 'a2_myth': '{who} ' + m_a2 + ', then returns to the start pose',
        'el': '{who} ' + el + ', then returns to the start pose', 'el_myth': '{who} ' + m_el + ', then returns to the start pose',
        'ult': '{who} ' + ult + ', ending in a strong standing pose',
    }

SPECIES.update({
  'tiger': _quad('tiger cub' if False else 'tiger', 'the White Tiger General, an upright chibi white tiger in blue and gold armor with a red sash',
      'swipes forward with one front paw (claw swipe)', 'pounces forward and claws twice quickly', 'roars with head raised and stomps one front paw',
      'punches forward with one big fist', 'punches forward twice quickly, left then right', 'raises one fist high and roars', 'jumps and smashes both fists down'),
  'fox': _quad('red fox', 'Gumiho, an upright chibi white nine-tailed fox in a pink and light blue hanbok holding a small blue flame in the right hand',
      'flicks its head forward and opens its mouth (spitting a fire ball)', 'flicks its head forward twice quickly, mouth open', 'swirls its big tail around and arches its back',
      'thrusts the hand with the blue flame forward (throwing fox fire)', 'thrusts the flame hand forward twice quickly', 'raises the flame hand high while the nine tails fan out wide',
      'spreads all nine tails wide, gathers the blue flame in both hands and pushes it forward hard'),
  'rabbit': _quad('white rabbit', 'the Moon Rabbit, an upright chibi white rabbit in a green robe holding a green rice-cake pestle in both hands',
      'hops forward and kicks with both hind legs', 'hops and does two quick jab kicks', 'thumps the ground hard with a hind foot, ears up',
      'swings the pestle forward in an arc', 'pokes the pestle forward twice quickly', 'raises the pestle high, the moon mark on the forehead glowing',
      'jumps high and pounds the pestle straight down with both hands', walk='hopping forward in small bunny hops'),
  'bison': _quad('bison', 'Babe the Blue Ox, an upright chibi blue ox in gold armor with golden horns and a dark blue cape',
      'lowers its head and tosses its horns upward forward', 'lowers its head and charges forward in a shoulder slam', 'rears up and stomps both front hooves down hard',
      'punches forward with one big fist', 'lowers the horns and rams forward shoulder-first', 'raises both fists and stomps one foot hard',
      'jumps up and smashes both fists into the ground', walk='walking forward with a heavy steady gait'),
  'wolf': _quad('grey wolf', 'Fenrir, an upright chibi dark grey wolf with leather straps, gold armor pieces and broken gold chains on both wrists',
      'lunges forward and bites with open jaws', 'bumps forward with its head (headbutt)', 'raises its head and howls',
      'slashes forward with one clawed hand', 'swings the chained arm forward twice', 'throws its head back and howls with fists clenched',
      'leaps forward and slashes down with both clawed hands'),
  'bighorn': _quad('bighorn ram', 'the Golden Ram, an upright chibi ram in gold armor with big golden curled horns and a gold cape',
      'lowers its head and butts forward with the curled horns', 'rears up and butts forward twice quickly', 'rears up and stomps both front hooves',
      'lowers the horns and butts forward', 'punches forward twice quickly', 'raises both fists and stomps one foot hard',
      'lowers the golden horns and charges forward in a huge ram attack'),
  'dog': _quad('Shiba Inu dog', 'an upright chibi Shiba Inu warrior with a flaming orange mane, gold armor pieces and small flames beside both shoulders',
      'lunges forward and bites', 'bumps forward with its shoulder', 'plants its feet and barks loudly, head up',
      'punches forward with one fist', 'punches forward twice quickly', 'raises both fists and barks, mane flaring',
      'leaps forward and slams down with both flaming fists', idle='breathing calmly, curled tail wags'),
  'monkey': _quad('monkey', 'Sun Wukong the Monkey King, an upright chibi monkey in gold armor with a red scarf and golden circlet, holding a red and gold staff',
      'sits up and throws something forward overhand with one arm', 'throws forward with the left arm then the right arm quickly', 'jumps up and spins once in the air',
      'swings the staff forward in a wide arc', 'thrusts the staff forward twice quickly', 'spins the staff overhead',
      'leaps high, spins the staff and smashes it down', walk='walking forward on all fours, tail swinging'),
  'ant': _quad('red ant', 'Myrmidon, an upright chibi red ant warrior in a bronze crested helmet holding a round bronze shield and a long spear',
      'lunges forward and snaps its mandibles', 'charges forward and bumps with its head', 'rears up on its back legs and stomps the front legs down',
      'thrusts the spear forward', 'bashes forward with the round shield then thrusts the spear', 'raises the spear high and stamps one foot',
      'leaps up and drives the spear down hard into the ground', walk='walking forward on six legs, antennae bobbing', idle='breathing, antennae twitch'),
})
SPECIES['ant']['who'] = _who('a chibi baby red ant on six legs', 'a chibi young red ant on six legs', 'a chibi red ant on six legs', SPECIES['ant']['who']['myth'])
SPECIES['tiger']['who'] = _who('a chibi tiger cub on four legs', 'a chibi young tiger on four legs', 'a chibi tiger on four legs', SPECIES['tiger']['who']['myth'])

# 다리 모양이 다른 종(서서 앉는 개구리, 메뚜기, 두 발 닭·병아리)
SPECIES['frog'] = {
    'who': _who('a chibi baby frog sitting', 'a chibi young frog sitting', 'a chibi big green frog sitting', 'Geumwa the frog king, an upright chibi golden-green frog with a small gold crown and a purple cape'),
    'idle': '{who} breathing, throat puffs in and out, eyes blink', 'idle_myth': '{who} standing and breathing, cape sways a little',
    'walk': '{who} hopping forward in small frog hops', 'walk_myth': '{who} walking forward on two legs, cape sways',
    'a1': '{who} puffs its cheeks and spits forward (spitting a water bubble), then returns to the start pose',
    'a2': '{who} spits forward twice quickly, then returns to the start pose',
    'el': '{who} jumps up and lands hard with a splash pose, then returns to the start pose',
    'a1_myth': '{who} thrusts one hand forward (casting a water bubble), then returns to the start pose',
    'a2_myth': '{who} thrusts the right hand then the left hand forward quickly, then returns to the start pose',
    'el_myth': '{who} raises both hands high with the cape flaring, then returns to the start pose',
    'ult': '{who} jumps high and lands in a huge belly flop, then stands up in a proud pose',
}
SPECIES['grasshopper'] = {
    'who': _who('a chibi baby green grasshopper', 'a chibi young green grasshopper', 'a chibi green grasshopper', 'Tithonus, an upright chibi golden grasshopper with clear golden wings holding a small glowing golden orb'),
    'idle': '{who} breathing, antennae twitch', 'idle_myth': '{who} standing and breathing, wings flutter slightly',
    'walk': '{who} walking forward on its legs with small hops', 'walk_myth': '{who} walking forward on two legs, wings flutter',
    'a1': '{who} kicks forward with a long hind leg (flinging a leaf), then returns to the start pose',
    'a2': '{who} kicks forward twice quickly with its hind legs, then returns to the start pose',
    'el': '{who} jumps up high and lands, wings buzzing, then returns to the start pose',
    'a1_myth': '{who} thrusts the orb forward with one hand, then returns to the start pose',
    'a2_myth': '{who} thrusts the orb forward twice quickly, then returns to the start pose',
    'el_myth': '{who} raises the orb high, wings spread wide and buzzing, then returns to the start pose',
    'ult': '{who} rises up on buzzing wings holding the orb high, then thrusts it forward and lands in a strong pose',
}
SPECIES['rooster'] = {
    'who': _who('a round fluffy yellow chick', 'a chibi young chicken with a small red comb', 'a chibi rooster with a red comb and tall tail feathers',
                'the Golden Rooster, an upright chibi golden rooster warrior in gold armor with feathered hands and a big flame-like golden tail'),
    'idle': '{who} breathing, head bobs a little', 'idle_myth': '{who} standing proudly and breathing, tail sways',
    'walk': '{who} walking forward on two legs, head bobbing', 'walk_myth': '{who} walking forward on two legs, tail sways',
    'a1': '{who} raises its head and crows loudly with beak open, then returns to the start pose',
    'a2': '{who} crows twice quickly with beak open, wings flapping, then returns to the start pose',
    'el': '{who} spreads its wings wide and crows to the sky, then returns to the start pose',
    'a1_myth': '{who} punches forward with one feathered fist, then returns to the start pose',
    'a2_myth': '{who} punches forward twice quickly, left then right, then returns to the start pose',
    'el_myth': '{who} raises one fist high and crows to the sky, tail flaring, then returns to the start pose',
    'ult': '{who} leaps up, flame tail blazing, and slams down with both fists, ending in a heroic standing pose',
}
SPECIES['crow'] = {
    'who': _who('a chibi baby crow flying with its small wings spread', 'a chibi young crow flying with wings spread', 'a chibi crow flying with wings spread',
                'Samjoko, an upright chibi three-legged crow warrior with a gold sun chest plate and black feathered hands, folded black wings on the back, holding a small red sun orb'),
    'idle': '{who}, hovering in place, wings flap down and back up in one smooth cycle, body bobs slightly',
    'idle_myth': '{who} standing and breathing, wings stay folded behind the back, tiny bob',
    'walk': '{who}, flying forward with one strong wing flap down and back up',
    'walk_myth': '{who} walking forward on its legs, wings stay folded behind',
    'a1': '{who}, while hovering, sweeps both wings forward hard once (throwing feathers), then back to the same flying pose',
    'a2': '{who}, while hovering, sweeps the wings forward twice quickly, then back to the same flying pose',
    'el': '{who}, rises a little and beats the wings down hard once making a gust, then back to the same flying pose',
    'a1_myth': '{who} thrusts the red sun orb forward with one hand, then returns to the start pose',
    'a2_myth': '{who} thrusts the sun orb forward twice quickly, then returns to the start pose',
    'el_myth': '{who} spreads both wings wide and raises the sun orb high, then returns to the start pose',
    'ult': '{who} leaps up with wings spread, raises the sun orb overhead and hurls it forward-down, landing in a heroic standing pose',
    'down_fly': '{who} gets knocked out: tumbles out of the air, falls onto the ground and lies still on its side with dizzy closed eyes',
}
# 1차: 까마귀는 서 있는 원화로 날기(walk)만 먼저 → 날개 편 장을 골라 BASE_PICK에 적고 나머지 동작
WALK_STAND = {'crow': '{who} takes off and flies forward with wings spread wide, strong wing flaps'}

# 산군(호랑이)은 전용 필살기 연출이 있어 공용 필살기 동작을 뽑지 않음(config.moves.ultOwn)
SKIP = {('tiger', 'myth', 'ult')}
