# CLAUDE.md — 腦內江湖 (noenae-gangho)

마인드맵형 아이디어 정리 웹앱. **Vite + Svelte 5 (runes)**.
런타임 의존성 0 — svelte/vite 외 라이브러리 추가 금지 (프로토타입 경량 유지가 원칙).

## 명령어

- `npm run dev` — 개발 서버 (localhost:5173)
- `npm run build` — `dist/` 정적 빌드. `vite.config.js`의 `base: './'`(상대경로)는 VSCode 웹뷰 이식용이니 절대 바꾸지 말 것

## 구조와 역할 분담

- `src/lib/store.svelte.js` — 모든 상태(`$state`)·변이 함수·저장 어댑터. **로직은 전부 여기로.** 컴포넌트에 도메인 상태 두지 말 것
- `src/App.svelte` — UI 전체 (캔버스/노드/엣지/시트/도움말). 단일 컴포넌트 유지가 기본, 새 영역이 300줄 넘을 때만 분리 검토
- `src/app.css` — 디자인 토큰. 색은 반드시 CSS 변수 경유 (`--hanji`, `--inju`, `--c-*`). 하드코딩 hex 금지

## 핵심 설계 결정 — 바꾸기 전에 사용자에게 물을 것

1. **저장은 어댑터 패턴** (`setStorageAdapter`): localStorage는 기본값일 뿐. VSCode 웹뷰 이식 시 postMessage 어댑터로 교체 예정 — `load()/save(data)` 시그니처 유지
2. **데이터 포맷** `{ app: 'noenae-gangho', v: 1, nodes, edges }` — 스키마 바꾸면 `v` 올리고 `loadData()`에 구버전 마이그레이션 추가
3. **좌표계**: 노드 x/y는 world 좌표, 화면 변환은 `ui.pan`/`ui.scale`. 새 인터랙션은 `toWorld()` 경유
4. **노드 w/h는 실측** (`bind:clientWidth/Height`) — 엣지 앵커 계산에 쓰임. 하드코딩 금지

## 컨벤션 / 세계관

- UI 문구는 무협 톤 한국어: 念=노드, 緣=엣지, 비급=내보내기, 주화입마=에러. 새 문구도 이 결 유지 (예: "삭제 실패" 대신 "베기에 실패했다")
- 색 5종은 오행 체계: `muk/cheong/dan/hwang/nam` — 추가·변경 시 `COLORS`(store) · `app.css` 변수 · `COLOR_LABEL`(App) 세 곳 동기화
- 커밋 메시지 한국어 환영. 유머 허용, 단 무엇을 왜 바꿨는지는 명확히

## 로드맵 (우선순위순)

1. Undo/Redo — snapshot 스택, store에 구현
2. 노드 접기 (가지 숨김)
3. 미니맵 / 노드 검색
4. 마크다운 → 그래프 역방향 가져오기
5. 모바일 핀치 줌

## 검증 체크리스트

- 빈 강호 / 시드 데이터 양쪽에서 dev 확인
- 내보내기 → 비우기 → 불러오기 라운드트립 무손실 확인
- 줌 0.35x/2.5x 양끝에서 드래그·연결 동작 확인
