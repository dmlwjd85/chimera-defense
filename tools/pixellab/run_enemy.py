# 적(마계 군단) PixelLab 생성: 스타일 = 아군 성체 호랑이(style_2), 모양 = 제미나이 밑그림(enemy/gref_<id>.png)
import sys, subprocess
COMMON = ("Enemy minion of the demon army, drawn in exactly the same chibi casual pixel-art style as the style image (our animal heroes): "
          "big head, big glossy eyes, big hands and feet, thick dark outline, 2-3 tone cel shading, same brightness and vividness. "
          "Cheeky, mischievous villain, cute but annoying, never gory. Facing right in three-quarter side view, full body, ready to fight. "
          "Demon-army mark: glowing purple eyes and a small purple rune. No background, no ground shadow, no text, no sparkles.")
BOSS = ("Boss of the demon army, same chibi casual pixel-art style as the style image: big head, big hands and feet, thick dark outline, cel shading, "
        "same brightness. Bigger and more majestic than the minions, menacing but not gory. Facing right in three-quarter side view, full body, battle stance. "
        "Glowing purple eyes or purple rune glow. No background, no ground shadow, no text, no sparkles.")
E = {
 'normal':   (80, 80, "Horned Imp: a small purple imp with two short curved horns, pointy ears, a thin tail with a spade tip, holding a little wooden club.", 0),
 'fast':     (80, 80, "Fox Bandit: an orange fox standing on two legs, a black bandana mask over its snout, a fluffy tail, holding a small dagger, light on its feet.", 0),
 'tough':    (88, 88, "Sprout Golem: a chunky grey stone golem made of blocky rocks, big stone fists, a green sprout with two leaves on its head, small purple runes carved on its body.", 0),
 'swarm':    (56, 56, "Red Beetle: a small round beetle with a shiny red shell with black spots, short legs, two antennae, tiny and chubby.", 0),
 'flying':   (80, 80, "Blue Moth: a moth with big open blue wings with darker veins, fuzzy blue body, feathery antennae, flying in the air.", 0),
 'healer':   (80, 80, "Mushroom Healer: a walking mushroom with a big red cap with white spots, beige body with stubby arms and legs, holding a crooked wooden staff.", 0),
 'miniboss': (104, 96, "Bramble Boar (mini boss): a stocky brown wild boar on four legs with a spiky mane, leather armor straps with leaves and thorny brambles on its back, curved white tusks.", 1),
 'bat':      (72, 64, "Purple Bat: a round little purple bat with big spread wings, big ears, tiny fangs, flying in the air.", 0),
 'skeleton': (80, 84, "Skeleton Soldier: a golden-bone skeleton with a big round skull, holding a small axe in one hand and a round wooden shield in the other.", 0),
 'ghost':    (80, 80, "Wandering Soul: a pale sky-blue ghost with a round head and a wispy tail, small arms, holding a little lantern, floating.", 0),
 'zombie':   (96, 84, "Risen Boar: a green zombie wild boar on four legs with stitched scars, a messy dark green mane, chipped tusks, glowing purple eyes.", 1),
 'wisp':     (64, 72, "Will-o'-the-wisp: a blue flame spirit with a big grinning face, flickering flame tips, floating.", 0),
 'boss_boar':  (128, 128, "Mighty Boar King (stage 1 boss): a huge upright black-brown boar in heavy gold-and-iron armor plates, a small gold crown, very long ivory tusks, spiky mane, huge fists.", 2),
 'boss_bat':   (128, 128, "Bat King (stage 2 boss): a round purple bat with a small gold crown and a red collar, huge bat wings spread like a cape, flying in the air.", 2),
 'boss_shadow':(128, 128, "Shadow of the Forest (stage 3 boss): a hulking living shadow of dark purple smoke, one silver armored shoulder and one silver gauntlet, mossy twig antlers, lower body fading into smoke.", 2),
 'boss_bone':  (128, 128, "Skeleton General (stage 4 boss): a skeleton warrior in blue steel armor with a horned helmet, a tattered red cape, a big curved sword.", 2),
 'boss_frost': (128, 128, "Frost Wraith (stage 5 boss): an icy ghost king in a translucent pale blue robe fading into mist, a frosty beard, an ice crystal crown, an ice staff.", 2),
 'boss_lich':  (128, 128, "Crow Priest (stage 6 boss): a skull-faced priest with a dark green hood and purple robe, a crooked wooden staff topped with a glowing violet orb.", 2),
 'overlord':   (160, 160, "Demon Overlord (final boss): skull face, big curved ram horns, spiky silver crown with purple gems, black-and-silver armor with glowing purple runes, tattered crimson and purple cape, a scythe staff with a purple crystal, purple soul flame floating above his other hand. The biggest and most majestic villain.", 2),
}
for k in sys.argv[1:]:
    w, h, d, kind = E[k]
    style = 'style_2.png'
    cmd = ['python3', 'gen.py', '--out', f'out/en_{k}', '--w', str(w), '--h', str(h), '--style', style,
           '--desc', d + ' ' + (BOSS if kind == 2 else COMMON),
           '--ref', f'enemy/gref_{k}.png', '--refnote', 'Role: shape_pose — the confirmed design of this character: its creature, outfit, props, colors and silhouette. Redraw it smaller in the style image\'s pixel style.']
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(k, (r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1][:90], flush=True)
    subprocess.run(['python3', 'grid.py', f'out/en_{k}', style, '6', '2'], capture_output=True)
