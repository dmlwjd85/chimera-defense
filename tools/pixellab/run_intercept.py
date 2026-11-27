# 돌파·막기 동작(intercept_spec.py)을 만든다. 이미 만든 것은 건너뜀. python3 run_intercept.py [base|enemy|all]
import sys, subprocess, os, json
from concurrent.futures import ThreadPoolExecutor
import intercept_spec as S
from motion_spec import CANVAS, base
from enemy_motion_spec import E
which = sys.argv[1] if len(sys.argv) > 1 else 'all'
def run(job):
    if job[0] == 'b':
        _, sp, st, m = job; out = f'anim/{sp}_{st}_{m}'; src = base(sp, st); act = S.action(sp, st, m); can = CANVAS[st]
        last = sp in S.FLY and st != 'myth'
    else:
        _, eid, m = job; out = f'anim/en_{eid}_adult_{m}'; src = f'pick/en_{eid}.png'; act = S.e_action(eid, m, E[eid][0]); can = E[eid][1]; last = False
    if os.path.exists(f'{out}/meta.json') and json.load(open(f'{out}/meta.json'))['n'] > 0: return f'skip {out}'
    seed = 700 + sum(map(ord, out + os.environ.get('SALT', ''))) % 300
    cmd = ['python3', 'anim.py', '--src', src, '--out', out, '--action', act, '--frames', str(S.FRAMES[m]), '--canvas', str(can), '--seed', str(seed)] + (['--last'] if last else [])
    for t in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0: break
    return f'{out}: ' + (r.stdout.strip().splitlines() or ['?'])[-1] + (' ERR ' + r.stderr[-150:] if r.returncode else '')
js = ([('b',) + j for j in S.jobs()] if which in ('base', 'all') else []) + ([('e',) + j for j in S.e_jobs()] if which in ('enemy', 'all') else [])
print(len(js), 'jobs', flush=True)
with ThreadPoolExecutor(int(os.environ.get('PAR', '3'))) as ex:
    for line in ex.map(run, js): print(line, flush=True)
