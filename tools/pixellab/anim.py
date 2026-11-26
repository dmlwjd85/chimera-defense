# PixelLab animate-with-text-v3: 확정 원화 1장을 첫 장으로, 몸 전체를 통째로 다시 그리는 동작 생성. 결과·사용량 기록.
import sys, json, base64, io, time, urllib.request, argparse, os
from PIL import Image
API = 'https://api.pixellab.ai/v2'
TOK = os.environ['PIXELLAB_API_TOKEN']   # 토큰은 환경변수에서만(파일·대화에 적지 않음)
def req(method, path, body=None):
    import urllib.error, random
    for k in range(12):   # 너무 많이 보내면 429 → 기다렸다 다시
        r = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                   headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(r, timeout=120) as f: return json.loads(f.read())
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503) or k == 11: raise
            time.sleep(15 + 10 * k + random.random() * 10)
ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True); ap.add_argument('--out', required=True); ap.add_argument('--action', required=True)
ap.add_argument('--frames', type=int, default=8); ap.add_argument('--canvas', type=int, default=128)
ap.add_argument('--padx', type=int, default=None); ap.add_argument('--seed', type=int, default=0)
ap.add_argument('--last', action='store_true', help='마지막 장 = 첫 장(반복 동작이 끊기지 않게, 제자리로 돌아오게)')
a = ap.parse_args()
src = Image.open(a.src).convert('RGBA')
src = src.crop(src.getbbox())
C = a.canvas; can = Image.new('RGBA', (C, C), (0, 0, 0, 0))
ox = (C - src.width) // 2 if a.padx is None else a.padx; oy = C - src.height - 6   # 발밑을 아래쪽에, 위·앞뒤로 움직일 자리
can.alpha_composite(src, (ox, oy))
buf = io.BytesIO(); can.save(buf, 'PNG')
bal0 = req('GET', '/balance')['subscription']['generations']
body = {'first_frame': {'type': 'base64', 'base64': base64.b64encode(buf.getvalue()).decode(), 'format': 'png'},
        'action': a.action, 'frame_count': a.frames, 'seed': a.seed, 'no_background': True}
if a.last: body['last_frame'] = body['first_frame']
j = req('POST', '/animate-with-text-v3', body); jid = j.get('background_job_id')
print('job', jid)
for _ in range(80):
    time.sleep(5); s = req('GET', f'/background-jobs/{jid}')
    if s.get('status') in ('completed', 'failed', 'error'): break
print('status', s.get('status'), str((s.get('last_response') or {}).get('detail') or '')[:300])
imgs = (s.get('last_response') or {}).get('images') or []
os.makedirs(a.out, exist_ok=True); can.save(f'{a.out}/first.png')
pil = []
for i, im in enumerate(imgs):
    data = im.get('base64') if isinstance(im, dict) else im
    p = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA'); p.save(f'{a.out}/f{i:02d}.png'); pil.append(p)
if pil:
    W = sum(p.width for p in pil) + 6 * (len(pil) + 1); H = max(p.height for p in pil) + 12
    sh = Image.new('RGBA', (W, H), (235, 240, 230, 255)); x = 6
    for p in pil: sh.alpha_composite(p, (x, 6)); x += p.width + 6
    sh.resize((W * 2, H * 2), Image.NEAREST).save(f'{a.out}/sheet.png')
    pil[0].save(f'{a.out}/anim.gif', save_all=True, append_images=pil[1:], duration=110, loop=0, disposal=2)
bal1 = req('GET', '/balance')['subscription']['generations']
json.dump({'src': a.src, 'last': a.last, 'action': a.action, 'frames': a.frames, 'seed': a.seed, 'job': jid, 'used': bal0 - bal1, 'n': len(pil)}, open(f'{a.out}/meta.json', 'w'), ensure_ascii=False)
print('used', bal0 - bal1, 'left', bal1, 'frames', len(pil))
