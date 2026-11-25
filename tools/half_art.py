# 폰용 반쪽 해상도 그림: public/assets/m/ 아래에 같은 경로로 만든다(조각 리그 rig/**, 배경 bg/*).
# 폰은 그림 메모리가 모자라 전투 화면에서 튕기므로(2026-11-25) 반 크기로 넣고, 리그는 그만큼 2배로 늘려 그린다.
# 사용: python3 tools/half_art.py  (그림을 바꾼 뒤 다시 돌리고 커밋)
import os
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
n = 0
for sub in ('rig', 'bg'):
    for dp, _, fs in os.walk(os.path.join(root, sub)):
        for f in fs:
            if not f.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
            src = os.path.join(dp, f)
            dst = os.path.join(root, 'm', os.path.relpath(src, root))
            if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im = Image.open(src)
            w, h = im.size
            im = im.resize((max(1, (w + 1) // 2), max(1, (h + 1) // 2)), Image.LANCZOS)
            if f.lower().endswith('.png'):
                im.save(dst, optimize=True)
            else:
                im.convert('RGB').save(dst, quality=88)
            n += 1
print('half art:', n, 'files')
