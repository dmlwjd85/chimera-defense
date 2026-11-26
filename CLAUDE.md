# 키메라 디펜스 — 작업 안내 (Claude / 에이전트)

이 저장소에서 그림·동작을 주문하거나 검수할 때는 아래를 먼저 읽습니다.

- 규칙 전문: [`docs/동작_주문_규칙.md`](docs/동작_주문_규칙.md)
- PixelLab 주문 틀: [`tools/pixellab/request_template.json`](tools/pixellab/request_template.json)
- 데모에 구현된 규칙 요약: [`docs/game.md`](docs/game.md)의 「동작·그림 주문 규칙」

화면 UI(버튼·글 상자·말풍선)를 만들거나 고칠 때는 [`docs/UI_규칙.md`](docs/UI_규칙.md)를 따르고 `src/scenes/ui.js` 부품만 씁니다. 게임 안 문구는 짧게(버튼 2~6글자, 안내 한 줄), 바꾼 문구는 [`docs/문구_전후.md`](docs/문구_전후.md)에 남깁니다.

부분 합성·팔 늘리기·잘라 붙이기는 하지 않습니다. 비율·실루엣·전장 나란히 비교·전후 비교를 통과하기 전에는 보여 주지 않습니다. 비밀값(토큰·비밀번호)은 대화와 파일에 적지 않습니다.
