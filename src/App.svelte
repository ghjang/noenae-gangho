<script>
  // ──────────────────────────────────────────────
  // 뇌내강호(腦內江湖) — 메인 컴포넌트
  // 먹빛 허공에 念(쪽지)을 띄우고 緣(연결)으로 잇는다.
  // 상태/영속화는 lib/store.svelte.js, 모양은 app.css, 문구는 lib/strings.js가 담당.
  // ──────────────────────────────────────────────
  import { onMount, tick } from 'svelte'
  import BoardView from './BoardView.svelte'
  import { fade, scale } from 'svelte/transition'
  import { backOut, cubicIn } from 'svelte/easing'
  import {
    graph, ui, COLORS, byId, init, selectNode, selectEdge, clearSelection,
    addToSelection, selectMany, isSelected, pruneSelection,
    addNodeAt, addChild, addSibling, updateText, setColorMany, setInk, setNodeWidth,
    removeNodes, addEdge, removeEdge, flipEdge, toggleCollapse, revealNode, arrange, clearAll,
    docs, switchDoc, createDoc, renameDoc, removeDoc, setViewMode,
    snapshot, loadData, scheduleSave, scheduleViewSave, toggleTone,
    markUndo, asOneStep, undo, redo, flushSave, clampScale,
  } from './lib/store.svelte.js'
  import { STRINGS, TONES, fmt } from './lib/strings.js'
  import { nodeBox, center, edgeStart, edgeEnd, edgePath, arrowPath, ghostPath } from './lib/geometry.js'
  import { computeHidden, neighborhood, parentEdgeOf, childIdsOf, childCounts, rootIds, boardColumns } from './lib/graph.js'
  import { fromMarkdown } from './lib/markdown.js'
  import { highlightJson, highlightMd, highlightAuto } from './lib/highlight.js'

  // 현재 말투 팩 — 무공봉인 토글(ui.tone)에 따라 문구 전체가 갈린다
  const t = $derived(STRINGS[ui.tone])

  let viewportEl
  // 움직임 줄이기 설정 사용자는 애니 시간 0 (기존 CSS stamp의 배려를 승계).
  // 문서 전환 중에도 0 — 떠나는 강호와 오는 강호가 겹쳐 보이지 않게 (동기식 절단)
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const dur = (ms) => (REDUCED || ui.docSwitching ? 0 : ms)
  let drag = null     // { grabbed, items: [{id, ox, oy}], moved, plain } — 쪽지(무리) 드래그
  let dragIds = $state(null) // 실제 이동 중인 쪽지 id 집합 — 그 緣들을 위층에 띄우는 용도
  let marquee = $state(null) // { x0, y0, x1, y1, base } — 올가미(Shift+빈 곳 드래그), world 좌표
  let shiftHeld = $state(false) // Shift 누름 — 캔버스 커서를 조준 레티클로 (올가미 예고)
  let panning = null  // { sx, sy, px, py } — 강호 유람(팬)
  let resizing = null // { id, sx, sw } — 쪽지 너비 조절
  let touchPts = new Map() // pointerId → {x, y} — 뷰포트에서 시작한 포인터 (핀치 판별)
  let pinch = null    // { d, mx, my } — 직전 두 손가락 거리·중점 (화면 좌표)
  let hover = $state({ id: null, side: 'right' }) // 緣 핸들 위치 — 마우스에 가까운 변
  let colorHover = $state(null) // 팔레트 호버 중인 오행색 — 선택 없을 때 같은 색 비추기
  let edgeHover = null // 마우스가 가리키는 緣 id — F 뒤집기용 (키 핸들러만 읽으니 비반응형)

  let sheetText = $state('')     // 입출력 시트 본문
  let hlPre = null               // 가져오기 편집 overlay의 하이라이트 pre — 스크롤 동기화용
  let sheetMsg = $state('')      // 시트 하단 메시지 — strings.js 키 (톤이 바뀌어도 현재 팩으로 그리기 위해)
  let searchQ = $state(null)     // 검색 질의 — null이면 닫힘
  let searchIdx = $state(0)      // 하이라이트 = 지금/다음에 볼 결과 (화면과 항상 일치)
  let searchJumped = false       // Enter 의미 분기: 처음엔 현재 항목, 그 뒤엔 전진 후 점프
  let searchEl = null            // 검색 input — 재호출 시 전체 선택용
  let vpW = $state(0), vpH = $state(0) // 뷰포트 실측 — 미니맵 뷰 사각형용
  let tidying = $state(false)    // 정돈(R) 직후 잠깐 — 쪽지가 미끄러지는 트랜지션
  let tidyTimer = null
  let mmDrag = false             // 미니맵 스크럽 중
  let mmEl = null                // 미니맵 svg (스크럽 좌표 변환용)

  onMount(() => { init() })

  $effect(() => { document.title = t.docTitle })

  // 뷰가 움직이면 저장 예약 — 새로고침해도 보던 자리에서 다시 연다
  $effect(() => {
    void ui.pan.x; void ui.pan.y; void ui.scale
    scheduleViewSave()
  })

  // ── 좌표 변환 ─────────────────────────────────
  // (緣 기하 — center/edgeStart/edgeEnd/edgePath/arrowPath/ghostPath — 는 lib/geometry.js)
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
    searchQ = null // 캔버스 직접 조작 = 검색창 닫기 (팝오버 국룰)
    if (e.shiftKey) {
      // 올가미(러버밴드) — 기존 무리에 더해 담는다. 맨 드래그(팬)와 Shift로 구분
      const w = toWorld(e)
      marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, base: [...ui.selectedIds] }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      return
    }
    clearSelection()
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
    const ns = clampScale(ui.scale * factor)
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
  // 보이는(접히지 않은) 쪽지들의 world 바운딩 — 전경 맞춤(全)과 전도(미니맵)가 공유.
  // 빈 강호면 null (뿌리는 절대 안 숨으니 '전부 숨음'은 없다)
  function visibleBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of graph.nodes) {
      if (hidden.has(n.id)) continue
      const b = nodeBox(n)
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
    }
    return x1 === -Infinity ? null : { x0, y0, x1, y1 }
  }
  // 강호 전경 — 모든 쪽지를 화면에 맞춤. 빈 강호면 원점 100%
  function fitAll() {
    const bb = visibleBounds()
    if (!bb) {
      ui.pan.x = 40; ui.pan.y = 40; ui.scale = 1
      return
    }
    const pad = 60
    const r = viewportEl.getBoundingClientRect()
    const s = clampScale(
      Math.min(r.width / (bb.x1 - bb.x0 + pad * 2), r.height / (bb.y1 - bb.y0 + pad * 2)))
    ui.scale = s
    ui.pan.x = (r.width - (bb.x0 + bb.x1) * s) / 2
    ui.pan.y = (r.height - (bb.y0 + bb.y1) * s) / 2
  }
  // 선택한 쪽지를 화면 가득히 (Shift+2 — Figma 'Zoom to Selection' 국룰)
  function fitSelection(n) {
    const b = nodeBox(n)
    const pad = 48
    const r = viewportEl.getBoundingClientRect()
    const s = clampScale(Math.min(r.width / (b.w + pad * 2), r.height / (b.h + pad * 2)))
    ui.scale = s
    ui.pan.x = (r.width - (b.x * 2 + b.w) * s) / 2
    ui.pan.y = (r.height - (b.y * 2 + b.h) * s) / 2
  }
  // 쪽지를 화면 중앙으로 (배율 유지)
  function centerOn(n) {
    const r = viewportEl.getBoundingClientRect()
    const b = nodeBox(n)
    ui.pan.x = r.width / 2 - (b.x + b.w / 2) * ui.scale
    ui.pan.y = r.height / 2 - (b.y + b.h / 2) * ui.scale
  }
  // 쪽지가 화면 밖이면 중앙으로 끌어온다 (Alt+화살표 緣 타기용)
  function ensureVisible(n) {
    const r = viewportEl.getBoundingClientRect()
    const b = nodeBox(n)
    const x0 = b.x * ui.scale + ui.pan.x, y0 = b.y * ui.scale + ui.pan.y
    const x1 = x0 + b.w * ui.scale, y1 = y0 + b.h * ui.scale
    const m = 24
    if (x0 < m || y0 < m || x1 > r.width - m || y1 > r.height - m) centerOn(n)
  }

  // ── 검색 (Ctrl+F) ────────────────────────────
  const matches = $derived.by(() => {
    if (searchQ === null) return []
    const q = searchQ.trim().toLowerCase()
    if (!q) return []
    return graph.nodes.filter((n) => n.text.toLowerCase().includes(q)).slice(0, 8)
  })
  function jumpTo(n) {
    revealNode(n.id) // 접힌 가지 속이면 조상 봉문을 열며 데려간다
    if (ui.focusId && ui.focusId !== n.id) ui.focusId = n.id // 집중 중 점프 = 표적 갈아타기
    selectNode(n.id)
    // 멀리서 보던 중이면 읽기 배율로 — 이미 가까우면(≥0.9x) 건드리지 않는다
    if (ui.scale < 0.9) ui.scale = 1
    centerOn(n)
  }
  function onSearchKey(e) {
    const len = matches.length
    if (e.key === 'Escape') {
      e.stopPropagation() // 전역 Esc(단계식 해제)가 같은 키로 또 동작하지 않게
      searchQ = null
    } else if (e.key === 'ArrowDown' && len) {
      e.preventDefault()
      searchIdx = (searchIdx + 1) % len
      searchJumped = false // 화살표로 고른 항목엔 다음 Enter가 '그대로' 점프
    } else if (e.key === 'ArrowUp' && len) {
      e.preventDefault()
      searchIdx = (searchIdx - 1 + len) % len
      searchJumped = false
    } else if (e.key === 'Enter' && len) {
      // 첫 Enter = 현재 하이라이트로, 그 뒤 = 전진(Shift면 후진) 후 점프
      // — 하이라이트가 항상 화면의 결과와 일치한다
      if (searchJumped) searchIdx = e.shiftKey ? (searchIdx - 1 + len) % len : (searchIdx + 1) % len
      jumpTo(matches[searchIdx % len])
      searchJumped = true
    }
  }
  const focusit = (el) => { el.focus() }

  // ── 미니맵 ───────────────────────────────────
  // 현재 화면이 비추는 world 사각형
  const viewRect = $derived({
    x: -ui.pan.x / ui.scale,
    y: -ui.pan.y / ui.scale,
    w: vpW / ui.scale,
    h: vpH / ui.scale,
  })
  // 전도 범위 — 보이는 쪽지들 + 현재 뷰 사각형의 합집합 (+여백)
  const minimapBox = $derived.by(() => {
    const bb = visibleBounds()
    const x0 = Math.min(viewRect.x, bb?.x0 ?? Infinity)
    const y0 = Math.min(viewRect.y, bb?.y0 ?? Infinity)
    const x1 = Math.max(viewRect.x + viewRect.w, bb?.x1 ?? -Infinity)
    const y1 = Math.max(viewRect.y + viewRect.h, bb?.y1 ?? -Infinity)
    const pad = 60
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }
  })
  // 미니맵의 한 점(world)이 화면 중앙에 오도록
  function mmJump(e) {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(mmEl.getScreenCTM().inverse())
    ui.pan.x = vpW / 2 - pt.x * ui.scale
    ui.pan.y = vpH / 2 - pt.y * ui.scale
  }
  function onMinimapDown(e) {
    e.stopPropagation()
    mmDrag = true
    mmEl.setPointerCapture?.(e.pointerId)
    mmJump(e)
  }
  function addAtCenter() {
    searchQ = null // 새 쪽지 행동 = 검색 팝오버 닫기 (캔버스/쪽지 클릭과 같은 국룰)
    const r = viewportEl.getBoundingClientRect()
    const x = (r.width / 2 - ui.pan.x) / ui.scale
    const y = (r.height / 2 - ui.pan.y) / ui.scale
    addNodeAt(x - 90 + (Math.random() * 48 - 24), y - 24 + (Math.random() * 48 - 24))
  }

  // ── 쪽지(노드) ────────────────────────────────
  function onNodeDown(e, n) {
    e.stopPropagation()
    // 편집 중인 쪽지의 여백을 잡으면 — 편집을 유지한 채 그대로 드래그한다.
    // preventDefault가 포커스 이탈(blur)을 막아, 빈 쪽지가 끌리는 도중에
    // 자동 폭으로 쪼그라드는 꼴을 방지. 확정·수축은 다른 곳을 짚어 편집이
    // 풀리는 순간의 몫이다. 글자 위 클릭(캐럿 이동)은 textarea 자신의
    // pointerdown stopPropagation이 지키므로 여기 오는 손은 전부 '옮기려는 손'
    if (ui.editingId === n.id) e.preventDefault()
    else if (ui.editingId) commitEditing()
    searchQ = null // 쪽지 직접 선택 = 검색창 닫기
    const toggling = e.shiftKey || e.ctrlKey || e.metaKey
    if (toggling) {
      addToSelection(n.id) // 무리에 넣고 빼기
      if (!isSelected(n.id)) return // 방금 뺀 쪽지를 끌진 않는다
    } else if (!isSelected(n.id)) {
      selectNode(n.id)
    }
    // 이미 무리에 든 쪽지를 맨손으로 잡으면 무리째 끈다 — 클릭만(이동 없음)이면
    // onWinUp에서 단독 선택으로 수렴 (Figma 관행)
    const w = toWorld(e)
    drag = {
      grabbed: n.id, moved: false, plain: !toggling,
      items: ui.selectedIds
        .map((id) => { const m = byId(id); return m && { id, ox: w.x - m.x, oy: w.y - m.y } })
        .filter(Boolean),
    }
  }
  // 더블클릭 좌표 → 표시 텍스트의 오프셋 (편집 진입 시 그 자리에 캐럿)
  let pendingCaret = null
  function caretIndexAt(x, y, textEl) {
    try {
      if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y)
        if (p && textEl.contains(p.offsetNode)) return p.offset
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y)
        if (r && textEl.contains(r.startContainer)) return r.startOffset
      }
    } catch {
      /* 미지원이면 끝 캐럿으로 */
    }
    return null
  }
  function onNodeDbl(e, n) {
    e.stopPropagation()
    const ntext = e.currentTarget.querySelector('.ntext')
    pendingCaret = ntext && n.text ? caretIndexAt(e.clientX, e.clientY, ntext) : null
    selectNode(n.id)
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
    selectNode(n.id)
    ui.linking = { from: n.id, x: w.x, y: w.y }
  }
  function onResizeDown(e, n, edge) {
    e.stopPropagation()
    selectNode(n.id)
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
  // 올가미 사각형 정규화 — 어느 방향으로 그어도 양수 폭
  const normRect = (m) => ({
    x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1),
    w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0),
  })
  function onWinMove(e) {
    if (mmDrag) {
      mmJump(e)
      return
    }
    if (marquee) {
      const w = toWorld(e)
      marquee.x1 = w.x
      marquee.y1 = w.y
      const r = normRect(marquee)
      const hit = graph.nodes
        .filter((n) => {
          if (hidden.has(n.id)) return false
          const b = nodeBox(n)
          return r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h
        })
        .map((n) => n.id)
      selectMany([...new Set([...marquee.base, ...hit])])
      return
    }
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
      if (!drag.moved) {
        markUndo('drag:' + drag.grabbed) // 제스처 시작 시점의 모습을 한 번만
        dragIds = new Set(drag.items.map((it) => it.id)) // 이동 시작 — 무리의 緣을 위층에
      }
      const w = toWorld(e)
      for (const it of drag.items) {
        const m = byId(it.id)
        if (m) { m.x = w.x - it.ox; m.y = w.y - it.oy }
      }
      drag.moved = true
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
    mmDrag = false
    marquee = null
    touchPts.delete(e.pointerId)
    if (touchPts.size < 2) pinch = null
    if (drag) {
      if (drag.moved) scheduleSave()
      else if (drag.plain && ui.selectedIds.length > 1) selectNode(drag.grabbed) // 무리 클릭(이동 없음) → 단독
      drag = null
      dragIds = null // 이동 끝 — 緣은 다시 뒤로
    }
    panning = null
    resizing = null
    if (ui.linking) {
      const from = ui.linking.from
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const nodeEl = el?.closest?.('[data-node-id]')
      // 접힌 쪽지에서 緣을 이으면 개문하고 진행 — 새 식구가 잇자마자 봉문 속으로
      // 사라지지 않게 (Tab/Enter 가지치기의 collapsed 해제와 같은 관행)
      const unfold = () => {
        const f = byId(from)
        if (f?.collapsed) {
          f.collapsed = undefined
          scheduleSave() // 緣 추가가 중복으로 무산돼도 개문만은 저장되게
        }
      }
      if (nodeEl && nodeEl.dataset.nodeId !== from) {
        asOneStep(() => {
          unfold()
          addEdge(from, nodeEl.dataset.nodeId)
        })
      } else if (!nodeEl && viewportEl?.contains(el)) {
        // 허공에 놓으면 — 그 자리에 새 쪽지를 피우고 緣을 잇는다 (undo 한 걸음)
        const w = toWorld(e)
        asOneStep(() => {
          unfold()
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
    const inField = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
    if (e.key === 'Shift' && !inField) shiftHeld = true // 올가미 예고 커서 (글 입력 중엔 무시)
    // 포커스가 버튼에 있으면 Space/Enter는 버튼의 몫 — '강호 비우기' 오발사 방지.
    // 오행진 카드(역시 버튼)만 예외: 그 위의 Enter는 보드 항법(점프)이 받는다 (#111)
    if (el?.tagName === 'BUTTON' && (e.code === 'Space' || e.key === 'Enter') && !el.closest('.board')) return
    if (e.key === 'Escape') {
      // 단계식 — 열린 것(시트/도움말/검색/연결/편집/비우기 무장)을 먼저 닫고,
      // 닫을 게 없을 때의 Esc는 선택 해제 (캔버스 툴 관행)
      const hadOpen =
        ui.linking || ui.overlay || ui.showHelp || ui.focusId || searchQ !== null || ui.editingId
      ui.linking = null
      ui.overlay = null
      ui.showHelp = false
      ui.focusId = null
      searchQ = null
      commitEditing()
      if (!hadOpen) clearSelection()
      return
    }
    if (ui.overlay) return
    // Ctrl/Cmd 조합 — 줌(±/0)과 검색(F)은 입력 필드에 포커스가 있어도 캔버스 몫
    // (검색창 띄운 채 Ctrl+±로 찾은 쪽지 확대). 나머지는 필드 네이티브에 양보
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      // 오행진(보드)에선 되돌리기 + 색 이동만 — 줌/검색/편집 진입은 캔버스 몫, 나머진 브라우저에
      if (ui.viewMode !== 'canvas') {
        if (e.code === 'KeyZ') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
        } else if (e.code === 'KeyY') {
          e.preventDefault()
          redo()
        } else if (!e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ui.selectedIds.length) {
          // Ctrl+←→ — 선택 카드를 이웃 종대 색으로 (#105 경량 편집 첫 수, 양끝 순환).
          // 빈 종대도 어엿한 목적지. 팔레트 칠하기와 같은 변이(setColorMany) —
          // undo 한 걸음, 종대 비행(crossfade)은 공짜. 무리면 앵커 색 기준으로 일괄
          e.preventDefault()
          const i = COLORS.indexOf(byId(ui.selectedId)?.color ?? COLORS[0])
          setColorMany(ui.selectedIds, COLORS[(i + (e.key === 'ArrowRight' ? 1 : -1) + COLORS.length) % COLORS.length])
        }
        return
      }
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault(); zoomCenter(1.18); return
      }
      if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault(); zoomCenter(1 / 1.18); return
      }
      if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault(); resetView(); return
      }
      if (e.code === 'KeyF') {
        // 무한 캔버스에서 브라우저 찾기는 무용지물 — 念 수소문으로 (#4)
        e.preventDefault()
        if (searchQ === null) { searchQ = ''; searchIdx = 0; searchJumped = false }
        else searchEl?.select() // 이미 열려 있으면 질의 유지 + 전체 선택 (찾기 관행)
        return
      }
      if (inField) return // Ctrl+Z/A/C/V 등은 입력 필드의 몫
      if (e.code === 'KeyA') {
        e.preventDefault() // 보이는 쪽지 전부 무리로 (#39) — 봉문 속은 빼고
        selectMany(graph.nodes.filter((n) => !hidden.has(n.id)).map((n) => n.id))
        return
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
      return // 나머지 Ctrl 조합(새로고침 등)은 브라우저 몫
    }
    // 검색창에서도 보기 단축키는 통한다 — Shift+1 전체 / Shift+2 찾은 쪽지 가득
    // ('!','@' 직접 입력은 포기 — 부분 일치 검색이라 기호 없이도 찾힌다)
    if (inField && el === searchEl && e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
      e.preventDefault()
      if (e.code === 'Digit1') {
        fitAll()
      } else {
        const m = matches.length ? matches[searchIdx % matches.length] : selected
        if (m) {
          jumpTo(m) // 개문 + 선택 + 중앙
          fitSelection(m) // 그리고 화면 가득
          searchJumped = true
        }
      }
      return
    }
    if (inField) return
    if (ui.viewMode !== 'canvas') { onBoardKey(e); return } // 캔버스 단축키(이동/가지/집중/올가미…)는 오행진에선 침묵 — 항법(#111)만 받는다
    // 화살표 키 — 쪽지가 선택돼 있으면 그 쪽지를 옮기고(nudge), 아니면 강호 유람(팬).
    // Alt 조합은 여기서 삼키지 않는다 — 아래 緣 타기(트리 탐색) 몫
    if (e.key.startsWith('Arrow') && !e.altKey) {
      e.preventDefault()
      const mult = e.shiftKey ? 4 : 1
      if (selected) {
        const d = 8 * mult
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        markUndo('nudge:' + selected.id) // 꾹 누르면 한 걸음으로 병합 (무리째)
        for (const id of ui.selectedIds) {
          const m = byId(id)
          if (m) { m.x += dx; m.y += dy }
        }
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
    // Shift+1 — 전체 보기 (Figma 국룰, 좌하단 全 버튼과 동일)
    if (e.code === 'Digit1' && e.shiftKey) {
      e.preventDefault()
      fitAll()
      return
    }
    // Shift+2 — 선택한 쪽지를 화면 가득히 (Figma Zoom to Selection)
    if (e.code === 'Digit2' && e.shiftKey && selected) {
      e.preventDefault()
      fitSelection(selected)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (ui.selectedIds.length) { e.preventDefault(); removeNodes(ui.selectedIds) } // 무리째 베기 — undo 한 걸음
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
    // L — 집중(포커스): 선택한 쪽지의 이웃만 남기고 숨김 (#47).
    // 같은 표적 재토글/빈손 L = 해제, 다른 쪽지 선택 후 L = 표적 갈아타기
    if (e.code === 'KeyL') {
      e.preventDefault()
      if (selected && ui.focusId !== selected.id) ui.focusId = selected.id
      else ui.focusId = null
      return
    }
    // [ / ] — 집중 반경(촌수) 조절
    if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && ui.focusId) {
      e.preventDefault()
      ui.focusDepth = Math.max(1, Math.min(9, ui.focusDepth + (e.code === 'BracketRight' ? 1 : -1)))
      return
    }
    // R — 가지런히(Tidy): 무조건 전체. Shift+R = 선택한 가지만 (예측 가능성 우선)
    if (e.code === 'KeyR') {
      e.preventDefault()
      tidying = true
      clearTimeout(tidyTimer)
      tidyTimer = setTimeout(() => (tidying = false), 300)
      arrange(e.shiftKey ? (selected?.id ?? null) : null)
      return
    }
    // Z / Shift+Z — 한 손 줌: 선택한 쪽지를 앵커로 확대/축소 (없으면 화면 중앙)
    if (e.code === 'KeyZ') {
      e.preventDefault()
      const f = e.shiftKey ? 1 / 1.18 : 1.18
      if (selected) {
        const c = center(selected)
        zoomAt(c.x * ui.scale + ui.pan.x, c.y * ui.scale + ui.pan.y, f)
      } else {
        zoomCenter(f)
      }
      return
    }
    // Alt+화살표 — 緣 타고 이동: ←부모 / →자식(최상단) / ↑↓형제(루트면 뿌리들 사이)
    if (e.altKey && e.key.startsWith('Arrow') && selected) {
      e.preventDefault()
      const cy = (nd) => center(nd).y
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
        const pe = parentEdgeOf(graph.edges, selected.id)
        const sibs = (pe ? childIdsOf(graph.edges, pe.a) : rootIds(graph.nodes, graph.edges))
          .map(byId)
          .filter((nd) => nd && visible(nd.id))
          .sort((p, q) => cy(p) - cy(q))
        const i = sibs.findIndex((nd) => nd.id === selected.id)
        target = e.key === 'ArrowUp' ? sibs[i - 1] : sibs[i + 1]
      }
      if (target) {
        selectNode(target.id)
        ensureVisible(target)
      }
      return
    }
    if (e.key === 'Tab') {
      if (ui.selectedId) {
        e.preventDefault()
        addChild(ui.selectedId)
        return
      }
      // 선택이 없으면 — 화면 중심에 가장 가까운 보이는 쪽지를 선택 (키보드 진입점,
      // 포커스가 엄한 데로 유랑하는 것도 차단). 툴바 버튼 포커스 중엔 네이티브 유지
      if (el?.tagName !== 'BUTTON') {
        const r = viewportEl.getBoundingClientRect()
        const wx = (r.width / 2 - ui.pan.x) / ui.scale
        const wy = (r.height / 2 - ui.pan.y) / ui.scale
        let best = null, bd = Infinity
        for (const n of graph.nodes) {
          if (hidden.has(n.id)) continue
          const c = center(n)
          const d = (c.x - wx) ** 2 + (c.y - wy) ** 2
          if (d < bd) { bd = d; best = n }
        }
        if (best) {
          e.preventDefault()
          selectNode(best.id)
          ensureVisible(best)
        }
      }
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
  function onKeyUp(e) {
    if (e.key === 'Shift') shiftHeld = false
    // Alt 단독으로 눌렀다 떼면 브라우저 메뉴바가 포커스를 훔쳐간다(Windows 관행)
    // — 緣 타기(Alt+화살표) 도중 끊기는 원인. keyup preventDefault로 차단
    if (e.key === 'Alt') {
      const el = e.target
      const inField = !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
      if (!inField) e.preventDefault()
    }
  }
  function onEditorKey(e, n) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditing() }
    else if (e.key === 'Escape') { e.stopPropagation(); commitEditing() }
    else if (e.key === 'Tab') { e.preventDefault(); commitEditing(); addChild(n.id) }
  }

  // 편집 textarea — 자동 높이 + 포커스.
  // 캐럿: 더블클릭이면 클릭한 그 자리(pendingCaret), 키보드 진입이면 끝.
  // 전체 선택은 안 한다 — 여러 줄 메모가 오타 한 방에 증발하지 않게 (갈아엎기는 Ctrl+A)
  function autogrow(el) {
    const fit = () => { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px' }
    fit()
    el.focus()
    const pos = Math.min(pendingCaret ?? el.value.length, el.value.length)
    pendingCaret = null
    el.setSelectionRange(pos, pos)
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
    const raw = sheetText.trim()
    // 양식 자동 판별 (#5) — JSON은 반드시 {/[로 시작. 그 외는 비급.md(들여쓰기 불릿)로 해석
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const data = JSON.parse(raw)
        let ok = false
        asOneStep(() => { ok = loadData(data) }) // 흡수도 되돌릴 수 있게
        if (ok) { scheduleSave(); ui.overlay = null }
        else sheetMsg = 'importBadShape'
      } catch {
        sheetMsg = 'importParseFail' // 깨진 JSON을 md로 오인해 외쪽지 한 장 만들지 않게
      }
      return
    }
    const data = fromMarkdown(raw, TONES.map((k) => STRINGS[k].mdEmptyNode))
    if (!data) { sheetMsg = 'importBadShape'; return }
    asOneStep(() => loadData(data))
    scheduleSave()
    ui.overlay = null
    fitAll() // 좌표 없이 격자로 태어난 강호 — 전경을 한눈에
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
    const kidsOf = (id) => childIdsOf(graph.edges, id).map(byId).filter(Boolean) // 緣 순서 보존
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

  // 도움말 — 퀵 카드(필수 요결)에서 전체 요결 시트로
  function openHelpAll() {
    ui.showHelp = false
    ui.overlay = { mode: 'help' }
  }
  // 전체 요결 시트·퀵 카드 공용 — 키→설명 사전
  const helpMap = $derived(new Map(t.helpItems))
  // 퀵 카드 목록 — helpQuick 키 순서대로 (본문 중복 없이)
  const quickHelp = $derived(t.helpQuick.map((k) => [k, helpMap.get(k)]).filter(([, d]) => d))

  // ── 서가 (다중 문서, #62) ─────────────────────
  let docEditId = $state(null) // 이름 고치는 중인 문서 id (시트 안 인라인 입력)
  let docKillId = $state(null) // 베기 확인 중인 문서 id (시트 안 인라인 확인)
  const curDoc = $derived(docs.list.find((d) => d.id === docs.current))
  function openDocs() {
    docEditId = null
    docKillId = null
    ui.overlay = { mode: 'docs' }
  }
  function commitDocRename(id, value) {
    renameDoc(id, value)
    docEditId = null
  }

  // ── 뷰 모드 (#42) — 캔버스 ↔ 오행진(칸반) ────
  function toggleView() {
    commitEditing()
    searchQ = null
    ui.linking = null
    // 집중(L)은 캔버스 전용 렌즈 — 켠 채 들어가면 선택 정리 effect가 집중으로
    // 좁힌 hidden으로 버블 밖 카드 선택을 증발시킨다. 렌즈 끄고 입장
    ui.focusId = null
    setViewMode(ui.viewMode === 'canvas' ? 'kanban' : 'canvas')
  }
  // 오행진 카드 더블클릭 — 강호의 그 자리로 (모드 전환 후 viewport가 서야 점프 가능)
  async function boardJump(n) {
    setViewMode('canvas')
    await tick()
    jumpTo(n)
  }

  // 오행진 키보드 항법 (#111 + 개정) — ↑↓ 종대 안 · ←→ 이웃 종대(같은 높이 착지,
  // 빈 종대 건너뜀) · 양끝에선 순환. Tab/Shift+Tab은 브라우저 포커스 순회 그대로(조준 금테).
  // 화살표는 '마지막으로 만진 링'을 움직인다: 조준(금테)이 선택(인주)과 갈라져 있으면
  // 금테만 이동하고 선택은 제자리 — 합체 상태면 둘이 같이 간다. 화살표 이동은 보드
  // 카드 밖으로 새지 않는다. Enter는 2단: 조준 카드 선택 → 선택된 카드면 캔버스 점프.
  // 빈손 첫 화살표 = 첫 종대 첫 카드
  function onBoardKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // 베기 — 캔버스와 같은 율법 (#105): 접힌 카드는 봉문이 숨기던 가지째,
      // 펼친 카드는 그 카드만, 다중 부모로 보이는 쪽지는 생존 (removeNodes 재사용 — undo 한 걸음)
      if (ui.selectedIds.length) { e.preventDefault(); removeNodes(ui.selectedIds) }
      return
    }
    const arrows = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
    const dir = arrows[e.key]
    if (!dir && e.key !== 'Enter') return
    const cols = boardColumns(graph.nodes, graph.edges, COLORS)
    const aimId = e.target?.classList?.contains('card') ? e.target.dataset.id : null
    // 조준(금테 따로)은 '선택이 어딘가 있는데 포커스가 다른 카드'일 때만 —
    // 빈손의 포커스 카드는 조준이 아니라 항법의 출발점 (Esc 직후 화살표 = 선택 재개)
    const aiming = !!aimId && !!ui.selectedId && aimId !== ui.selectedId
    if (e.key === 'Enter') {
      e.preventDefault()
      if (aimId && aimId !== ui.selectedId) { selectNode(aimId); return } // 조준/포커스 카드 선택 — 금테가 인주로
    }
    const refId = aiming ? aimId : (ui.selectedId ?? aimId)
    let ci = -1, ri = -1 // 기준 카드(조준 또는 앵커)의 종대/높이 — 보드에 없으면(빈손) -1
    for (let i = 0; refId && i < cols.length && ci < 0; i++) {
      const j = cols[i].findIndex((n) => n.id === refId)
      if (j >= 0) { ci = i; ri = j }
    }
    if (e.key === 'Enter') {
      if (ci >= 0) boardJump(cols[ci][ri])
      return
    }
    e.preventDefault()
    let next = null
    if (ci < 0) {
      next = cols.find((col) => col.length)?.[0] // 빈손 진입점 — 캔버스 Tab의 '화면 중심 선택'과 평행
    } else if (dir[1]) {
      const col = cols[ci]
      next = col[(ri + dir[1] + col.length) % col.length] // 종대 양끝 순환
    } else {
      const N = cols.length // 좌우도 순환 — 빈 종대 건너뛰고 한 바퀴가 한계
      for (let s = 1; s <= N; s++) {
        const i = (((ci + dir[0] * s) % N) + N) % N
        if (cols[i].length) { next = cols[i][Math.min(ri, cols[i].length - 1)]; break }
      }
    }
    if (!next) return
    if (!aiming) selectNode(next.id) // 합체 상태 — 선택과 포커스가 같이 간다
    focusCard(next.id) // 조준 중엔 금테만 옮긴다 (선택 불변)
  }

  // 보드 카드에 포커스 + 시야 확보 — 카드는 항상 DOM에 있으니 tick 불요
  function focusCard(id) {
    const card = document.querySelector(`.board .card[data-id="${id}"]`)
    card?.focus({ preventScroll: true }) // 포커스 동행 — Tab 순회·보조기기 출발점 갱신
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  // ── 비우기 (확인 카드) ────────────────────────
  // 네이티브 confirm()은 VSCode 웹뷰에서 차단 — 시트/배경막 패턴 재사용이 이식 안전
  function onClear() {
    ui.overlay = { mode: 'confirmClear' }
  }
  function confirmClear() {
    clearAll()
    ui.overlay = null
  }

  const selected = $derived(ui.selectedId ? byId(ui.selectedId) : null)
  // 집중 표적의 이름표 — 배지에 '누구 중심인지'를 글로도 (첫 줄, 12자 갈무리)
  const focalLabel = $derived.by(() => {
    const n = ui.focusId ? byId(ui.focusId) : null
    if (!n) return ''
    const s = (n.text || t.mdEmptyNode).split('\n')[0]
    return s.length > 12 ? s.slice(0, 12) + '…' : s
  })
  const sheetTitle = $derived(ui.overlay ? t[ui.overlay.mode + 'Title'] : '')

  // 접힌 가지 아래 숨은 쪽지들 — 규칙·증명은 lib/graph.js computeHidden
  // (시나리오 검증: scripts/check-graph.mjs)
  // 집중(포커스, #47)이 켜져 있으면 표적의 이웃 밖도 합쳐 숨긴다 —
  // 全 맞춤/전도/Alt 항법/선택 정리가 전부 이 집합을 보므로 공짜로 따라온다
  const hidden = $derived.by(() => {
    const base = computeHidden(graph.nodes, graph.edges)
    if (!ui.focusId || !byId(ui.focusId)) return base
    const keep = neighborhood(graph.edges, ui.focusId, ui.focusDepth)
    const out = new Set(base)
    for (const n of graph.nodes) if (!keep.has(n.id)) out.add(n.id)
    return out
  })
  // 자식 수 — 봉문 배지용 (노드마다 edges를 다시 돌지 않게 한 번에)
  const kidCount = $derived(childCounts(graph.edges))

  // 숨은(봉문) 쪽지가 무리·편집 상태로 남지 않게, 끊긴 緣 선택도 정리
  $effect(() => {
    if (ui.focusId && !byId(ui.focusId)) ui.focusId = null // 표적이 베이면 집중도 풀린다
    const dead = new Set(ui.selectedIds.filter((id) => hidden.has(id)))
    if (dead.size) pruneSelection(dead)
    if (ui.editingId && hidden.has(ui.editingId)) ui.editingId = null
    if (ui.selectedEdgeId) {
      const ed = graph.edges.find((x) => x.id === ui.selectedEdgeId)
      if (!ed || hidden.has(ed.a) || hidden.has(ed.b)) clearSelection()
    }
  })
</script>

<svelte:window onpointermove={onWinMove} onpointerup={onWinUp} onpointercancel={onWinUp} onkeydown={onKey} onkeyup={onKeyUp} onblur={() => (shiftHeld = false)} onpagehide={flushSave} />

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
    <button class="icon" onclick={openDocs} title={fmt(t.docsButtonTitle, { title: curDoc?.title ?? '' })} aria-label={t.docsButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M231.65,194.55,198.46,36.75a16,16,0,0,0-19-12.39L132.65,34.42a16.08,16.08,0,0,0-12.3,19l33.19,157.8A16,16,0,0,0,169.16,224a16.25,16.25,0,0,0,3.38-.36l46.81-10.06A16.09,16.09,0,0,0,231.65,194.55ZM136,50.15c0-.06,0-.09,0-.09l46.8-10,3.33,15.87L139.33,66Zm6.62,31.47,46.82-10.05,3.34,15.9L146,97.53Zm6.64,31.57,46.82-10.06,13.3,63.24-46.82,10.06ZM216,197.94l-46.8,10-3.33-15.87L212.67,182,216,197.85C216,197.91,216,197.94,216,197.94ZM104,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V48A16,16,0,0,0,104,32ZM56,48h48V64H56Zm0,32h48v96H56Zm48,128H56V192h48v16Z"/></svg>
    </button>
    <!-- 뷰 모드 토글 — Phosphor 'kanban'/'graph' (MIT). 캔버스에선 오행진으로, 오행진에선 강호로 -->
    <button
      class="icon"
      onclick={toggleView}
      title={ui.viewMode === 'canvas' ? t.viewKanbanTitle : t.viewCanvasTitle}
      aria-label={ui.viewMode === 'canvas' ? t.viewKanbanAria : t.viewCanvasAria}
    >
      {#if ui.viewMode === 'canvas'}
        <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M216,48H40a8,8,0,0,0-8,8V208a16,16,0,0,0,16,16H88a16,16,0,0,0,16-16V160h48v16a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V56A8,8,0,0,0,216,48ZM88,208H48V128H88Zm0-96H48V64H88Zm64,32H104V64h48Zm56,32H168V128h40Zm0-64H168V64h40Z"/></svg>
      {:else}
        <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M200,152a31.84,31.84,0,0,0-19.53,6.68l-23.11-18A31.65,31.65,0,0,0,160,128c0-.74,0-1.48-.08-2.21l13.23-4.41A32,32,0,1,0,168,104c0,.74,0,1.48.08,2.21l-13.23,4.41A32,32,0,0,0,128,96a32.59,32.59,0,0,0-5.27.44L115.89,81A32,32,0,1,0,96,88a32.59,32.59,0,0,0,5.27-.44l6.84,15.4a31.92,31.92,0,0,0-8.57,39.64L73.83,165.44a32.06,32.06,0,1,0,10.63,12l25.71-22.84a31.91,31.91,0,0,0,37.36-1.24l23.11,18A31.65,31.65,0,0,0,168,184a32,32,0,1,0,32-32Zm0-64a16,16,0,1,1-16,16A16,16,0,0,1,200,88ZM80,56A16,16,0,1,1,96,72,16,16,0,0,1,80,56ZM56,208a16,16,0,1,1,16-16A16,16,0,0,1,56,208Zm56-80a16,16,0,1,1,16,16A16,16,0,0,1,112,128Zm88,72a16,16,0,1,1,16-16A16,16,0,0,1,200,200Z"/></svg>
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
    <button class="add" onclick={addAtCenter} title={t.newNode} aria-label={t.newNode}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg>
    </button>
    <button class="md" onclick={openMd} title={t.mdButtonTitle} aria-label={t.mdButtonAria}>
      <!-- 공식 Markdown 마크(M↓) — dcurtis/markdown-mark, 퍼블릭 도메인 헌정(저장소 LICENSE 확인) -->
      <svg viewBox="0 0 208 128" width="21" height="13" aria-hidden="true"><g fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="m15 10c-2.7614 0-5 2.2386-5 5v98c0 2.761 2.2386 5 5 5h178c2.761 0 5-2.239 5-5v-98c0-2.7614-2.239-5-5-5zm-15 5c0-8.28427 6.71573-15 15-15h178c8.284 0 15 6.71573 15 15v98c0 8.284-6.716 15-15 15h-178c-8.28427 0-15-6.716-15-15z"/><path d="m30 98v-68h20l20 25 20-25h20v68h-20v-39l-20 25-20-25v39zm125 0-30-33h20v-35h20v35h20z"/></g></svg>
    </button>
    <!-- 아이콘 3종: Phosphor Icons regular (MIT, phosphor-icons/core) — export / download-simple / broom -->
    <button class="icon" onclick={openExport} title={t.exportButtonTitle} aria-label={t.exportButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M216,112v96a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V112A16,16,0,0,1,56,96H80a8,8,0,0,1,0,16H56v96H200V112H176a8,8,0,0,1,0-16h24A16,16,0,0,1,216,112ZM93.66,69.66,120,43.31V136a8,8,0,0,0,16,0V43.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,69.66Z"/></svg>
    </button>
    <button class="icon" onclick={openImport} title={t.importButtonTitle} aria-label={t.importButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/></svg>
    </button>
    <button class="icon" onclick={onClear} title={t.clearButtonTitle} aria-label={t.clearButtonAria}>
      <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M235.5,216.81c-22.56-11-35.5-34.58-35.5-64.8V134.73a15.94,15.94,0,0,0-10.09-14.87L165,110a8,8,0,0,1-4.48-10.34l21.32-53a28,28,0,0,0-16.1-37,28.14,28.14,0,0,0-35.82,16,.61.61,0,0,0,0,.12L108.9,79a8,8,0,0,1-10.37,4.49L73.11,73.14A15.89,15.89,0,0,0,55.74,76.8C34.68,98.45,24,123.75,24,152a111.45,111.45,0,0,0,31.18,77.53A8,8,0,0,0,61,232H232a8,8,0,0,0,3.5-15.19ZM67.14,88l25.41,10.3a24,24,0,0,0,31.23-13.45l21-53c2.56-6.11,9.47-9.27,15.43-7a12,12,0,0,1,6.88,15.92L145.69,93.76a24,24,0,0,0,13.43,31.14L184,134.73V152c0,.33,0,.66,0,1L55.77,101.71A108.84,108.84,0,0,1,67.14,88Zm48,128a87.53,87.53,0,0,1-24.34-42,8,8,0,0,0-15.49,4,105.16,105.16,0,0,0,18.36,38H64.44A95.54,95.54,0,0,1,40,152a85.9,85.9,0,0,1,7.73-36.29l137.8,55.12c3,18,10.56,33.48,21.89,45.16Z"/></svg>
    </button>
    <!-- 서가(다중 문서) — Phosphor 'books' (MIT, phosphor-icons/core) -->
    <button class="tone" onclick={toggleTone} title={t.toneButtonTitle} aria-label={t.toneButtonAria}>{t.toneButton}</button>
    <button onclick={() => (ui.showHelp = !ui.showHelp)} aria-label={t.helpAria}>?</button>
  </div>
</header>

<!-- ── 캔버스 ↔ 오행진 (#42: 데이터 불변, 표현만 교체) ── -->
{#if ui.viewMode !== 'canvas'}
  <BoardView onJump={boardJump} hue={colorHover} />
{:else}
<div
  class="viewport"
  class:lasso={shiftHeld || marquee}
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

  <div class="world" class:tidying style={`transform: translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.scale})`}>
    <svg class="edges" aria-hidden="true">
      {#each graph.edges as e (e.id)}
        {@const a = byId(e.a)}
        {@const b = byId(e.b)}
        {#if a && b && !hidden.has(a.id) && !hidden.has(b.id)}
          {@const E = edgeEnd(a, b)}
          {@const d = edgePath(edgeStart(a, center(b)), E)}
          <g class="edge" class:sel={ui.selectedEdgeId === e.id} transition:fade={{ duration: dur(170) }}>
            <path
              class="hit"
              d={d}
              onpointerenter={() => (edgeHover = e.id)}
              onpointerleave={() => (edgeHover = null)}
              onpointerdown={(ev) => {
                ev.stopPropagation()
                searchQ = null
                selectEdge(e.id)
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

    {#if dragIds}
      <!-- 이동 중인 무리의 緣만 노드들 위에 잠깐 — 손 떼면 사라지고 원래 층으로.
           주의: 'overlay'라는 클래스명은 입출력 시트 배경막(.overlay)과 충돌한다 -->
      <svg class="edges lift-layer" aria-hidden="true">
        {#each graph.edges.filter((ed) => dragIds.has(ed.a) || dragIds.has(ed.b)) as e (e.id)}
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

    {#if marquee}
      {@const r = normRect(marquee)}
      <div class="marquee" style={`left:${r.x}px; top:${r.y}px; width:${r.w}px; height:${r.h}px`}></div>
    {/if}
  </div>
</div>
{/if}

{#if ui.viewMode === 'canvas'}
<!-- ── 집중(포커스) 배지 — 켜진 동안 상단 중앙, 클릭 = 해제 ── -->
{#if ui.focusId}
  <button
    class="focus-pill"
    onclick={() => (ui.focusId = null)}
    title={t.focusPillAria}
    aria-label={t.focusPillAria}
    transition:fade={{ duration: dur(150) }}
  ><i></i>{fmt(t.focusPill, { label: focalLabel, depth: ui.focusDepth })}</button>
{/if}

<!-- ── 하단 HUD + 콜로폰 ── -->
<div class="hud">
  <button onclick={() => zoomCenter(1 / 1.18)} aria-label={t.zoomOutAria}>−</button>
  <button class="pct" onclick={resetView} title={t.resetViewTitle}>{Math.round(ui.scale * 100)}%</button>
  <button onclick={() => zoomCenter(1.18)} aria-label={t.zoomInAria}>+</button>
  <!-- 화면 맞춤(全) — Phosphor 'frame-corners' (MIT, phosphor-icons/core) -->
  <button class="icon" onclick={fitAll} title={t.fitButtonTitle} aria-label={t.fitAria}>
    <svg viewBox="0 0 256 256" width="15" height="15" aria-hidden="true" fill="currentColor"><path d="M200,80v32a8,8,0,0,1-16,0V88H160a8,8,0,0,1,0-16h32A8,8,0,0,1,200,80ZM96,168H72V144a8,8,0,0,0-16,0v32a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16ZM232,56V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z"/></svg>
  </button>
</div>
{#if t.colophon}<div class="colophon">{t.colophon}</div>{/if}

<!-- ── 미니맵 (전도) — 폰에서는 CSS로 숨김 ── -->
{#if graph.nodes.length > 0}
  <svg
    class="minimap"
    bind:this={mmEl}
    viewBox={`${minimapBox.x} ${minimapBox.y} ${minimapBox.w} ${minimapBox.h}`}
    aria-label={t.minimapAria}
    onpointerdown={onMinimapDown}
  >
    {#each graph.nodes.filter((nd) => !hidden.has(nd.id)) as n (n.id)}
      {@const b = nodeBox(n)}
      <rect class="mm-node" x={b.x} y={b.y} width={b.w} height={b.h} rx="8" style={`fill: var(--c-${n.color})`} />
    {/each}
    <rect class="mm-view" x={viewRect.x} y={viewRect.y} width={viewRect.w} height={viewRect.h} />
  </svg>
{/if}

<!-- ── 검색 (Ctrl+F) ── -->
{#if searchQ !== null}
  <aside class="search-card">
    <input
      use:focusit
      bind:this={searchEl}
      aria-label={t.searchPlaceholder}
      placeholder={t.searchPlaceholder}
      value={searchQ}
      oninput={(e) => { searchQ = e.currentTarget.value; searchIdx = 0; searchJumped = false }}
      onkeydown={onSearchKey}
    />
    {#if searchQ.trim()}
      <ul>
        {#each matches as m, i (m.id)}
          <li class:sel={i === searchIdx % matches.length}>
            <button
              onclick={() => { searchIdx = i; searchJumped = true; jumpTo(m) }}
              onpointerenter={() => { searchIdx = i; searchJumped = false }}
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
{/if}

<!-- ── 도움말 ── -->
{#if ui.showHelp}
  <aside class="help-card">
    <h2>{t.helpTitle}</h2>
    <dl>
      {#each quickHelp as [key, desc] (key)}
        <dt>{key}</dt><dd>{desc}</dd>
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
{#snippet toks(list, text)}{#each list as tk}{#if tk.c}<span class={'tk-' + tk.c}>{tk.t}</span>{:else}{tk.t}{/if}{/each}{text.endsWith('\n') ? ' ' : ''}{/snippet}
{#if ui.overlay}
  <div
    class="overlay"
    role="presentation"
    onpointerdown={(e) => { if (e.target === e.currentTarget) ui.overlay = null }}
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
                    if (e.key === 'Enter') commitDocRename(d.id, e.currentTarget.value)
                    else if (e.key === 'Escape') { e.stopPropagation(); docEditId = null }
                  }}
                  onblur={(e) => commitDocRename(d.id, e.currentTarget.value)}
                />
              {:else if docKillId === d.id}
                <span class="ask">{t.docDeleteConfirm}</span>
                <button class="mini" onclick={() => (docKillId = null)}>{t.cancelButton}</button>
                <button class="mini armed" onclick={() => { removeDoc(d.id); docKillId = null }}>{t.docDeleteYes}</button>
              {:else}
                <button class="open" onclick={() => { switchDoc(d.id); ui.overlay = null }}>
                  <i></i><span>{d.title}</span>
                </button>
                <button class="mini" aria-label={t.docRenameAria} title={t.docRenameAria} onclick={() => (docEditId = d.id)}>✎</button>
                <button class="mini" aria-label={t.docDeleteAria} title={t.docDeleteAria} onclick={() => (docKillId = d.id)}>×</button>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="row">
          <button onclick={() => (ui.overlay = null)}>{t.closeButton}</button>
          <button class="primary" onclick={() => { createDoc(); ui.overlay = null }}>{t.docNewButton}</button>
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
                  <dt>{k}</dt><dd>{helpMap.get(k)}</dd>
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
            <pre class="code" bind:this={hlPre} aria-hidden="true">{@render toks(highlightAuto(sheetText), sheetText)}</pre>
            <textarea
              bind:value={sheetText}
              wrap="off"
              spellcheck="false"
              onscroll={(e) => { if (hlPre) { hlPre.scrollTop = e.currentTarget.scrollTop; hlPre.scrollLeft = e.currentTarget.scrollLeft } }}
            ></textarea>
          </div>
        {:else}
          <pre class="code ro">{@render toks(ui.overlay.mode === 'md' ? highlightMd(sheetText) : highlightJson(sheetText), sheetText)}</pre>
        {/if}
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
    {/if}
  </div>
{/if}
