# Sonniss 소리 파일 자리 (이 폴더의 소리 파일은 저장소에 올리지 않는다)

이 폴더에는 Sonniss #GameAudioGDC 2026 번들에서 고른 소리 10개가 들어간다(`*.ogg`, `*.mp3`).
번들 라이선스는 "게임 안에 넣어 파는 것"은 허용하지만 "소리 파일 자체를 다른 사람에게 나눠 주는 것"은 금지한다.
이 저장소는 공개라서 파일을 올리지 않는다(`.gitignore`). 파일이 없으면 게임은 자동으로 예전 합성음을 쓴다.

필요한 파일: click, hit_light, hit_heavy, shoot, magic, heal, kill, coin, evolve, boss (각각 .ogg + .mp3)
어디서 왔는지, 어떻게 자르고 맞췄는지: `docs/에셋_출처.md`의 「효과음」 절.
앱(스팀 빌드)을 만들 때는 이 폴더에 파일을 복사해 넣은 뒤 `npm run build` 한다.
