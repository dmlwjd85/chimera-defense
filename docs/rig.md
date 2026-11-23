# 리그 도구 (자체 스파인 대용)

부위별 그림을 뼈대에 붙여 움직이는 도구입니다. 런타임은 Phaser와 분리된 순수 로직이라 `node --test`로 검사합니다.

## 파일

| 경로 | 내용 |
|---|---|
| `src/rig/math.js` | 2D 행렬, 각도 보간, 이징, 시드 난수 |
| `src/rig/animator.js` | 키프레임 샘플링, 섞기(mix), 이벤트 |
| `src/rig/procedural.js` | 숨쉬기(부위 세로 3%, 2.6초), 눈 깜빡임(3~6초), 각도 스프링(꼬리 60/8, 귀 120/12) |
| `src/rig/rope.js` | 뼈 사슬 → 휘는 띠(꼬리·뱀 몸통) 점 목록 |
| `src/rig/RigInstance.js` | 한 마리: `play / on / setFacing / setStage / setSkin / hitFlash / update / getDrawList` |
| `src/rig/RigView.js` | Phaser 렌더러. 실제 그림(`종_단계_부위` 텍스처)이 있으면 쓰고, 없으면 임시 도형 |
| `src/rig/load.js` | `loadRig('fox')` — JSON 읽기 + 검증 |
| `public/data/rig/quadruped.template.json` | 네발 뼈대 25개, 부위 슬롯, 절차 동작 값 |
| `public/data/rig/quadruped.anims.json` | 모션 10종: idle, move, attack(hit), skill(cast), hit, down, respawn, victory, merge_in(pop), evolve(flash) |
| `public/data/rig/fox.rig.json` | 여우 색, 단계별 크기·속도·과장·머리 비율 |
| `rig.html`, `src/rigLab.js` | 리그 랩 페이지 |

## 좌표 규칙

- 발이 y=0, 오른쪽을 봄, 각도는 시계 방향이 +.
- 자식 뼈의 x, y는 부모 기준. 단계를 바꾸면 발이 자동으로 땅에 붙음(`foot: true` 뼈 기준).
- 키프레임 `[시간, 값, 이징]` — rot·x·y는 기본 자세에 더하고, sx·sy·alpha는 곱함.
- 이벤트 `[시간, 이름]` — 전투 코드는 `inst.on('hit', fn)`으로 피해 시점을 맞춤.

## 리그 랩 쓰는 법

`npm run dev` 후 `/rig.html`.

- 모션 버튼: 세 단계가 같은 모션을 동시에 재생.
- 장면: 단계 비교 / 전투 미리보기(hit 이벤트 → 피격·번쩍·숫자·화면 흔들림) / 이동(몸 속도 → 꼬리 스프링).
- 뼈 편집: 기본 자세를 슬라이더로 고치고 `템플릿 JSON 보기` → `public/data/rig/quadruped.template.json`에 붙여 넣기.

## 새 동물 추가

1. `public/data/rig/<종>.rig.json` 작성(템플릿, 색, 단계 값).
2. 그림이 오면 `public/assets/rig/<종>/<종>_<단계>_<부위>.png`로 넣고 `this.load.image('<종>_<단계>_<부위>', ...)`로 로드 — 임시 도형이 자동으로 교체됨.
3. `npm test`로 검증(모든 모션 × 모든 단계 NaN 없음, 발 접지).
