# 무릉도원(동산 꾸미기) 주문서 — 다시 뽑지 않게 여기서만 고친다. (2026-11-27 밤 사용자 "무릉도원 꾸미기 기능", 배경 "동양 무릉도원")
# 1) 배경: 제미나이 밑그림(노트북 내장 브라우저) → 시안 3장 → 고른 것을 gemini_bg_wm.py로 워터마크 지움 → 1280×720
# 2) 소품: PixelLab generate-image-v2, 스타일 = 아군 성체 호랑이(style_2.png), 3/4 앞모습, 땅에 놓이는 물건
BG = ("Generate an image. A wide 16:9 2D background for a cute fantasy pixel-art game, high quality pixel art like a famous anime/game illustration, "
      "rich detail, clean pixels, soft pastel colors. An East Asian paradise garden 'Mureung-dowon' (peach blossom paradise): "
      "pink peach blossom trees, misty layered mountains with clouds far behind, a clear stream with a small waterfall, gentle golden light. "
      "Composition: the horizon sits at about 38% from the top; the lower 62% is a wide, gently grassy open meadow seen from a slightly elevated side view, "
      "mostly empty in the middle so small animals can walk around and props can be placed on it. A few petals floating. "
      "No characters, no animals, no people, no buildings in the middle, no text, no UI, no frame, no watermark. Variant: ")
BG_VAR = {
 'a': "spring morning, pink peach blossoms everywhere, soft blue sky",
 'b': "late afternoon golden hour, warm sunlight through peach blossoms, long soft shadows",
 'c': "dreamy misty dawn, pale pink and lavender mist over the mountains, sparkling stream",
}
STYLE = ("Pixel art in exactly the same style as the style image: thick dark brown outline, 2-3 tone cel shading, bright saturated pastel colors, clean pixels. "
         "Seen from the front at a slight top-down three-quarter angle, standing on the ground. Centered, filling most of the canvas, "
         "no background, no ground tile, no characters, no animals, no text.")
# id: (이름, 너비, 높이, 설명)
P = {
 'pavilion': ('정자', 160, 144, 'A small traditional Korean wooden pavilion (jeongja) with a curved tiled roof, red wooden pillars and a raised wooden floor'),
 'peach':    ('복숭아나무', 144, 160, 'A small round peach tree full of pink peach blossoms and a few ripe pink peaches, short brown trunk'),
 'pond':     ('연못', 160, 96, 'A small round garden pond with clear blue water, pink lotus flowers and green lily pads, edged with smooth grey stones'),
 'lantern':  ('석등', 64, 112, 'A traditional grey stone garden lantern with a warm glowing light inside its little window'),
 'flowers':  ('꽃밭', 112, 72, 'A small patch of colorful flowers: pink, yellow and white blossoms with green leaves'),
 'bridge':   ('돌다리', 160, 96, 'A small arched grey stone bridge with low railings, the kind that crosses a garden stream'),
}
# 노트북(제미나이)이 없을 때 대안: PixelLab 배경 688×384(16:9 최대) → 2배 = 1376×768에서 1280×720으로 자름
BG_PL = ("A wide side-view pixel art game background of an East Asian peach blossom paradise garden (Mureung-dowon): "
         "pink peach blossom trees on both sides, misty layered green mountains with white clouds far behind, a small waterfall and clear stream at the back, "
         "soft golden morning light. The lower 60% is a wide open flat grassy meadow with tiny flowers, empty in the middle for characters to walk. "
         "Same pixel style as the style image: dark outlines, cel shading, bright pastel colors. No characters, no animals, no buildings, no text.")
BG_PL_VAR = {'a': 'spring morning, soft blue-cream sky', 'b': 'late afternoon golden hour, warm orange-pink sky and long soft shadows', 'c': 'dreamy misty dawn, pale pink and lavender mist, sparkling stream'}
