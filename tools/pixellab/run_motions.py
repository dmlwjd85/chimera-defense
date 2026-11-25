# 주문서(motion_spec.py)대로 동작을 4개씩 동시에 만든다. 이미 만든 동작은 건너뜀(다시 뽑지 않음).
import sys, subprocess, os, json
from concurrent.futures import ThreadPoolExecutor
from motion_spec import action, jobs, FRAMES, CANVAS, base, use_last
species = sys.argv[1].split(',')
stages_only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 and sys.argv[3] else None
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 and sys.argv[2] else None
def run(job):
    sp, st, m = job
    out = f'anim/{sp}_{st}_{m}'
    if os.path.exists(f'{out}/meta.json') and json.load(open(f'{out}/meta.json'))['n'] > 0: return f'skip {out}'
    seed = 700 + sum(map(ord, sp + st + m)) % 300
    cmd = ['python3', 'anim.py', '--src', base(sp, st), '--out', out, '--action', action(sp, st, m),
           '--frames', str(FRAMES[m]), '--canvas', str(CANVAS[st]), '--seed', str(seed)] + (['--last'] if use_last(sp, st, m) else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    return f'{out}: ' + (r.stdout.strip().splitlines() or ['?'])[-1] + (' ERR ' + r.stderr[-200:] if r.returncode else '')
js = [j for j in jobs(species) if (not only or j[2] in only) and (not stages_only or j[1] in stages_only)]
print(len(js), 'jobs', flush=True)
with ThreadPoolExecutor(4) as ex:
    for line in ex.map(run, js): print(line, flush=True)
