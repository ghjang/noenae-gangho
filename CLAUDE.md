# CLAUDE.md — 腦內江湖 (noenae-gangho)

마인드맵형 아이디어 정리 웹앱. **Vite + Svelte 5 (runes) + TypeScript(strict, #115)**.
**런타임 의존성 0** = _번들(배포물)_에 실리는 외부 라이브러리만 금지 — svelte/vite 외 런타임 의존 금지(프로토타입 경량 + VSCode 웹뷰 이식 대비). ⚠️ **dev 의존을 막는 규칙이 아니다**: typescript·svelte-check·prettier·vitest·@types/node는 devDependencies라 번들엔 한 바이트도 안 실린다 — 검증된 표준 dev 도구는 환영(단 '최소화는 미덕' — 표준 하나로, 난립 금지). 런타임에 필요한 잔것(신택스 하이라이트·아이콘 SVG)은 자작/인라인.
설계 원칙·불변식의 전문은 **[DESIGN.md](DESIGN.md)** — 이 문서는 세션 작업 규칙(HOW)만.

## 명령어

- `npm run dev` — 개발 서버 (localhost:5173)
- `npm run build` — `dist/` 정적 빌드. `vite.config.js`의 `base: './'`(상대경로)는 VSCode 웹뷰 이식용이니 절대 바꾸지 말 것
- `npm run preview` — 빌드 결과물 로컬 확인
- `npm run check` — 시나리오 검사(Vitest) + 타입 게이트 2종: `vitest run`(문구 팩 `src/lib/strings.test.ts` — 키 일치·App 사용 키·고아 금지·순수 데이터 / 봉문·정돈·이웃·족보 `src/lib/graph.test.ts` — 시나리오 15종 / 비급 역해석 `src/lib/markdown.test.ts` — 7종) + `tsc --noEmit` + `svelte-check`(에러만 게이트 — 현재 경고 0). `npm run build` 때 prebuild로 자동 실행. 단위 테스트만 따로 돌리려면 `npm run test`(1회)·`npm run test:watch`(감시). 순수층 테스트는 Vitest **node 환경 + svelte 플러그인 없음**이라 store(runes)를 import하면 깨진다 — 그게 곧 '순수층은 스토어 무관' 보초 (#166, CI·로컬 모두 node 22)
- `npm run format` — Prettier 일괄 (semi·singleQuote·printWidth 110, .prettierrc) — 세미콜론 종결 컨벤션(#115)의 강제 장치. 코드 수술 후 커밋 전에 돌릴 것
- 배포: `main` 푸시마다 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드 → GitHub Pages 자동 배포, PR에서는 빌드 검증만. 사이트: https://ghjang.github.io/noenae-gangho/
- 테스트는 **Vitest**(순수층 단위·문구 팩 정합 — `src/lib/*.test.ts`, #166), 린터는 없음(포매터 Prettier, 타입 tsc/svelte-check). 자동 검증은 `npm run build`(위 check 전부 포함) 통과가 전부 — 컴포넌트/조작은 헤드리스 e2e(수동)와 맨 아래 수동 체크리스트로 직접 논검
- 헤드리스 검증(렌더링/조작 버그 재현·수술 확인용): Claude Code 원격 컨테이너엔 전역 playwright가 있다 — `NODE_PATH=/opt/node22/lib/node_modules node 스크립트.cjs` (크로미움 `/opt/pw-browsers`). localhost 접속은 프록시 우회 필수: launch args `--proxy-bypass-list=<-loopback>` + env `NO_PROXY=localhost,127.0.0.1`. 그래프 시드는 `context.addInitScript`로 **로드 전에** localStorage에 심을 것 — 로드 후 setItem은 앱의 500ms 디바운스 저장이 도로 덮는다 (그래프 `noenae-gangho-v1` / 뷰 `noenae-gangho-view` `{x,y,s}`). 드래그 중 상태는 `mouse.down()` 후 `mouse.move()` 반복으로 동결해 검사
- 재사용 헤드리스 스위트: `scripts/e2e/*.cjs` (앵커/오행진/커서/서가·문서/緣·undo/집중/도움말/하이라이트/아이콘바/모바일/다중 선택/족보/캔버스 메커니즘/뷰 전환 점프(#178) — 14종, 빌드 게이트 아님·수동 실행). `canvas.cjs`는 줌(휠/Z/Ctrl±)·팬(드래그/화살표)·맞춤(Shift+1/2)·미니맵·리사이즈·緣 뒤집기(F)·검색 점프 — `.world` 인라인 transform 파싱으로 관찰(#152 분리 안전망). `npm run build && npm run preview -- --port 4173` 띄운 뒤 위 env로 `node scripts/e2e/<이름>.cjs`. 관련 부위를 수술하면 해당 스위트를 같이 갱신·재실행할 것 — 기능 추가로 도움말 수가 변하면 `help.cjs`의 요결 수부터 깨진다 (의도된 보초)

## 구조와 역할 분담

- `src/lib/types.ts` — 도메인 타입(`NoteNode`/`Edge`/`Color`) — 영속 화이트리스트(DESIGN 2장)와 한 몸. 영속 필드를 들이면 여기·`snapshot()`·`loadData()` 3곳 동기
- `src/lib/store.svelte.ts` — 모든 상태(`$state`)·변이 함수·저장 어댑터. **로직은 전부 여기로.** 컴포넌트에 도메인 상태 두지 말 것
  - `graph`/`ui`는 export된 `$state` 객체 — 재할당 금지, `push`/`splice`/`length = 0` 같은 제자리 변이만
  - 선택 변경은 선택 API(`selectNode`/`selectEdge`/`clearSelection`/`addToSelection`/`selectMany`/`pruneSelection`) 경유 — 직접 대입 금지. `ui.selectedIds`가 무리, `ui.selectedId`는 앵커(항상 무리 안, 단일 표적 작업 Tab/F2/Z/Alt+화살표의 기준), 緣 선택과 상호 배타
  - 변이 함수는 첫머리에 `markUndo()`(되돌리기 스택 — 타이핑·드래그 등 연속 제스처는 key로 병합, 복합 변이는 `asOneStep`으로 한 걸음) · 끝에 `scheduleSave()`(500ms 디바운스). 스토어 밖 직접 변이(드래그/넛지의 `n.x/n.y`)는 호출부가 둘 다 챙긴다 — 빠뜨리면 저장 증발/유령 undo
- `src/lib/strings.ts` — UI 문구 팩: `muhyeop`(무협 톤, 기본) / `plain`(일반 톤). 화면에 보이는 문구를 App에 하드코딩하지 말고 팩 키로 — 새 문구는 두 팩에 같은 키로 추가. 팩은 순수 데이터(JSON 직렬화 가능) — 함수 금지, 매개변수 문구는 `{label}` 플레이스홀더 + `fmt()` 치환
- `src/lib/geometry.ts` — 緣 기하 순수 함수(`nodeBox`/`center`/`edgeStart`/`edgeEnd`/`edgePath`/`arrowPath`/`ghostPath`). DOM·스토어 무관 — 노드 실측 전 폴백(180×48)은 `nodeBox()` 한 곳에만. 緣은 양끝 다 변 중앙 앵커(시작=edgeStart·끝=edgeEnd) — 우세 축 판정을 공유해 양끝 축이 늘 짝 맞는다
- `src/lib/graph.ts` — 緣 그래프 순수 함수(`computeHidden` 봉문 규칙 본체 · `neighborhood` 무방향 이웃(포커스) · `tidyLayout`+`separateComponents` 정돈(R) 트리 배치·성분 간 겹침 제거(#125, 전략은 분리해 교체 가능 #157) · `outlineRows`/`boardColumns` 족보·오행진 피더 · `outlineFilterRows` 족보 검색 필터(매칭 ∪ 조상, collapsed 무시 — #154) · 자식/뿌리 헬퍼). 봉문·정돈·필터 규칙을 바꾸면 `src/lib/graph.test.ts` 시나리오(Vitest)도 같이 갱신
- `src/lib/markdown.ts` — 비급.md 역해석 순수 함수(`fromMarkdown` — 들여쓰기 불릿 → 트리, 격자 배치 행=줄·열=깊이). 스토어 import 금지: 순수층은 스토어 무관이어야(Vitest node 환경엔 svelte 플러그인이 없어 runes를 못 굴린다 — store를 물면 테스트가 깨져 그게 곧 보초) — id 생성기를 자체로 갖는 이유. 규칙 바꾸면 `src/lib/markdown.test.ts`도 같이
- `src/lib/highlight.ts` — 시트 신택스 하이라이트 순수 토크나이저(JSON/비급.md, 외부 라이브러리 금지라 자작). 토큰 text를 이어 붙이면 입력과 동일해야 함 — 가져오기 편집 overlay(투명 textarea+pre) 정렬의 전제
- `src/App.svelte` — UI 셸: 상단 바·시트(입출력/도움말/서가)·키 라우터(`onKey`)·뷰 디스패치(`viewKey`)·검색(`.search-card`, 셸 잔류). 3뷰(캔버스/오행진/족보)는 형제 컴포넌트로 분리됨(#42·#152) — 캔버스 기하가 필요한 점프/맞춤은 `canvasRef?.`(bind:this) 위임. 큰 영역·새 뷰는 컴포넌트로(300줄 넘으면)
- `src/CanvasView.svelte` — 캔버스(마인드맵) 뷰 (#152, #151 키 라우터 위에서 분리). 캔버스 로컬 상태(드래그/올가미/팬/줌/리사이즈/핀치/호버)·기하(`toWorld`/`zoomAt`/`fitAll`/`fitSelection`/`centerOn`/`ensureVisible`)·노드/미니맵 조작·`onCanvasKey`·자기 `svelte:window`(포인터/keyup) 소유. 셸이 `bind:this`로 seam(`onKey`/`fitAll`/`fitSelection`/`jumpTo`/`centerOn`/`addAtCenter`/`zoomCenter`/`resetView`) 호출, `hue`(팔레트 호버색)·`closeSearch` 주입. 보초: `scripts/e2e/canvas.cjs`. 캔버스 전용 CSS는 자기 스코프 `<style>`로 이주됨(#160 1단계) — 토큰·공유 규칙(오행 `[data-color]` 매핑·버튼 베이스·`.hud`)은 app.css 잔류. 보드/족보 CSS도 각 컴포넌트 스코프로 이주 완료(#160 완결)
- `src/BoardView.svelte` — 오행진(칸반) 뷰 (#42, 첫 분리 컴포넌트). 종대 진형(색별 y→x)은 graph.ts `boardColumns`로 App의 보드 키 항법(#111)과 공유 — 따로 세면 어긋난다. 스타일은 자기 스코프 `<style>`(#160)
- `src/OutlineView.svelte` — 족보(아웃라인) 뷰 (#42 셋째 식구). 행 목록은 graph.ts `outlineRows`(비급.md와 같은 순회 율법 — ↻ 재방문·봉문 생략·스코프) — 규칙 바꾸면 `graph.test.ts` 족보 시나리오도 같이. 검색 필터(#154)는 셸 Ctrl+F가 부르는 `openSearch`/`closeSearch` seam(bind:this)으로 열고 닫는다(인라인 상단 검색창 — `outlineFilterRows`로 매칭 ∪ 조상만, 접기 멈춤·`<mark>` 강조). 필터 키보드 커서(↑↓ 골드 링)는 `ui.selectedId`와 분리한 로컬 `activeId` — 접힌 가지 속 매칭이 store 봉문 가지치기(App `$effect`의 `pruneSelection`)에 깎이는 걸 피한다(캔버스 검색 `searchIdx`와 같은 결). 스타일은 자기 스코프 `<style>`(#160)
- `src/app.css` — 디자인 토큰. 색은 반드시 CSS 변수 경유 (`--hanji`, `--inju`, `--c-*`). 하드코딩 hex 금지. 면 위계: 부유 패널(HUD·미니맵·검색 카드)은 `--panel`+`--hairline-strong`+그림자, 전폭 상단 바만 `--chrome`(다크) — 캔버스와의 분리감 규칙. **뷰별 CSS는 각 컴포넌트 스코프 `<style>`로 이주(#160)** — app.css엔 토큰·전역 리셋·공유 규칙(오행 `[data-color]` 색매핑·버튼 베이스)·셸 크롬(상단바/시트/HUD/검색/서가)만 잔류

## 핵심 설계 결정 — 바꾸기 전에 사용자에게 물을 것

1. **저장은 어댑터 패턴** (`setStorageAdapter`): localStorage는 기본값일 뿐. VSCode 웹뷰 이식 시 postMessage 어댑터로 교체 예정 — `load(docId)/save(docId, data)` 시그니처 유지 (#62부터 문서 단위, 파일 하나=문서 하나 그림). 문서 인덱스(`noenae-gangho-docs` — `{current, list:[{id,title,updatedAt}]}`)는 `persistDocs()`가 항구 — 이식 때 어댑터와 같이 갈아끼운다
2. **데이터 포맷** `{ app: 'noenae-gangho', v: 3, nodes, edges }` — 스키마 바꾸면 `v` 올리고 `loadData()`에 구버전 마이그레이션 추가 (v1→v2 `bw`, v2→v3 `collapsed` — 선택 필드뿐이라 마이그레이션 불요). `snapshot()`은 저장 필드를 화이트리스트로 추림(노드 `id,x,y,text,color,bw?,collapsed?` / 엣지 `id,a,b`) — 영속 필드를 새로 들이면 `snapshot()`과 `loadData()` 기본값 양쪽을 같이 고칠 것. 문서별 본문은 `noenae-gangho-doc-<id>`(포맷은 문서 단위로 동일), 옛 단일 키 `noenae-gangho-v1`은 첫 실행 이주 후 화석 백업(지우지 않되 다시 읽지도 않음)
3. **좌표계**: 노드 x/y는 world 좌표, 화면 변환은 `ui.pan`/`ui.scale`. 새 인터랙션은 `toWorld()` 경유
4. **노드 w/h는 실측** (`bind:offsetWidth/Height` — 테두리 포함 박스 치수) — 엣지 앵커 계산에 쓰임. 하드코딩 금지. clientWidth로 바꾸면 좌측 7px 띠만큼 우변이 안쪽으로 어긋나 화살촉이 박스에 묻힌다. ResizeObserver는 크기가 변할 때만 울리므로, 같은 id 객체를 갈아끼우는 `loadData()`(언두/불러오기)는 직전 실측을 물려받는다 — 빼먹으면 엣지가 허공을 찌른다
5. **엣지는 방향이 있다**: `a`=부모, `b`=자식. Tab 가지치기(`addChild`)와 비급.md 트리 출력(`toMarkdown`)이 이 방향에 의존하고, 화면에는 화살촉으로 표시(F키 = `flipEdge` 방향 뒤집기). 단 중복 판정(`addEdge`)은 무방향 — 같은 두 쪽지 사이 緣은 한 가닥뿐
6. **말투(톤) 전환은 문자열 팩 교체로만** (`ui.tone` + `STRINGS[ui.tone]`, 상단 바 무공봉인 토글 — 한자 아이콘 封/武, 접근 라벨은 `toneButtonAria`): 선택은 별도 localStorage 키 `noenae-gangho-tone`에 즉시 저장(`setTone` — `scheduleSave()` 안 탐) — 그래프 스냅샷/저장 어댑터와 무관, `snapshot()`에 넣지 말 것. 디자인(색·서체·먹빛)은 톤과 무관하게 공통. 뷰포트(팬/줌)도 같은 원칙이되 문서별 — 키 `noenae-gangho-view-<docId>`(`scheduleViewSave`, App의 `$effect`가 감지), 문서 전환 시 그 문서의 뷰로 복원. 뷰 모드(`noenae-gangho-viewmode-<docId>`)와 족보 스코프(`noenae-gangho-outline-<docId>`, `setOutlineScope`)도 문서별 — 톤만 문서 무관 전역

## 컨벤션 / 세계관

- 기본 말투는 무협 톤 한국어: 念=노드, 緣=엣지, 비급=내보내기, 주화입마=에러. `muhyeop` 팩의 새 문구도 이 결 유지 (예: "삭제 실패" 대신 "베기에 실패했다") — `plain` 팩은 담백한 표준어(쪽지→노트, 緣→연결)로
- TypeScript는 strict + **소거 가능 문법만**(tsconfig `erasableSyntaxOnly` — enum/namespace 금지): 'TS는 타입만'이라는 결(`verbatimModuleSyntax`와 한 쌍). 원래 검사 스크립트의 맨 node import에서 비롯됐고 지금은 Vitest가 굴리지만, 제약은 유지. import는 `.ts` 실확장자로(`allowImportingTsExtensions`), 문장은 세미콜론 종결(Prettier가 강제). `any`는 외부 JSON 검역 구간(loadData/ensureDocs)과 동적 합성 키뿐 — 새로 들일 땐 주석으로 경계 사유 명기
- 색 5종은 오행 체계: `muk/cheong/dan/hwang/nam` — 추가·변경 시 `Color`(types.ts) · `COLORS`(store) · `app.css`(`:root`의 `--c-*` 변수와 `.node[data-color]` 규칙 두 군데) · `colorLabel`(strings.ts 두 팩) 동기화
- 조작·단축키를 바꾸면 strings.ts 두 팩의 `helpItems`(도움말 카드)와 README '조작 요결' 표도 같이 갱신
- 커밋 메시지 한국어 환영. 유머 허용, 단 무엇을 왜 바꿨는지는 명확히

## 로드맵

할일·우선순위·설계 메모는 GitHub 이슈로 관리: https://github.com/ghjang/noenae-gangho/issues
새 할일을 이 문서나 README에 쌓지 말고 이슈로 등록할 것 (각 이슈 본문에 '우선순위: N' 표기 — 숫자 낮을수록 먼저). Claude Code 세션은 GitHub 도구로 이슈를 직접 읽고 쓸 수 있다 — 커밋/PR에 `closes #N`을 달면 머지 때 자동으로 닫힌다.

## 검증 체크리스트

- 빈 강호 / 시드 데이터 양쪽에서 dev 확인 — 빈 강호는 '강호 비우기' 또는 localStorage 키 `noenae-gangho-v1` 삭제, 저장본이 없으면 `seed()`가 창세 사연을 심는다
- 내보내기 → 비우기 → 불러오기 라운드트립 무손실 확인
- 줌 0.1x/2.5x 양끝에서 드래그·연결 동작 확인 (한계 상수는 store의 `SCALE_MIN/MAX` — 하한을 올리면 全 전체 보기가 큰 강호에서 또 잘린다)
- 무공봉인 토글 왕복 + 새로고침 후 말투 유지 확인 — 열린 시트의 제목·메시지도 즉시 갈리는지
- 새로고침 후 마지막 뷰(팬/줌) 복원 확인
- IME(한글) 조합 입력으로 쪽지 편집 — 조합 중 깨짐/중복 없는지 · 클립보드 복사 성공/실패 폴백 메시지 (둘 다 자동 검증 밖 — #115 점검에서 식별)
