# 새 보스 5종 주문서(스테이지 7~11) — 다시 뽑지 않게 여기서만 고친다. (handoff/키메라_이미지작업창_주문서.md B2)
# 같은 글로 제미나이 밑그림 · PixelLab 원화(run_enemy.py 틀, 128칸) · 동작(enemy_motion_spec 틀, 176칸)을 주문한다.
# 효과 이름(연기·불꽃·불티)은 쓰지 않는다 — 쓰면 PixelLab이 덧그림.
B2 = {
 'boss_lava': ('용암 바위 거인',
   "Lava Rock Giant (stage 7 boss): a hulking giant made of cracked dark grey basalt rocks with glowing orange lava lines in the cracks, a small volcano cone on its back with orange lava at its top, huge rock fists, short thick legs.",
   'a big chibi rock giant of cracked dark grey stone with thin orange lines in the cracks; the cone on its back is solid rock and never changes',
   'pulls back one huge rock fist and throws a heavy straight punch forward, leaning its whole body into it, then returns to the start pose',
   'raises both rock fists high over its head and slams them down on the ground in front of it, then returns to the start pose'),
 'boss_witch': ('안개 늪의 마녀',
   "Swamp Witch (stage 8 boss): a hunched green-skinned old witch in a ragged mossy green hooded cloak, a long crooked nose, a frog sitting on top of her hood, holding a gnarled staff with a small black cauldron hanging from its top.",
   'a big chibi green swamp witch in a mossy hooded cloak with a frog on her hood, holding a staff with a small cauldron hanging from its top',
   'swings the cauldron staff forward and bonks it on the enemy in front of her, then returns to the start pose',
   'raises the cauldron staff high with both hands and stirs the air in a circle, cloak sways, then lowers it back to the start pose'),
 'boss_knight': ('그믐의 해골 기사',
   "Headless Skeleton Knight (stage 9 boss): a tall headless knight in dark purple-black plate armor and a tattered dark cape, carrying its own horned helmet under one arm with two violet glowing eyes inside the helmet, holding a long straight sword in the other hand.",
   'a big chibi headless knight in dark purple-black armor and a tattered cape, carrying its horned helmet under one arm, holding a long sword',
   'swings the long sword in a wide horizontal slash in front of it, the cape flaps, then returns to the start pose',
   'raises the carried helmet high with one arm as if showing it to the enemy, then lowers it back to the start pose'),
 'boss_gate': ('마계 문지기',
   "Demon Gatekeepers (stage 10 boss): two identical stocky pink-skinned horned demon twins standing shoulder to shoulder as one team, each holding one half of a huge iron double-door shield in front of them so the two halves form a gate, glowing purple runes on the doors.",
   'two big chibi pink horned demon twins standing shoulder to shoulder, each holding one half of a huge iron double-door shield',
   'both twins step forward together and shove the door shield into the enemy in front of them, then step back to the start pose',
   'both twins plant the door shield firmly on the ground and brace behind it, then return to the start pose'),
 'boss_mole': ('땅굴 대왕',
   "Tunnel King (stage 11 boss): a huge chubby brown mole king on two legs with a small gold crown, an armored metal snout like a helmet, tiny squinting eyes, enormous digging claws studded with blue crystals.",
   'a big chibi chubby brown mole king with a small gold crown, an armored metal snout and huge crystal-studded digging claws',
   'swipes forward with one huge crystal-studded claw, then returns to the start pose',
   'crouches and digs furiously at the ground in front of it with both claws, then stands back to the start pose'),
}
ORDER = list(B2)


def gemini_prompt():
    lines = [f"{i + 1}. {B2[k][1]}" for i, k in enumerate(ORDER)]
    return ("Generate an image. Draw a character sheet of 5 boss monsters of a cute demon army for a fantasy game, in a 3 columns × 2 rows grid on a plain white background. "
            "Style: high quality chibi pixel art like a famous anime/game illustration — big head, big glossy eyes, big hands and big feet, thick dark brown outline, 2-3 tone cel shading, vivid colors. "
            "Menacing but cute and casual, never gory, each with a distinctive readable silhouette and glowing purple eyes or purple runes. "
            "Every boss faces right in three-quarter side view, full body, the same size, well separated with lots of white space between them. "
            "Write only a small number under each boss, no title, no other text. " + " ".join(lines))


if __name__ == '__main__':
    print(gemini_prompt())
