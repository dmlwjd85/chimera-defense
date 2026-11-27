# 적(마계 군단) 동작 주문서 — 다시 뽑지 않게 여기서만 고친다. (docs/동작_주문_규칙.md)
# 원화: pick/en_<id>.png (제미나이 밑그림 → PixelLab generate-image-v2, 아군 성체 호랑이 스타일, 오른쪽을 봄 → 게임에서 좌우 뒤집어 왼쪽으로 걸어옴)
# 쓰는 법(작업 자리): python3 run_enemy_motions.py <id,id|all> [동작,..]   → anim/en_<id>_adult_<동작>/
# 2026-11-26 1차에서 배운 것: 'eyes become swirls'를 넣으면 머리 위에 소용돌이 이펙트를 그림(바위골렘) → 'eyes shut' + 'no swirls'.
#   ※ 3차에서 배운 것: 문장에 효과 이름(sparks·smoke·swoosh…)을 'no ~'로 넣으면 오히려 그 효과를 더 그림 → 효과 이름은 아예 쓰지 않음.
#     PixelLab은 맞기 첫 장에 거의 늘 번쩍임을 그려서, 그런 장은 DROP 표로 빼고 씀(장을 지우기만 함, 새로 만들지 않음).
#   그래도 보스(큰 칸)는 빛·연기·별을 자주 덧그려서 COMMON 맨 앞에 '몸만 그림, 이펙트 일절 없음'을 두고 'ground shakes·smoke billows·chanting'처럼 이펙트를 부르는 말을 뺌.
#   공격에 휘두름 자국(흰 호)을 그려서(여우 도적) 'no motion trails, no swoosh lines'.
#   맞기에도 땀방울·불꽃을 그려서(나방·버섯) 'no sweat drops, no sparks, no flames'.
# 2026-11-26 사용자: "많이 나오는게 중요한게 아니라 진짜로 티격태격 싸우는게 중요해"
#   → 막아선 동물과 치고받는 공격(a1)·맞고 움찔(hit)·쓰러짐(down)이 핵심. 보스는 패턴(돌진·소환·방패) 신호로 skill(el) 하나 더.

COMMON = ("Side view facing right. Same character, same colors, same size and proportions in every frame; "
          "feet stay on the same ground line unless jumping or flying. No projectiles, no effects, no background, no props added.")

# id: (설명, 캔버스, 나는가, 공격 문장(None = 공격 안 함), 보스 기술 문장(None = 없음))
E = {
 'normal':   ('a chibi purple horned imp holding a wooden club', 96, False,
              'raises the club over its head and smashes it down hard on the enemy in front of it, then hops back to the start pose', None),
 'fast':     ('a chibi fox bandit with a black bandana mask holding a small dagger', 96, False,
              'darts forward and does two quick dagger stabs at the enemy in front of it, then springs back to the start pose', None),
 'tough':    ('a chibi stone golem with a green sprout on its head', 112, False,
              'pulls back one big stone fist and throws a heavy straight punch forward, its body leans into the blow, then returns to the start pose', None),
 'swarm':    ('a tiny chibi red beetle', 80, False,
              'crouches, hops forward and headbutts the enemy in front of it, then bounces back to the start pose', None),
 'flying':   ('a chibi blue moth flying', 96, True, None, None),
 'healer':   ('a chibi red-capped mushroom holding a crooked wooden staff', 96, False,
              'lifts the staff and bonks it down on the enemy in front of it, its mushroom cap wobbles, then returns to the start pose', None),
 'miniboss': ('a chibi armored wild boar with brambles on its back, on four legs', 128, False,
              'lowers its head, charges forward a short step and tosses its tusks upward in a goring strike, then steps back to the start pose', None),
 'bat':      ('a chibi purple bat flying', 96, True, None, None),
 'skeleton': ('a chibi golden skeleton soldier with an axe and a round shield', 96, False,
              'raises the axe and chops down at the enemy in front of it while holding the shield up, then returns to the start pose', None),
 'ghost':    ('a chibi pale blue ghost holding a small lantern, floating', 96, False,
              'swoops forward and swipes with its wispy free arm at the enemy in front of it, then floats back to the start pose', None),
 'zombie':   ('a chibi green zombie wild boar with stitched scars, on four legs', 112, False,
              'lurches forward and snaps a big bite with its tusked jaw at the enemy in front of it, then staggers back to the start pose', None),
 'wisp':     ('a chibi blue flame spirit with a grinning face, floating', 80, True, None, None),
 'boss_boar':  ('a big chibi boar king in gold-and-iron armor with a small crown', 176, False,
                'winds up and slams a huge armored fist forward in a heavy punch, leaning its whole body into it, then returns to the start pose',
                'stamps one foot hard, then lowers its head with tusks pointed forward and leans far forward ready to charge, then returns to the start pose'),
 'boss_bat':   ('a big chibi bat king with a gold crown and a red collar, flying', 176, True, None,
                'spreads its huge wings as wide as possible with its mouth open, then folds back to the start pose'),
 'boss_shadow':('a big chibi shadow giant of purple smoke with a silver shoulder plate and gauntlet', 176, False,
                'raises its silver gauntlet fist high and smashes it straight down in front of it, then returns to the start pose. It holds no weapon',
                'crosses both arms in front of its body and hunkers down like a shield, then returns to the start pose'),
 'boss_bone':  ('a big chibi skeleton general in blue armor with a horned helmet, red cape and curved sword', 176, False,
                'swings the curved sword in a wide horizontal slash in front of it, the cape flaps, then returns to the start pose',
                'raises the sword high overhead and stamps the ground, commanding its soldiers, then returns to the start pose'),
 'boss_frost': ('a big chibi frost wraith king with an ice crown and an ice staff, floating', 176, False,
                'swings the ice staff forward in a heavy strike at the enemy in front of it, its robe flutters, then returns to the start pose',
                'leans far forward and lunges ahead as if charging, robe streaming behind, then returns to the start pose'),
 'boss_lich':  ('a big chibi crow-masked priest in a green hood and purple robe with an orb staff', 176, False,
                'thrusts the orb staff forward and bashes it at the enemy in front of it, then returns to the start pose',
                'raises the orb staff high with both hands, robe sways, then lowers it back to the start pose'),
 'overlord':   ('a big chibi demon overlord with ram horns, silver crown, black armor, crimson cape and a scythe staff', 208, False,
                'grips the scythe with both hands and swings it down in front of him, the scythe stays in his hands the whole time, then returns to the start pose',
                'raises his free hand high above his head, cape billows, then lowers it back to the start pose'),
}
# 새 보스 5종(스테이지 7~11): 몸·공격·기술 문장은 boss2_spec.py 한 곳에서 관리
from boss2_spec import B2
E.update({k: (v[2], 176, False, v[3], v[4]) for k, v in B2.items()})

# 어려운 난이도 보스 단계(boss_tier_spec.py): <id>_t1 성난 모습 · <id>_t2 깨어난 마왕 모습. 동작 문장은 원래 보스 것을 쓰고 몸 설명만 바꿈
from boss_tier_spec import BASE as _TB, SP as _TSP
for _k in _TB:
    for _t, _w in ((1, 'an enraged spiked version of '), (2, 'a terrifying awakened demon-lord version of ')):
        if _k in E: E[f'{_k}_t{_t}'] = (_w + E[_k][0][2:] + ', ' + _TSP[(_k, _t)], 176, E[_k][2], E[_k][3], E[_k][4])

FRAMES = {'idle': 4, 'walk': 8, 'a1': 8, 'el': 8, 'hit': 4, 'down': 8}
LAST = {'idle', 'walk'}


def motions(eid):
    who, can, fly, a1, el = E[eid]
    ms = ['walk', 'hit', 'down']
    if not fly or a1: ms.insert(0, 'idle')
    if a1: ms.append('a1')
    if el: ms.append('el')
    return ms


def action(eid, m):
    who, can, fly, a1, el = E[eid]
    if m == 'idle': t = f'{who} standing in a fighting stance, bouncing lightly, eyes blink once'
    elif m == 'walk': t = f'{who} flapping and flying forward, bobbing up and down' if fly else f'{who} walking forward with a cheeky swagger, body bobs'
    elif m == 'a1': t = f'{who} {a1}'
    elif m == 'el': t = f'{who} {el}'
    elif m == 'hit': t = f'{who} gets hit hard: the whole body flinches backward with a pained squint, then recovers to the start pose'
    else: t = (f'{who} gets knocked out of the air, tumbles and falls flat on the ground, eyes shut, lies still' if fly else
               f'{who} gets knocked out: staggers, falls flat on its back on the ground, eyes shut, lies still')
    return t + '. ' + COMMON


def jobs(ids):
    return [(e, m) for e in ids for m in motions(e)]


# 장 빼기(검수 2026-11-26): PixelLab이 덧그린 번쩍임·휘두름 자국이 있는 장은 빼고 씀(새 장을 만들지 않음).
# 번호 = 주문 결과 f01부터 0. 쓰러짐은 뺀 뒤 가장 낮게 누운 장에서 멈춤.
DROP = {
    ('swarm', 'hit'): [0, 1], ('skeleton', 'hit'): [0, 1], ('healer', 'hit'): [0, 1], ('healer', 'walk'): [1, 2, 3],
    ('bat', 'hit'): [0], ('ghost', 'hit'): [0, 1], ('miniboss', 'hit'): [0, 1], ('miniboss', 'down'): [1],
    ('zombie', 'hit'): [0, 1], ('zombie', 'down'): [2],
    ('boss_boar', 'walk'): [2, 4], ('boss_boar', 'hit'): [0],
    ('boss_bat', 'hit'): [0], ('boss_bat', 'down'): [0, 1],
    ('boss_shadow', 'hit'): [0, 1], ('boss_shadow', 'down'): [1], ('boss_shadow', 'el'): [2, 3], ('boss_shadow', 'idle'): [0, 1], ('boss_shadow', 'walk'): [1, 2],
    ('boss_bone', 'hit'): [0], ('boss_frost', 'hit'): [0, 1], ('boss_frost', 'down'): [1, 2], ('boss_frost', 'idle'): [0],
    ('overlord', 'down'): [1],
    # 새 보스 5종(2026-11-27): 맞기 덧그림 장
    ('boss_mole', 'hit'): [0, 1], ('boss_gate', 'hit'): [2, 3], ('boss_mole', 'down'): [0, 1, 2], ('boss_lava', 'hit'): [0, 1, 2], ('boss_lava', 'el'): [4], ('boss_lava', 'down'): [0, 1, 2],
    ('boss_witch', 'hit'): [0], ('boss_knight', 'hit'): [0, 1],
    # 하드 단계 보스(2026-11-27 검수): 덧그린 휘두름 자국·빛 장
    ('boss_boar_t1', 'a1'): [2, 3], ('boss_bat_t1', 'down'): [0, 1, 2, 3], ('boss_shadow_t1', 'idle'): [1, 2], ('boss_shadow_t1', 'a1'): [3, 4, 5, 6],
    ('boss_bone_t1', 'a1'): [1, 2, 3], ('boss_frost_t1', 'idle'): [0, 1], ('boss_frost_t1', 'a1'): [1, 2, 3], ('boss_frost_t1', 'down'): [0, 1, 2],
    ('boss_knight_t1', 'idle'): [0, 1],
    # 하드코어·신계 단계 보스
    ('boss_boar_t2', 'down'): [0, 1, 2], ('boss_bat_t2', 'down'): [1], ('boss_shadow_t2', 'idle'): [1, 2], ('boss_bone_t2', 'a1'): [1, 2, 3], ('boss_bone_t2', 'down'): [0, 1, 2],
    ('boss_lava_t1', 'idle'): [0, 1, 2], ('boss_lava_t1', 'a1'): [4, 5], ('boss_lava_t1', 'down'): [0, 1, 2, 3, 4], ('boss_lava_t2', 'idle'): [0, 1, 2],
    ('boss_boar_t2', 'a1'): [4], ('boss_knight_t2', 'a1'): [3, 4, 5], ('boss_mole_t2', 'a1'): [3, 4], ('boss_mole_t2', 'el'): [4, 5, 6, 7],
    ('boss_frost_t2', 'a1'): [3, 4, 5, 6], ('boss_shadow_t2', 'a1'): [2, 3, 4], ('boss_frost_t2', 'down'): [0, 1, 2], ('boss_witch_t2', 'el'): [0, 1, 2], ('boss_knight_t2', 'idle'): [1, 2], ('boss_gate_t1', 'a1'): [3, 4, 5], ('boss_mole_t1', 'a1'): [2, 3, 4], ('overlord_t1', 'idle'): [0, 1, 2],
    # 공격: 여러 번 뽑아 가장 나은 판(meta.json에 실제 쓴 문장)을 쓰고 자국 있는 장만 뺌
    ('fast', 'a1'): [2, 3, 4], ('miniboss', 'a1'): [2], ('boss_boar', 'a1'): [1, 2, 3], ('boss_shadow', 'a1'): [1, 2, 3], ('boss_frost', 'a1'): [1, 2],
}
