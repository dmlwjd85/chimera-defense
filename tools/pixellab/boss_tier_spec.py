# 어려운 난이도 보스 단계 그림 주문서 — 다시 뽑지 않게 여기서만 고친다.
# 2026-11-27 사용자: "어려운 난이도 스테이지 보스는 몇 개 더 무섭게 단계별로 그려서 넣어"
#   + "노멀 하드 신계모드 몬스터는 다시 그리지 말고 무기·피부·테두리·후광 색깔로 구별" → 졸병은 코드 색, 보스만 새로 그림.
# 단계: 1 = 하드(성난 모습), 2 = 하드코어·신계(깨어난 마왕 모습). 노멀은 지금 그림 그대로.
# 같은 보스로 읽혀야 함(실루엣·소품 유지) + 단계마다 더 크고 날카롭고 어두워짐. 몸 밖 이펙트(빛·연기·불꽃 무리)는 그리지 않음.
BASE = {
 'boss_boar': 'a huge upright black-brown boar king in heavy gold-and-iron armor plates, a small gold crown, very long ivory tusks, spiky mane, huge fists',
 'boss_bat': 'a round purple bat king with a small gold crown and a red collar, huge bat wings spread like a cape, flying',
 'boss_shadow': 'a hulking living shadow giant of dark purple smoke with one silver armored shoulder and one silver gauntlet, mossy twig antlers, lower body fading into smoke',
 'boss_bone': 'a skeleton general in blue steel armor with a horned helmet, a tattered red cape and a big curved sword',
 'boss_frost': 'an icy ghost king in a translucent pale blue robe fading into mist, a frosty beard, an ice crystal crown and an ice staff',
 'boss_lich': 'a skull-faced crow priest with a dark green hood and purple robe, a crooked wooden staff topped with a violet orb',
 'boss_lava': 'a hulking giant of cracked dark grey basalt rocks with orange lava lines in the cracks, a small volcano cone on its back, huge rock fists',
 'boss_witch': 'a hunched green-skinned swamp witch in a ragged mossy hooded cloak with a frog on her hood, holding a staff with a small black cauldron hanging from it',
 'boss_knight': 'a headless knight in dark purple-black plate armor and a tattered cape, carrying its horned helmet under one arm, holding a long sword',
 'boss_gate': 'two stocky pink horned demon twins standing shoulder to shoulder, each holding one half of a huge iron double-door shield with purple runes',
 'boss_mole': 'a huge chubby brown mole king on two legs with a small gold crown, an armored metal snout and huge crystal-studded digging claws',
 'overlord': 'a skull-faced demon overlord with big curved ram horns, a spiky silver crown, black-and-silver armor with purple runes, a tattered crimson cape and a scythe staff',
}
T1 = ('ENRAGED form (hard mode): the same boss, same outfit and props, but angrier and tougher: glowing red eyes, a furious snarl, '
      'extra spikes and spiked armor pieces, battle scars, darker and redder colors, a bigger and more jagged weapon')
T2 = ('AWAKENED DEMON form (hardest mode): the same boss, same outfit and props, but transformed into a terrifying demon lord version: '
      'bigger and taller, a crown of black horns, cracked dark skin or armor with glowing crimson lines inside the cracks, four glowing eyes, '
      'black-and-crimson colors with gold trim, a huge menacing weapon; still chibi and readable, not gory')
SP = {   # 보스마다 단계에 더할 것
 ('boss_boar', 1): 'tusks capped with iron spikes, a war banner on its back', ('boss_boar', 2): 'molten-gold tusks, a horned iron helmet over the crown',
 ('boss_bat', 1): 'torn ragged wings with hooked claws, red fangs', ('boss_bat', 2): 'two extra smaller wings, a dark crimson body, a spiked crown',
 ('boss_shadow', 1): 'the silver armor becomes black spiked armor, thorny antlers', ('boss_shadow', 2): 'a huge crimson eye in the chest, twisted black antlers',
 ('boss_bone', 1): 'a cracked red-edged sword, a ripped black cape', ('boss_bone', 2): 'a second skull on the shoulder, a giant two-handed bone sword',
 ('boss_frost', 1): 'jagged icicle spikes on the robe and crown', ('boss_frost', 2): 'a dark blue-black robe, a crown of black ice horns, an ice scythe',
 ('boss_lich', 1): 'a cracked crow mask with red eyes, black feathers on the shoulders', ('boss_lich', 2): 'three crow skulls on the staff, huge black feathered wings folded on its back',
 ('boss_lava', 1): 'a bigger solid rock cone on its back, spiky obsidian shoulders', ('boss_lava', 2): 'black obsidian body with crimson cracks, two volcano cones like horns',
 ('boss_witch', 1): 'a bigger cauldron, a crooked crown of thorns on the hood', ('boss_witch', 2): 'four long clawed arms, a frog skull on the hood, a black cauldron staff',
 ('boss_knight', 1): 'red glowing helmet eyes, spikes on the armor', ('boss_knight', 2): 'a burning-red cape, a giant black greatsword, horned pauldrons',
 ('boss_gate', 1): 'spiked iron door shields, bigger horns', ('boss_gate', 2): 'dark crimson skin, the door shields have a demon face, crowns of black horns',
 ('boss_mole', 1): 'bigger drill-like claws, a spiked helmet snout', ('boss_mole', 2): 'six crystal-studded claws, a dark crimson body, a huge drill crown',
 ('overlord', 1): 'a larger crown of black horns, a blood-red cape, glowing red runes', ('overlord', 2): 'four horns, six glowing eyes, giant black wings, a huge two-bladed scythe',
}
ORDER = list(BASE)


def desc(k, tier):
    return f"{BASE[k]}. {T1 if tier == 1 else T2}: {SP[(k, tier)]}."


def gemini_prompt(ids, tier):
    lines = [f"{i + 1}. {BASE[k]}, plus {SP[(k, tier)]}." for i, k in enumerate(ids)]
    return ("Generate an image. Draw a character sheet of " + str(len(ids)) + " boss monsters of a cute-but-menacing demon army for a fantasy game, "
            "in a 3 columns × 2 rows grid on a plain white background. Style: high quality chibi pixel art like a famous anime/game illustration — "
            "big head, big hands and feet, thick dark brown outline, 2-3 tone cel shading, vivid colors. Each boss faces right in three-quarter side view, "
            "full body, well separated with lots of white space. No glow aura, smoke or flames floating around the body. "
            "Write only a small number under each boss, no title, no other text. All of them are drawn in their " + (T1 if tier == 1 else T2) + ". " + " ".join(lines))


if __name__ == '__main__':
    for t in (1, 2):
        for g in (ORDER[:6], ORDER[6:]): print(t, gemini_prompt(g, t), '\n')
