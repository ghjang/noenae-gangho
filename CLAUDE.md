# CLAUDE.md — 腦內江湖 (noenae-gangho)

마인드맵형 아이디어 정리 웹앱. **Vite + Svelte 5 (runes)**.
런타임 의존성 0 — svelte/vite 외 라이브러리 추가 금지 (프로토타입 경량 유지가 원칙).
설계 원칙·불변식의 전문은 **[DESIGN.md](DESIGN.md)** — 이 문서는 세션 작업 규칙(HOW)만.

## 명령어

- `npm run dev` — 개발 서버 (localhost:5173)
- `npm run build` — `dist/` 정적 빌드. `vite.config.js`의 `base: './'`(상대경로)는 VSCode 웹뷰 이식용이니 절대 바꾸지 말 것
- `npm run preview` — 빌드 결과물 로컬 확인
- `npm run check` — 정합성 검사 3종: 문구 팩(`scripts/check-strings.mjs` — 키 일치·App 사용 키·고아 금지·순수 데이터) + 봉문 규칙(`scripts/check-graph.mjs` — 접기/순환 시나리오 5종) + 비급 역해석(`scripts/check-markdown.mjs` — 불릿 파서 시나리오 7종). `npm run build` 때 prebuild로 자동 실행
- 배포: `main` 푸시마다 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드 → GitHub Pages 자동 배포, PR에서는 빌드 검증만. 사이트: https://ghjang.github.io/noenae-gangho/
- 테스트·린트·포매터 없음. 자동 검증은 `npm run build`(위 문구 검사 포함) 통과가 전부 — 나머지는 맨 아래 수동 체크리스트로 직접 논검
- 헤드리스 검증(렌더링/조작 버그 재현·수술 확인용): Claude Code 원격 컨테이너엔 전역 playwright가 있다 — `NODE_PATH=/opt/node22/lib/node_modules node 스크립트.cjs` (크로미움 `/opt/pw-browsers`). localhost 접속은 프록시 우회 필수: launch args `--proxy-bypass-list=<-loopback>` + env `NO_PROXY=localhost,127.0.0.1`. 그래프 시드는 `context.addInitScript`로 **로드 전에** localStorage에 심을 것 — 로드 후 setItem은 앱의 500ms 디바운스 저장이 도로 덮는다 (그래프 `noenae-gangho-v1` / 뷰 `noenae-gangho-view` `{x,y,s}`). 드래그 중 상태는 `mouse.down()` 후 `mouse.move()` 반복으로 동결해 검사
- 재사용 헤드리스 스위트: `scripts/e2e/*.cjs` (앵커/다중 선택/집중/도움말/하이라이트/아이콘바/모바일/커서 — 8종, 빌드 게이트 아님·수동 실행). `npm run build && npm run preview -- --port 4173` 띄운 뒤 위 env로 `node scripts/e2e/<이름>.cjs`. 관련 부위를 수술하면 해당 스위트를 같이 갱신·재실행할 것 — 기능 추가로 도움말 수가 변하면 `help.cjs`의 요결 수부터 깨진다 (의도된 보초)

## 구조와 역할 분담

- `src/lib/store.svelte.js` — 모든 상태(`$state`)·변이 함수·저장 어댑터. **로직은 전부 여기로.** 컴포넌트에 도메인 상태 두지 말 것
  - `graph`/`ui`는 export된 `$state` 객체 — 재할당 금지, `push`/`splice`/`length = 0` 같은 제자리 변이만
  - 선택 변경은 선택 API(`selectNode`/`selectEdge`/`clearSelection`/`addToSelection`/`selectMany`/`pruneSelection`) 경유 — 직접 대입 금지. `ui.selectedIds`가 무리, `ui.selectedId`는 앵커(항상 무리 안, 단일 표적 작업 Tab/F2/Z/Alt+화살표의 기준), 緣 선택과 상호 배타
  - 변이 함수는 첫머리에 `markUndo()`(되돌리기 스택 — 타이핑·드래그 등 연속 제스처는 key로 병합, 복합 변이는 `asOneStep`으로 한 걸음) · 끝에 `scheduleSave()`(500ms 디바운스). 스토어 밖 직접 변이(드래그/넛지의 `n.x/n.y`)는 호출부가 둘 다 챙긴다 — 빠뜨리면 저장 증발/유령 undo
- `src/lib/strings.js` — UI 문구 팩: `muhyeop`(무협 톤, 기본) / `plain`(일반 톤). 화면에 보이는 문구를 App에 하드코딩하지 말고 팩 키로 — 새 문구는 두 팩에 같은 키로 추가. 팩은 순수 데이터(JSON 직렬화 가능) — 함수 금지, 매개변수 문구는 `{label}` 플레이스홀더 + `fmt()` 치환
- `src/lib/geometry.js` — 緣 기하 순수 함수(`nodeBox`/`center`/`edgeStart`/`edgeEnd`/`edgePath`/`arrowPath`/`ghostPath`). DOM·스토어 무관 — 노드 실측 전 폴백(180×48)은 `nodeBox()` 한 곳에만. 緣은 양끝 다 변 중앙 앵커(시작=edgeStart·끝=edgeEnd) — 우세 축 판정을 공유해 양끝 축이 늘 짝 맞는다
- `src/lib/graph.js` — 緣 그래프 순수 함수(`computeHidden` 봉문 규칙 본체 · `neighborhood` 무방향 이웃(포커스) · 자식/뿌리 헬퍼). 봉문 규칙을 바꾸면 `scripts/check-graph.mjs` 시나리오도 같이 갱신
- `src/lib/markdown.js` — 비급.md 역해석 순수 함수(`fromMarkdown` — 들여쓰기 불릿 → 트리, 격자 배치 행=줄·열=깊이). 스토어 import 금지: runes 탓에 맨 node(검사 스크립트)가 못 읽는다 — id 생성기를 자체로 갖는 이유. 규칙 바꾸면 `scripts/check-markdown.mjs`도 같이
- `src/lib/highlight.js` — 시트 신택스 하이라이트 순수 토크나이저(JSON/비급.md, 외부 라이브러리 금지라 자작). 토큰 text를 이어 붙이면 입력과 동일해야 함 — 가져오기 편집 overlay(투명 textarea+pre) 정렬의 전제
- `src/App.svelte` — UI 전체 (캔버스/노드/엣지/시트/도움말). 단일 컴포넌트 유지가 기본, 새 영역이 300줄 넘을 때만 분리 검토
- `src/app.css` — 디자인 토큰. 색은 반드시 CSS 변수 경유 (`--hanji`, `--inju`, `--c-*`). 하드코딩 hex 금지. 면 위계: 부유 패널(HUD·미니맵·검색 카드)은 `--panel`+`--hairline-strong`+그림자, 전폭 상단 바만 `--chrome`(다크) — 캔버스와의 분리감 규칙

## 핵심 설계 결정 — 바꾸기 전에 사용자에게 물을 것

1. **저장은 어댑터 패턴** (`setStorageAdapter`): localStorage는 기본값일 뿐. VSCode 웹뷰 이식 시 postMessage 어댑터로 교체 예정 — `load(docId)/save(docId, data)` 시그니처 유지 (#62부터 문서 단위, 파일 하나=문서 하나 그림). 문서 인덱스(`noenae-gangho-docs` — `{current, list:[{id,title,updatedAt}]}`)는 `persistDocs()`가 항구 — 이식 때 어댑터와 같이 갈아끼운다
2. **데이터 포맷** `{ app: 'noenae-gangho', v: 3, nodes, edges }` — 스키마 바꾸면 `v` 올리고 `loadData()`에 구버전 마이그레이션 추가 (v1→v2 `bw`, v2→v3 `collapsed` — 선택 필드뿐이라 마이그레이션 불요). `snapshot()`은 저장 필드를 화이트리스트로 추림(노드 `id,x,y,text,color,bw?,collapsed?` / 엣지 `id,a,b`) — 영속 필드를 새로 들이면 `snapshot()`과 `loadData()` 기본값 양쪽을 같이 고칠 것. 문서별 본문은 `noenae-gangho-doc-<id>`(포맷은 문서 단위로 동일), 옛 단일 키 `noenae-gangho-v1`은 첫 실행 이주 후 화석 백업(지우지 않되 다시 읽지도 않음)
3. **좌표계**: 노드 x/y는 world 좌표, 화면 변환은 `ui.pan`/`ui.scale`. 새 인터랙션은 `toWorld()` 경유
4. **노드 w/h는 실측** (`bind:offsetWidth/Height` — 테두리 포함 박스 치수) — 엣지 앵커 계산에 쓰임. 하드코딩 금지. clientWidth로 바꾸면 좌측 7px 띠만큼 우변이 안쪽으로 어긋나 화살촉이 박스에 묻힌다. ResizeObserver는 크기가 변할 때만 울리므로, 같은 id 객체를 갈아끼우는 `loadData()`(언두/불러오기)는 직전 실측을 물려받는다 — 빼먹으면 엣지가 허공을 찌른다
5. **엣지는 방향이 있다**: `a`=부모, `b`=자식. Tab 가지치기(`addChild`)와 비급.md 트리 출력(`toMarkdown`)이 이 방향에 의존하고, 화면에는 화살촉으로 표시(F키 = `flipEdge` 방향 뒤집기). 단 중복 판정(`addEdge`)은 무방향 — 같은 두 쪽지 사이 緣은 한 가닥뿐
6. **말투(톤) 전환은 문자열 팩 교체로만** (`ui.tone` + `STRINGS[ui.tone]`, 상단 바 무공봉인 토글 — 한자 아이콘 封/武, 접근 라벨은 `toneButtonAria`): 선택은 별도 localStorage 키 `noenae-gangho-tone`에 즉시 저장(`setTone` — `scheduleSave()` 안 탐) — 그래프 스냅샷/저장 어댑터와 무관, `snapshot()`에 넣지 말 것. 디자인(색·서체·먹빛)은 톤과 무관하게 공통. 뷰포트(팬/줌)도 같은 원칙이되 문서별 — 키 `noenae-gangho-view-<docId>`(`scheduleViewSave`, App의 `$effect`가 감지), 문서 전환 시 그 문서의 뷰로 복원. 톤만 문서 무관 전역

## 컨벤션 / 세계관

- 기본 말투는 무협 톤 한국어: 念=노드, 緣=엣지, 비급=내보내기, 주화입마=에러. `muhyeop` 팩의 새 문구도 이 결 유지 (예: "삭제 실패" 대신 "베기에 실패했다") — `plain` 팩은 담백한 표준어(쪽지→노트, 緣→연결)로
- 색 5종은 오행 체계: `muk/cheong/dan/hwang/nam` — 추가·변경 시 `COLORS`(store) · `app.css`(`:root`의 `--c-*` 변수와 `.node[data-color]` 규칙 두 군데) · `colorLabel`(strings.js 두 팩) 동기화
- 조작·단축키를 바꾸면 strings.js 두 팩의 `helpItems`(도움말 카드)와 README '조작 요결' 표도 같이 갱신
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
