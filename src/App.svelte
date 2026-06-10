<script>
  // ──────────────────────────────────────────────
  // 뇌내강호(腦內江湖) — 메인 컴포넌트
  // 먹빛 허공에 念(쪽지)을 띄우고 緣(연결)으로 잇는다.
  // 상태/영속화는 lib/store.svelte.js, 모양은 app.css가 담당.
  // ──────────────────────────────────────────────
  import { onMount } from 'svelte'
  import {
    graph, ui, COLORS, byId, init,
    addNodeAt, addChild, updateText, setColor,
    removeNode, addEdge, removeEdge, clearAll,
    snapshot, loadData, scheduleSave,
  } from './lib/store.svelte.js'

  const COLOR_LABEL = { muk: '먹', cheong: '청', dan: '단', hwang: '황', nam: '남' }

  let viewportEl
  let drag = null     // { id, ox, oy, moved } — 쪽지 드래그
  let panning = null  // { sx, sy, px, py } — 강호 유람(팬)

  let armedClear = $state(false) // '비우기' 2단 확인
  let sheetText = $state('')     // 입출력 시트 본문
  let sheetMsg = $state('')      // 시트 하단 메시지

  onMount(() => { init() })

  // ── 좌표 변환 ─────────────────────────────────
  function toWorld(e) {
    const r = viewportEl.getBoundingClientRect()
    return {
      x: (e.clientX - r.left - ui.pan.x) / ui.scale,
      y: (e.clientY - r.top - ui.pan.y) / ui.scale,
    }
  }
  function center(n) {
    return { x: n.x + (n.w || 180) / 2, y: n.y + (n.h || 48) / 2 }
  }
  function edgePath(a, b) {
    const A = center(a), B = center(b)
    const mx = (A.x + B.x) / 2
    return `M ${A.x} ${A.y} C ${mx} ${A.y}, ${mx} ${B.y}, ${B.x} ${B.y}`
  }
  function ghostPath(s, x, y) {
    const A = center(s)
    return `M ${A.x} ${A.y} L ${x} ${y}`
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
  function resetView() {
    ui.pan.x = 40; ui.pan.y = 40; ui.scale = 1
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
  function onHandleDown(e, n) {
    e.stopPropagation()
    const w = toWorld(e)
    ui.selectedId = n.id
    ui.linking = { from: n.id, x: w.x, y: w.y }
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
    const t = e.target
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
    if (e.key === 'Escape') {
      ui.linking = null
      ui.overlay = null
      ui.showHelp = false
      armedClear = false
      commitEditing()
      return
    }
    if (ui.overlay) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.selectedId) { e.preventDefault(); removeNode(ui.selectedId) }
      else if (ui.selectedEdgeId) { e.preventDefault(); removeEdge(ui.selectedEdgeId) }
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
    ui.overlay = { mode: 'export', title: '내공 내보내기 — JSON' }
  }
  function openImport() {
    sheetMsg = ''
    sheetText = ''
    ui.overlay = { mode: 'import', title: '내공 흡수 — JSON 붙여넣기' }
  }
  function openMd() {
    sheetMsg = ''
    sheetText = toMarkdown()
    ui.overlay = { mode: 'md', title: '비급으로 출력 — Markdown' }
  }
  function applyImport() {
    try {
      const data = JSON.parse(sheetText)
      if (loadData(data)) { scheduleSave(); ui.overlay = null }
      else sheetMsg = '형식이 비급답지 않습니다. nodes 배열이 있는 JSON이어야 함.'
    } catch {
      sheetMsg = 'JSON 해독 실패 — 주화입마 직전에 멈췄다 ㅋ 다시 확인을.'
    }
  }
  async function copySheet() {
    try {
      await navigator.clipboard.writeText(sheetText)
      sheetMsg = '복사 완료. 단전에 잘 갈무리하시길.'
    } catch {
      sheetMsg = '자동 복사 실패 — 본문을 직접 긁어가시게.'
    }
  }

  // 그래프 → 마크다운 개요 (루트부터 가지치기, 순환은 ↻ 표시)
  function toMarkdown() {
    const out = ['# 뇌내강호 — 念 모음', '']
    const incoming = new Set(graph.edges.map((e) => e.b))
    const kidsOf = (id) =>
      graph.edges.filter((e) => e.a === id).map((e) => byId(e.b)).filter(Boolean)
    const label = (n) => (n.text || '(빈 쪽지)').replace(/\s*\n+\s*/g, ' / ')
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
</script>

<svelte:window onpointermove={onWinMove} onpointerup={onWinUp} onkeydown={onKey} />

<!-- ── 상단 바 ── -->
<header class="bar">
  <div class="title">
    <span class="hanja">腦內江湖</span>
    <span class="ko">뇌내강호 · 두서없는 아이디어 정리소</span>
    <span class="ver">α</span>
  </div>

  <div class="palette" aria-label="오행 색">
    {#each COLORS as c (c)}
      <button
        style={`--swatch: var(--c-${c})`}
        title={`${COLOR_LABEL[c]}(${c})`}
        aria-label={`선택한 쪽지를 ${COLOR_LABEL[c]} 색으로`}
        disabled={!selected}
        onclick={() => selected && setColor(selected.id, c)}
      ></button>
    {/each}
  </div>

  <div class="actions">
    <button class="primary" onclick={addAtCenter}>+ 새 쪽지</button>
    <button onclick={openMd}>비급.md</button>
    <button onclick={openExport}>내보내기</button>
    <button onclick={openImport}>불러오기</button>
    <button class:armed={armedClear} onclick={onClear}>
      {armedClear ? '진짜 비움?' : '강호 비우기'}
    </button>
    <button onclick={() => (ui.showHelp = !ui.showHelp)} aria-label="도움말">?</button>
  </div>
</header>

<!-- ── 캔버스 ── -->
<div
  class="viewport"
  bind:this={viewportEl}
  role="application"
  aria-label="강호 — 생각의 캔버스"
  onpointerdown={onViewportDown}
  ondblclick={onViewportDbl}
  onwheel={onWheel}
>
  {#if graph.nodes.length === 0}
    <div class="empty">
      <p>허공이 비어 있다.</p>
      <p class="sub">빈 곳을 두 번 두드리면 念이 핀다 — 우상단 ? 참고</p>
    </div>
  {/if}

  <div class="world" style={`transform: translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.scale})`}>
    <svg class="edges" aria-hidden="true">
      {#each graph.edges as e (e.id)}
        {@const a = byId(e.a)}
        {@const b = byId(e.b)}
        {#if a && b}
          {@const d = edgePath(a, b)}
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
        data-color={n.color}
        data-node-id={n.id}
        style={`left:${n.x}px; top:${n.y}px`}
        bind:clientWidth={n.w}
        bind:clientHeight={n.h}
        role="group"
        onpointerdown={(e) => onNodeDown(e, n)}
        ondblclick={(e) => onNodeDbl(e, n)}
      >
        {#if ui.editingId === n.id}
          <textarea
            use:autogrow
            rows="1"
            value={n.text}
            placeholder="念…"
            oninput={(e) => updateText(n.id, e.currentTarget.value)}
            onkeydown={(e) => onEditorKey(e, n)}
            onblur={commitEditing}
            onpointerdown={(e) => e.stopPropagation()}
          ></textarea>
        {:else}
          <div class="ntext">{n.text || '…'}</div>
        {/if}
        <button
          class="handle"
          title="끌어서 다른 쪽지에 緣 잇기 (허공에 놓으면 새 쪽지)"
          aria-label="緣 잇기"
          onpointerdown={(e) => onHandleDown(e, n)}
          ondblclick={(e) => e.stopPropagation()}
        ></button>
      </div>
    {/each}
  </div>
</div>

<!-- ── 하단 HUD + 콜로폰 ── -->
<div class="hud">
  <button onclick={() => zoomCenter(1 / 1.18)} aria-label="축소">−</button>
  <button class="pct" onclick={resetView} title="원점 회귀">{Math.round(ui.scale * 100)}%</button>
  <button onclick={() => zoomCenter(1.18)} aria-label="확대">+</button>
</div>
<div class="colophon">腦內江湖 — 한 글자의 다름에서</div>

<!-- ── 도움말 ── -->
{#if ui.showHelp}
  <aside class="help-card">
    <h2>강호 행보 요결</h2>
    <dl>
      <dt>빈 곳 2번</dt><dd>새 念(쪽지) 피우기</dd>
      <dt>쪽지 2번</dt><dd>글 고치기</dd>
      <dt>쪽지 끌기</dt><dd>자리 옮기기</dd>
      <dt>붉은 점 끌기</dt><dd>緣 잇기 · 허공에 놓으면 새 쪽지</dd>
      <dt>Tab</dt><dd>선택한 쪽지에 가지 치기</dd>
      <dt>Enter</dt><dd>선택한 쪽지 편집</dd>
      <dt>Delete</dt><dd>선택한 쪽지/緣 베기</dd>
      <dt>빈 곳 끌기</dt><dd>강호 유람(이동)</dd>
      <dt>휠</dt><dd>축경(줌)</dd>
    </dl>
    <div class="close-row">
      <button onclick={() => (ui.showHelp = false)}>닫기</button>
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
    <div class="sheet" role="dialog" aria-label={ui.overlay.title}>
      <h2>{ui.overlay.title}</h2>
      <textarea bind:value={sheetText} readonly={ui.overlay.mode !== 'import'}></textarea>
      {#if sheetMsg}<p class="msg">{sheetMsg}</p>{/if}
      <div class="row">
        {#if ui.overlay.mode === 'import'}
          <button onclick={() => (ui.overlay = null)}>취소</button>
          <button class="primary" onclick={applyImport}>흡수</button>
        {:else}
          <button onclick={() => (ui.overlay = null)}>닫기</button>
          <button class="primary" onclick={copySheet}>복사</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
