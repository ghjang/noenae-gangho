<script>
  // ──────────────────────────────────────────────
  // 뇌내강호(腦內江湖) — 메인 컴포넌트
  // 먹빛 허공에 念(쪽지)을 띄우고 緣(연결)으로 잇는다.
  // 상태/영속화는 lib/store.svelte.js, 모양은 app.css, 문구는 lib/strings.js가 담당.
  // ──────────────────────────────────────────────
  import { onMount } from 'svelte'
  import {
    graph, ui, COLORS, byId, init,
    addNodeAt, addChild, updateText, setColor, setNodeWidth,
    removeNode, addEdge, removeEdge, flipEdge, clearAll,
    snapshot, loadData, scheduleSave, toggleTone,
  } from './lib/store.svelte.js'
  import { STRINGS, fmt } from './lib/strings.js'
  import { nodeBox, edgeEnd, edgePath, arrowPath, ghostPath } from './lib/geometry.js'

  // 현재 말투 팩 — 무공봉인 토글(ui.tone)에 따라 문구 전체가 갈린다
  const t = $derived(STRINGS[ui.tone])

  let viewportEl
  let drag = null     // { id, ox, oy, moved } — 쪽지 드래그
  let panning = null  // { sx, sy, px, py } — 강호 유람(팬)
  let resizing = null // { id, sx, sw } — 쪽지 너비 조절
  let hover = $state({ id: null, side: 'right' }) // 緣 핸들 위치 — 마우스에 가까운 변

  let armedClear = $state(false) // '비우기' 2단 확인
  let sheetText = $state('')     // 입출력 시트 본문
  let sheetMsg = $state('')      // 시트 하단 메시지 — strings.js 키 (톤이 바뀌어도 현재 팩으로 그리기 위해)

  onMount(() => { init() })

  $effect(() => { document.title = t.docTitle })

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
    panning = { sx: e.clientX, sy: e.clientY, px: ui.pan.x, py: ui.pan.y }
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
    if (panning) {
      ui.pan.x = panning.px + (e.clientX - panning.sx)
      ui.pan.y = panning.py + (e.clientY - panning.sy)
    } else if (drag) {
      const n = byId(drag.id)
      if (n) {
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
        // 허공에 놓으면 — 그 자리에 새 쪽지를 피우고 緣을 잇는다
        const w = toWorld(e)
        const child = addNodeAt(w.x - 90, w.y - 24, '', byId(from)?.color ?? 'muk')
        addEdge(from, child.id)
      }
      ui.linking = null
    }
  }

  // ── 키보드 ───────────────────────────────────
  function onKey(e) {
    const el = e.target
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return
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
      return // 나머지 Ctrl 조합(찾기·새로고침 등)은 브라우저 몫
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.selectedId) { e.preventDefault(); removeNode(ui.selectedId) }
      else if (ui.selectedEdgeId) { e.preventDefault(); removeEdge(ui.selectedEdgeId) }
      return
    }
    if (e.code === 'KeyF' && ui.selectedEdgeId) {
      e.preventDefault()
      flipEdge(ui.selectedEdgeId)
      return
    }
    if (e.key === 'Tab' && ui.selectedId) {
      e.preventDefault()
      addChild(ui.selectedId)
      return
    }
    if (e.key === 'Enter' && ui.selectedId && !ui.editingId) {
      e.preventDefault()
      ui.editingId = ui.selectedId
    }
  }
  function onEditorKey(e, n) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditing() }
    else if (e.key === 'Escape') { e.stopPropagation(); commitEditing() }
    else if (e.key === 'Tab') { e.preventDefault(); commitEditing(); addChild(n.id) }
  }

  // 편집 textarea — 자동 높이 + 포커스
  function autogrow(el) {
    const fit = () => { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px' }
    fit(); el.focus(); el.select()
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
      if (loadData(data)) { scheduleSave(); ui.overlay = null }
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
</script>

<svelte:window onpointermove={onWinMove} onpointerup={onWinUp} onkeydown={onKey} />

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
        disabled={!selected}
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
        {#if a && b}
          {@const E = edgeEnd(a, b)}
          {@const d = edgePath(a, E)}
          <g class="edge" class:sel={ui.selectedEdgeId === e.id}>
            <path
              class="hit"
              d={d}
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

    {#each graph.nodes as n (n.id)}
      <div
        class="node"
        class:selected={ui.selectedId === n.id}
        class:resized={!!n.bw}
        data-color={n.color}
        data-node-id={n.id}
        style={`left:${n.x}px; top:${n.y}px;${n.bw ? ` width:${n.bw}px;` : ''}`}
        bind:offsetWidth={n.w}
        bind:offsetHeight={n.h}
        role="group"
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
