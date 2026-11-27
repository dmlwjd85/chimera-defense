# 이야기 키메라 7종 주문서(recipes.json) — 다시 뽑지 않게 여기서만 고친다. (주문서 B4 "이야기 키메라 전투 동작 시트")
# 예전 벡터 부위판 그림 → PixelLab 한 몸 그림·7동작. id = recipes.json id(게임 speciesId)
# id: (이름, 부모, 몸 설명, 기본공격, 강타, 기술, 나는가)
S = {
 'bear_tiger': ('곰범', ['bear', 'tiger'], "a brown bear with orange-and-black tiger stripes on its back and legs and a green leaf headband, calm proud face",
     'swipes forward with a heavy striped paw, then returns to the start pose',
     'rears up on its hind legs and smashes down with both front paws, then returns to the start pose',
     'sits and munches happily on a garlic bulb held in both paws, then returns to the start pose', False),
 'wolf_in_sheep': ('양의 탈을 쓴 늑대', ['wolf', 'bighorn'], "a grey wolf wearing a fluffy white sheep fleece costume over its back and a little sheep hood with curled cream horns, sly yellow eyes peeking out",
     'lunges forward and bites, then returns to the start pose',
     'throws off the fleece hood and pounces forward with both front claws, then lands back in the start pose',
     'pulls the sheep hood down over its eyes and grins innocently, then returns to the start pose', False),
 'jackalope': ('재칼로프', ['rabbit', 'bighorn'], "a tan jackrabbit with small branching deer antlers, long ears and a white cotton tail, cheeky face",
     'lowers its head and butts forward with its antlers, then hops back to the start pose',
     'hops high and stomps down with both hind feet, then returns to the start pose',
     'stands on its hind legs and sways side to side as if singing, then returns to the start pose', False),
 'thunderbird': ('썬더버드', ['crow', 'eagle'], "a big dark blue eagle-crow bird with a hooked yellow beak, sharp talons and bright yellow zigzag patterns on its wings",
     'swoops down and strikes forward with its talons, then flies back to the start pose',
     'beats its huge wings hard once and dives forward beak first, then flies back to the start pose',
     'spreads its wings as wide as possible and screeches with its beak open, then folds back to the start pose', True),
 'phoenix': ('봉황', ['rooster', 'eagle'], "a red and gold rooster-eagle bird with a red comb, a hooked golden beak and very long flowing orange-gold tail plumes",
     'swoops down and pecks forward hard with its beak, then flies back to the start pose',
     'beats its wings and kicks forward with both talons, then flies back to the start pose',
     'spreads its wings and long tail plumes wide like a fan, holding its head high, then returns to the start pose', True),
 'cheese_thief': ('치즈 도둑', ['fox', 'crow'], "an orange fox with black crow wings on its back, holding a yellow wedge of cheese in its mouth, mischievous eyes",
     'swoops forward and swipes with a front paw, then flies back to the start pose',
     'dives forward and kicks with both hind legs, then flies back to the start pose',
     'flutters in place, tosses the cheese up and catches it again in its mouth, then returns to the start pose', True),
 'bullfrog': ('황소개구리', ['bison', 'frog'], "a big round green frog with curved bison horns and a shaggy brown mane on its head, wide mouth, big eyes",
     'shoots out its long tongue forward and slaps the enemy, then returns to the start pose',
     'leaps forward and belly-slams down hard, then returns to the start pose',
     'puffs its throat and belly up round like a balloon, then deflates back to the start pose', False),
}
ORDER = list(S)


def gemini_prompt():
    lines = [f"{i + 1}. {S[k][2]}" + (' (flying)' if S[k][6] else '') for i, k in enumerate(ORDER)]
    return ("Generate an image. Draw a character sheet of 7 cute legendary chimera animals for a fantasy game, in a 4 columns × 2 rows grid on a plain white background. "
            "Style: high quality chibi pixel art like a famous anime/game illustration — big head, big glossy eyes, big paws, thick dark brown outline, 2-3 tone cel shading, vivid colors. "
            "Each chimera is ONE natural animal body that blends both parents (not two animals glued together, not humanoid). "
            "Every character faces right in three-quarter side view, full body, the same size, well separated with lots of white space between them. "
            "Write only a small number under each character, no title, no other text. " + " ".join(lines))


if __name__ == '__main__':
    print(gemini_prompt())
