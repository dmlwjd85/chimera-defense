#!/usr/bin/env python3
"""산군 필살기 v6 에셋(v4 캐릭터 8방향/마무리 + v6 under/over 이펙트 17장)을
Phaser 3 아틀라스(PNG + JSON)와 public/data/sangun_ult.json으로 묶는다."""
import json
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
V4_DIR = Path('/workspace/chimera-defense/prototype/sangun_ult_v4/bullettime_frames_1x')
V6_DIR = Path('/workspace/chimera-defense/prototype/sangun_ult_v6')
OUT_FX = REPO / 'public' / 'assets' / 'fx' / 'sangun-ult'
OUT_DATA = REPO / 'public' / 'data' / 'sangun_ult.json'

CHAR_FILES = [
    'scene_0_south-west_f0.png',
    'scene_1_west_f1.png',
    'scene_2_north-west_f2.png',
    'scene_3_north_f3.png',
    'scene_4_north-east_f4.png',
    'scene_5_east_f5.png',
    'scene_6_south-east_f6.png',
    'scene_7_south_finish_f7.png',
]


def pack_atlas(items, cols, out_png, out_json):
    w, h = items[0][1].size
    rows = -(-len(items) // cols)
    sheet = Image.new('RGBA', (w * cols, h * rows), (0, 0, 0, 0))
    frames = []
    for i, (name, im) in enumerate(items):
        if im.size != (w, h):
            raise ValueError(f'{name}: size {im.size} != {(w, h)}')
        x = (i % cols) * w
        y = (i // cols) * h
        sheet.paste(im, (x, y))
        frames.append({
            'filename': name,
            'frame': {'x': x, 'y': y, 'w': w, 'h': h},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h},
            'sourceSize': {'w': w, 'h': h},
        })
    sheet.save(out_png, optimize=True)
    atlas = {
        'frames': frames,
        'meta': {
            'app': 'chimera-defense pack_sangun_ult.py',
            'version': '1.0',
            'image': out_png.name,
            'format': 'RGBA8888',
            'size': {'w': sheet.width, 'h': sheet.height},
            'scale': '1',
        },
    }
    out_json.write_text(json.dumps(atlas, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{out_png.relative_to(REPO)}: {len(items)} frames ({w}x{h}) -> {sheet.width}x{sheet.height}')


def main():
    OUT_FX.mkdir(parents=True, exist_ok=True)
    char_items = [(f'char_{i}', Image.open(V4_DIR / fn).convert('RGBA')) for i, fn in enumerate(CHAR_FILES)]
    pack_atlas(char_items, 8, OUT_FX / 'char.png', OUT_FX / 'char.json')

    fx_cfg = json.loads((V6_DIR / 'fx_config.json').read_text(encoding='utf-8'))
    under_items = []
    over_items = []
    out_frames = []
    for fr in fx_cfg['frames']:
        idx = fr['index']
        key = f'fx_{idx:02d}'
        under_items.append((key, Image.open(V6_DIR / fr['under_file']).convert('RGBA')))
        over_items.append((key, Image.open(V6_DIR / fr['over_file']).convert('RGBA')))
        char_idx = idx if idx < 7 else 7
        out_frames.append({
            'index': idx,
            'char_frame': f'char_{char_idx}',
            'under_frame': key,
            'over_frame': key,
            'phase': fr['phase'],
            'label': fr['label'],
            'duration_ms': fr['duration_ms'],
            'shake_px': fr['shake_px'],
            'has_flash': fr['has_flash'],
        })

    pack_atlas(under_items, 6, OUT_FX / 'under.png', OUT_FX / 'under.json')
    pack_atlas(over_items, 6, OUT_FX / 'over.png', OUT_FX / 'over.json')

    data = {
        'note': '산군 필살기 v6 연출 시간표 및 레이어 설정 (fx_config.json 기반)',
        'canvas': fx_cfg['canvas'],
        'ground_baseline_y': fx_cfg['ground_baseline_y'],
        'orbit_total_ms': fx_cfg['orbit_total_ms'],
        'landing_total_ms': fx_cfg['landing_total_ms'],
        'one_play_ms': fx_cfg['one_play_ms'],
        'frames': out_frames,
    }
    OUT_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{OUT_DATA.relative_to(REPO)}: {len(out_frames)} frames, {data["one_play_ms"]}ms')


if __name__ == '__main__':
    main()
