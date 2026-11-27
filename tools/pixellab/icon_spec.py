# 모바일 설치 아이콘(PWA) 시안 주문서 — 2026-11-27 사용자 "모바일 설치 아이콘 다시 그려줘. 시안 3개"
# 제미나이 정사각 그림 → 512·192·maskable(가운데 80% 안전 영역)·apple-touch·favicon 으로 자름
COMMON = ("Generate an image. A square mobile game app icon, full-bleed square artwork filling the whole canvas edge to edge (no rounded corners, no border, no frame), "
          "high quality chibi pixel art like a famous anime/game illustration: thick dark brown outline, 2-3 tone cel shading, vivid colors, clean pixels. "
          "Bold simple silhouette that reads clearly even when very small, the main subject centered and filling the middle 70% of the square. No text, no letters, no logo, no watermark. ")
S = {
 'A': "A heroic chibi orange tiger cub face and front paws bursting forward toward the viewer, determined big glossy eyes, in front of a glowing blue-green planet Earth, deep navy night sky with a few stars, a small swirling purple demon portal in the corner.",
 'B': "A chibi fox-tiger chimera (fox face and bushy tail with orange tiger stripes) standing proudly in front of a small grey stone castle gate with torches, a swirling purple demon portal glowing in the dark purple sky behind, warm golden rim light.",
 'C': "Three chibi animal heroes - an orange tiger, a red fox and a black crow - standing together on top of a small round glowing planet Earth like a tiny world, facing a swirling purple demon portal in the dark starry sky, epic but cute.",
}
def prompt(k): return COMMON + S[k]
if __name__ == '__main__':
    for k in S: print(k, prompt(k))
