<script lang="ts">
  // ──────────────────────────────────────────────
  // 뇌내강호(腦內江湖) — 메인 컴포넌트
  // 먹빛 허공에 念(쪽지)을 띄우고 緣(연결)으로 잇는다.
  // 상태/영속화는 lib/store.svelte.ts, 모양은 app.css, 문구는 lib/strings.ts가 담당.
  // ──────────────────────────────────────────────
  import { onMount, tick } from 'svelte';
  import CanvasView from './CanvasView.svelte';
  import BoardView from './BoardView.svelte';
  import OutlineView from './OutlineView.svelte';
  import {
    graph,
    ui,
    COLORS,
    byId,
    init,
    selectNode,
    clearSelection,
    selectMany,
    pruneSelection,
    addNodeAt,
    setColorMany,
    setInk,
    removeNodes,
    toggleCollapse,
    clearAll,
    docs,
    switchDoc,
    createDoc,
    renameDoc,
    removeDoc,
    setViewMode,
    setOutlineScope,
    popOutlineScope,
    snapshot,
    loadData,
    scheduleSave,
    toggleTone,
    asOneStep,
    undo,
    redo,
    flushSave,
    commitEditing,
  } from './lib/store.svelte.ts';
  import { STRINGS, TONES, fmt } from './lib/strings.ts';
  import { nodeBox } from './lib/geometry.ts';
  import {
    computeHidden,
    neighborhood,
    childIdsOf,
    childCounts,
    boardColumns,
    outlineRows,
  } from './lib/graph.ts';
  import { fromMarkdown } from './lib/markdown.ts';
  import { highlightJson, highlightMd, highlightAuto } from './lib/highlight.ts';
  import type { NoteNode } from './lib/types.ts';

  // 현재 말투 팩 — 무공봉인 토글(ui.tone)에 따라 문구 전체가 갈린다
  const t = $derived(STRINGS[ui.tone]);

  // 캔버스 뷰 핸들 — bind:this. 캔버스가 마운트된 동안만 실존(보드/족보 뷰에선 null) —
  // 셸의 키 라우터·검색·점프가 canvasRef?.로 부른다 (#152 분리). 보초: scripts/e2e/canvas.cjs
  let canvasRef = $state<CanvasView>();
  // 족보 뷰 핸들 — bind:this. 셸의 Ctrl+F가 검색 필터를 열고(openSearch), 단계식 Esc가 닫는다
  // (closeSearch). 족보 뷰일 때만 실존(다른 뷰에선 null) (#154)
  let outlineRef = $state<OutlineView>();

  // bind:this 참조(hlPre/searchEl)는 $state로 받는다 — Svelte 5에선 bind:this 대상도 $state여야
  // 값 갱신을 컴파일러가 추적해 non_reactive_update 경고가 안 뜬다. 실제론 DOM 메서드 호출용
  let colorHover = $state<import('./lib/types.ts').Color | null>(null); // 팔레트 호버 중인 오행색 — 선택 없을 때 같은 색 비추기
  let sheetText = $state(''); // 입출력 시트 본문
  let mdRespectCollapsed = $state(false); // 비급.md 봉문 반영 옵션 (#147) — 시트 열 때마다 꺼짐(전체가 안전 기본)
  let hlPre = $state<HTMLElement | null>(null); // 가져오기 편집 overlay 하이라이트 pre — 스크롤 동기화 (위 $state 주석)
  // 시트 하단 메시지 — strings 키 (톤이 바뀌어도 현재 팩으로 그리기 위해)
  let sheetMsg = $state<'' | 'importBadShape' | 'importParseFail' | 'copyOk' | 'copyFail'>('');
  let searchQ = $state<string | null>(null); // 검색 질의 — null이면 닫힘
  let searchIdx = $state(0); // 하이라이트 = 지금/다음에 볼 결과 (화면과 항상 일치)
  let searchJumped = false; // Enter 의미 분기: 처음엔 현재 항목, 그 뒤엔 전진 후 점프
  let searchEl = $state<HTMLInputElement | null>(null); // 검색 input — 재호출 시 전체 선택 (위 $state 주석)

  onMount(() => {
    init();
  });

  $effect(() => {
    document.title = t.docTitle;
  });

  // ── 검색 (Ctrl+F) ────────────────────────────
  // 검색은 셸(App)에 남는다 — Esc/Ctrl+F 라우터·검색창 Shift+1/2와 한 몸이라(#152).
  // 캔버스 기하가 필요한 점프/맞춤은 canvasRef로 위임
  const matches = $derived.by(() => {
    if (searchQ === null) return [];
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes.filter((n) => n.text.toLowerCase().includes(q)).slice(0, 8);
  });
  function onSearchKey(e: KeyboardEvent) {
    const len = matches.length;
    if (e.key === 'Escape') {
      e.stopPropagation(); // 전역 Esc(단계식 해제)가 같은 키로 또 동작하지 않게
      searchQ = null;
    } else if (e.key === 'ArrowDown' && len) {
      e.preventDefault();
      searchIdx = (searchIdx + 1) % len;
      searchJumped = false; // 화살표로 고른 항목엔 다음 Enter가 '그대로' 점프
    } else if (e.key === 'ArrowUp' && len) {
      e.preventDefault();
      searchIdx = (searchIdx - 1 + len) % len;
      searchJumped = false;
    } else if (e.key === 'Enter' && len) {
      // 첫 Enter = 현재 하이라이트로, 그 뒤 = 전진(Shift면 후진) 후 점프
      // — 하이라이트가 항상 화면의 결과와 일치한다
      if (searchJumped) searchIdx = e.shiftKey ? (searchIdx - 1 + len) % len : (searchIdx + 1) % len;
      canvasRef?.jumpTo(matches[searchIdx % len]);
      searchJumped = true;
    }
  }
  const focusit = (el: HTMLElement) => {
    el.focus();
  };

  // ── 키보드 (전역 라우터) ──────────────────────
  // DESIGN 9장 단축키 계층의 코드판(#151): 전역층(Esc 단계식·Ctrl 앱 전역·V/숫자 뷰 전환)을
  // 먼저 처리한 뒤 viewKey[viewMode](e)로 디스패치 — 캔버스도 canvasRef.onKey로 빠져 세 뷰 대칭.
  // 줌·검색은 Ctrl이라 의미는 캔버스라도 전역층에 남는 회색지대 (주석으로 표시)
  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    const inField = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
    // 포커스가 버튼에 있으면 Space/Enter는 버튼의 몫 — '강호 비우기' 오발사 방지.
    // 오행진 카드·족보 행(역시 버튼)만 예외: 그 위의 Enter는 각 뷰의 항법(점프)이 받는다
    // (족보의 ▸/▾·스코프 버튼은 예외가 아니다 — 네이티브 Enter 활성 유지)
    if (
      el?.tagName === 'BUTTON' &&
      (e.code === 'Space' || e.key === 'Enter') &&
      !el.matches('.board .card, .outline button.row')
    )
      return;
    if (e.key === 'Escape') {
      // 족보 검색 필터(#154)가 열려 있으면 그것부터 닫는다(한 단계) — 스코프 팝/선택해제는 다음 Esc.
      // 입력창에 포커스가 있을 땐 OutlineView가 stopPropagation으로 먼저 닫아 여긴 안 온다 — 여기는
      // 행 등 다른 데로 포커스가 옮겨간 뒤의 Esc 길(closeSearch는 닫았을 때만 true)
      if (ui.viewMode === 'outline' && outlineRef?.closeSearch()) return;
      // 단계식 — 열린 것(시트/도움말/검색/연결/편집/비우기 무장)을 먼저 닫고,
      // 닫을 게 없을 때의 Esc는 선택 해제 (캔버스 툴 관행)
      const hadOpen =
        ui.linking ||
        ui.overlay ||
        ui.showHelp ||
        ui.focusId ||
        searchQ !== null ||
        ui.editingId ||
        (ui.viewMode === 'outline' && ui.outlineRootId); // 족보 스코프도 '열린 것' — 렌즈니까
      ui.linking = null;
      ui.overlay = null;
      ui.showHelp = false;
      ui.focusId = null;
      searchQ = null;
      if (ui.viewMode === 'outline' && ui.outlineRootId) popOutlineScope(); // 한 단 위로 — 0(전체 직행)과 구분
      commitEditing();
      if (!hadOpen) clearSelection();
      return;
    }
    if (ui.overlay) return;
    // ── Ctrl/Cmd 층 (앱 전역 수식자 — DESIGN 9장) ── 뷰별 디스패치 위에 둔다: undo/redo는
    // 어느 뷰서나, 줌(±/0)·검색(F)은 '의미는 캔버스지만 Ctrl이라' 이 층에서 처리(회색지대 —
    // v1은 뷰별로 안 쪼갠다). 줌/검색은 입력 필드 포커스 중에도 캔버스 몫(검색창 띄운 채
    // Ctrl+±로 찾은 쪽지 확대), 나머지 Ctrl 조합은 필드 네이티브에 양보
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      // 오행진(보드)에선 되돌리기 + 색 이동만 — 줌/검색/편집 진입은 캔버스 몫, 나머진 브라우저에
      if (ui.viewMode !== 'canvas') {
        // 족보 Ctrl+F — 인라인 검색 필터 열기 (#154). 캔버스 Ctrl+F(念 수소문)의 족보판:
        // 캔버스는 부유 검색 카드, 족보는 상단 인라인 필터(매칭 ∪ 조상만 남긴다). 오행진엔 아직 없다
        if (e.code === 'KeyF' && ui.viewMode === 'outline') {
          e.preventDefault();
          outlineRef?.openSearch();
          return;
        }
        // 비캔버스 뷰(오행진/족보)엔 줌 대상이 없다 — Ctrl ±/0는 '동작 없이 막기만'.
        // 양보하면 브라우저 페이지 줌이 새므로(캔버스에서 봉인한 그 동작), 전 뷰 일관 차단.
        // 단축키 계층(DESIGN 9장): Ctrl는 앱 전역, 비캔버스는 그 부분집합 (사용자 제보)
        if (
          e.key === '+' ||
          e.key === '=' ||
          e.code === 'NumpadAdd' ||
          e.key === '-' ||
          e.code === 'NumpadSubtract' ||
          e.key === '0' ||
          e.code === 'Numpad0'
        ) {
          e.preventDefault();
          return;
        }
        if (e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (e.code === 'KeyY') {
          e.preventDefault();
          redo();
        } else if (
          ui.viewMode === 'kanban' &&
          !e.altKey &&
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          ui.selectedIds.length
        ) {
          // Ctrl+←→ — 선택 카드를 이웃 종대 색으로 (#105 경량 편집 첫 수, 양끝 순환).
          // 오행진 전용 — 족보의 질문('위계로 읽기') 밖이라 들이지 않는다 (렌즈 원칙).
          // 빈 종대도 어엿한 목적지. 팔레트 칠하기와 같은 변이(setColorMany) —
          // undo 한 걸음, 종대 비행(crossfade)은 공짜. 무리면 앵커 색 기준으로 일괄
          e.preventDefault();
          const i = COLORS.indexOf(byId(ui.selectedId)?.color ?? COLORS[0]);
          setColorMany(
            ui.selectedIds,
            COLORS[(i + (e.key === 'ArrowRight' ? 1 : -1) + COLORS.length) % COLORS.length],
          );
        }
        return;
      }
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault();
        canvasRef?.zoomCenter(1.18);
        return;
      }
      if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        canvasRef?.zoomCenter(1 / 1.18);
        return;
      }
      if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        canvasRef?.resetView();
        return;
      }
      if (e.code === 'KeyF') {
        // 무한 캔버스에서 브라우저 찾기는 무용지물 — 念 수소문으로 (#4)
        e.preventDefault();
        if (searchQ === null) {
          searchQ = '';
          searchIdx = 0;
          searchJumped = false;
        } else searchEl?.select(); // 이미 열려 있으면 질의 유지 + 전체 선택 (찾기 관행)
        return;
      }
      if (inField) return; // Ctrl+Z/A/C/V 등은 입력 필드의 몫
      if (e.code === 'KeyA') {
        e.preventDefault(); // 보이는 쪽지 전부 무리로 (#39) — 봉문 속은 빼고
        selectMany(graph.nodes.filter((n) => !hidden.has(n.id)).map((n) => n.id));
        return;
      }
      if (e.key === 'Enter' && ui.selectedId && !ui.editingId) {
        e.preventDefault();
        ui.editingId = ui.selectedId;
        return; // F2와 동일 — 편집 진입
      }
      if (e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.code === 'KeyY') {
        e.preventDefault();
        redo();
        return;
      }
      return; // 나머지 Ctrl 조합(새로고침 등)은 브라우저 몫
    }
    // 검색창에서도 보기 단축키는 통한다 — Shift+1 전체 / Shift+2 찾은 쪽지 가득
    // ('!','@' 직접 입력은 포기 — 부분 일치 검색이라 기호 없이도 찾힌다)
    if (inField && el === searchEl && e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
      e.preventDefault();
      if (e.code === 'Digit1') {
        canvasRef?.fitAll();
      } else {
        const m = matches.length ? matches[searchIdx % matches.length] : selected;
        if (m) {
          canvasRef?.jumpTo(m); // 개문 + 선택 + 중앙
          canvasRef?.fitSelection(m); // 그리고 화면 가득
          searchJumped = true;
        }
      }
      return;
    }
    if (inField) return;
    // V/Shift+V — 뷰 순환/역순환 (캔버스→오행진→족보), 1·2·3 — 뷰 직행: 전 뷰 공통.
    if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      goView((e.shiftKey ? PREV_VIEW : NEXT_VIEW)[ui.viewMode]);
      return;
    }
    // 3 = 족보 직행. 기본은 전체 족보 + 선택 念을 화면 중앙(1·2와 같은 결 — 직행은 선택을
    // 시야에 비출 뿐 시야를 좁히지 않는다), Shift+3은 선택 가지로 집중(스코프). #185
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'Digit3') {
      e.preventDefault();
      goView('outline', { scopeOutline: e.shiftKey });
      return;
    }
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey &&
      (e.code === 'Digit1' || e.code === 'Digit2')
    ) {
      e.preventDefault();
      goView(e.code === 'Digit1' ? 'canvas' : 'kanban');
      return;
    }
    // ── 뷰별 디스패치 ── 전역(Esc·Ctrl·V·1/2/3·검색창)을 다 지난 뒤, 나머지 키는 현재
    // 뷰의 핸들러에게 넘긴다. 캔버스도 canvasRef.onKey로 빠져 세 뷰가 대칭 — onKey는 '전역 먼저
    // → 뷰 핸들러' 얇은 라우터로 남는다. 새 뷰 = 핸들러 1개 + viewKey 한 줄 (#151)
    viewKey[ui.viewMode](e);
  }
  // 키 디스패치 테이블 — viewMode → 그 뷰의 (전역이 아닌) 키 핸들러. DESIGN 9장 단축키
  // 계층의 코드판: 한 글자 키 = 그 뷰의 도구. 새 뷰는 여기 한 줄 + 핸들러 하나면 입주.
  // 캔버스는 핸들이 살아 있을 때만 — 마운트 전(부팅 찰나)엔 무동작 가드
  const viewKey = {
    canvas: (e: KeyboardEvent) => canvasRef?.onKey(e),
    kanban: onBoardKey,
    outline: onOutlineKey,
  };

  // ── 입출력 시트 ──────────────────────────────
  function openExport() {
    sheetMsg = '';
    sheetText = JSON.stringify(snapshot(), null, 2);
    ui.overlay = { mode: 'export' };
  }
  function openImport() {
    sheetMsg = '';
    sheetText = '';
    ui.overlay = { mode: 'import' };
  }
  function openMd() {
    sheetMsg = '';
    mdRespectCollapsed = false; // 열 때마다 전체로 리셋 — 취향 저장 안 함('왜 일부만 나오지?' 혼란 방지)
    sheetText = toMarkdown();
    ui.overlay = { mode: 'md' };
  }
  function applyImport() {
    const raw = sheetText.trim();
    // 양식 자동 판별 (#5) — JSON은 반드시 {/[로 시작. 그 외는 비급.md(들여쓰기 불릿)로 해석
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const data = JSON.parse(raw);
        let ok = false;
        asOneStep(() => {
          ok = loadData(data);
        }); // 흡수도 되돌릴 수 있게
        if (ok) {
          scheduleSave();
          ui.overlay = null;
        } else sheetMsg = 'importBadShape';
      } catch {
        sheetMsg = 'importParseFail'; // 깨진 JSON을 md로 오인해 외쪽지 한 장 만들지 않게
      }
      return;
    }
    const data = fromMarkdown(
      raw,
      TONES.map((k) => STRINGS[k].mdEmptyNode),
    );
    if (!data) {
      sheetMsg = 'importBadShape';
      return;
    }
    asOneStep(() => loadData(data));
    scheduleSave();
    ui.overlay = null;
    // 좌표 없이 격자로 태어난 강호 — 전경을 한눈에. 캔버스로 돌아가 뷰포트가 선 뒤 맞춤
    // (다른 뷰에서 가져왔을 수도 있으니 — canvasRef는 캔버스 마운트 후에야 산다)
    setViewMode('canvas');
    tick().then(() => canvasRef?.fitAll());
  }
  async function copySheet() {
    try {
      await navigator.clipboard.writeText(sheetText);
      sheetMsg = 'copyOk';
    } catch {
      sheetMsg = 'copyFail';
    }
  }

  // 그래프 → 마크다운 개요 (루트부터 가지치기, 순환은 ↻ 표시)
  // respectCollapsed=true면 봉문(접힌) 가지의 후손을 생략 — 족보 뷰(graph.outlineRows)와
  // 한 순회 율법으로 합류(#147). 기본(false)은 전체 트리 — 백업·전체 공유의 안전 기본값
  function toMarkdown(respectCollapsed = false) {
    const out = [t.mdHeading, ''];
    const incoming = new Set(graph.edges.map((e) => e.b));
    const kidsOf = (id: string) =>
      childIdsOf(graph.edges, id)
        .map(byId)
        .filter((m): m is NoteNode => !!m); // 緣 순서 보존
    const label = (n: NoteNode) => (n.text || t.mdEmptyNode).replace(/\s*\n+\s*/g, ' / ');
    const seen = new Set<string>();
    const walk = (n: NoteNode, d: number) => {
      if (seen.has(n.id)) {
        out.push(`${'  '.repeat(d)}- ${label(n)} ↻`);
        return;
      }
      seen.add(n.id);
      out.push(`${'  '.repeat(d)}- ${label(n)}`);
      if (respectCollapsed && n.collapsed) return; // 봉문 존중 — outlineRows와 동일
      for (const k of kidsOf(n.id)) walk(k, d + 1);
    };
    for (const r of graph.nodes.filter((n) => !incoming.has(n.id))) walk(r, 0);
    // 잔여(뿌리 없는 순환 덩어리) — 봉문 반영 땐 그늘 속은 구제 금지(접힌 가지가 뿌리로
    // 부활하는 사고 방지, outlineRows와 동일). 전체 모드(기본)에선 종전대로 빠짐없이.
    const hidden = respectCollapsed ? computeHidden(graph.nodes, graph.edges) : null;
    for (const n of graph.nodes) if (!seen.has(n.id) && !hidden?.has(n.id)) walk(n, 0);
    return out.join('\n');
  }

  // 도움말 — 퀵 카드(필수 요결)에서 전체 요결 시트로
  function openHelpAll() {
    ui.showHelp = false;
    ui.overlay = { mode: 'help' };
  }
  // 전체 요결 시트·퀵 카드 공용 — 키→설명 사전
  const helpMap = $derived(new Map(t.helpItems));
  // 퀵 카드 목록 — helpQuick 키 순서대로 (본문 중복 없이)
  const quickHelp = $derived(
    t.helpQuick
      .map((k): [string, string | undefined] => [k, helpMap.get(k)])
      .filter((p): p is [string, string] => !!p[1]),
  );

  // ── 서가 (다중 문서, #62) ─────────────────────
  let docEditId = $state<string | null>(null); // 이름 고치는 중인 문서 id (시트 안 인라인 입력)
  let docKillId = $state<string | null>(null); // 베기 확인 중인 문서 id (시트 안 인라인 확인)
  const curDoc = $derived(docs.list.find((d) => d.id === docs.current));
  function openDocs() {
    docEditId = null;
    docKillId = null;
    ui.overlay = { mode: 'docs' };
  }
  function commitDocRename(id: string, value: string) {
    renameDoc(id, value);
    docEditId = null;
  }

  // ── 뷰 모드 (#42) — 캔버스 → 오행진(칸반) → 족보(아웃라인) 순환 ────
  const NEXT_VIEW = { canvas: 'kanban', kanban: 'outline', outline: 'canvas' } as const;
  const PREV_VIEW = { canvas: 'outline', kanban: 'canvas', outline: 'kanban' } as const;
  // 족보 스코프(ui.outlineRootId)는 store 소관 — 문서별로 영속(setOutlineScope), 전환 시 복원.
  // 모든 뷰 이동의 공용 길 — 순환(V/토글)·역순환(Shift+V)·직행(1/2/3)이 다 이 문을 지난다.
  // 족보 진입(#185): 기본(3·V·토글)은 전체 족보 + 선택 念을 화면 중앙(1·2와 같은 결 — 직행은
  // 선택을 시야에 비출 뿐 시야를 좁히지 않는다). opts.scopeOutline(Shift+3)일 때만 선택 가지로 집중
  async function goView(mode: 'canvas' | 'kanban' | 'outline', opts: { scopeOutline?: boolean } = {}) {
    commitEditing();
    searchQ = null;
    ui.linking = null;
    // 집중(L)은 캔버스 전용 렌즈 — 켠 채 들어가면 선택 정리 effect가 집중으로
    // 좁힌 hidden으로 버블 밖 카드 선택을 증발시킨다. 렌즈 끄고 입장
    ui.focusId = null;
    if (mode === 'outline') {
      // Shift+3 = 선택 가지로 집중(스코프, 선택 있을 때만). 그 외(3·V·토글)는 전체 족보(스코프 해제)
      if (opts.scopeOutline) {
        if (ui.selectedId) setOutlineScope(ui.selectedId);
      } else {
        setOutlineScope(null);
      }
    }
    // 비캔버스 → 캔버스 전환 시 선택 念을 화면 중앙으로 — 작업 흐름 유지(#178). 선택 있을 때만:
    // 없으면 저장 뷰포트 복원 그대로(특정 念 줌/이동 없음). 팬만(centerOn) — 줌은 안 건드린다.
    const land = mode === 'canvas' && ui.viewMode !== 'canvas' && ui.selectedId ? byId(ui.selectedId) : null;
    setViewMode(mode);
    if (land) {
      await tick(); // 캔버스가 서야 canvasRef.centerOn 가능 (boardJump와 같은 패턴)
      canvasRef?.centerOn(land);
    }
    // 전체 족보 진입 + 선택 있으면 그 행을 화면 중앙으로(#185) — 캔버스 centerOn의 족보판.
    // 스코프(Shift+3)는 OutlineView의 rootId 변경 effect가 이미 시야로 끌어온다(scrollIntoView)
    if (mode === 'outline' && !opts.scopeOutline && ui.selectedId) {
      await tick(); // 족보가 서야 outlineRef.centerSelected 가능
      outlineRef?.centerSelected();
    }
  }
  function toggleView() {
    goView(NEXT_VIEW[ui.viewMode]);
  }
  // 새 쪽지(+ 버튼) — 캔버스면 화면 중앙에(canvasRef.addAtCenter), 비캔버스 뷰(오행진/족보)엔
  // '화면 중앙'이 없으니 #105의 좌표 규칙으로: 붓 색 마지막 쪽지 아래 이어 붙이기(같은 x),
  // 그 색이 없으면 맨 아래 쪽지 아래 — 캔버스 배치 보존. 편집기가 없는 뷰라 선택까지만(edit=false).
  // 캔버스 분기는 CanvasView 소유, 셸은 캔버스 부재 시의 길만 (#152 — 같은 변이 함수 재사용)
  function addNote() {
    searchQ = null; // 새 쪽지 행동 = 검색 팝오버 닫기 (캔버스/쪽지 클릭과 같은 국룰)
    if (canvasRef) {
      canvasRef.addAtCenter();
      return;
    }
    const pool = graph.nodes.filter((n) => n.color === ui.ink);
    const anchor = (pool.length ? pool : graph.nodes).reduce<NoteNode | null>(
      (a, b) => (!a || b.y > a.y ? b : a),
      null,
    );
    if (anchor) addNodeAt(anchor.x, anchor.y + nodeBox(anchor).h + 24, '', ui.ink, false);
    else addNodeAt(0, 0, '', ui.ink, false);
  }
  // 오행진/족보 더블클릭 — 강호의 그 자리로 (모드 전환 후 캔버스가 서야 canvasRef.jumpTo 가능)
  async function boardJump(n: NoteNode) {
    setViewMode('canvas');
    await tick();
    canvasRef?.jumpTo(n);
  }

  // 오행진 키보드 항법 (#111 + 개정) — ↑↓ 종대 안 · ←→ 이웃 종대(같은 높이 착지,
  // 빈 종대 건너뜀) · 양끝에선 순환. Tab/Shift+Tab은 브라우저 포커스 순회 그대로(조준 금테).
  // 화살표는 '마지막으로 만진 링'을 움직인다: 조준(금테)이 선택(인주)과 갈라져 있으면
  // 금테만 이동하고 선택은 제자리 — 합체 상태면 둘이 같이 간다. 화살표 이동은 보드
  // 카드 밖으로 새지 않는다. Enter는 2단: 조준 카드 선택 → 선택된 카드면 캔버스 점프.
  // 빈손 첫 화살표 = 첫 종대 첫 카드
  function onBoardKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // 베기 — 캔버스와 같은 율법 (#105): 접힌 카드는 봉문이 숨기던 가지째,
      // 펼친 카드는 그 카드만, 다중 부모로 보이는 쪽지는 생존 (removeNodes 재사용 — undo 한 걸음)
      if (ui.selectedIds.length) {
        e.preventDefault();
        removeNodes(ui.selectedIds);
      }
      return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const dir = arrows[e.key];
    if (!dir && e.key !== 'Enter') return;
    const cols = boardColumns(graph.nodes, graph.edges, COLORS);
    const tgt = e.target as HTMLElement | null;
    const aimId = (tgt?.classList?.contains('card') ? tgt.dataset.id : null) ?? null;
    // 조준(금테 따로)은 '선택이 어딘가 있는데 포커스가 다른 카드'일 때만 —
    // 빈손의 포커스 카드는 조준이 아니라 항법의 출발점 (Esc 직후 화살표 = 선택 재개)
    const aiming = !!aimId && !!ui.selectedId && aimId !== ui.selectedId;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (aimId && aimId !== ui.selectedId) {
        selectNode(aimId);
        return;
      } // 조준/포커스 카드 선택 — 금테가 인주로
    }
    const refId = aiming ? aimId : (ui.selectedId ?? aimId);
    let ci = -1,
      ri = -1; // 기준 카드(조준 또는 앵커)의 종대/높이 — 보드에 없으면(빈손) -1
    for (let i = 0; refId && i < cols.length && ci < 0; i++) {
      const j = cols[i].findIndex((n) => n.id === refId);
      if (j >= 0) {
        ci = i;
        ri = j;
      }
    }
    if (e.key === 'Enter') {
      if (ci >= 0) boardJump(cols[ci][ri]);
      return;
    }
    e.preventDefault();
    let next: NoteNode | undefined;
    if (ci < 0) {
      next = cols.find((col) => col.length)?.[0]; // 빈손 진입점 — 캔버스 Tab의 '화면 중심 선택'과 평행
    } else if (dir[1]) {
      const col = cols[ci];
      next = col[(ri + dir[1] + col.length) % col.length]; // 종대 양끝 순환
    } else {
      const N = cols.length; // 좌우도 순환 — 빈 종대 건너뛰고 한 바퀴가 한계
      for (let s = 1; s <= N; s++) {
        const i = (((ci + dir[0] * s) % N) + N) % N;
        if (cols[i].length) {
          next = cols[i][Math.min(ri, cols[i].length - 1)];
          break;
        }
      }
    }
    if (!next) return;
    if (!aiming) selectNode(next.id); // 합체 상태 — 선택과 포커스가 같이 간다
    focusCard(next.id); // 조준 중엔 금테만 옮긴다 (선택 불변)
  }

  // 보드 카드에 포커스 + 시야 확보 — 카드는 항상 DOM에 있으니 tick 불요.
  // id는 CSS.escape — 손으로 가져온 JSON의 별난 id(따옴표 등)가 셀렉터를 못 깨게
  function focusCard(id: string) {
    const card = document.querySelector<HTMLElement>(`.board .card[data-id="${CSS.escape(id)}"]`);
    card?.focus({ preventScroll: true }); // 포커스 동행 — Tab 순회·보조기기 출발점 갱신
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // 족보 키보드 항법 — 트리 뷰 국룰: ↑↓ 행 순회(양끝 순환), ←(펼친 가지면 접기, 아니면
  // 부모로) →(접힌 가지면 펼치기, 아니면 첫 자식으로), Enter 2단(조준 선택 → 점프),
  // Delete 베기(캔버스 율법 그대로). 재방문(↻) 행은 표지일 뿐 — 항법에서 건너뛴다
  function onOutlineKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.selectedIds.length) {
        e.preventDefault();
        removeNodes(ui.selectedIds);
      }
      return;
    }
    if (e.code === 'Digit0' && !e.shiftKey) {
      // 0 — 전체 족보로 (1·2·3 직행 가족의 귀환 번호. Shift+3 집중과 짝 — 0은 펼치고 Shift+3은 좁힌다)
      if (ui.outlineRootId) {
        e.preventDefault();
        setOutlineScope(null);
      }
      return;
    }
    const isArrow =
      e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    // 봉문/개문 토글 — 캔버스 C·Space와 같은 키(방향 없는 토글, #168). 하위 있을 때만, 없으면 무동작
    const isFold = e.code === 'Space' || e.key === 'c' || e.key === 'C';
    if (!isArrow && e.key !== 'Enter' && !isFold) return;
    const rid = ui.outlineRootId && byId(ui.outlineRootId) ? ui.outlineRootId : null;
    const rows = outlineRows(graph.nodes, graph.edges, rid).filter((r) => !r.revisit);
    const tgt = e.target as HTMLElement | null;
    const aimId = (tgt?.classList?.contains('row') ? tgt.dataset.id : null) ?? null;
    const aiming = !!aimId && !!ui.selectedId && aimId !== ui.selectedId; // 보드와 같은 조준 율법
    if (e.key === 'Enter') {
      e.preventDefault();
      if (aimId && aimId !== ui.selectedId) {
        selectNode(aimId);
        return;
      }
      const cur = rows.find((r) => r.node.id === ui.selectedId);
      if (cur) boardJump(cur.node);
      return;
    }
    e.preventDefault();
    const refId = aiming ? aimId : (ui.selectedId ?? aimId);
    const i = rows.findIndex((r) => r.node.id === refId);
    if (i < 0) {
      if (rows.length) {
        if (!aiming) selectNode(rows[0].node.id); // 빈손 진입점 — 첫 행
        focusRow(rows[0].node.id);
      }
      return;
    }
    const cur = rows[i];
    if (isFold) {
      // 캔버스 C·Space와 같은 봉문/개문 — 방향 없는 토글, 하위 있을 때만 (e.preventDefault는 위에서)
      if ((kidCount.get(cur.node.id) ?? 0) > 0) toggleCollapse(cur.node.id);
      return;
    }
    let next: NoteNode | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      next = rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length].node; // 양끝 순환
    } else if (e.key === 'ArrowRight') {
      if (cur.node.collapsed && (kidCount.get(cur.node.id) ?? 0) > 0) {
        toggleCollapse(cur.node.id); // 개문
        return;
      }
      if (rows[i + 1] && rows[i + 1].depth > cur.depth) next = rows[i + 1].node; // 첫 자식으로
    } else {
      if (!cur.node.collapsed && (kidCount.get(cur.node.id) ?? 0) > 0) {
        toggleCollapse(cur.node.id); // 봉문
        return;
      }
      for (let k = i - 1; k >= 0; k--)
        if (rows[k].depth < cur.depth) {
          next = rows[k].node; // 부모로
          break;
        }
    }
    if (!next) return;
    if (!aiming) selectNode(next.id);
    focusRow(next.id); // 조준 중엔 금테만 (보드와 같은 '마지막으로 만진 링' 율법)
  }
  function focusRow(id: string) {
    const row = document.querySelector<HTMLElement>(`.outline button.row[data-id="${CSS.escape(id)}"]`);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  }

  // ── 비우기 (확인 카드) ────────────────────────
  // 네이티브 confirm()은 VSCode 웹뷰에서 차단 — 시트/배경막 패턴 재사용이 이식 안전
  function onClear() {
    ui.overlay = { mode: 'confirmClear' };
  }
  function confirmClear() {
    clearAll();
    ui.overlay = null;
  }

  // 앵커 쪽지 — 검색창 Shift+2 폴백(찾은 게 없으면 선택 쪽지로 맞춤)과 뷰 라우터가 읽는다.
  // 집중 배지의 이름표(focalLabel)·캔버스 키 핸들러의 selected는 CanvasView로 이주(#152)
  const selected = $derived(ui.selectedId ? byId(ui.selectedId) : null);
  // 동적 합성 키(mode+'Title') — 실존은 strings.test.ts의 간접 참조 목록이 검증 (any 경계)
  const sheetTitle = $derived(ui.overlay ? ((t as any)[ui.overlay.mode + 'Title'] ?? '') : '');

  // 접힌 가지 아래 숨은 쪽지들 — 규칙·증명은 lib/graph.ts computeHidden
  // (시나리오 검증: src/lib/graph.test.ts)
  // 집중(포커스, #47)이 켜져 있으면 표적의 이웃 밖도 합쳐 숨긴다 —
  // 全 맞춤/전도/Alt 항법/선택 정리가 전부 이 집합을 보므로 공짜로 따라온다
  const hidden = $derived.by(() => {
    const base = computeHidden(graph.nodes, graph.edges);
    if (!ui.focusId || !byId(ui.focusId)) return base;
    const keep = neighborhood(graph.edges, ui.focusId, ui.focusDepth);
    const out = new Set(base);
    for (const n of graph.nodes) if (!keep.has(n.id)) out.add(n.id);
    return out;
  });
  // 자식 수 — 봉문 배지용 (노드마다 edges를 다시 돌지 않게 한 번에)
  const kidCount = $derived(childCounts(graph.edges));

  // 숨은(봉문) 쪽지가 무리·편집 상태로 남지 않게, 끊긴 緣 선택도 정리
  $effect(() => {
    if (ui.focusId && !byId(ui.focusId)) ui.focusId = null; // 표적이 베이면 집중도 풀린다
    // 족보 검색 필터가 열린 동안엔 봉문 가지치기를 봉인한다(#190) — 필터는 일부러 접힌 가지 속
    // 매칭까지 펼쳐 보여주므로, 그걸 ↑↓·클릭으로 선택해도 '숨었다'고 깎으면 안 된다. 그래프는
    // 손대지 않는 비파괴(접힘 그대로) — 필터를 닫으면 다시 깨어나 아직 숨은 선택을 정리한다.
    // (focus는 비캔버스 진입 시 꺼지니 족보에선 hidden=봉문뿐 — 봉인해도 緣/편집 정리는 아래 유지)
    const dead = ui.outlineFiltering
      ? new Set<string>()
      : new Set(ui.selectedIds.filter((id) => hidden.has(id)));
    if (dead.size) pruneSelection(dead);
    if (ui.editingId && hidden.has(ui.editingId)) ui.editingId = null;
    if (ui.selectedEdgeId) {
      const ed = graph.edges.find((x) => x.id === ui.selectedEdgeId);
      if (!ed || hidden.has(ed.a) || hidden.has(ed.b)) clearSelection();
    }
  });
</script>

<!-- 전역 키다운(라우터)·떠날 때 저장만 셸의 몫. 캔버스 포인터/키업(onWinMove/Up·Shift 레티클
     해제·Alt 메뉴바 차단)은 CanvasView가 마운트된 동안만 거는 자기 svelte:window로 옮겼다 (#152) -->
<svelte:window onkeydown={onKey} onpagehide={flushSave} />

<!-- ── 상단 바 ── -->
<header class="bar">
  <div class="title">
    <span class="hanja">{t.titleMain}</span>
    <span class="ko">{t.titleSub}</span>
    <span class="ver">α</span>
  </div>

  <!-- 서가(다중 문서) — 맥락의 출발점이라 맨 왼쪽: 문서 → 창작 → 입출력 → 위험 → 메타 순서.
       글리프는 Phosphor 'books' (MIT, phosphor-icons/core) -->
  <div class="docbar">
    <button
      class="icon"
      onclick={openDocs}
      title={fmt(t.docsButtonTitle, { title: curDoc?.title ?? '' })}
      aria-label={t.docsButtonAria}
    >
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
        ><path
          d="M231.65,194.55,198.46,36.75a16,16,0,0,0-19-12.39L132.65,34.42a16.08,16.08,0,0,0-12.3,19l33.19,157.8A16,16,0,0,0,169.16,224a16.25,16.25,0,0,0,3.38-.36l46.81-10.06A16.09,16.09,0,0,0,231.65,194.55ZM136,50.15c0-.06,0-.09,0-.09l46.8-10,3.33,15.87L139.33,66Zm6.62,31.47,46.82-10.05,3.34,15.9L146,97.53Zm6.64,31.57,46.82-10.06,13.3,63.24-46.82,10.06ZM216,197.94l-46.8,10-3.33-15.87L212.67,182,216,197.85C216,197.91,216,197.94,216,197.94ZM104,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V48A16,16,0,0,0,104,32ZM56,48h48V64H56Zm0,32h48v96H56Zm48,128H56V192h48v16Z"
        /></svg
      >
    </button>
    <!-- 뷰 모드 토글 — Phosphor 'kanban'/'list'/'graph' (MIT). 다음 뷰의 글리프를 보인다:
         캔버스→오행진→족보→캔버스 순환 (V와 동일) -->
    <button
      class="icon"
      onclick={toggleView}
      title={ui.viewMode === 'canvas'
        ? t.viewKanbanTitle
        : ui.viewMode === 'kanban'
          ? t.viewOutlineTitle
          : t.viewCanvasTitle}
      aria-label={ui.viewMode === 'canvas'
        ? t.viewKanbanAria
        : ui.viewMode === 'kanban'
          ? t.viewOutlineAria
          : t.viewCanvasAria}
    >
      {#if ui.viewMode === 'canvas'}
        <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
          ><path
            d="M216,48H40a8,8,0,0,0-8,8V208a16,16,0,0,0,16,16H88a16,16,0,0,0,16-16V160h48v16a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V56A8,8,0,0,0,216,48ZM88,208H48V128H88Zm0-96H48V64H88Zm64,32H104V64h48Zm56,32H168V128h40Zm0-64H168V64h40Z"
          /></svg
        >
      {:else if ui.viewMode === 'kanban'}
        <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
          ><path
            d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"
          /></svg
        >
      {:else}
        <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
          ><path
            d="M200,152a31.84,31.84,0,0,0-19.53,6.68l-23.11-18A31.65,31.65,0,0,0,160,128c0-.74,0-1.48-.08-2.21l13.23-4.41A32,32,0,1,0,168,104c0,.74,0,1.48.08,2.21l-13.23,4.41A32,32,0,0,0,128,96a32.59,32.59,0,0,0-5.27.44L115.89,81A32,32,0,1,0,96,88a32.59,32.59,0,0,0,5.27-.44l6.84,15.4a31.92,31.92,0,0,0-8.57,39.64L73.83,165.44a32.06,32.06,0,1,0,10.63,12l25.71-22.84a31.91,31.91,0,0,0,37.36-1.24l23.11,18A31.65,31.65,0,0,0,168,184a32,32,0,1,0,32-32Zm0-64a16,16,0,1,1-16,16A16,16,0,0,1,200,88ZM80,56A16,16,0,1,1,96,72,16,16,0,0,1,80,56ZM56,208a16,16,0,1,1,16-16A16,16,0,0,1,56,208Zm56-80a16,16,0,1,1,16,16A16,16,0,0,1,112,128Zm88,72a16,16,0,1,1,16-16A16,16,0,0,1,200,200Z"
          /></svg
        >
      {/if}
    </button>
  </div>

  <div class="palette" aria-label={t.paletteAria}>
    {#each COLORS as c (c)}
      <button
        style={`--swatch: var(--c-${c})`}
        title={`${t.colorLabel[c]}(${c})`}
        aria-label={fmt(t.paletteSet, { label: t.colorLabel[c] })}
        class:dim={!selected}
        class:cur={selected ? selected.color === c : ui.ink === c}
        onpointerenter={() => (colorHover = selected ? null : c)}
        onpointerleave={() => (colorHover = null)}
        onclick={() => (selected ? setColorMany(ui.selectedIds, c) : setInk(c))}
      ></button>
    {/each}
  </div>

  <div class="actions">
    <!-- 새 쪽지 — Phosphor 'plus' regular (MIT, phosphor-icons/core). 인주 채움·ASCII '+'는
         퇴역(튀기만 했다): 붓 색은 팔레트 링이, 강세는 낙관(선택)만 — 창작 버튼도 이웃 결로 -->
    <button class="add" onclick={addNote} title={t.newNode} aria-label={t.newNode}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
        ><path
          d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"
        /></svg
      >
    </button>
    <button class="md" onclick={openMd} title={t.mdButtonTitle} aria-label={t.mdButtonAria}>
      <!-- 공식 Markdown 마크(M↓) — dcurtis/markdown-mark, 퍼블릭 도메인 헌정(저장소 LICENSE 확인) -->
      <svg viewBox="0 0 208 128" width="21" height="13" aria-hidden="true"
        ><g fill="currentColor"
          ><path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="m15 10c-2.7614 0-5 2.2386-5 5v98c0 2.761 2.2386 5 5 5h178c2.761 0 5-2.239 5-5v-98c0-2.7614-2.239-5-5-5zm-15 5c0-8.28427 6.71573-15 15-15h178c8.284 0 15 6.71573 15 15v98c0 8.284-6.716 15-15 15h-178c-8.28427 0-15-6.716-15-15z"
          /><path
            d="m30 98v-68h20l20 25 20-25h20v68h-20v-39l-20 25-20-25v39zm125 0-30-33h20v-35h20v35h20z"
          /></g
        ></svg
      >
    </button>
    <!-- 아이콘 3종: Phosphor Icons regular (MIT, phosphor-icons/core) — export / download-simple / broom -->
    <button class="icon" onclick={openExport} title={t.exportButtonTitle} aria-label={t.exportButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
        ><path
          d="M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z"
        /></svg
      >
    </button>
    <button class="icon" onclick={openImport} title={t.importButtonTitle} aria-label={t.importButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
        ><path
          d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"
        /></svg
      >
    </button>
    <button class="icon" onclick={onClear} title={t.clearButtonTitle} aria-label={t.clearButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
        ><path
          d="M235.5,216.81c-22.56-11-35.5-34.58-35.5-64.8V134.73a15.94,15.94,0,0,0-10.09-14.87L165,110a8,8,0,0,1-4.48-10.34l21.32-53a28,28,0,0,0-16.1-37,28.14,28.14,0,0,0-35.82,16,.61.61,0,0,0,0,.12L108.9,79a8,8,0,0,1-10.37,4.49L73.11,73.14A15.89,15.89,0,0,0,55.74,76.8C34.68,98.45,24,123.75,24,152a111.45,111.45,0,0,0,31.18,77.53A8,8,0,0,0,61,232H232a8,8,0,0,0,3.5-15.19ZM67.14,88l25.41,10.3a24,24,0,0,0,31.23-13.45l21-53c2.56-6.11,9.47-9.27,15.43-7a12,12,0,0,1,6.88,15.92L145.69,93.76a24,24,0,0,0,13.43,31.14L184,134.73V152c0,.33,0,.66,0,1L55.77,101.71A108.84,108.84,0,0,1,67.14,88Zm48,128a87.53,87.53,0,0,1-24.34-42,8,8,0,0,0-15.49,4,105.16,105.16,0,0,0,18.36,38H64.44A95.54,95.54,0,0,1,40,152a85.9,85.9,0,0,1,7.73-36.29l137.8,55.12c3,18,10.56,33.48,21.89,45.16Z"
        /></svg
      >
    </button>
    <!-- 서가(다중 문서) — Phosphor 'books' (MIT, phosphor-icons/core) -->
    <button class="tone" onclick={toggleTone} title={t.toneButtonTitle} aria-label={t.toneButtonAria}
      >{t.toneButton}</button
    >
    <button onclick={() => (ui.showHelp = !ui.showHelp)} aria-label={t.helpAria}>?</button>
  </div>
</header>

<!-- ── 캔버스 ↔ 오행진 ↔ 족보 (#42: 데이터 불변, 표현만 교체) ── -->
<!-- 캔버스(강호)는 #152로 BoardView/OutlineView와 형제인 CanvasView로 분리 — 셸은 bind:this로
     잡아 키 라우팅·검색·점프를 위임하고 hue(팔레트 호버색)/closeSearch만 내려준다 -->
{#if ui.viewMode === 'kanban'}
  <BoardView onJump={boardJump} hue={colorHover} />
{:else if ui.viewMode === 'outline'}
  <OutlineView
    bind:this={outlineRef}
    onJump={boardJump}
    rootId={ui.outlineRootId}
    onScopeClear={() => setOutlineScope(null)}
  />
{:else}
  <CanvasView bind:this={canvasRef} hue={colorHover} closeSearch={() => (searchQ = null)} />
{/if}

<!-- ── 검색 (Ctrl+F) ── 검색은 셸에 남는다(Esc/Ctrl+F 라우터와 한 몸, #152). 캔버스 기하가
     필요한 점프·맞춤은 canvasRef로 위임. 캔버스 뷰에서만 띄운다 -->
{#if ui.viewMode === 'canvas' && searchQ !== null}
  <aside class="search-card">
    <input
      use:focusit
      bind:this={searchEl}
      aria-label={t.searchPlaceholder}
      placeholder={t.searchPlaceholder}
      value={searchQ}
      oninput={(e) => {
        searchQ = e.currentTarget.value;
        searchIdx = 0;
        searchJumped = false;
      }}
      onkeydown={onSearchKey}
    />
    {#if searchQ.trim()}
      <ul>
        {#each matches as m, i (m.id)}
          <li class:sel={i === searchIdx % matches.length}>
            <button
              onclick={() => {
                searchIdx = i;
                searchJumped = true;
                canvasRef?.jumpTo(m);
                searchEl?.focus(); // 클릭 뒤에도 input이 키보드 소유 — ↑↓가 노드 넛지 아닌 결과 순회 (#180)
              }}
              onpointerenter={() => {
                searchIdx = i;
                searchJumped = false;
              }}
            >
              <i style={`background: var(--c-${m.color})`}></i>
              <span>{m.text}</span>
            </button>
          </li>
        {/each}
        {#if matches.length === 0}<li class="none">{t.searchEmpty}</li>{/if}
      </ul>
    {/if}
  </aside>
{/if}

<!-- ── 도움말 ── -->
{#if ui.showHelp}
  <aside class="help-card">
    <h2>{t.helpTitle}</h2>
    <dl>
      {#each quickHelp as [key, desc] (key)}
        <dt>{key}</dt>
        <dd>{desc}</dd>
      {/each}
    </dl>
    <div class="close-row">
      <button onclick={openHelpAll}>{t.helpMoreButton}</button>
      <button onclick={() => (ui.showHelp = false)}>{t.closeButton}</button>
    </div>
  </aside>
{/if}

<!-- ── 입출력 시트 ── -->
<!-- 하이라이트 토큰 렌더 — 읽기 전용 pre와 가져오기 overlay pre가 공유.
     pre 안이라 공백·개행이 그대로 보인다: 한 줄 유지. 끝 개행은 pre가 삼키니 공백 한 칸 보전 -->
{#snippet toks(list: import('./lib/highlight.ts').Token[], text: string)}{#each list as tk}{#if tk.c}<span
        class={'tk-' + tk.c}>{tk.t}</span
      >{:else}{tk.t}{/if}{/each}{text.endsWith('\n') ? ' ' : ''}{/snippet}
{#if ui.overlay}
  <div
    class="overlay"
    role="presentation"
    onpointerdown={(e) => {
      if (e.target === e.currentTarget) ui.overlay = null;
    }}
  >
    {#if ui.overlay.mode === 'confirmClear'}
      <div class="sheet confirm" role="alertdialog" aria-label={t.clearConfirm}>
        <h2>{t.clearConfirm}</h2>
        <p class="hint">{t.clearHint}</p>
        <div class="row">
          <button onclick={() => (ui.overlay = null)}>{t.cancelButton}</button>
          <button class="armed" onclick={confirmClear}>{t.clearButton}</button>
        </div>
      </div>
    {:else if ui.overlay.mode === 'docs'}
      <div class="sheet docs" role="dialog" aria-label={t.docsTitle}>
        <h2>{t.docsTitle}</h2>
        <ul class="doc-list">
          {#each docs.list as d (d.id)}
            <li class:cur={d.id === docs.current}>
              {#if docEditId === d.id}
                <input
                  use:focusit
                  value={d.title}
                  aria-label={t.docRenameAria}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') commitDocRename(d.id, e.currentTarget.value);
                    else if (e.key === 'Escape') {
                      e.stopPropagation();
                      docEditId = null;
                    }
                  }}
                  onblur={(e) => commitDocRename(d.id, e.currentTarget.value)}
                />
              {:else if docKillId === d.id}
                <span class="ask">{t.docDeleteConfirm}</span>
                <button class="mini" onclick={() => (docKillId = null)}>{t.cancelButton}</button>
                <button
                  class="mini armed"
                  onclick={() => {
                    removeDoc(d.id);
                    docKillId = null;
                  }}>{t.docDeleteYes}</button
                >
              {:else}
                <button
                  class="open"
                  onclick={() => {
                    switchDoc(d.id);
                    ui.overlay = null;
                  }}
                >
                  <i></i><span>{d.title}</span>
                </button>
                <button
                  class="mini"
                  aria-label={t.docRenameAria}
                  title={t.docRenameAria}
                  onclick={() => (docEditId = d.id)}>✎</button
                >
                <button
                  class="mini"
                  aria-label={t.docDeleteAria}
                  title={t.docDeleteAria}
                  onclick={() => (docKillId = d.id)}>×</button
                >
              {/if}
            </li>
          {/each}
        </ul>
        <div class="row">
          <button onclick={() => (ui.overlay = null)}>{t.closeButton}</button>
          <button
            class="primary"
            onclick={() => {
              createDoc();
              ui.overlay = null;
            }}>{t.docNewButton}</button
          >
        </div>
      </div>
    {:else if ui.overlay.mode === 'help'}
      <div class="sheet help" role="dialog" aria-label={t.helpTitle}>
        <h2>{t.helpTitle}</h2>
        <div class="cols">
          {#each t.helpSections as [title, keys] (title)}
            <section>
              <h3>{title}</h3>
              <dl>
                {#each keys as k (k)}
                  <dt>{k}</dt>
                  <dd>{helpMap.get(k)}</dd>
                {/each}
              </dl>
            </section>
          {/each}
        </div>
        <div class="row">
          <button onclick={() => (ui.overlay = null)}>{t.closeButton}</button>
        </div>
      </div>
    {:else}
      <div class="sheet" role="dialog" aria-label={sheetTitle}>
        <h2>{sheetTitle}</h2>
        {#if ui.overlay.mode === 'import'}<p class="hint">{t.importHint}</p>{/if}
        {#if ui.overlay.mode === 'import'}
          <!-- 편집 + 하이라이트: 투명 글자 textarea 밑에 같은 metric의 pre — 입력은 위가, 색은 아래가.
               줄바꿈 어긋남 방지로 양쪽 다 no-wrap(가로 스크롤), 스크롤은 onscroll로 동기화 -->
          <div class="code-wrap">
            <pre class="code" bind:this={hlPre} aria-hidden="true">{@render toks(
                highlightAuto(sheetText),
                sheetText,
              )}</pre>
            <textarea
              bind:value={sheetText}
              wrap="off"
              spellcheck="false"
              onscroll={(e) => {
                if (hlPre) {
                  hlPre.scrollTop = e.currentTarget.scrollTop;
                  hlPre.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            ></textarea>
          </div>
        {:else}
          <pre class="code ro">{@render toks(
              ui.overlay.mode === 'md' ? highlightMd(sheetText) : highlightJson(sheetText),
              sheetText,
            )}</pre>
        {/if}
        {#if sheetMsg}<p class="msg">{t[sheetMsg]}</p>{/if}
        <div class="row">
          {#if ui.overlay.mode === 'import'}
            <button onclick={() => (ui.overlay = null)}>{t.cancelButton}</button>
            <button class="primary" onclick={applyImport}>{t.applyImportButton}</button>
          {:else}
            {#if ui.overlay.mode === 'md'}
              <!-- 봉문 반영 옵션 (#147) — footer 좌측, 체크 시 미리보기(pre) 즉시 갱신. 인주색 커스텀 -->
              <label class="md-opt">
                <input
                  type="checkbox"
                  checked={mdRespectCollapsed}
                  onchange={(e) => {
                    mdRespectCollapsed = e.currentTarget.checked;
                    sheetText = toMarkdown(mdRespectCollapsed);
                  }}
                />
                <span>{t.mdRespectCollapsedLabel}</span>
              </label>
            {/if}
            <button onclick={() => (ui.overlay = null)}>{t.closeButton}</button>
            <button class="primary" onclick={copySheet}>{t.copyButton}</button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
