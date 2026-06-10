<script>
  // ──────────────────────────────────────────────
  // 뇌내강호(腦內江湖) — 메인 컴포넌트
  // 먹빛 허공에 念(쪽지)을 띄우고 緣(연결)으로 잇는다.
  // 상태/영속화는 lib/store.svelte.js, 모양은 app.css, 문구는 lib/strings.js가 담당.
  // ──────────────────────────────────────────────
  import { onMount } from 'svelte'
  import { fade, scale } from 'svelte/transition'
  import { backOut, cubicIn } from 'svelte/easing'
  import {
    graph, ui, COLORS, byId, init,
    addNodeAt, addChild, addSibling, updateText, setColor, setNodeWidth,
    removeNode, addEdge, removeEdge, flipEdge, toggleCollapse, clearAll,
    snapshot, loadData, scheduleSave, scheduleViewSave, toggleTone,
    markUndo, asOneStep, undo, redo,
  } from './lib/store.svelte.js'
  import { STRINGS, fmt } from './lib/strings.js'
  import { nodeBox, edgeEnd, edgePath, arrowPath, ghostPath } from './lib/geometry.js'
  import { computeHidden, childIdsOf, childCounts, rootIds } from './lib/graph.js'

  // 현재 말투 팩 — 무공봉인 토글(ui.tone)에 따라 문구 전체가 갈린다
  const t = $derived(STRINGS[ui.tone])

  let viewportEl
  // 움직임 줄이기 설정 사용자는 애니 시간 0 (기존 CSS stamp의 배려를 승계)
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const dur = (ms) => (REDUCED ? 0 : ms)
  let drag = null     // { id, ox, oy, moved } — 쪽지 드래그
  let panning = null  // { sx, sy, px, py } — 강호 유람(팬)
  let resizing = null // { id, sx, sw } — 쪽지 너비 조절
  let touchPts = new Map() // pointerId → {x, y} — 뷰포트에서 시작한 포인터 (핀치 판별)
  let pinch = null    // { d, mx, my } — 직전 두 손가락 거리·중점 (화면 좌표)
  let hover = $state({ id: null, side: 'right' }) // 緣 핸들 위치 — 마우스에 가까운 변
  let colorHover = $state(null) // 팔레트 호버 중인 오행색 — 선택 없을 때 같은 색 비추기
  let edgeHover = null // 마우스가 가리키는 緣 id — F 뒤집기용 (키 핸들러만 읽으니 비반응형)

  let armedClear = $state(false) // '비우기' 2단 확인
  let sheetText = $state('')     // 입출력 시트 본문
  let sheetMsg = $state('')      // 시트 하단 메시지 — strings.js 키 (톤이 바뀌어도 현재 팩으로 그리기 위해)

  onMount(() => { init() })

  $effect(() => { document.title = t.docTitle })

  // 뷰가 움직이면 저장 예약 — 새로고침해도 보던 자리에서 다시 연다
  $effect(() => {
    void ui.pan.x; void ui.pan.y; void ui.scale
    scheduleViewSave()
  })

  // ── 좌표 변환 ─────────────────────────────────
  // (緣 기하 — center/edgeEnd/edgePath/arrowPath/ghostPath — 는 lib/geometry.js)
  function toWorld(e) {
    const r = viewportEl.getBoundingClientRect()
    return {
      x: (e.clientX - r.left - ui.pan.x) / ui.scale,
      y: (e.clientY - r.top - ui.pan.y) / ui.scale,
    }
  }

  // ── 뷰포트: 팬 / 줌 / 새 쪽지 ─────────────────
  function onViewportDown(e) {
    if (e.target !== e.currentTarget) return
    commitEditing()
    ui.selectedId = null
    ui.selectedEdgeId = null
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touchPts.size === 2) {
      // 두 번째 손가락 — 팬을 끊고 핀치로 (#6)
      panning = null
      const [p, q] = [...touchPts.values()]
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }
    } else if (touchPts.size === 1) {
      panning = { sx: e.clientX, sy: e.clientY, px: ui.pan.x, py: ui.pan.y }
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onViewportDbl(e) {
    if (e.target !== e.currentTarget) return
    const w = toWorld(e)
    addNodeAt(w.x - 90, w.y - 24)
  }
  function onWheel(e) {
    e.preventDefault()
    const r = viewportEl.getBoundingClientRect()
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }
  function zoomAt(cx, cy, factor) {
    const ns = Math.min(2.5, Math.max(0.35, ui.scale * factor))
    const k = ns / ui.scale
    ui.pan.x = cx - (cx - ui.pan.x) * k
    ui.pan.y = cy - (cy - ui.pan.y) * k
    ui.scale = ns
  }
  function zoomCenter(factor) {
    const r = viewportEl.getBoundingClientRect()
    zoomAt(r.width / 2, r.height / 2, factor)
  }
  // 배율만 100%로 — 보던 화면 중심은 그대로 (#18)
  function resetView() {
    zoomCenter(1 / ui.scale)
  }
  // 강호 전경 — 모든 쪽지를 화면에 맞춤. 빈 강호면 원점 100%
  function fitAll() {
    if (graph.nodes.length === 0) {
      ui.pan.x = 40; ui.pan.y = 40; ui.scale = 1
      return
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of graph.nodes) {
      if (hidden.has(n.id)) continue // 접혀 숨은 쪽지는 측량 밖 — 보이는 강호만 맞춘다
      const b = nodeBox(n)
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    const pad = 60
    const r = viewportEl.getBoundingClientRect()
    const s = Math.min(2.5, Math.max(0.35,
      Math.min(r.width / (x1 - x0 + pad * 2), r.height / (y1 - y0 + pad * 2))))
    ui.scale = s
    ui.pan.x = (r.width - (x0 + x1) * s) / 2
    ui.pan.y = (r.height - (y0 + y1) * s) / 2
  }
  // 쪽지가 화면 밖이면 중앙으로 끌어온다 (Alt+화살표 緣 타기용)
  function ensureVisible(n) {
    const r = viewportEl.getBoundingClientRect()
    const b = nodeBox(n)
    const x0 = b.x * ui.scale + ui.pan.x, y0 = b.y * ui.scale + ui.pan.y
    const x1 = x0 + b.w * ui.scale, y1 = y0 + b.h * ui.scale
    const m = 24
    if (x0 < m || y0 < m || x1 > r.width - m || y1 > r.height - m) {
      ui.pan.x = r.width / 2 - (b.x + b.w / 2) * ui.scale
      ui.pan.y = r.height / 2 - (b.y + b.h / 2) * ui.scale
    }
  }
  function addAtCenter() {
    const r = viewportEl.getBoundingClientRect()
    const x = (r.width / 2 - ui.pan.x) / ui.scale
    const y = (r.height / 2 - ui.pan.y) / ui.scale
    addNodeAt(x - 90 + (Math.random() * 48 - 24), y - 24 + (Math.random() * 48 - 24))
  }

  // ── 쪽지(노드) ────────────────────────────────
  function onNodeDown(e, n) {
    e.stopPropagation()
    if (ui.editingId === n.id) return
    if (ui.editingId) commitEditing()
    ui.selectedId = n.id
    ui.selectedEdgeId = null
    const w = toWorld(e)
    drag = { id: n.id, ox: w.x - n.x, oy: w.y - n.y, moved: false }
  }
  function onNodeDbl(e, n) {
    e.stopPropagation()
    ui.selectedId = n.id
    ui.editingId = n.id
  }
  // 緣 핸들을 마우스와 가장 가까운 변으로 — 제스처 중에는 고정
  function onNodeHover(e, n) {
    if (drag || panning || resizing || ui.linking) return
    const w = toWorld(e)
    const b = nodeBox(n)
    const lx = w.x - b.x, ly = w.y - b.y
    const side = [['left', lx], ['right', b.w - lx], ['top', ly], ['bottom', b.h - ly]]
      .sort((p, q) => p[1] - q[1])[0][0]
    if (hover.id !== n.id || hover.side !== side) hover = { id: n.id, side }
  }
  function onNodeLeave(n) {
    if (hover.id === n.id) hover = { id: null, side: 'right' }
  }
  function onHandleDown(e, n) {
    e.stopPropagation()
    const w = toWorld(e)
    ui.selectedId = n.id
    ui.linking = { from: n.id, x: w.x, y: w.y }
  }
  function onResizeDown(e, n, edge) {
    e.stopPropagation()
    ui.selectedId = n.id
    ui.selectedEdgeId = null
    const w = toWorld(e)
    const sw = n.bw || nodeBox(n).w
    resizing = { id: n.id, edge, sx: w.x, sw, right: n.x + sw }
  }
  function onResizeDbl(e, n) {
    e.stopPropagation()
    setNodeWidth(n.id, null) // 자동 너비로 복귀
  }
  function commitEditing() {
    if (ui.editingId) ui.editingId = null
  }

  // ── 전역 포인터: 드래그 진행/마무리 ────────────
  function onWinMove(e) {
    if (pinch && touchPts.has(e.pointerId)) {
      // 핀치 — 거리비만큼 중점 기준 축경, 중점 이동만큼 팬
      touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touchPts.size >= 2) {
        const [p, q] = [...touchPts.values()]
        const d = Math.hypot(p.x - q.x, p.y - q.y)
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
        const r = viewportEl.getBoundingClientRect()
        ui.pan.x += mx - pinch.mx
        ui.pan.y += my - pinch.my
        if (pinch.d > 0) zoomAt(mx - r.left, my - r.top, d / pinch.d)
        pinch = { d, mx, my }
      }
      return
    }
    if (panning) {
      ui.pan.x = panning.px + (e.clientX - panning.sx)
      ui.pan.y = panning.py + (e.clientY - panning.sy)
    } else if (drag) {
      const n = byId(drag.id)
      if (n) {
        if (!drag.moved) markUndo('drag:' + drag.id) // 제스처 시작 시점의 모습을 한 번만
        const w = toWorld(e)
        n.x = w.x - drag.ox
        n.y = w.y - drag.oy
        drag.moved = true
      }
    } else if (resizing) {
      const w = toWorld(e)
      const dx = w.x - resizing.sx
      setNodeWidth(resizing.id, resizing.edge === 'right' ? resizing.sw + dx : resizing.sw - dx)
      if (resizing.edge === 'left') {
        const n = byId(resizing.id)
        if (n) n.x = resizing.right - n.bw // 왼변을 끌 때는 오른변 고정
      }
    } else if (ui.linking) {
      const w = toWorld(e)
      ui.linking.x = w.x
      ui.linking.y = w.y
    }
  }
  function onWinUp(e) {
    touchPts.delete(e.pointerId)
    if (touchPts.size < 2) pinch = null
    if (drag) {
      if (drag.moved) scheduleSave()
      drag = null
    }
    panning = null
    resizing = null
    if (ui.linking) {
      const from = ui.linking.from
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const nodeEl = el?.closest?.('[data-node-id]')
      if (nodeEl && nodeEl.dataset.nodeId !== from) {
        addEdge(from, nodeEl.dataset.nodeId)
      } else if (!nodeEl && viewportEl?.contains(el)) {
        // 허공에 놓으면 — 그 자리에 새 쪽지를 피우고 緣을 잇는다 (undo 한 걸음)
        const w = toWorld(e)
        asOneStep(() => {
          const child = addNodeAt(w.x - 90, w.y - 24, '', byId(from)?.color ?? 'muk')
          addEdge(from, child.id)
        })
      }
      ui.linking = null
    }
  }

  // ── 키보드 ───────────────────────────────────
  function onKey(e) {
    const el = e.target
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return
    // 포커스가 버튼에 있으면 Space/Enter는 버튼의 몫 — '강호 비우기' 오발사 방지
    if (el?.tagName === 'BUTTON' && (e.code === 'Space' || e.key === 'Enter')) return
    if (e.key === 'Escape') {
      ui.linking = null
      ui.overlay = null
      ui.showHelp = false
      armedClear = false
      commitEditing()
      return
    }
    if (ui.overlay) return
    // Ctrl/Cmd + ± / 0 — 브라우저 줌 대신 앱 자체 축경 (입력 중·시트 열림엔 양보)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault(); zoomCenter(1.18); return
      }
      if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault(); zoomCenter(1 / 1.18); return
      }
      if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault(); resetView(); return
      }
      if (e.key === 'Enter' && ui.selectedId && !ui.editingId) {
        e.preventDefault(); ui.editingId = ui.selectedId; return // F2와 동일 — 편집 진입
      }
      if (e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.code === 'KeyY') {
        e.preventDefault(); redo(); return
      }
      return // 나머지 Ctrl 조합(찾기·새로고침 등)은 브라우저 몫
    }
    // 화살표 키 — 쪽지가 선택돼 있으면 그 쪽지를 옮기고(nudge), 아니면 강호 유람(팬).
    // Alt 조합은 여기서 삼키지 않는다 — 아래 緣 타기(트리 탐색) 몫
    if (e.key.startsWith('Arrow') && !e.altKey) {
      e.preventDefault()
      const mult = e.shiftKey ? 4 : 1
      if (selected) {
        const d = 8 * mult
        markUndo('nudge:' + selected.id) // 꾹 누르면 한 걸음으로 병합
        if (e.key === 'ArrowLeft') selected.x -= d
        else if (e.key === 'ArrowRight') selected.x += d
        else if (e.key === 'ArrowUp') selected.y -= d
        else if (e.key === 'ArrowDown') selected.y += d
        scheduleSave() // n.x/y 직접 변이 — 저장은 호출부 책임
      } else {
        const step = 48 * mult
        if (e.key === 'ArrowLeft') ui.pan.x += step
        else if (e.key === 'ArrowRight') ui.pan.x -= step
        else if (e.key === 'ArrowUp') ui.pan.y += step
        else if (e.key === 'ArrowDown') ui.pan.y -= step
      }
      return
    }
    // PgUp/PgDn — 한 화면(80%)씩 세로 이동
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const r = viewportEl.getBoundingClientRect()
      ui.pan.y += (e.key === 'PageUp' ? 1 : -1) * r.height * 0.8
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.selectedId) { e.preventDefault(); removeNode(ui.selectedId) }
      else if (ui.selectedEdgeId) { e.preventDefault(); removeEdge(ui.selectedEdgeId) }
      return
    }
    if (e.code === 'KeyF' && (edgeHover || ui.selectedEdgeId)) {
      e.preventDefault()
      flipEdge(edgeHover ?? ui.selectedEdgeId) // 가리키는 緣이 선택보다 우선
      return
    }
    if ((e.code === 'KeyC' || e.code === 'Space') && selected && (kidCount.get(selected.id) ?? 0) > 0) {
      e.preventDefault()
      toggleCollapse(selected.id) // 가지 봉문/개문 — 자식 있는 쪽지만 (Space는 FreeMind 혈통 별칭)
      return
    }
    // Alt+화살표 — 緣 타고 이동: ←부모 / →자식(최상단) / ↑↓형제(루트면 뿌리들 사이)
    if (e.altKey && e.key.startsWith('Arrow') && selected) {
      e.preventDefault()
      const cy = (nd) => nd.y + (nd.h || 48) / 2
      const visible = (id) => !hidden.has(id)
      let target = null
      if (e.key === 'ArrowLeft') {
        const pe = graph.edges.find((ed) => ed.b === selected.id && visible(ed.a))
        target = pe ? byId(pe.a) : null
      } else if (e.key === 'ArrowRight') {
        const kids = childIdsOf(graph.edges, selected.id)
          .map(byId)
          .filter((nd) => nd && visible(nd.id))
          .sort((p, q) => cy(p) - cy(q))
        target = kids[0] ?? null
      } else {
        const pe = graph.edges.find((ed) => ed.b === selected.id)
        const sibs = (pe ? childIdsOf(graph.edges, pe.a) : rootIds(graph.nodes, graph.edges))
          .map(byId)
          .filter((nd) => nd && visible(nd.id))
          .sort((p, q) => cy(p) - cy(q))
        const i = sibs.findIndex((nd) => nd.id === selected.id)
        target = e.key === 'ArrowUp' ? sibs[i - 1] : sibs[i + 1]
      }
      if (target) {
        ui.selectedId = target.id
        ui.selectedEdgeId = null
        ensureVisible(target)
      }
      return
    }
    if (e.key === 'Tab' && ui.selectedId) {
      e.preventDefault()
      addChild(ui.selectedId)
      return
    }
    // Enter — 형제 가지치기 (마인드맵 국룰: Tab=자식, Enter=형제). 로직은 store.addSibling
    if (e.key === 'Enter' && ui.selectedId && !ui.editingId) {
      e.preventDefault()
      addSibling(ui.selectedId)
      return
    }
    // F2 — 편집 진입 (Ctrl+Enter도 동일)
    if (e.key === 'F2' && ui.selectedId && !ui.editingId) {
      e.preventDefault()
      ui.editingId = ui.selectedId
    }
  }
  function onEditorKey(e, n) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditing() }
    else if (e.key === 'Escape') { e.stopPropagation(); commitEditing() }
    else if (e.key === 'Tab') { e.preventDefault(); commitEditing(); addChild(n.id) }
  }

  // 편집 textarea — 자동 높이 + 포커스.
  // 전체 선택 대신 끝에 캐럿: 여러 줄 메모가 오타 한 방에 증발하지 않게 (갈아엎기는 Ctrl+A)
  function autogrow(el) {
    const fit = () => { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px' }
    fit()
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
    el.addEventListener('input', fit)
    return { destroy() { el.removeEventListener('input', fit) } }
  }

  // ── 입출력 시트 ──────────────────────────────
  function openExport() {
    sheetMsg = ''
    sheetText = JSON.stringify(snapshot(), null, 2)
    ui.overlay = { mode: 'export' }
  }
  function openImport() {
    sheetMsg = ''
    sheetText = ''
    ui.overlay = { mode: 'import' }
  }
  function openMd() {
    sheetMsg = ''
    sheetText = toMarkdown()
    ui.overlay = { mode: 'md' }
  }
  function applyImport() {
    try {
      const data = JSON.parse(sheetText)
      let ok = false
      asOneStep(() => { ok = loadData(data) }) // 흡수도 되돌릴 수 있게
      if (ok) { scheduleSave(); ui.overlay = null }
      else sheetMsg = 'importBadShape'
    } catch {
      sheetMsg = 'importParseFail'
    }
  }
  async function copySheet() {
    try {
      await navigator.clipboard.writeText(sheetText)
      sheetMsg = 'copyOk'
    } catch {
      sheetMsg = 'copyFail'
    }
  }

  // 그래프 → 마크다운 개요 (루트부터 가지치기, 순환은 ↻ 표시)
  function toMarkdown() {
    const out = [t.mdHeading, '']
    const incoming = new Set(graph.edges.map((e) => e.b))
    const kidsOf = (id) =>
      graph.edges.filter((e) => e.a === id).map((e) => byId(e.b)).filter(Boolean)
    const label = (n) => (n.text || t.mdEmptyNode).replace(/\s*\n+\s*/g, ' / ')
    const seen = new Set()
    const walk = (n, d) => {
      if (seen.has(n.id)) { out.push(`${'  '.repeat(d)}- ${label(n)} ↻`); return }
      seen.add(n.id)
      out.push(`${'  '.repeat(d)}- ${label(n)}`)
      for (const k of kidsOf(n.id)) walk(k, d + 1)
    }
    for (const r of graph.nodes.filter((n) => !incoming.has(n.id))) walk(r, 0)
    for (const n of graph.nodes) if (!seen.has(n.id)) walk(n, 0)
    return out.join('\n')
  }

  // ── 비우기 (2단 확인) ─────────────────────────
  let disarmTimer = null
  function onClear() {
    if (!armedClear) {
      armedClear = true
      clearTimeout(disarmTimer)
      disarmTimer = setTimeout(() => (armedClear = false), 2600)
      return
    }
    clearAll()
    armedClear = false
  }

  const selected = $derived(ui.selectedId ? byId(ui.selectedId) : null)
  const sheetTitle = $derived(ui.overlay ? t[ui.overlay.mode + 'Title'] : '')

  // 접힌 가지 아래 숨은 쪽지들 — 규칙·증명은 lib/graph.js computeHidden
  // (시나리오 검증: scripts/check-graph.mjs)
  const hidden = $derived.by(() => computeHidden(graph.nodes, graph.edges))
  // 자식 수 — 봉문 배지용 (노드마다 edges를 다시 돌지 않게 한 번에)
  const kidCount = $derived(childCounts(graph.edges))

  // 숨은 쪽지/緣이 선택·편집 상태로 남지 않게
  $effect(() => {
    if (ui.selectedId && hidden.has(ui.selectedId)) ui.selectedId = null
    if (ui.editingId && hidden.has(ui.editingId)) ui.editingId = null
    if (ui.selectedEdgeId) {
      const ed = graph.edges.find((x) => x.id === ui.selectedEdgeId)
      if (!ed || hidden.has(ed.a) || hidden.has(ed.b)) ui.selectedEdgeId = null
    }
  })
</script>

<svelte:window onpointermove={onWinMove} onpointerup={onWinUp} onpointercancel={onWinUp} onkeydown={onKey} />

<!-- ── 상단 바 ── -->
<header class="bar">
  <div class="title">
    <span class="hanja">{t.titleMain}</span>
    <span class="ko">{t.titleSub}</span>
    <span class="ver">α</span>
  </div>

  <div class="palette" aria-label={t.paletteAria}>
    {#each COLORS as c (c)}
      <button
        style={`--swatch: var(--c-${c})`}
        title={`${t.colorLabel[c]}(${c})`}
        aria-label={fmt(t.paletteSet, { label: t.colorLabel[c] })}
        aria-disabled={!selected}
        class:dim={!selected}
        class:cur={!!selected && selected.color === c}
        onpointerenter={() => (colorHover = selected ? null : c)}
        onpointerleave={() => (colorHover = null)}
        onclick={() => selected && setColor(selected.id, c)}
      ></button>
    {/each}
  </div>

  <div class="actions">
    <button class="primary" onclick={addAtCenter}>{t.newNode}</button>
    <button onclick={openMd}>{t.mdButton}</button>
    <button onclick={openExport}>{t.exportButton}</button>
    <button onclick={openImport}>{t.importButton}</button>
    <button class:armed={armedClear} onclick={onClear}>
      {armedClear ? t.clearConfirm : t.clearButton}
    </button>
    <button class="tone" onclick={toggleTone} title={t.toneButtonTitle} aria-label={t.toneButtonAria}>{t.toneButton}</button>
    <button onclick={() => (ui.showHelp = !ui.showHelp)} aria-label={t.helpAria}>?</button>
  </div>
</header>

<!-- ── 캔버스 ── -->
<div
  class="viewport"
  bind:this={viewportEl}
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

  <div class="world" style={`transform: translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.scale})`}>
    <svg class="edges" aria-hidden="true">
      {#each graph.edges as e (e.id)}
        {@const a = byId(e.a)}
        {@const b = byId(e.b)}
        {#if a && b && !hidden.has(a.id) && !hidden.has(b.id)}
          {@const E = edgeEnd(a, b)}
          {@const d = edgePath(a, E)}
          <g class="edge" class:sel={ui.selectedEdgeId === e.id} transition:fade={{ duration: dur(170) }}>
            <path
              class="hit"
              d={d}
              onpointerenter={() => (edgeHover = e.id)}
              onpointerleave={() => (edgeHover = null)}
              onpointerdown={(ev) => {
                ev.stopPropagation()
                ui.selectedEdgeId = e.id
                ui.selectedId = null
              }}
            />
            <path class="vis" d={d} />
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

    {#each graph.nodes.filter((nd) => !hidden.has(nd.id)) as n (n.id)}
      {@const kids = kidCount.get(n.id) ?? 0}
      <div
        class="node"
        class:selected={ui.selectedId === n.id}
        class:resized={!!n.bw}
        class:lit={!selected && colorHover === n.color}
        class:fade={!selected && colorHover && colorHover !== n.color}
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
            onclick={(e) => { e.stopPropagation(); toggleCollapse(n.id) }}
          >{n.collapsed ? `▸${kids}` : '▾'}</button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- ── 하단 HUD + 콜로폰 ── -->
<div class="hud">
  <button onclick={() => zoomCenter(1 / 1.18)} aria-label={t.zoomOutAria}>−</button>
  <button class="pct" onclick={resetView} title={t.resetViewTitle}>{Math.round(ui.scale * 100)}%</button>
  <button onclick={() => zoomCenter(1.18)} aria-label={t.zoomInAria}>+</button>
  <button onclick={fitAll} title={t.fitButtonTitle} aria-label={t.fitAria}>{t.fitButton}</button>
</div>
{#if t.colophon}<div class="colophon">{t.colophon}</div>{/if}

<!-- ── 도움말 ── -->
{#if ui.showHelp}
  <aside class="help-card">
    <h2>{t.helpTitle}</h2>
    <dl>
      {#each t.helpItems as [key, desc] (key)}
        <dt>{key}</dt><dd>{desc}</dd>
      {/each}
    </dl>
    <div class="close-row">
      <button onclick={() => (ui.showHelp = false)}>{t.closeButton}</button>
    </div>
  </aside>
{/if}

<!-- ── 입출력 시트 ── -->
{#if ui.overlay}
  <div
    class="overlay"
    role="presentation"
    onpointerdown={(e) => { if (e.target === e.currentTarget) ui.overlay = null }}
  >
    <div class="sheet" role="dialog" aria-label={sheetTitle}>
      <h2>{sheetTitle}</h2>
      <textarea bind:value={sheetText} readonly={ui.overlay.mode !== 'import'}></textarea>
      {#if sheetMsg}<p class="msg">{t[sheetMsg]}</p>{/if}
      <div class="row">
        {#if ui.overlay.mode === 'import'}
          <button onclick={() => (ui.overlay = null)}>{t.cancelButton}</button>
          <button class="primary" onclick={applyImport}>{t.applyImportButton}</button>
        {:else}
          <button onclick={() => (ui.overlay = null)}>{t.closeButton}</button>
          <button class="primary" onclick={copySheet}>{t.copyButton}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
