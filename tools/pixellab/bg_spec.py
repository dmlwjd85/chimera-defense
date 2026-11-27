# 스테이지 배경 주문서(제미나이, 2026-11-27 사용자 "배경은 제미나이로") — 다시 뽑지 않게 여기서만 고친다.
# 구도는 지금 bg-forest-1과 같음: 왼쪽 끝 아군 성문, 오른쪽 끝 마계 포털, 가운데 아래 절반은 비어 있는 평평한 땅(동물·적이 서는 곳)
COMMON = ("Generate an image. A wide 16:9 2D side-view battle stage background for a cute fantasy pixel-art game, "
          "high quality pixel art like a famous anime/game illustration, rich detail, clean pixels, vivid colors. "
          "Composition: the horizon sits at about 40% from the top; the lower 60% is a wide, flat, open ground area seen from a slightly elevated side view, "
          "completely empty in the middle so characters can stand and fight on it. "
          "At the far left edge, a small grey stone castle gate with a wooden door and a torch. "
          "At the far right edge, a jagged dark purple demon portal of black rocks and twisted roots with a swirling violet vortex. "
          "No characters, no animals, no people, no monsters, no text, no UI, no frame, no watermark. Scene: ")
S = {
 'forest-1': ('숲 어귀', "a sunny morning meadow at the edge of an enchanted forest, big round green trees, rolling hills and fluffy clouds, grass with little wildflowers"),
 'forest-2': ('비 오는 습지', "a rainy green wetland: reeds, puddles reflecting the grey sky, misty willow trees, soft rain, wet mossy grass ground"),
 'forest-3': ('달밤의 산길', "a moonlit mountain path at night: a big full moon, starry sky, dark pine trees, silvery grass and fireflies, cool blue night light"),
 'stage-4': ('메마른 고원', "a dry windy highland plateau: golden dry grass, cracked earth patches, red mesa cliffs and a few acacia trees far away, warm afternoon sun"),
 'stage-5': ('얼어붙은 호수', "a frozen lake in winter: the flat ground is snow and thick blue ice, snowy pine trees, icy mountains, pale blue sky with light snowfall"),
 'stage-6': ('폭풍의 묘지', "a stormy graveyard at dusk: old tilted tombstones at the far back, dead trees, dark storm clouds with lightning far away, dark grass ground"),
 'stage-7': ('불의 산 기슭', "the foot of a volcano: black volcanic rock ground with glowing orange lava cracks, a smoking volcano far behind, red-orange sky with ash clouds"),
 'stage-8': ('안개 늪', "a foggy swamp: thick white fog, twisted mangrove trees with hanging moss, green murky pools at the back, mossy muddy ground, eerie green light"),
 'stage-9': ('달 없는 묘지', "a moonless graveyard at midnight: crooked tombstones and a ruined chapel far back, bare black trees, pale blue will-o-wisps far away, very dark starry sky"),
 'stage-10': ('마계의 문턱', "the threshold of the demon realm: cracked purple stone ground with glowing violet runes, floating rocks and broken demonic pillars far back, crimson and purple sky"),
 'stage-11': ('땅속 길', "an underground cave tunnel: rocky cave ground, glowing blue crystals on the cave walls, wooden mine supports and a mine cart track far back, warm lantern light"),
 'stage-12': ('지구의 심장', "the heart of the earth deep underground: a vast glowing cavern, a giant glowing red-gold crystal core far in the back, magma rivers, dark rock ground with golden glowing veins"),
}


def prompt(k):
    return COMMON + S[k][1] + '.'


if __name__ == '__main__':
    import sys
    for k in (sys.argv[1:] or S): print(k, prompt(k), '\n')
