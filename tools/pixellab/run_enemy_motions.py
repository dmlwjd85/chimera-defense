# 적 동작 주문서(enemy_motion_spec.py)대로 4개씩 동시에 만든다. 이미 만든 동작은 건너뜀(다시 뽑지 않음).
# python3 run_enemy_motions.py <id,id|all> [동작,..]
import sys, subprocess, os, json
from concurrent.futures import ThreadPoolExecutor
from enemy_motion_spec import E, FRAMES, LAST, action, jobs
ids = list(E) if sys.argv[1] == 'all' else sys.argv[1].split(',')
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 and sys.argv[2] else None
def run(job):
    eid, m = job
    out = f'anim/en_{eid}_adult_{m}'
    if os.path.exists(f'{out}/meta.json') and json.load(open(f'{out}/meta.json'))['n'] > 0: return f'skip {out}'
    seed = 700 + sum(map(ord, eid + m + os.environ.get('SALT', ''))) % 300
    cmd = ['python3', 'anim.py', '--src', f'pick/en_{eid}.png', '--out', out, '--action', action(eid, m),
           '--frames', str(FRAMES[m]), '--canvas', str(E[eid][1]), '--seed', str(seed)] + (['--last'] if m in LAST else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    return f'{out}: ' + (r.stdout.strip().splitlines() or ['?'])[-1] + (' ERR ' + r.stderr[-200:] if r.returncode else '')
js = [j for j in jobs(ids) if not only or j[1] in only]
print(len(js), 'jobs', flush=True)
with ThreadPoolExecutor(int(os.environ.get('PAR', '4'))) as ex:
    for line in ex.map(run, js): print(line, flush=True)
