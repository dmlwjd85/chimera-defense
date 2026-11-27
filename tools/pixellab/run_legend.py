# 전설 키메라 6종 원화(PixelLab, 제미나이 밑그림 없음): python3 run_legend.py <id..|all>  → out/ch_<id>/c*.png
import sys, subprocess, os
from concurrent.futures import ThreadPoolExecutor
from legend_spec import L
from run_chim import COMMON
def one(k):
    name, parents, d = L[k][0], L[k][1], L[k][2]
    out = f'out/ch_{k}' + (('_' + os.environ['SALT']) if os.environ.get('SALT') else '')
    desc = f"{name} legendary chimera: {d}. " + COMMON
    cmd = ['python3', 'gen.py', '--out', out, '--w', '112', '--h', '96', '--style', 'style_2.png', '--desc', desc]
    for p in parents: cmd += ['--ref', f'final/{p}_adult.png', '--refnote', f'Role: color_material_light_only — the {p} parent as drawn in our game: copy its colors, fur or feather texture and eye style only']
    r = subprocess.run(cmd, capture_output=True, text=True)
    return k + ' ' + ((r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1][:80])
ids = list(L) if sys.argv[1:] == ['all'] else sys.argv[1:]
with ThreadPoolExecutor(3) as ex:
    for line in ex.map(one, ids): print(line, flush=True)
