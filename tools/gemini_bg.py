"""제미나이 스테이지 배경 → 게임 배경(bg-<id>.jpg 1920x1080 — 화면 1280x720·도트화라 이 크기로 충분, 불러오기 가벼움)·썸네일(thumb-<id>.jpg 560x260).
원본: art-src/gemini_bg/<id>.png (1376x768, 오른쪽 아래 제미나이 표식은 tools/gemini_bg_wm.py로 지운 것)
주문서: tools/pixellab/bg_spec.py (구도: 왼쪽 성문 · 오른쪽 마계 포털 · 아래 60% 빈 땅)
그림이 생긴 스테이지는 stages.json의 art(다른 스테이지 그림 빌려 쓰기)를 지운다.
python3 tools/gemini_bg.py"""
import os, json
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art-src', 'gemini_bg'); OUT = os.path.join(ROOT, 'public', 'assets', 'bg')
stp = os.path.join(ROOT, 'public', 'data', 'stages.json'); mp = os.path.join(ROOT, 'public', 'assets', 'manifest.json')
stages = json.load(open(stp)); man = json.load(open(mp)); done = []
for st in stages:
    p = os.path.join(SRC, st['id'] + '.png')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB').resize((1920, 1080), Image.LANCZOS)
    im.save(os.path.join(OUT, f'bg-{st["id"]}.jpg'), quality=86, optimize=True)
    im.crop((120, 105, 1800, 645)).resize((560, 260), Image.LANCZOS).save(os.path.join(OUT, f'thumb-{st["id"]}.jpg'), quality=85)
    man['images'][f'bg-{st["id"]}'] = f'assets/bg/bg-{st["id"]}.jpg'; man['images'][f'thumb-{st["id"]}'] = f'assets/bg/thumb-{st["id"]}.jpg'
    done.append(st['id'])
# stages.json은 손으로 맞춘 모양(일부 한 줄)이라 글자로만 고침: 그림이 생긴 스테이지의 "art": "..." 지우기
txt = open(stp).read()
for sid in done:
    i = txt.find(f'"id": "{sid}"'); j = txt.find('"id": "stage-', i + 5); j = len(txt) if j < 0 else j
    k = txt.find('"art": "', i, j)
    if k >= 0:
        e = txt.find('"', k + 8) + 1
        while txt[e] in ', ': e += 1
        if txt[e] == '\n': e += 1
        ls = txt.rfind('\n', 0, k) + 1
        txt = txt[:ls] + txt[e:] if txt[ls:k].strip() == '' else txt[:k] + txt[e:]
json.loads(txt); open(stp, 'w').write(txt)
json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=1); open(mp, 'a').write('') 
print('gemini bg:', done)
