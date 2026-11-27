# 자동 키메라(같은 강 짝)·돌연변이 슬라임 동작 주문서 — 다시 뽑지 않게 여기서만 고친다. (docs/동작_주문_규칙.md, handoff/키메라_이미지작업창_주문서.md A1·A2)
# 원화: pick/ch_<id>.png (제미나이 밑그림 → PixelLab generate-image-v2, 스타일 = 아군 성체 호랑이, 색 = 두 부모 성체), 오른쪽을 봄(아군)
# 쓰는 법(작업 자리): python3 run_chimera_motions.py <id,id|all> [동작,..]  → anim/ch_<id>_adult_<동작>/
# 적 동작에서 배운 것: 문장에 효과 이름(불꽃·연기·자국…)을 넣지 않는다(오히려 그림). 맞기 첫 장 번쩍임은 DROP 표로 뺀다.

COMMON = ("Side view facing right. Same character, same colors, same size and proportions in every frame; "
          "feet stay on the same ground line unless jumping. No projectiles, no background, no props added.")

# id: (몸 설명, 캔버스, 기본1, 기본2(강타), 기술)
C = {
 'slime': ('a chibi grey-green jelly slime blob with two dopey eyes and two round grey spots', 96,
           'squashes down, then bounces forward and bumps the enemy in front of it with its whole jelly body, then wobbles back to the start pose',
           'stretches up tall, then slams down flat with a big splat in front of it, then reforms to the start pose',
           'jiggles side to side and puffs up round like a balloon, then deflates back to the start pose'),
 'ant_grasshopper': ('a chibi red ant with long green grasshopper hind legs and a tiny violin on its back', 128,
           'bites forward with its big ant jaws, then returns to the start pose',
           'crouches on its long grasshopper legs, leaps forward and kicks with both hind legs, then lands back in the start pose',
           'stands up, plays the tiny violin with a happy face, swaying, then returns to the start pose'),
 'fox_tiger': ('a chibi striped fox-tiger with a fox face and bushy tail', 128,
           'swipes forward with a striped front paw, then returns to the start pose',
           'crouches, pounces forward and slams down with both front paws, then steps back to the start pose',
           'puffs out its chest and raises its chin proudly, tail held high, then returns to the start pose'),
 'rabbit_tiger': ('a chibi small tiger with long rabbit ears and a round fluffy tail', 128,
           'hops forward and swats with a front paw, then hops back to the start pose',
           'jumps up high and stomps down with both hind feet, then returns to the start pose',
           'ears perk straight up, it shakes nervously, then hops in place twice and returns to the start pose'),
 'dog_wolf': ('a chibi grey wolf-dog with a red collar and a curled tail', 128,
           'lunges forward and bites, then returns to the start pose',
           'charges forward and tackles with its shoulder, then steps back to the start pose',
           'sits, raises its head and howls with its mouth open, tail wagging, then returns to the start pose'),
 'crow_rooster': ('a chibi black crow-rooster bird with a red comb and long black tail feathers', 128,
           'pecks forward hard with its beak, then returns to the start pose',
           'flaps its wings, jumps and kicks forward with both clawed feet, then lands back in the start pose',
           'puffs up its chest, flaps its wings wide and crows loudly with its beak wide open, then returns to the start pose'),
 'bear_monkey': ('a chibi brown bear-monkey with a monkey face, long arms and a curly tail', 128,
           'swings one long arm forward in a punch, then returns to the start pose',
           'rears up on its hind legs and smashes down with both long arms, then returns to the start pose',
           'pounds its chest with both fists happily, then returns to the start pose'),
 'bighorn_bison': ('a chibi brown bison with curled ram horns and short bison horns', 128,
           'lowers its head and butts forward with its horns, then steps back to the start pose',
           'paws the ground, charges forward and rams hard with its horns, then steps back to the start pose',
           'shakes its shaggy head and stamps its front hooves, snorting, then returns to the start pose'),
 'fox_wolf': ('a chibi grey wolf with a big fluffy orange fox tail and orange ear tips', 128,
           'lunges forward and bites, then returns to the start pose',
           'leaps forward and slashes with both front claws, then lands back in the start pose',
           'sweeps its fluffy tail around itself and grins slyly, then returns to the start pose'),
}
# 2순위 27종: 몸·공격·기술 문장은 chimera2_spec.py 한 곳에서 관리
from chimera2_spec import C2
C.update({k: ('a chibi ' + v[2].split(' ', 1)[1], 128, v[3], v[4], v[5]) for k, v in C2.items()})
# 이야기 키메라 7종(recipes.json id 그대로): story_spec.py 한 곳에서 관리. 나는 셋은 걷기 대신 날갯짓
from story_spec import S
C.update({k: ('a chibi ' + v[2].split(' ', 1)[1], 128, v[3], v[4], v[5]) for k, v in S.items()})
STORY = set(S)
FLY = {k for k, v in S.items() if v[6]}

FRAMES = {'idle': 4, 'walk': 8, 'a1': 8, 'a2': 8, 'el': 8, 'hit': 4, 'down': 8}
LAST = {'idle', 'walk'}
MOTIONS = ['idle', 'walk', 'a1', 'a2', 'el', 'hit', 'down']


def action(cid, m):
    who, can, a1, a2, el = C[cid]
    if m == 'idle': t = (f'{who} hovering in the air, wings flapping slowly, eyes blink once' if cid in FLY else f'{who} standing still, eyes blink once')
    elif m == 'walk': t = (f'{who} hopping forward, the jelly body squishes and stretches' if cid == 'slime' else
                           f'{who} flapping its wings and flying forward, bobbing up and down' if cid in FLY else f'{who} walking forward with a steady gait')
    elif m == 'a1': t = f'{who} {a1}'
    elif m == 'a2': t = f'{who} {a2}'
    elif m == 'el': t = f'{who} {el}'
    elif m == 'hit': t = f'{who} gets hit: the whole body flinches backward with a pained squint, then recovers to the start pose'
    elif cid in FLY: t = f'{who} gets knocked out of the air, tumbles and falls flat on the ground, eyes shut, lies still'
    else: t = (f'{who} melts and flattens into a jelly puddle with its eyes still on top, lies still' if cid == 'slime' else
               f'{who} gets knocked out: legs give way, ends lying flat on its side, eyes shut, completely still')
    return t + '. ' + COMMON


def jobs(ids):
    return [(c, m) for c in ids for m in MOTIONS]


# 장 빼기(검수 2026-11-27): (id, 동작): [f01부터 0인 번호] — 덧그린 흰 별·자국·먼지가 있는 장만 뺌
DROP = {
    ('slime', 'a2'): [4, 5, 6],
    # 2순위 27종(2026-11-27 검수): 덧그린 표식·흰 자국이 있는 장
    ('bear_bighorn', 'hit'): [2, 3], ('bear_bison', 'hit'): [0, 1], ('bear_rabbit', 'a1'): [3], ('bear_wolf', 'a1'): [1, 2, 3],
    ('bighorn_dog', 'el'): [3, 4, 5], ('bighorn_dog', 'down'): [0, 1], ('bighorn_monkey', 'a1'): [3, 4], ('bighorn_monkey', 'hit'): [0, 1],
    ('bison_fox', 'hit'): [0], ('bison_rabbit', 'down'): [1, 2], ('bison_tiger', 'hit'): [0, 1], ('bison_wolf', 'el'): [2, 3, 4], ('bison_wolf', 'hit'): [0, 1], ('fox_tiger', 'hit'): [1], ('bear_monkey', 'a1'): [3, 4], ('bighorn_bison', 'hit'): [0, 2, 3],
}
