# 자동 키메라(같은 강 짝) + 돌연변이 슬라임 원화: 스타일 = 아군 성체 호랑이(style_2), 모양 = 제미나이 밑그림(gem2/g_<id>.png), 색 = 두 부모 성체 원화
import sys, subprocess
COMMON = ("Drawn in exactly the same chibi casual pixel-art style as the style image (our animal heroes): big head, big glossy eyes, big paws, "
          "thick dark brown outline, 2-3 tone cel shading, same brightness and vividness, same pixel size. One single natural animal body that blends both parents "
          "(not two animals glued together, not humanoid, stands like an animal). Facing right in three-quarter side view, full body. No background, no ground shadow, no text, no props unless described.")
C = {
 'ant_grasshopper': (112, 88, ['ant', 'grasshopper'], "Ant-hopper chimera: a red ant body with a grasshopper's long green jumping hind legs and long antennae, holding a tiny violin on its back, cheerful."),
 'fox_tiger': (112, 88, ['fox', 'tiger'], "Fox-tiger chimera: a fox face, ears and bushy tail with orange tiger stripes all over, chin raised with a smug proud grin."),
 'rabbit_tiger': (112, 92, ['rabbit', 'tiger'], "Rabbit-tiger chimera: a small striped tiger with long upright rabbit ears and a fluffy round tail, big scared-but-cute eyes."),
 'dog_wolf': (112, 88, ['dog', 'wolf'], "Wolf-dog chimera: a grey wolf body with a shiba-like friendly face, a red dog collar, curled wagging tail, happy open mouth."),
 'crow_rooster': (96, 96, ['crow', 'rooster'], "Crow-rooster chimera: a black-feathered crow body shaped like a rooster, with a red rooster comb and wattle and long black tail feathers, beak open cawing."),
 'bear_monkey': (112, 92, ['bear', 'monkey'], "Bear-monkey chimera: a brown bear with long monkey arms, a monkey face and a curly monkey tail, a little banana stem on top of its head."),
 'bighorn_bison': (112, 92, ['bighorn', 'bison'], "Twin-horn bull chimera: a brown bison body and shaggy mane with big curled bighorn ram horns AND short bison horns together."),
 'fox_wolf': (112, 88, ['fox', 'wolf'], "Sly-wolf chimera: a grey wolf body with a big fluffy orange fox tail and fox-orange ear tips, sly half-closed smiling eyes."),
}
SLIME = (64, 64, "Mutant slime: a goofy grey-green translucent jelly blob shaped like a dripping water drop with a wobbly pointy tip on top, small air bubbles and glossy highlights inside, "
         "two mismatched dopey eyes, a slack open mouth with the tongue sticking out a little, two big round plain grey spots on its side. Funny and harmless, not scary. "
         "Same chibi pixel-art style as the style image: thick dark brown outline, 2-3 tone cel shading, same pixel size. Facing right, three-quarter view. No background, no ground shadow, no text.")
for k in sys.argv[1:]:
    if k == 'slime':
        w, h, d = SLIME
        refs = [('gem2/g_slime_a.png', 'Role: shape_pose — the confirmed design: the dripping drop shape, face and the two grey spots')]
    else:
        w, h, parents, d = C[k]
        d = d + ' ' + COMMON
        refs = [(f'gem2/g_{k}.png', 'Role: shape_pose — the confirmed design of this chimera: body shape, pose and which parts come from which parent. Redraw it in the style image\'s pixel style.')]
        refs += [(f'final/{p}_adult.png', f'Role: color_material_light_only — the {p} parent as drawn in our game: copy its fur/feather colors and eye style only') for p in parents]
    cmd = ['python3', 'gen.py', '--out', f'out/ch_{k}', '--w', str(w), '--h', str(h), '--style', 'style_2.png', '--desc', d]
    for p, n in refs: cmd += ['--ref', p, '--refnote', n]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(k, (r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1][:90], flush=True)
