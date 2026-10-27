# 친구무스메 더비

친구 사진과 이름을 넣고 구경만 하는 운빨 경마 룰렛. 서버 없이 정적 파일만으로 동작합니다.

## 구조

- `index.html` — 화면 구조
- `css/style.css` — 스타일
- `js/game.js` — 레이스 시뮬레이션, 스킬, 렌더링

## 로컬에서 열기

`index.html`을 브라우저에서 바로 열면 됩니다.

## GitHub Pages 배포

1. 이 폴더 전체를 저장소에 올립니다.
2. Settings → Pages → Source: Deploy from a branch → `main` / `(root)`
3. 1~2분 뒤 `https://<아이디>.github.io/<저장소>/` 에서 열립니다.

## 조정하기 (`js/game.js`)

- 스킬 목록과 발동 확률: `POOL` 배열
- 역전각 확률(35%)과 선두 휘청 확률(12%): `buildRace()` 안의 `events`
- 응원 보정 세기: `step()` 안의 "관중 응원 보정" 부분
- 공정성 확인: 브라우저 콘솔에서 `__fdFairness(1000)`

사진과 전적은 각 브라우저의 localStorage에만 저장됩니다.
