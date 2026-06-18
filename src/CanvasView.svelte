<script lang="ts">
  // ──────────────────────────────────────────────
  // 강호(江湖) — 캔버스 뷰 (#152 분리: BoardView/OutlineView와 형제로 대칭).
  // 렌즈 질문: "생각을 어디에 두고 무엇과 잇는가" — 본진(本陣)이자 모든 창작·구조
  // 편집의 자리. 자유 배치(공간 기억), 緣 짓기/뒤집기, 팬/줌/집중/정돈이 다 여기 산다.
  // 셸(App)이 bind:this로 잡아 키 라우팅·검색·점프를 호출하고, hue/closeSearch만 내려준다.
  // 자족적(store 구동) — 데이터/변이는 전부 store, 모양은 app.css(전역), 문구는 strings.ts.
  // ──────────────────────────────────────────────
  import { fade, scale } from 'svelte/transition';
  import { backOut, cubicIn } from 'svelte/easing';
  import {
    graph,
    ui,
    byId,
    selectNode,
    selectEdge,
    clearSelection,
    addToSelection,
    selectMany,
    isSelected,
    addNodeAt,
    addChild,
    addSibling,
    updateText,
    setNodeWidth,
    removeNodes,
    addEdge,
    removeEdge,
    flipEdge,
    toggleCollapse,
    revealNode,
    arrange,
    commitEditing,
    scheduleSave,
    scheduleViewSave,
    markUndo,
    asOneStep,
    clampScale,
  } from './lib/store.svelte.ts';
  import { STRINGS, fmt } from './lib/strings.ts';
  import { nodeBox, center, edgeStart, edgeEnd, edgePath, arrowPath, ghostPath } from './lib/geometry.ts';
  import {
    computeHidden,
    neighborhood,
    parentEdgeOf,
    childIdsOf,
    childCounts,
    rootIds,
  } from './lib/graph.ts';
  import type { NoteNode } from './lib/types.ts';

  // hue: 팔레트 호버 중인 오행색(선택 없을 때 같은 색 비추기 — 팔레트는 셸이 소유).
  // closeSearch: 캔버스 직접 조작 시 검색 팝오버를 닫는 콜백(검색은 셸에 남는다, #152)
  let { hue = null, closeSearch }: { hue?: import('./lib/types.ts').Color | null; closeSearch: () => void } =
    $props();

  // 현재 말투 팩
  const t = $derived(STRINGS[ui.tone]);

  // bind:this 참조(viewportEl/mmEl)는 $state로 받는다 — Svelte 5에선 bind:this 대상도 $state여야
  // 값 갱신을 컴파일러가 추적해 non_reactive_update 경고가 안 뜬다. 실제론 DOM 메서드 호출용
  let viewportEl = $state<HTMLDivElement>()!; // bind:this
  // 움직임 줄이기 설정 사용자는 애니 시간 0. 문서 전환 중에도 0 — 떠나는 강호와 오는 강호가
  // 겹쳐 보이지 않게 (동기식 절단)
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = (ms: number) => (REDUCED || ui.docSwitching ? 0 : ms);
  // 쪽지(무리) 드래그
  let drag: {
    grabbed: string;
    moved: boolean;
    plain: boolean;
    items: { id: string; ox: number; oy: number }[];
  } | null = null;
  let dragIds = $state<Set<string> | null>(null); // 실제 이동 중인 쪽지 id 집합 — 그 緣들을 위층에 띄우는 용도
  // 올가미(Shift+빈 곳 드래그), world 좌표
  let marquee = $state<{ x0: number; y0: number; x1: number; y1: number; base: string[] } | null>(null);
  let shiftHeld = $state(false); // Shift 누름 — 캔버스 커서를 조준 레티클로 (올가미 예고)
  let panning: { sx: number; sy: number; px: number; py: number } | null = null; // 강호 유람(팬)
  let resizing: { id: string; edge: 'left' | 'right'; sx: number; sw: number; right: number } | null = null; // 쪽지 너비 조절
  let touchPts = new Map<number, { x: number; y: number }>(); // pointerId → {x, y} — 뷰포트에서 시작한 포인터 (핀치 판별)
  let pinch: { d: number; mx: number; my: number } | null = null; // 직전 두 손가락 거리·중점 (화면 좌표)
  let hover = $state<{ id: string | null; side: string }>({ id: null, side: 'right' }); // 緣 핸들 위치 — 마우스에 가까운 변
  let edgeHover: string | null = null; // 마우스가 가리키는 緣 id — F 뒤집기용 (키 핸들러만 읽으니 비반응형)
  let vpW = $state(0),
    vpH = $state(0); // 뷰포트 실측 — 미니맵 뷰 사각형용
  let tidying = $state(false); // 정돈(R) 직후 잠깐 — 쪽지가 미끄러지는 트랜지션
  let tidyTimer: ReturnType<typeof setTimeout> | undefined;
  let mmDrag = false; // 미니맵 스크럽 중
  let mmEl = $state<SVGSVGElement>()!; // 미니맵 svg — 스크럽 좌표 변환

  // 접힌 가지 아래 숨은 쪽지들 — 규칙·증명은 lib/graph.ts computeHidden
  // (시나리오 검증: src/lib/graph.test.ts). 집중(포커스, #47)이 켜져 있으면 표적의 이웃
  // 밖도 합쳐 숨긴다 — 全 맞춤/전도/Alt 항법/선택 정리가 전부 이 집합을 보므로 공짜로 따라온다
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
  const selected = $derived(ui.selectedId ? byId(ui.selectedId) : null);
  // 집중 표적의 이름표 — 배지에 '누구 중심인지'를 글로도 (첫 줄, 12자 갈무리)
  const focalLabel = $derived.by(() => {
    const n = ui.focusId ? byId(ui.focusId) : null;
    if (!n) return '';
    const s = (n.text || t.mdEmptyNode).split('\n')[0];
    return s.length > 12 ? s.slice(0, 12) + '…' : s;
  });

  // 뷰가 움직이면 저장 예약 — 새로고침해도 보던 자리에서 다시 연다
  $effect(() => {
    void ui.pan.x;
    void ui.pan.y;
    void ui.scale;
    scheduleViewSave();
  });

  // ── 좌표 변환 ─────────────────────────────────
  // (緣 기하 — center/edgeStart/edgeEnd/edgePath/arrowPath/ghostPath — 는 lib/geometry.ts)
  function toWorld(e: { clientX: number; clientY: number }) {
    const r = viewportEl.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - ui.pan.x) / ui.scale,
      y: (e.clientY - r.top - ui.pan.y) / ui.scale,
    };
  }

  // ── 뷰포트: 팬 / 줌 / 새 쪽지 ─────────────────
  function onViewportDown(e: PointerEvent & { currentTarget: HTMLElement }) {
    if (e.target !== e.currentTarget) return;
    commitEditing();
    closeSearch(); // 캔버스 직접 조작 = 검색창 닫기 (팝오버 국룰)
    if (e.shiftKey) {
      // 올가미(러버밴드) — 기존 무리에 더해 담는다. 맨 드래그(팬)와 Shift로 구분
      const w = toWorld(e);
      marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, base: [...ui.selectedIds] };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    clearSelection();
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPts.size === 2) {
      // 두 번째 손가락 — 팬을 끊고 핀치로 (#6)
      panning = null;
      const [p, q] = [...touchPts.values()];
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
    } else if (touchPts.size === 1) {
      panning = { sx: e.clientX, sy: e.clientY, px: ui.pan.x, py: ui.pan.y };
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onViewportDbl(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    const w = toWorld(e);
    addNodeAt(w.x - 90, w.y - 24);
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const r = viewportEl.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }
  function zoomAt(cx: number, cy: number, factor: number) {
    const ns = clampScale(ui.scale * factor);
    const k = ns / ui.scale;
    ui.pan.x = cx - (cx - ui.pan.x) * k;
    ui.pan.y = cy - (cy - ui.pan.y) * k;
    ui.scale = ns;
  }
  export function zoomCenter(factor: number) {
    const r = viewportEl.getBoundingClientRect();
    zoomAt(r.width / 2, r.height / 2, factor);
  }
  // 배율만 100%로 — 보던 화면 중심은 그대로 (#18)
  export function resetView() {
    zoomCenter(1 / ui.scale);
  }
  // 보이는(접히지 않은) 쪽지들의 world 바운딩 — 전경 맞춤(全)과 전도(미니맵)가 공유.
  // 빈 강호면 null (뿌리는 절대 안 숨으니 '전부 숨음'은 없다)
  function visibleBounds() {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of graph.nodes) {
      if (hidden.has(n.id)) continue;
      const b = nodeBox(n);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    return x1 === -Infinity ? null : { x0, y0, x1, y1 };
  }
  // 강호 전경 — 모든 쪽지를 화면에 맞춤. 빈 강호면 원점 100%
  export function fitAll() {
    const bb = visibleBounds();
    if (!bb) {
      ui.pan.x = 40;
      ui.pan.y = 40;
      ui.scale = 1;
      return;
    }
    const pad = 60;
    const r = viewportEl.getBoundingClientRect();
    const s = clampScale(Math.min(r.width / (bb.x1 - bb.x0 + pad * 2), r.height / (bb.y1 - bb.y0 + pad * 2)));
    ui.scale = s;
    ui.pan.x = (r.width - (bb.x0 + bb.x1) * s) / 2;
    ui.pan.y = (r.height - (bb.y0 + bb.y1) * s) / 2;
  }
  // 선택한 쪽지를 화면 가득히 (Shift+2 — Figma 'Zoom to Selection' 국룰)
  export function fitSelection(n: NoteNode) {
    const b = nodeBox(n);
    const pad = 48;
    const r = viewportEl.getBoundingClientRect();
    const s = clampScale(Math.min(r.width / (b.w + pad * 2), r.height / (b.h + pad * 2)));
    ui.scale = s;
    ui.pan.x = (r.width - (b.x * 2 + b.w) * s) / 2;
    ui.pan.y = (r.height - (b.y * 2 + b.h) * s) / 2;
  }
  // 쪽지를 화면 중앙으로 (배율 유지)
  // 셸 seam(#178) — 비캔버스→캔버스 전환 시 선택 念을 화면 중앙으로(팬만, 줌 유지). jumpTo와 달리 개문·줌변경 없음
  export function centerOn(n: NoteNode) {
    const r = viewportEl.getBoundingClientRect();
    const b = nodeBox(n);
    ui.pan.x = r.width / 2 - (b.x + b.w / 2) * ui.scale;
    ui.pan.y = r.height / 2 - (b.y + b.h / 2) * ui.scale;
  }
  // 쪽지가 화면 밖이면 중앙으로 끌어온다 (Alt+화살표 緣 타기용)
  function ensureVisible(n: NoteNode) {
    const r = viewportEl.getBoundingClientRect();
    const b = nodeBox(n);
    const x0 = b.x * ui.scale + ui.pan.x,
      y0 = b.y * ui.scale + ui.pan.y;
    const x1 = x0 + b.w * ui.scale,
      y1 = y0 + b.h * ui.scale;
    const m = 24;
    if (x0 < m || y0 < m || x1 > r.width - m || y1 > r.height - m) centerOn(n);
  }

  // ── 점프 (검색/오행진/족보 점프의 캔버스 착지) ──
  // 셸의 검색·보드/족보 더블클릭이 canvasRef.jumpTo로 부른다 — 접힌 가지 속이면 조상 봉문을
  // 열며 데려가고(자기 봉문은 보존), 멀리서 보던 중이면 읽기 배율로
  export function jumpTo(n: NoteNode) {
    revealNode(n.id);
    if (ui.focusId && ui.focusId !== n.id) ui.focusId = n.id; // 집중 중 점프 = 표적 갈아타기
    selectNode(n.id);
    if (ui.scale < 0.9) ui.scale = 1;
    centerOn(n);
  }

  // ── 미니맵 ───────────────────────────────────
  // 현재 화면이 비추는 world 사각형
  const viewRect = $derived({
    x: -ui.pan.x / ui.scale,
    y: -ui.pan.y / ui.scale,
    w: vpW / ui.scale,
    h: vpH / ui.scale,
  });
  // 전도 범위 — 보이는 쪽지들 + 현재 뷰 사각형의 합집합 (+여백)
  const minimapBox = $derived.by(() => {
    const bb = visibleBounds();
    const x0 = Math.min(viewRect.x, bb?.x0 ?? Infinity);
    const y0 = Math.min(viewRect.y, bb?.y0 ?? Infinity);
    const x1 = Math.max(viewRect.x + viewRect.w, bb?.x1 ?? -Infinity);
    const y1 = Math.max(viewRect.y + viewRect.h, bb?.y1 ?? -Infinity);
    const pad = 60;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  });
  // 미니맵의 한 점(world)이 화면 중앙에 오도록
  function mmJump(e: { clientX: number; clientY: number }) {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(mmEl.getScreenCTM()!.inverse());
    ui.pan.x = vpW / 2 - pt.x * ui.scale;
    ui.pan.y = vpH / 2 - pt.y * ui.scale;
  }
  function onMinimapDown(e: PointerEvent) {
    e.stopPropagation();
    mmDrag = true;
    mmEl.setPointerCapture?.(e.pointerId);
    mmJump(e);
  }
  export function addAtCenter() {
    closeSearch(); // 새 쪽지 행동 = 검색 팝오버 닫기 (캔버스/쪽지 클릭과 같은 국룰)
    if (!viewportEl) {
      // 오행진엔 '화면 중앙'이 없다 — viewportEl은 캔버스 분기에서만 산다 (#42 이래
      // 잠복 크래시, 전수 점검에서 검거). #105의 좌표 규칙으로: 붓 색 마지막 쪽지
      // 아래 이어 붙이기(같은 x), 그 색이 없으면 맨 아래 쪽지 아래 — 캔버스 배치 보존.
      // 보드엔 편집기가 없으니 선택까지만(edit=false) — 인라인 편집은 #105의 몫
      const pool = graph.nodes.filter((n) => n.color === ui.ink);
      const anchor = (pool.length ? pool : graph.nodes).reduce<NoteNode | null>(
        (a, b) => (!a || b.y > a.y ? b : a),
        null,
      );
      if (anchor) addNodeAt(anchor.x, anchor.y + nodeBox(anchor).h + 24, '', ui.ink, false);
      else addNodeAt(0, 0, '', ui.ink, false);
      return;
    }
    const r = viewportEl.getBoundingClientRect();
    const x = (r.width / 2 - ui.pan.x) / ui.scale;
    const y = (r.height / 2 - ui.pan.y) / ui.scale;
    addNodeAt(x - 90 + (Math.random() * 48 - 24), y - 24 + (Math.random() * 48 - 24));
  }

  // ── 쪽지(노드) ────────────────────────────────
  function onNodeDown(e: PointerEvent, n: NoteNode) {
    e.stopPropagation();
    // 편집 중인 쪽지의 여백을 잡으면 — 편집을 유지한 채 그대로 드래그한다.
    // preventDefault가 포커스 이탈(blur)을 막아, 빈 쪽지가 끌리는 도중에
    // 자동 폭으로 쪼그라드는 꼴을 방지. 확정·수축은 다른 곳을 짚어 편집이
    // 풀리는 순간의 몫이다. 글자 위 클릭(캐럿 이동)은 textarea 자신의
    // pointerdown stopPropagation이 지키므로 여기 오는 손은 전부 '옮기려는 손'
    if (ui.editingId === n.id) e.preventDefault();
    else if (ui.editingId) commitEditing();
    closeSearch(); // 쪽지 직접 선택 = 검색창 닫기
    const toggling = e.shiftKey || e.ctrlKey || e.metaKey;
    if (toggling) {
      addToSelection(n.id); // 무리에 넣고 빼기
      if (!isSelected(n.id)) return; // 방금 뺀 쪽지를 끌진 않는다
    } else if (!isSelected(n.id)) {
      selectNode(n.id);
    }
    // 이미 무리에 든 쪽지를 맨손으로 잡으면 무리째 끈다 — 클릭만(이동 없음)이면
    // onWinUp에서 단독 선택으로 수렴 (Figma 관행)
    const w = toWorld(e);
    drag = {
      grabbed: n.id,
      moved: false,
      plain: !toggling,
      items: ui.selectedIds
        .map((id) => {
          const m = byId(id);
          return m && { id, ox: w.x - m.x, oy: w.y - m.y };
        })
        .filter((it): it is { id: string; ox: number; oy: number } => !!it),
    };
  }
  // 더블클릭 좌표 → 표시 텍스트의 오프셋 (편집 진입 시 그 자리에 캐럿)
  let pendingCaret: number | null = null;
  function caretIndexAt(x: number, y: number, textEl: HTMLElement): number | null {
    try {
      if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (p && textEl.contains(p.offsetNode)) return p.offset;
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r && textEl.contains(r.startContainer)) return r.startOffset;
      }
    } catch {
      /* 미지원이면 끝 캐럿으로 */
    }
    return null;
  }
  function onNodeDbl(e: MouseEvent & { currentTarget: HTMLElement }, n: NoteNode) {
    e.stopPropagation();
    const ntext = e.currentTarget.querySelector<HTMLElement>('.ntext');
    pendingCaret = ntext && n.text ? caretIndexAt(e.clientX, e.clientY, ntext) : null;
    selectNode(n.id);
    ui.editingId = n.id;
  }
  // 緣 핸들을 마우스와 가장 가까운 변으로 — 제스처 중에는 고정
  function onNodeHover(e: PointerEvent, n: NoteNode) {
    if (drag || panning || resizing || ui.linking) return;
    const w = toWorld(e);
    const b = nodeBox(n);
    const lx = w.x - b.x,
      ly = w.y - b.y;
    const sides: [string, number][] = [
      ['left', lx],
      ['right', b.w - lx],
      ['top', ly],
      ['bottom', b.h - ly],
    ];
    const side = sides.sort((p, q) => p[1] - q[1])[0][0];
    if (hover.id !== n.id || hover.side !== side) hover = { id: n.id, side };
  }
  function onNodeLeave(n: NoteNode) {
    if (hover.id === n.id) hover = { id: null, side: 'right' };
  }
  function onHandleDown(e: PointerEvent, n: NoteNode) {
    e.stopPropagation();
    const w = toWorld(e);
    selectNode(n.id);
    ui.linking = { from: n.id, x: w.x, y: w.y };
  }
  function onResizeDown(e: PointerEvent, n: NoteNode, edge: 'left' | 'right') {
    e.stopPropagation();
    selectNode(n.id);
    const w = toWorld(e);
    const sw = n.bw || nodeBox(n).w;
    resizing = { id: n.id, edge, sx: w.x, sw, right: n.x + sw };
  }
  function onResizeDbl(e: MouseEvent, n: NoteNode) {
    e.stopPropagation();
    setNodeWidth(n.id, null); // 자동 너비로 복귀
  }

  // ── 전역 포인터: 드래그 진행/마무리 ────────────
  // 올가미 사각형 정규화 — 어느 방향으로 그어도 양수 폭
  const normRect = (m: { x0: number; y0: number; x1: number; y1: number }) => ({
    x: Math.min(m.x0, m.x1),
    y: Math.min(m.y0, m.y1),
    w: Math.abs(m.x1 - m.x0),
    h: Math.abs(m.y1 - m.y0),
  });
  function onWinMove(e: PointerEvent) {
    if (!viewportEl) return; // 캔버스 부재 — 떠돌이 제스처 상태가 toWorld를 찌르지 않게 (안전핀)
    if (mmDrag) {
      mmJump(e);
      return;
    }
    if (marquee) {
      const w = toWorld(e);
      marquee.x1 = w.x;
      marquee.y1 = w.y;
      const r = normRect(marquee);
      const hit = graph.nodes
        .filter((n) => {
          if (hidden.has(n.id)) return false;
          const b = nodeBox(n);
          return r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h;
        })
        .map((n) => n.id);
      selectMany([...new Set([...marquee.base, ...hit])]);
      return;
    }
    if (pinch && touchPts.has(e.pointerId)) {
      // 핀치 — 거리비만큼 중점 기준 축경, 중점 이동만큼 팬
      touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touchPts.size >= 2) {
        const [p, q] = [...touchPts.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        const mx = (p.x + q.x) / 2,
          my = (p.y + q.y) / 2;
        const r = viewportEl.getBoundingClientRect();
        ui.pan.x += mx - pinch.mx;
        ui.pan.y += my - pinch.my;
        if (pinch.d > 0) zoomAt(mx - r.left, my - r.top, d / pinch.d);
        pinch = { d, mx, my };
      }
      return;
    }
    if (panning) {
      ui.pan.x = panning.px + (e.clientX - panning.sx);
      ui.pan.y = panning.py + (e.clientY - panning.sy);
    } else if (drag) {
      if (!drag.moved) {
        markUndo('drag:' + drag.grabbed); // 제스처 시작 시점의 모습을 한 번만
        dragIds = new Set(drag.items.map((it) => it.id)); // 이동 시작 — 무리의 緣을 위층에
      }
      const w = toWorld(e);
      for (const it of drag.items) {
        const m = byId(it.id);
        if (m) {
          m.x = w.x - it.ox;
          m.y = w.y - it.oy;
        }
      }
      drag.moved = true;
    } else if (resizing) {
      const w = toWorld(e);
      const dx = w.x - resizing.sx;
      setNodeWidth(resizing.id, resizing.edge === 'right' ? resizing.sw + dx : resizing.sw - dx);
      if (resizing.edge === 'left') {
        const n = byId(resizing.id);
        if (n) n.x = resizing.right - n.bw!; // 왼변을 끌 때는 오른변 고정 (직전 setNodeWidth가 bw를 채웠다)
      }
    } else if (ui.linking) {
      const w = toWorld(e);
      ui.linking.x = w.x;
      ui.linking.y = w.y;
    }
  }
  function onWinUp(e: PointerEvent) {
    mmDrag = false;
    marquee = null;
    touchPts.delete(e.pointerId);
    if (touchPts.size < 2) pinch = null;
    if (drag) {
      if (drag.moved) scheduleSave();
      else if (drag.plain && ui.selectedIds.length > 1) selectNode(drag.grabbed); // 무리 클릭(이동 없음) → 단독
      drag = null;
      dragIds = null; // 이동 끝 — 緣은 다시 뒤로
    }
    panning = null;
    resizing = null;
    if (ui.linking) {
      const from = ui.linking.from;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = el?.closest?.<HTMLElement>('[data-node-id]');
      // 접힌 쪽지에서 緣을 이으면 개문하고 진행 — 새 식구가 잇자마자 봉문 속으로
      // 사라지지 않게 (Tab/Enter 가지치기의 collapsed 해제와 같은 관행)
      const unfold = () => {
        const f = byId(from);
        if (f?.collapsed) {
          f.collapsed = undefined;
          scheduleSave(); // 緣 추가가 중복으로 무산돼도 개문만은 저장되게
        }
      };
      if (nodeEl && nodeEl.dataset.nodeId !== from) {
        asOneStep(() => {
          unfold();
          addEdge(from, nodeEl.dataset.nodeId!);
        });
      } else if (!nodeEl && viewportEl?.contains(el)) {
        // 허공에 놓으면 — 그 자리에 새 쪽지를 피우고 緣을 잇는다 (undo 한 걸음)
        const w = toWorld(e);
        asOneStep(() => {
          unfold();
          const child = addNodeAt(w.x - 90, w.y - 24, '', byId(from)?.color ?? 'muk');
          addEdge(from, child.id);
        });
      }
      ui.linking = null;
    }
  }

  // ── 키보드 ───────────────────────────────────
  // 캔버스 전용 키 — 이동/넛지/팬·줌·집중(L)·정돈(R)·緣 타기(Alt+화살표)·가지치기(Tab/Enter)·
  // 편집(F2)·봉문(C/Space)·베기(Del). 셸(App)의 onKey 라우터가 전역층을 처리한 뒤 이 함수를
  // viewKey 디스패치로 부른다(세 뷰 대칭, #151). bind:this로 노출 — 셸이 canvasRef.onKey로 호출
  export function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null; // Tab 진입점이 버튼 포커스를 구분하는 데 쓴다
    // 화살표 키 — 쪽지가 선택돼 있으면 그 쪽지를 옮기고(nudge), 아니면 강호 유람(팬).
    // Alt 조합은 여기서 삼키지 않는다 — 아래 緣 타기(트리 탐색) 몫
    if (e.key.startsWith('Arrow') && !e.altKey) {
      e.preventDefault();
      const mult = e.shiftKey ? 4 : 1;
      if (selected) {
        const d = 8 * mult;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        markUndo('nudge:' + selected.id); // 꾹 누르면 한 걸음으로 병합 (무리째)
        for (const id of ui.selectedIds) {
          const m = byId(id);
          if (m) {
            m.x += dx;
            m.y += dy;
          }
        }
        scheduleSave(); // n.x/y 직접 변이 — 저장은 호출부 책임
      } else {
        const step = 48 * mult;
        if (e.key === 'ArrowLeft') ui.pan.x += step;
        else if (e.key === 'ArrowRight') ui.pan.x -= step;
        else if (e.key === 'ArrowUp') ui.pan.y += step;
        else if (e.key === 'ArrowDown') ui.pan.y -= step;
      }
      return;
    }
    // PgUp/PgDn — 한 화면(80%)씩 세로 이동
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const r = viewportEl.getBoundingClientRect();
      ui.pan.y += (e.key === 'PageUp' ? 1 : -1) * r.height * 0.8;
      return;
    }
    // Shift+1 — 전체 보기 (Figma 국룰, 좌하단 全 버튼과 동일)
    if (e.code === 'Digit1' && e.shiftKey) {
      e.preventDefault();
      fitAll();
      return;
    }
    // Shift+2 — 선택한 쪽지를 화면 가득히 (Figma Zoom to Selection)
    if (e.code === 'Digit2' && e.shiftKey && selected) {
      e.preventDefault();
      fitSelection(selected);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.selectedIds.length) {
        e.preventDefault();
        removeNodes(ui.selectedIds);
      } // 무리째 베기 — undo 한 걸음
      else if (ui.selectedEdgeId) {
        e.preventDefault();
        removeEdge(ui.selectedEdgeId);
      }
      return;
    }
    if (e.code === 'KeyF' && (edgeHover || ui.selectedEdgeId)) {
      e.preventDefault();
      flipEdge((edgeHover ?? ui.selectedEdgeId)!); // 가리키는 緣이 선택보다 우선 — 가드가 실존 보장
      return;
    }
    if ((e.code === 'KeyC' || e.code === 'Space') && selected && (kidCount.get(selected.id) ?? 0) > 0) {
      e.preventDefault();
      toggleCollapse(selected.id); // 가지 봉문/개문 — 자식 있는 쪽지만 (Space는 FreeMind 혈통 별칭)
      return;
    }
    // L — 집중(포커스): 선택한 쪽지의 이웃만 남기고 숨김 (#47).
    // 같은 표적 재토글/빈손 L = 해제, 다른 쪽지 선택 후 L = 표적 갈아타기
    if (e.code === 'KeyL') {
      e.preventDefault();
      if (selected && ui.focusId !== selected.id) ui.focusId = selected.id;
      else ui.focusId = null;
      return;
    }
    // [ / ] — 집중 반경(촌수) 조절
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && ui.focusId) {
      e.preventDefault();
      ui.focusDepth = Math.max(1, Math.min(9, ui.focusDepth + (e.code === 'BracketRight' ? 1 : -1)));
      return;
    }
    // R — 가지런히(Tidy): 무조건 전체. Shift+R = 선택한 가지만 (예측 가능성 우선)
    if (e.code === 'KeyR') {
      e.preventDefault();
      tidying = true;
      clearTimeout(tidyTimer);
      tidyTimer = setTimeout(() => (tidying = false), 300);
      arrange(e.shiftKey ? (selected?.id ?? null) : null);
      return;
    }
    // Z / Shift+Z — 한 손 줌: 선택한 쪽지를 앵커로 확대/축소 (없으면 화면 중앙)
    if (e.code === 'KeyZ') {
      e.preventDefault();
      const f = e.shiftKey ? 1 / 1.18 : 1.18;
      if (selected) {
        const c = center(selected);
        zoomAt(c.x * ui.scale + ui.pan.x, c.y * ui.scale + ui.pan.y, f);
      } else {
        zoomCenter(f);
      }
      return;
    }
    // Alt+화살표 — 緣 타고 이동: ←부모 / →자식(최상단) / ↑↓형제(루트면 뿌리들 사이)
    if (e.altKey && e.key.startsWith('Arrow') && selected) {
      e.preventDefault();
      const cy = (nd: NoteNode) => center(nd).y;
      const visible = (id: string) => !hidden.has(id);
      let target: NoteNode | null = null;
      if (e.key === 'ArrowLeft') {
        const pe = graph.edges.find((ed) => ed.b === selected.id && visible(ed.a));
        target = pe ? (byId(pe.a) ?? null) : null;
      } else if (e.key === 'ArrowRight') {
        const kids = childIdsOf(graph.edges, selected.id)
          .map(byId)
          .filter((nd): nd is NoteNode => !!nd && visible(nd.id))
          .sort((p, q) => cy(p) - cy(q));
        target = kids[0] ?? null;
      } else {
        const pe = parentEdgeOf(graph.edges, selected.id);
        const sibs = (pe ? childIdsOf(graph.edges, pe.a) : rootIds(graph.nodes, graph.edges))
          .map(byId)
          .filter((nd): nd is NoteNode => !!nd && visible(nd.id))
          .sort((p, q) => cy(p) - cy(q));
        const i = sibs.findIndex((nd) => nd.id === selected.id);
        target = (e.key === 'ArrowUp' ? sibs[i - 1] : sibs[i + 1]) ?? null;
      }
      if (target) {
        selectNode(target.id);
        ensureVisible(target);
      }
      return;
    }
    if (e.key === 'Tab') {
      if (ui.selectedId) {
        e.preventDefault();
        addChild(ui.selectedId);
        return;
      }
      // 선택이 없으면 — 화면 중심에 가장 가까운 보이는 쪽지를 선택 (키보드 진입점,
      // 포커스가 엄한 데로 유랑하는 것도 차단). 툴바 버튼 포커스 중엔 네이티브 유지
      if (el?.tagName !== 'BUTTON') {
        const r = viewportEl.getBoundingClientRect();
        const wx = (r.width / 2 - ui.pan.x) / ui.scale;
        const wy = (r.height / 2 - ui.pan.y) / ui.scale;
        let best: NoteNode | null = null,
          bd = Infinity;
        for (const n of graph.nodes) {
          if (hidden.has(n.id)) continue;
          const c = center(n);
          const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
        if (best) {
          e.preventDefault();
          selectNode(best.id);
          ensureVisible(best);
        }
      }
      return;
    }
    // Enter — 형제 가지치기 (마인드맵 국룰: Tab=자식, Enter=형제). 로직은 store.addSibling
    if (e.key === 'Enter' && ui.selectedId && !ui.editingId) {
      e.preventDefault();
      addSibling(ui.selectedId);
      return;
    }
    // F2 — 편집 진입 (Ctrl+Enter도 동일)
    if (e.key === 'F2' && ui.selectedId && !ui.editingId) {
      e.preventDefault();
      ui.editingId = ui.selectedId;
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Shift') shiftHeld = false;
    // Alt 단독으로 눌렀다 떼면 브라우저 메뉴바가 포커스를 훔쳐간다(Windows 관행)
    // — 緣 타기(Alt+화살표) 도중 끊기는 원인. keyup preventDefault로 차단
    if (e.key === 'Alt') {
      const el = e.target as HTMLElement | null;
      const inField = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
      if (!inField) e.preventDefault();
    }
  }
  function onEditorKey(e: KeyboardEvent, n: NoteNode) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEditing();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      commitEditing();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEditing();
      addChild(n.id);
    }
  }

  // 편집 textarea — 자동 높이 + 포커스.
  // 캐럿: 더블클릭이면 클릭한 그 자리(pendingCaret), 키보드 진입이면 끝.
  // 전체 선택은 안 한다 — 여러 줄 메모가 오타 한 방에 증발하지 않게 (갈아엎기는 Ctrl+A)
  function autogrow(el: HTMLTextAreaElement) {
    const fit = () => {
      el.style.height = '0px';
      el.style.height = el.scrollHeight + 'px';
    };
    fit();
    el.focus();
    const pos = Math.min(pendingCaret ?? el.value.length, el.value.length);
    pendingCaret = null;
    el.setSelectionRange(pos, pos);
    el.addEventListener('input', fit);
    return {
      destroy() {
        el.removeEventListener('input', fit);
      },
    };
  }
</script>

<!-- 캔버스 포인터/키업 — 마운트된 동안만 산다 (보드/족보에선 부재). 키다운(전역 라우터)은
     셸의 onKey가, 여기 onKeyUp은 Shift 레티클 해제·Alt 메뉴바 차단(캔버스 한정) -->
<svelte:window
  onpointermove={onWinMove}
  onpointerup={onWinUp}
  onpointercancel={onWinUp}
  onkeyup={onKeyUp}
  onblur={() => (shiftHeld = false)}
/>

<div
  class="viewport"
  class:lasso={shiftHeld || marquee}
  class:linking={!!ui.linking}
  bind:this={viewportEl}
  bind:clientWidth={vpW}
  bind:clientHeight={vpH}
  role="application"
  aria-label={t.canvasAria}
  onpointerdown={onViewportDown}
  ondblclick={onViewportDbl}
  onwheel={onWheel}
>
  {#if graph.nodes.length === 0}
    <div class="empty">
      <p>{t.emptyTitle}</p>
      <p class="sub">{t.emptyHint}</p>
    </div>
  {/if}

  <div
    class="world"
    class:tidying
    style={`transform: translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.scale})`}
  >
    <svg class="edges" aria-hidden="true">
      {#each graph.edges as e (e.id)}
        {@const a = byId(e.a)}
        {@const b = byId(e.b)}
        {#if a && b && !hidden.has(a.id) && !hidden.has(b.id)}
          {@const E = edgeEnd(a, b)}
          {@const d = edgePath(edgeStart(a, center(b)), E)}
          <g class="edge" class:sel={ui.selectedEdgeId === e.id} transition:fade={{ duration: dur(170) }}>
            <!-- 緣 선택은 마우스 편의 — 키보드 경로는 Alt 항법(노드 오가기)·F(방향 뒤집기)가 맡는다.
                 緣마다 tab stop을 두면 항법이 번잡해 role 미부여 (緣 접근성은 #88에서 별도 설계) -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <path
              class="hit"
              {d}
              onpointerenter={() => (edgeHover = e.id)}
              onpointerleave={() => (edgeHover = null)}
              onpointerdown={(ev) => {
                ev.stopPropagation();
                closeSearch();
                selectEdge(e.id);
              }}
            />
            <path class="vis" {d} />
            <!-- 촉+접점 원은 한 그룹 — 그룹 opacity로 합성해 겹침 부위 알파 중첩 방지 -->
            <g class="cap">
              <path d={arrowPath(E)} />
              <circle cx={E.x} cy={E.y} r="3" />
            </g>
          </g>
        {/if}
      {/each}
      {#if ui.linking}
        {@const s = byId(ui.linking.from)}
        {#if s}
          <path class="ghost" d={ghostPath(s, ui.linking.x, ui.linking.y)} />
        {/if}
      {/if}
    </svg>

    {#if dragIds}
      <!-- 이동 중인 무리의 緣만 노드들 위에 잠깐 — 손 떼면 사라지고 원래 층으로.
           주의: 'overlay'라는 클래스명은 입출력 시트 배경막(.overlay)과 충돌한다 -->
      <svg class="edges lift-layer" aria-hidden="true">
        {#each graph.edges.filter((ed) => dragIds!.has(ed.a) || dragIds!.has(ed.b)) as e (e.id)}
          {@const a = byId(e.a)}
          {@const b = byId(e.b)}
          {#if a && b && !hidden.has(a.id) && !hidden.has(b.id)}
            {@const E = edgeEnd(a, b)}
            <g class="edge lift">
              <path class="vis" d={edgePath(edgeStart(a, center(b)), E)} />
              <g class="cap"><path d={arrowPath(E)} /><circle cx={E.x} cy={E.y} r="3" /></g>
            </g>
          {/if}
        {/each}
      </svg>
    {/if}

    {#each graph.nodes.filter((nd) => !hidden.has(nd.id)) as n (n.id)}
      {@const kids = kidCount.get(n.id) ?? 0}
      <div
        class="node"
        class:selected={ui.selectedIds.includes(n.id)}
        class:focal={ui.focusId === n.id}
        class:resized={!!n.bw}
        class:lit={!selected && hue === n.color}
        class:fade={!selected && hue && hue !== n.color}
        data-color={n.color}
        data-node-id={n.id}
        style={`left:${n.x}px; top:${n.y}px;${n.bw ? ` width:${n.bw}px;` : ''}`}
        bind:offsetWidth={n.w}
        bind:offsetHeight={n.h}
        role="group"
        in:scale={{ duration: dur(230), start: 0.65, easing: backOut }}
        out:scale={{ duration: dur(190), start: 0.5, easing: cubicIn }}
        onpointerdown={(e) => onNodeDown(e, n)}
        onpointermove={(e) => onNodeHover(e, n)}
        onpointerleave={() => onNodeLeave(n)}
        ondblclick={(e) => onNodeDbl(e, n)}
      >
        {#if ui.editingId === n.id}
          <textarea
            use:autogrow
            rows="1"
            value={n.text}
            placeholder={t.nodePlaceholder}
            oninput={(e) => updateText(n.id, e.currentTarget.value)}
            onkeydown={(e) => onEditorKey(e, n)}
            onblur={commitEditing}
            onpointerdown={(e) => e.stopPropagation()}
          ></textarea>
        {:else}
          <div class="ntext">{n.text || '…'}</div>
        {/if}
        <button
          class={`handle ${hover.id === n.id ? hover.side : 'right'}`}
          title={t.handleTitle}
          aria-label={t.handleAria}
          onpointerdown={(e) => onHandleDown(e, n)}
          ondblclick={(e) => e.stopPropagation()}
        ></button>
        <button
          class="rsz left"
          title={t.resizeHandleTitle}
          aria-label={t.resizeHandleAria}
          onpointerdown={(e) => onResizeDown(e, n, 'left')}
          ondblclick={(e) => onResizeDbl(e, n)}
        ></button>
        <button
          class="rsz right"
          title={t.resizeHandleTitle}
          aria-label={t.resizeHandleAria}
          onpointerdown={(e) => onResizeDown(e, n, 'right')}
          ondblclick={(e) => onResizeDbl(e, n)}
        ></button>
        {#if kids > 0}
          <button
            class="fold"
            class:on={n.collapsed}
            title={t.foldBadgeTitle}
            aria-label={t.foldBadgeAria}
            onpointerdown={(e) => e.stopPropagation()}
            ondblclick={(e) => e.stopPropagation()}
            onclick={(e) => {
              e.stopPropagation();
              toggleCollapse(n.id);
            }}>{n.collapsed ? `▸${kids}` : '▾'}</button
          >
        {/if}
      </div>
    {/each}

    {#if marquee}
      {@const r = normRect(marquee)}
      <div class="marquee" style={`left:${r.x}px; top:${r.y}px; width:${r.w}px; height:${r.h}px`}></div>
    {/if}
  </div>
</div>

<!-- ── 집중(포커스) 배지 — 켜진 동안 상단 중앙, 클릭 = 해제 ── -->
{#if ui.focusId}
  <button
    class="focus-pill"
    onclick={() => (ui.focusId = null)}
    title={t.focusPillAria}
    aria-label={t.focusPillAria}
    transition:fade={{ duration: dur(150) }}
    ><i></i>{fmt(t.focusPill, { label: focalLabel, depth: ui.focusDepth })}</button
  >
{/if}

<!-- ── 하단 HUD + 콜로폰 ── -->
<div class="hud">
  <button onclick={() => zoomCenter(1 / 1.18)} aria-label={t.zoomOutAria}>−</button>
  <button class="pct" onclick={resetView} title={t.resetViewTitle}>{Math.round(ui.scale * 100)}%</button>
  <button onclick={() => zoomCenter(1.18)} aria-label={t.zoomInAria}>+</button>
  <!-- 화면 맞춤(全) — Phosphor 'frame-corners' (MIT, phosphor-icons/core) -->
  <button class="icon" onclick={fitAll} title={t.fitButtonTitle} aria-label={t.fitAria}>
    <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"
      ><path
        d="M200,80v32a8,8,0,0,1-16,0V88H160a8,8,0,0,1,0-16h32A8,8,0,0,1,200,80ZM96,168H72V144a8,8,0,0,0-16,0v32a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16ZM232,56V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z"
      /></svg
    >
  </button>
</div>
{#if t.colophon}<div class="colophon">{t.colophon}</div>{/if}

<!-- ── 미니맵 (전도) — 폰에서는 CSS로 숨김 ── -->
{#if graph.nodes.length > 0}
  <!-- 전도(미니맵)는 마우스 전용 보조 항법 — 키보드는 팬(화살표)·검색·全으로 충분.
       aria-label로 존재만 알리고 인터랙션 role은 안 단다(마우스 한정) -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    class="minimap"
    bind:this={mmEl}
    viewBox={`${minimapBox.x} ${minimapBox.y} ${minimapBox.w} ${minimapBox.h}`}
    aria-label={t.minimapAria}
    onpointerdown={onMinimapDown}
  >
    {#each graph.nodes.filter((nd) => !hidden.has(nd.id)) as n (n.id)}
      {@const b = nodeBox(n)}
      <rect
        class="mm-node"
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx="8"
        style={`fill: var(--c-${n.color})`}
      />
    {/each}
    <rect class="mm-view" x={viewRect.x} y={viewRect.y} width={viewRect.w} height={viewRect.h} />
  </svg>
{/if}

<!-- 캔버스 전용 스타일 — 강호(CanvasView)의 DOM에만 입는 스코프 (#160 1단계, app.css에서 이주).
     토큰(:root)·공유 규칙([data-color] 오행 매핑·.hud·버튼 등)은 app.css에 남는다.
     검색 카드(.search-card)는 셸(App)이 그리니 여기 아닌 app.css에 잔류 -->
<style>
  /* ── 캔버스 ── */
  .viewport {
    position: absolute;
    inset: var(--bar-h) 0 0 0;
    overflow: hidden;
    touch-action: none;
    cursor: var(--cursor-grab), grab;
    background:
      radial-gradient(1100px 600px at 72% -8%, rgba(242, 233, 214, 0.05), transparent 60%),
      radial-gradient(rgba(242, 233, 214, 0.07) 1px, transparent 1.4px), var(--muk-void);
    background-size:
      auto,
      26px 26px,
      auto;
  }
  .viewport:active {
    cursor: var(--cursor-grabbing), grabbing;
  }
  /* Shift = 올가미 예고/진행 — 영역 선택의 국룰 커서, 조준 레티클 (:active의 주먹도 덮는다) */
  .viewport.lasso,
  .viewport.lasso:active {
    cursor: var(--cursor-cross), crosshair;
  }

  /* 緣 잇기 드래그 중 (#169) — 놓을 때까지 표적 커서 유지(올가미처럼 :active 주먹·노드 손을 덮는다).
     빨간점(핸들)은 '잡는 자리'일 뿐 연결선 위치가 아니라 숨기고, 놓이게 될 타겟 念엔 부드러운 글로우. */
  .viewport.linking,
  .viewport.linking:active,
  .viewport.linking .node,
  .viewport.linking .node:active,
  .viewport.linking .fold,
  .viewport.linking .rsz {
    cursor: var(--cursor-cross), crosshair;
  }
  .viewport.linking .node .handle {
    display: none; /* 소스·타겟 양쪽 빨간점 숨김 — 앵커는 geometry가 두 박스로 계산하므로 점은 군더더기 */
  }
  .viewport.linking .node:hover {
    /* 타겟 강조 — 어두운 허공(--muk-void)에서 읽히는 한지빛 글로우. 선택의 인주 sharp 링과 구분되는
       부드러운 헤일로. 자기 자신 포함 호버 念 모두 일관(놓으면 addEdge가 자기 緣·중복을 조용히 무산) */
    filter: brightness(1.06);
    box-shadow:
      0 0 0 1px rgba(242, 233, 214, 0.4),
      0 0 20px 4px rgba(242, 233, 214, 0.32),
      0 1px 0 rgba(0, 0, 0, 0.35),
      0 9px 22px -10px rgba(0, 0, 0, 0.75);
  }

  .world {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }

  /* 연(緣) — 엣지 */
  .edges {
    position: absolute;
    left: 0;
    top: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
  }
  /* 드래그 중 緣 부상층 — 노드들(.node z≤2) 위, 클릭은 통과.
     ('overlay'라 이름 지으면 시트 배경막 .overlay 규칙이 같이 발려
     검은 박스 + 緣 18px 어긋남 사고가 난다 — 실제로 났었다 ㅋ) */
  .edges.lift-layer {
    z-index: 3;
  }
  .edge.lift .vis {
    stroke: var(--edge-strong);
  }

  .edge .hit {
    fill: none;
    stroke: transparent;
    stroke-width: 16;
    pointer-events: stroke;
    cursor: var(--cursor-pointer), pointer;
  }
  .edge .vis {
    fill: none;
    stroke: var(--edge);
    stroke-width: 2;
    transition: stroke 0.12s ease;
  }
  .edge:hover .vis {
    stroke: var(--edge-strong);
  }
  .edge.sel .vis {
    stroke: var(--inju);
    stroke-width: 2.5;
  }
  /* 화살촉+접점 원 — 자식은 불투명, 그룹에만 투명도: 겹쳐도 농도가 균일하다 */
  .edge .cap {
    fill: var(--hanji);
    opacity: 0.55; /* --edge-strong과 같은 농도 */
    transition:
      opacity 0.12s ease,
      fill 0.12s ease;
  }
  .edge:hover .cap {
    opacity: 1;
  }
  .edge.sel .cap {
    fill: var(--inju);
    opacity: 1;
  }
  .ghost {
    fill: none;
    stroke: var(--inju);
    stroke-width: 2;
    stroke-dasharray: 5 6;
  }

  /* 念 — 노드 */
  .node {
    position: absolute;
    /* 자동 폭은 내용 기준(max-content) — 절대배치 shrink-to-fit이 0폭 .world를
       기준 삼아 'x>0이면 min-width로 짓눌리고 x<0이면 위치 따라 변신'하던 버그의 처방.
       상한(--node-max-w)에서 줄바꿈, 사용자 지정 폭(bw)은 인라인 width가 이긴다 */
    width: max-content;
    max-width: var(--node-max-w);
    min-width: 84px;
    padding: 10px 13px 11px;
    background: linear-gradient(173deg, var(--hanji), var(--hanji-2));
    color: var(--ink);
    /* 본문은 고딕 — 노트 앱 국룰(시스템 산세리프). 명조는 장식(낙관·콜로폰·제목)에만 */
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.5;
    border-radius: 3px;
    /* 태그색 띠 — 얇으면 안 보인다는 피드백으로 3px→7px (#12) */
    border-left: 7px solid var(--c, var(--c-muk));
    box-shadow:
      0 1px 0 rgba(0, 0, 0, 0.35),
      0 9px 22px -10px rgba(0, 0, 0, 0.75);
    cursor: var(--cursor-grab), grab;
    user-select: none;
    -webkit-user-select: none;
    /* 자식 배지/핸들의 z-index가 쪽지 밖으로 탈출하지 못하게 — 겹친 아래
       쪽지의 접기 배지가 위 쪽지를 뚫고 떠오르던 버그의 처방 */
    isolation: isolate;
    /* 등장/퇴장(도장·봉문)은 Svelte transition이 담당 — App의 in:/out:scale */
    transition: filter 0.15s ease;
  }
  /* 겹침에서는 만지는 놈이 위로 — 호버/선택 부상 (캔버스 앱 관행) */
  .node:hover {
    z-index: 1;
  }
  .node.selected {
    z-index: 2;
  }
  /* 올가미(러버밴드, Shift+빈 곳 드래그) — 인주 점선 사각 */
  .marquee {
    position: absolute;
    border: 1px dashed var(--inju);
    border-radius: 2px;
    background: rgba(200, 71, 43, 0.08); /* 인주 박명 */
    pointer-events: none;
  }

  /* 정돈(R) 직후 잠깐만 — 쪽지가 새 자리로 미끄러진다 (드래그엔 무영향) */
  .world.tidying .node {
    transition:
      left 0.25s ease,
      top 0.25s ease,
      filter 0.15s ease;
  }
  .node:active {
    cursor: var(--cursor-grabbing), grabbing;
  }

  .node.selected {
    outline: 2px solid var(--inju);
    outline-offset: 2px;
    box-shadow:
      0 0 0 6px rgba(200, 71, 43, 0.13),
      0 9px 22px -10px rgba(0, 0, 0, 0.75);
  }
  /* 집중(포커스) 표적 — 선택 링(실선 outline)과 공존하는 인주 점선 후광(::after).
     올가미와 같은 점선 어휘. 선택이 풀리거나 딴 데로 가도 표적만은 늘 보인다 */
  .node.focal::after {
    content: '';
    position: absolute;
    inset: -14px; /* 선택 실선(offset 2+2px)·후광(6px)보다 한 발 밖 — 겹쳐도 갑갑하지 않게 */
    border: 1.5px dashed var(--inju);
    border-radius: 14px;
    opacity: 0.85;
    pointer-events: none;
  }

  /* 팔레트 범례 호버(선택 없음) — 같은 색은 제 색 테두리, 다른 색은 물러남.
     opacity가 아니라 filter인 이유: 반투명해지면 노드 뒤를 지나는 緣이 비친다 */
  .node.lit {
    outline: 2px solid var(--c);
    outline-offset: 2px;
  }
  .node.fade {
    filter: brightness(0.32) saturate(0.55);
  }

  /* 사용자 지정 너비(bw) — 상한 해제, 편집창도 박스에 맞춤 */
  .node.resized {
    max-width: none;
  }
  .node.resized textarea {
    width: 100%;
  }

  .ntext {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .node textarea {
    width: 200px;
    max-width: 100%; /* max-content 박스가 상한(230)에 닿아도 글이 변 밖으로 안 샌다 */
    display: block;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 0;
    outline: 0;
    resize: none;
    padding: 0;
    overflow: hidden;
  }

  .handle {
    position: absolute;
    z-index: 1; /* 좌/우 리사이즈 띠(.rsz)보다 위 — 점이 보이는 곳에선 점이 이긴다 */
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--inju);
    border: 2px solid var(--hanji);
    opacity: 0;
    transition: opacity 0.12s;
    cursor: var(--cursor-cross), crosshair;
    padding: 0;
  }
  /* 마우스와 가장 가까운 변에 나타난다 (기본은 우변) */
  .handle.right {
    right: -9px;
    top: 50%;
    translate: 0 -50%;
  }
  .handle.left {
    left: -9px;
    top: 50%;
    translate: 0 -50%;
  }
  .handle.top {
    top: -9px;
    left: 50%;
    translate: -50% 0;
  }
  .handle.bottom {
    bottom: -9px;
    left: 50%;
    translate: -50% 0;
  }
  .node:hover .handle,
  .node.selected .handle {
    opacity: 1;
  }

  /* 우하단 — 가지 접기 배지 (자식 있는 쪽지만, 접힌 상태면 상시 표시 + 자식 수).
     반드시 .node 스코프 — 무스코프 .fold는 오행진 카드의 ▸N 배지까지 순간이동시킨 전과가 있다 */
  .node .fold {
    position: absolute;
    z-index: 1;
    right: -9px;
    bottom: -9px;
    min-width: 23px;
    height: 23px;
    padding: 0 6px;
    border-radius: 12px;
    background: var(--hanji);
    color: var(--ink);
    border: 1.5px solid var(--c, var(--c-muk));
    font-size: 13px;
    line-height: 1;
    cursor: var(--cursor-pointer), pointer;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .node:hover .fold,
  .node.selected .fold,
  .node .fold.on {
    opacity: 1;
  }

  /* 좌/우 변 — 보이지 않는 너비 조절 띠 (호버하면 커서가 ↔ 로) */
  .rsz {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 9px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: var(--cursor-ew), ew-resize;
  }
  .rsz.left {
    left: -2px;
  }
  .rsz.right {
    right: -2px;
  }

  /* 빈 강호 */
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    pointer-events: none;
    font-family: var(--serif);
    color: var(--paper-dim);
  }
  .empty p {
    margin: 4px 0;
    font-size: 16px;
  }
  .empty .sub {
    font-size: 13px;
    opacity: 0.7;
  }

  /* ── 미니맵 (전도) ── */
  .minimap {
    position: fixed;
    right: 14px;
    bottom: 14px; /* 좌하단 줌 위젯과 같은 베이스라인 */
    z-index: 20;
    width: 200px;
    height: 132px;
    /* 캔버스와 일체화되지 않게 — 패널 면 + 뚜렷한 보더 + 그림자 (Figma류 관행) */
    background: var(--panel);
    border: 1px solid var(--hairline-strong);
    border-radius: 6px;
    box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.85);
    cursor: var(--cursor-cross), crosshair;
    touch-action: none;
  }
  .minimap .mm-node {
    opacity: 0.9;
  }
  .minimap .mm-view {
    fill: rgba(242, 233, 214, 0.07);
    stroke: var(--inju);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  /* 폰에서는 전도가 가림막이 된다 — 숨김 */
  @media (max-width: 640px) {
    .minimap {
      display: none;
    }
  }

  /* 집중(포커스) 배지 — 켜진 동안 상단 중앙 알림 겸 해제 버튼 */
  .focus-pill {
    position: fixed;
    top: calc(var(--bar-h) + 10px);
    left: 50%;
    translate: -50% 0;
    z-index: 30;
    font: 12px/1 var(--sans);
    color: var(--hanji);
    background: var(--panel);
    border: 1px solid var(--hairline-strong);
    border-radius: 999px;
    padding: 7px 13px;
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.7);
    cursor: var(--cursor-pointer), pointer;
  }
  .focus-pill i {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--inju);
    margin-right: 7px;
  }
</style>
