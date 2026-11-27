# 무릉도원 소품: python3 run_garden_props.py <id,..|all>  → out/garden_<id>/c*.png (후보 4장씩)
import sys, subprocess, os
from concurrent.futures import ThreadPoolExecutor
from garden_spec import P, STYLE
def one(k):
    name, w, h, d = P[k]
    if os.path.exists(f'out/garden_{k}/c0.png') and not os.environ.get('SALT'): return k + ' skip'
    out = f'out/garden_{k}' + (('_' + os.environ['SALT']) if os.environ.get('SALT') else '')
    r = subprocess.run(['python3', 'gen.py', '--out', out, '--w', str(w), '--h', str(h), '--style', 'style_2.png', '--desc', d + ', cute fantasy garden decoration. ' + STYLE], capture_output=True, text=True)
    return k + ' ' + ((r.stdout.strip().splitlines() or [r.stderr[-200:]])[-1][:80])
ids = list(P) if sys.argv[1:] == ['all'] else sys.argv[1].split(',')
with ThreadPoolExecutor(3) as ex:
    for line in ex.map(one, ids): print(line, flush=True)
