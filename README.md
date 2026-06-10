# 腦內江湖 — 뇌내강호

두서없는 아이디어를 먹빛 허공에 念(쪽지)으로 띄우고, 緣(연결)으로 잇는
마인드맵/브레인스토밍 프로토타입. **Vite + Svelte 5** (runes).

> 시작은 '깨다름'이라는 오타 하나였다. 자세한 사연은 첫 실행 시드 데이터 참고 ㅋ

**바로 써보기 → <https://ghjang.github.io/noenae-gangho/>** (main 머지마다 자동 배포)

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 정적 빌드 (상대경로 — 아무 데나 얹어도 동작)
npm run check    # 문구 팩 정합성 검사 (build 때 자동 실행)
```

## 조작 요결

| 동작 | 결과 |
|---|---|
| 빈 곳 더블클릭 | 새 쪽지 |
| 쪽지 더블클릭 | 텍스트 편집 (Enter 확정, Shift+Enter 줄바꿈) |
| 쪽지 드래그 | 이동 |
| 붉은 점 드래그 → 다른 쪽지 | 緣(연결) 잇기 |
| 붉은 점 드래그 → 허공 | 그 자리에 새 쪽지 + 자동 연결 |
| 쪽지 좌/우 변 드래그 | 너비 조절 (더블클릭 = 자동 너비) |
| Tab | 자식 가지치기 — 선택 없으면 화면 중심에 가까운 쪽지 선택(키보드 진입점) |
| Enter | 형제 가지치기 — 같은 부모 밑에 새 쪽지 (루트면 아래에 새 루트) |
| F2 (또는 Ctrl+Enter) | 선택한 쪽지 편집 |
| Delete | 선택한 쪽지/緣 삭제 |
| F | 가리키거나(호버) 선택한 緣 방향 뒤집기 — 한 가닥씩 |
| C·Space 또는 ▾ 배지 | 가지(하위 쪽지) 접기/펼치기 — 접힌 쪽지엔 ▸숫자 배지 |
| R / Shift+R | 자동 정렬(Tidy) — 전체 / 선택한 쪽지의 하위만, 뿌리는 제자리 |
| Z / Shift+Z | 선택한 쪽지 기준 확대/축소 (없으면 화면 중앙) — 한 손 줌 |
| Alt + 화살표 | 緣 타고 선택 이동 — ←부모 / →자식 / ↑↓형제 (화면 밖이면 자동 이동) |
| Ctrl + ± / Ctrl + 0 | 앱 자체 줌 / 100% 복귀 (글 입력·시트 중엔 브라우저에 양보) |
| Ctrl+Z / Ctrl+Shift+Z (Y) | 되돌리기 / 다시 실행 — 타이핑·드래그는 한 걸음으로 병합 |
| Ctrl+F | 쪽지 검색 — Enter 순회 · Shift+Enter 역순, 접힌 가지 속이면 펼치며 점프 |
| Shift+1 | 전체 보기 — 좌하단 全 버튼과 동일 (Ctrl+0 = 100%와 짝) |
| Shift+2 | 선택한 쪽지를 화면 가득 확대 (Figma Zoom to Selection) |
| 미니맵 클릭/드래그 | 해당 지점으로 즉시 이동 (우하단 전도 — 폰에선 숨김) |
| 화살표 키 | 화면 이동 · 쪽지 선택 중엔 쪽지 이동 (Shift = 성큼) |
| PgUp / PgDn | 한 화면씩 세로 이동 |
| 빈 곳 드래그 / 휠 | 팬 / 줌 |
| 두 손가락 (터치) | 핀치 줌 · 두 손가락 끌기 = 팬 |

상단 바: 오행 색 팔레트 · 비급.md(마크다운 개요 출력) · 내보내기/불러오기(JSON) · 강호 비우기(2단 확인) · 封/武 무공봉인 토글(무협 ↔ 일반 말투 전환).

## 구조

```
src/
  main.js              # 마운트
  app.css              # 디자인 토큰 (먹/한지/인주/오행)
  App.svelte           # UI 전체 — 캔버스, 노드, 엣지, 시트
  lib/store.svelte.js  # 상태($state) + 변이 함수 + 저장 어댑터
  lib/strings.js       # UI 문구 팩 — 무협(muhyeop) / 일반(plain)
  lib/geometry.js      # 緣 기하 — 경로/화살촉 계산 (순수 함수)
  lib/graph.js         # 緣 그래프 — 봉문(접기) 규칙/탐색 헬퍼 (순수 함수)
```

저장은 기본 localStorage (`noenae-gangho-v1`), 말투 선택은 `noenae-gangho-tone`에 따로. 데이터 포맷:

```json
{ "app": "noenae-gangho", "v": 3,
  "nodes": [{ "id", "x", "y", "text", "color", "bw?", "collapsed?" }],
  "edges": [{ "id", "a", "b" }] }
```

`bw`는 사용자 지정 너비(px), `collapsed`는 가지 접힘 — 둘 다 선택 필드라 구버전 데이터도 그대로 읽힌다.

## 내 GitHub 프라이빗 레포에 올리기

```bash
cd noenae-gangho
git init && git add -A && git commit -m "腦內江湖 α — 오자돈오 기념 1커밋"
# GitHub에서 빈 private repo 만든 뒤:
git remote add origin git@github.com:<유저명>/noenae-gangho.git
git branch -M main && git push -u origin main
```

## VSCode 확장으로 가는 길 (로드맵)

`store.svelte.js`의 저장 어댑터(`setStorageAdapter`)만 갈아끼우면 된다:
웹뷰에서 `postMessage`로 확장 호스트에 보내고, 호스트가 `workspaceState`나
`*.noegang.json` 파일에 기록. `vite build`가 상대경로(`base: './'`)라서
`dist/`를 웹뷰에 그대로 로드 가능.

## 다음 후보들

할일은 [GitHub 이슈](https://github.com/ghjang/noenae-gangho/issues)에서 관리한다 — 우선순위와 설계 메모도 거기에.
