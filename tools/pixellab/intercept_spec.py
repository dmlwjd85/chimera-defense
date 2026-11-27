# 뛰어들기·점프 돌파와 막기(막아서기·다리걸기·발목잡기) 동작 주문서 — 다시 뽑지 않게 여기서만 고친다.
# 2026-11-27 사용자: "후열을 노리는 공격이 너무 순간이동 … 뛰어 들어가거나 점프를 해서 공격 … 막히는 것도 있게.
#   적도 마찬가지 … 브루저가 막아서기, 다리걸기(딜러 넘어지는 모션), 발목잡기(점프하는 개체 떨어뜨리기)"
# 범위(사용자 '추천대로'): 성체·신화급 + 적만 새로 그림. 아기·성장기는 자기 걷기·쓰러짐 장을 코드로 빠르게/거꾸로 돌려 씀.
# 새 동작: leap(점프파 딜러) · fall(넘어짐/끌려 떨어짐, 딜러) · block(막아서기) · sweep(다리걸기) · grab(발목잡기)  — 브루저
# 2026-11-27 검수: PixelLab 'fall'(넘어짐)은 웅크리기만 하고 눕지 않아서 → 넘어짐은 각자 쓰러짐(down) 장을 앞으로 → 잠깐 멈춤 → 거꾸로(일어남) 이어 씀(build_pixellab_motions가 만듦). fall 주문은 뺌.
# 효과 이름은 쓰지 않는다(쓰면 PixelLab이 그림). 시작 장 = 확정 원화, 끝은 시작 자세로 돌아옴.
from motion_spec import SPECIES, CANVAS, FLYERS, base

DASH = ['tiger', 'bighorn']                  # 빠르게 달려 들어감(걷기 장을 빠르게) → 다리걸기·막아서기에 걸림
JUMP = ['fox', 'rabbit', 'monkey']           # 점프해서 날아듦 → 발목잡기에 걸림
FLY = ['crow', 'eagle']                      # 날아서 들어감 → 발목잡기만(다리걸기 안 통함)
BRUISER = ['bear', 'bison', 'frog', 'ant', 'dog']
STAGES = ['adult', 'myth']
FRAMES = {'leap': 8, 'fall': 8, 'block': 6, 'sweep': 8, 'grab': 8}

COMMON = ("Side view facing right. Same character, same colors, same size and proportions in every frame; "
          "feet stay on the same ground line unless jumping. No projectiles, no background, no props added.")

T = {
    'leap': '{who} crouches low, springs up high into the air with its legs tucked under, hangs in the air for a moment, then lands softly back in the start pose',
    'fall': '{who} trips, stumbles forward and falls flat on its belly with a surprised face, lies there for a moment, then quickly scrambles back up to the start pose',
    'fall_fly': '{who} is yanked down out of the air by one leg, drops onto the ground on its belly with a surprised face, then flaps back up into the start pose',
    'block': '{who} quickly steps forward and plants its feet wide, bracing its whole body like a wall with its chest pushed out and head lowered, then relaxes back to the start pose',
    'sweep': '{who} drops low and swings one leg sideways along the ground in a low sweeping kick, then returns to the start pose',
    'grab': '{who} rears up and reaches high with both front paws, grabs at the air above and yanks down hard to the ground, then returns to the start pose',
    'grab_up': '{who} jumps up and reaches high with one hand, grabs at the air above and yanks down hard to the ground, then returns to the start pose',
}
SP_T = {   # 종마다 다르게
    ('frog', 'grab'): '{who} shoots its long tongue straight up high, wraps the tip and yanks it back down hard, then returns to the start pose',
    ('frog', 'sweep'): '{who} drops low and swings one long hind leg sideways along the ground in a low sweeping kick, then returns to the start pose',
    ('ant', 'grab'): '{who} rears up on its back legs and snaps its big jaws high in the air, then pulls down hard to the ground and returns to the start pose',
}


def who(sp, st):
    return SPECIES[sp]['who'][st]


def action(sp, st, m):
    if (sp, m) in SP_T: t = SP_T[(sp, m)]
    elif m == 'fall' and sp in FLY and st != 'myth': t = T['fall_fly']
    elif m == 'grab' and st == 'myth': t = T['grab_up']
    else: t = T[m]
    return t.format(who=who(sp, st)) + '. ' + COMMON


def jobs():
    for st in STAGES:
        for sp in JUMP: yield (sp, st, 'leap')
        for sp in BRUISER:
            for m in ('block', 'sweep', 'grab'): yield (sp, st, m)


# 적: 뛰어드는 쪽(fall) · 막는 쪽(block/sweep/grab). 원화 = pick/en_<id>.png, 칸 = enemy_motion_spec 크기
E_DIVE = {'fast': 'dash', 'ghost': 'fly', 'bat': 'fly', 'boss_bat': 'fly'}
E_GUARD = ['normal', 'tough', 'zombie', 'skeleton', 'miniboss']
E_T = {
    'fall': '{who} trips, stumbles forward and falls flat on its face, lies there for a moment, then scrambles back up to the start pose',
    'fall_fly': '{who} is yanked down out of the air, drops onto the ground on its belly, then floats back up into the start pose',
    'block': T['block'], 'sweep': T['sweep'],
    'grab': '{who} jumps up and reaches high with its hands, grabs at the air above and yanks down hard to the ground, then returns to the start pose',
}


def e_jobs():
    for e in E_GUARD:
        for m in ('block', 'sweep', 'grab'): yield (e, m)


def e_action(eid, m, who_):
    t = E_T['fall_fly'] if m == 'fall' and E_DIVE.get(eid) == 'fly' else E_T[m]
    return t.format(who=who_) + '. ' + COMMON
