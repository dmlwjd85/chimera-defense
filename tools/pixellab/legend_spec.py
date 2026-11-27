# 전설(기적 합성) 키메라 6종 주문서 — 다시 뽑지 않게 여기서만 고친다. (2026-11-28 사용자 "전설키메라 진행" → "픽셀랩으로")
# 제미나이 밑그림 없이 PixelLab generate-image-v2로 바로: 스타일 = 아군 성체 호랑이, 색 = 두 부모 성체 원화(final/<부모>_adult.png)
# 시트 이름 = auto_<짝>(recipes id), 동작은 chimera_motion_spec가 이 표를 읽음. 사람형 아님(한 몸 동물), 오른쪽을 봄
# id: (이름, 부모, 몸 설명(한 몸), 기본공격, 강타, 기술)
L = {
 'bison_eagle': ('그리핀', ['bison', 'eagle'], "a brown bison body with a shaggy mane, short black horns and a golden eagle head with a hooked yellow beak, big brown eagle wings folded on its back, eagle talons on the front legs",
     'snaps forward with its hooked beak, then returns to the start pose',
     'spreads its big wings, hops up and slams down with its talons, then folds its wings back to the start pose',
     'flaps its big wings hard trying to lift its heavy body, rises a tiny bit off the ground, then drops back to the start pose'),
 'eagle_frog': ('케찰코아틀', ['eagle', 'frog'], "a round green frog with a crest of long colorful feathers on its head, small feathered wings on its back and a feathered tail, big golden eyes",
     'opens its mouth and flicks its pink tongue straight forward in a short horizontal line toward the enemy in front of it, then pulls it back in, back to the start pose',
     'crouches, leaps forward with its wings spread and belly-flops down, then hops back to the start pose',
     'puffs out its throat sac and sings, its head feathers fanning open, then returns to the start pose'),
 'eagle_monkey': ('가루다', ['eagle', 'monkey'], "a brown monkey with big brown eagle wings on its back, a small eagle-like golden crest of feathers on its head and eagle talon feet, a long curled monkey tail",
     'swings forward and punches with one long arm, then returns to the start pose',
     'flaps its wings, hops up and dives down kicking with its talon feet, then lands back in the start pose',
     'flaps its wings proudly and hovers a little while peeling and eating a banana, then lands back in the start pose'),
 'ant_monkey': ('아난시', ['ant', 'monkey'], "a small brown monkey with a red ant's shiny segmented body, six thin ant legs, two long antennae and a curled monkey tail, a clever grin",
     'jabs forward with two front legs, then returns to the start pose',
     'rears up on its back legs and drums down with four front legs, then returns to the start pose',
     'stands up and claps many legs together happily with a sly grin, then returns to the start pose'),
 'fox_grasshopper': ('구미호 나비', ['fox', 'grasshopper'], "an orange fox with nine thin translucent green grasshopper wings fanned out behind it like tails, long grasshopper antennae and slender grasshopper hind legs",
     'pounces forward and swipes with a front paw, then returns to the start pose',
     'leaps forward on its long hind legs and kicks with both of them, then lands back in the start pose',
     'fans its nine wings open wide and rubs its legs to sing with closed eyes, then folds back to the start pose'),
 'ant_bear': ('불가사리', ['ant', 'bear'], "a black moon bear covered in shiny reddish iron-like ant armor plates, two ant antennae and big ant jaws, chewing on a small iron spoon",
     'bites forward with its big ant jaws, then returns to the start pose',
     'rears up and slams down with both armored front paws, then returns to the start pose',
     'happily chews and swallows the iron spoon, its belly glowing a little, then pats its belly and returns to the start pose'),
}
