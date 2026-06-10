# 腦內江湖 — 뇌내강호

두서없는 아이디어를 먹빛 허공에 念(쪽지)으로 띄우고, 緣(연결)으로 잇는
마인드맵/브레인스토밍 프로토타입. **Vite + Svelte 5** (runes).

> 시작은 '깨다름'이라는 오타 하나였다. 자세한 사연은 첫 실행 시드 데이터 참고 ㅋ

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 정적 빌드 (상대경로 — 아무 데나 얹어도 동작)
```

## 조작 요결

| 동작 | 결과 |
|---|---|
| 빈 곳 더블클릭 | 새 쪽지 |
| 쪽지 더블클릭 | 텍스트 편집 (Enter 확정, Shift+Enter 줄바꿈) |
| 쪽지 드래그 | 이동 |
| 붉은 점 드래그 → 다른 쪽지 | 緣(연결) 잇기 |
| 붉은 점 드래그 → 허공 | 그 자리에 새 쪽지 + 자동 연결 |
| Tab | 선택한 쪽지에 자식 가지치기 |
| Delete | 선택한 쪽지/緣 삭제 |
| 빈 곳 드래그 / 휠 | 팬 / 줌 |

상단 바: 오행 색 팔레트 · 비급.md(마크다운 개요 출력) · 내보내기/불러오기(JSON) · 강호 비우기(2단 확인).

## 구조

```
src/
  main.js              # 마운트
  app.css              # 디자인 토큰 (먹/한지/인주/오행)
  App.svelte           # UI 전체 — 캔버스, 노드, 엣지, 시트
  lib/store.svelte.js  # 상태($state) + 변이 함수 + 저장 어댑터
```

저장은 기본 localStorage (`noenae-gangho-v1`). 데이터 포맷:

```json
{ "app": "noenae-gangho", "v": 1,
  "nodes": [{ "id", "x", "y", "text", "color" }],
  "edges": [{ "id", "a", "b" }] }
```

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

- [ ] 미니맵 / 검색
- [ ] 노드 접기(가지 숨기기)
- [ ] Undo/Redo (스냅샷 스택)
- [ ] 마크다운 → 그래프 역방향 가져오기
- [ ] 모바일 핀치 줌
