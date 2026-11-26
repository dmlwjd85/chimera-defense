# 키메라 7종 PixelLab 원화 주문서 (2026-11-26)
# 순서: 1) 제미나이 밑그림(아래 GEMINI_PROMPT, 아군 성체 원화를 붙여 넣고 7칸 한 장) → 칸마다 잘라 chimera/gref_<id>.png
#       2) PixelLab: 스타일 = 아군 성체 호랑이(style_2.png), 모양 = 제미나이 칸(shape_pose), 색 = 두 재료 동물 성체(color_material_light_only)
#       3) 오른쪽을 보는 후보를 사람이 고름 → 16색·외곽선 #291a1f·외딴 점 0 정리(clean_enemy.py와 같은 방식)
#       4) 실루엣 검사: 재료 두 동물의 부위가 검은 실루엣에서 먼저 읽혀야 함(동글동글한 한 마리처럼 보이면 불합격)
# 작업 자리(PixelLab 작업 폴더)에서: PIXELLAB_API_TOKEN=... python3 run_chimera.py cheese_thief bear_tiger ...
# 토큰은 환경변수에서만(파일·대화에 적지 않음).
import sys, subprocess

COMMON = ("A chimera hero of the animal alliance, drawn in exactly the same chibi casual pixel-art style as the style image: "
          "big head, big glossy eyes, big hands and feet, thick dark outline, 2-3 tone cel shading, same brightness and vividness as the style image. "
          "Clearly a mix of two animals: the parts of BOTH animals must be readable in the silhouette, not one round cute animal. "
          "Proud and a little funny, a fairy-tale creature. Facing right in three-quarter side view, full body, ready to fight. "
          "No background, no ground shadow, no text.")

# id: (w, h, 설명, 재료 두 종, 나는가)
C = {
 'cheese_thief': (88, 88, "Cheese Thief (fox + crow): an orange fox head and body with big pointed fox ears and a fluffy fox tail, "
                  "but with big glossy black crow wings spread open and black crow feathers on the tail tip and chest. "
                  "It holds a wedge of yellow cheese in its mouth, sly grin. Flying in the air.", ('fox', 'crow'), True),
 'bear_tiger':   (104, 96, "Bear-Tiger (bear + tiger, from the Korean Dangun myth): a big bulky brown bear body on four legs with round bear ears and a bear snout, "
                  "covered in bold orange-and-black tiger stripes on its back and legs, a long striped tiger tail, "
                  "a small sprig of green mugwort tucked behind one ear.", ('bear', 'tiger'), False),
 'wolf_in_sheep':(96, 88, "Wolf in Sheep's Clothing (wolf + bighorn sheep): a grey wolf wearing a fluffy white sheep fleece costume like a hood and coat, "
                  "the hood has big curled bighorn ram horns, the wolf's long snout, sharp grin and bushy grey tail stick out of the costume. Four legs.", ('wolf', 'bighorn'), False),
 'bullfrog':     (104, 88, "Bull-Frog (bison + frog): a huge round green frog with a big pale throat sac and webbed feet, "
                  "with a shaggy dark brown bison mane over its shoulders and a hump, and two short curved bison horns on its head. Squatting, ready to jump.", ('bison', 'frog'), False),
 'jackalope':    (80, 88, "Jackalope (rabbit + bighorn sheep): a white rabbit with very long ears and a fluffy round tail, "
                  "with a pair of big curled brown ram horns growing from its head between the ears, strong hind legs, hopping stance.", ('rabbit', 'bighorn'), False),
 'thunderbird':  (104, 96, "Thunderbird (crow + eagle): a big eagle shape with a hooked yellow eagle beak and big eagle talons, "
                  "but with glossy black-blue crow plumage, wide wings spread with bright yellow zigzag lightning-shaped feather tips. Flying in the air.", ('crow', 'eagle'), True),
 'phoenix':      (104, 104, "Phoenix (rooster + eagle, the bonghwang): a rooster head with a big red comb and wattles, "
                  "wide eagle wings and eagle talons, very long flowing tail feathers in red, gold and green like a rooster's tail. Flying in the air.", ('rooster', 'eagle'), True),
}

GEMINI_PROMPT = ("붙여 넣은 그림(우리 동물 영웅들)과 똑같은 그림체로, 두 동물이 섞인 키메라 7마리를 한 장에 7칸으로 그려 줘. "
                 "머리·눈·손발이 크고 외곽선이 굵은 캐주얼 도트풍, 모두 오른쪽을 보는 3/4 옆모습, 배경 없음. "
                 "검게 칠해도 두 동물 부위가 읽히게. "
                 "1 치즈 도둑(여우+까마귀, 치즈를 물고 날기) 2 곰범(곰 몸에 호랑이 줄무늬와 꼬리) 3 양의 탈을 쓴 늑대(양털 옷과 굽은 뿔 두건) "
                 "4 황소개구리(개구리에 들소 갈기와 뿔) 5 재칼로프(토끼에 굽은 양 뿔) 6 썬더버드(독수리 몸에 까마귀 깃털, 번개 모양 깃 끝) "
                 "7 봉황(수탉 머리와 볏, 독수리 날개, 긴 꼬리깃)")

if __name__ == '__main__':
    for k in sys.argv[1:]:
        w, h, d, (a, b), fly = C[k]
        cmd = ['python3', 'gen.py', '--out', f'out/ch_{k}', '--w', str(w), '--h', str(h), '--style', 'style_2.png',
               '--desc', d + ' ' + COMMON,
               '--ref', f'chimera/gref_{k}.png', '--refnote', "Role: shape_pose — the confirmed design of this chimera: which animal parts go where, silhouette and props. Redraw it in the style image's pixel style.",
               '--ref', f'../art-src/pixellab/{a}_adult.png', '--refnote', f'Role: color_material_light_only — fur/feather colors of the {a} parts only. Do not copy its body shape.',
               '--ref', f'../art-src/pixellab/{b}_adult.png', '--refnote', f'Role: color_material_light_only — fur/feather colors of the {b} parts only. Do not copy its body shape.']
        r = subprocess.run(cmd, capture_output=True, text=True)
        print(k, (r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1][:90], flush=True)
        subprocess.run(['python3', 'grid.py', f'out/ch_{k}', 'style_2.png', '6', '2'], capture_output=True)
