// ──────────────────────────────────────────────
// 緣 그래프 순수 함수 — 방향은 a(부모) → b(자식).
// DOM·스토어 무관, node로 직접 검증 가능 (scripts/check-graph.mjs).
// ──────────────────────────────────────────────
import { nodeBox } from './geometry.js'

// 접힌 가지 아래 숨은 쪽지 집합 — 봉문 뿌리를 순서대로 적용한다.
// 규칙: ① 이미 숨은 뿌리의 봉문은 효력 없음 (상호 잠금 방지)
//       ② 봉문은 자기 조상(순환 동료 포함)을 절대 숨기지도, 그 너머로
//          건너가지도 않는다 — 순환 緣에서 펼치기 단추가 증발하는 참사 방지
// 중첩 봉문(접힌 자식)은 정상으로 숨는다. 규칙을 바꾸면 check-graph.mjs도 같이.
export function computeHidden(nodes, edges) {
  const out = new Set()
  for (const root of nodes) {
    if (!root.collapsed || out.has(root.id)) continue
    // 정방향 BFS — 조상(ancestorIds)은 숨기지도, 그 너머로 건너가지도 않는다
    const seen = ancestorIds(edges, root.id)
    let stack = []
    for (const e of edges) if (e.a === root.id) stack.push(e.b)
    while (stack.length) {
      const id = stack.pop()
      if (seen.has(id)) continue
      seen.add(id)
      out.add(id)
      for (const e of edges) if (e.a === id) stack.push(e.b)
    }
  }
  return out
}

// id의 모든 조상 집합 (자기 자신 포함) — 역방향 BFS, 순환 안전
export function ancestorIds(edges, id) {
  const anc = new Set([id])
  const stack = []
  for (const e of edges) if (e.b === id) stack.push(e.a)
  while (stack.length) {
    const x = stack.pop()
    if (anc.has(x)) continue
    anc.add(x)
    for (const e of edges) if (e.b === x) stack.push(e.a)
  }
  return anc
}

// 부모 緣 — 여럿이면 첫 가닥 (없으면 null)
export function parentEdgeOf(edges, id) {
  return edges.find((e) => e.b === id) ?? null
}

// 자식 id 목록
export function childIdsOf(edges, id) {
  const out = []
  for (const e of edges) if (e.a === id) out.push(e.b)
  return out
}

// 자식 수 Map — 렌더에서 노드마다 edges를 다시 돌지 않게 한 번에
export function childCounts(edges) {
  const m = new Map()
  for (const e of edges) m.set(e.a, (m.get(e.a) ?? 0) + 1)
  return m
}

// 뿌리(들어오는 緣 없음) id 목록
export function rootIds(nodes, edges) {
  const incoming = new Set(edges.map((e) => e.b))
  return nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id)
}

// 정돈(Tidy) 레이아웃 — 첫 부모 기준 신장 트리, 보이는 쪽지만.
// 뿌리(rootId 지정 시 그 쪽지)는 제자리에 두고 후손을 오른쪽으로 펼친다.
// 형제 순서는 현재 y를 존중. 접힌 쪽지는 잎으로 치되 숨은 후손은 같은
// 이동량으로 동행(개문 시 난장판 방지). 순환 덩어리(서로가 첫 부모)는 불변.
// 반환: Map<id, {x, y}> — 움직일 쪽지만 담긴다
export function tidyLayout(nodes, edges, rootId = null, gapX = 90, gapY = 24) {
  const byIdM = new Map(nodes.map((n) => [n.id, n]))
  const hidden = computeHidden(nodes, edges)
  // 신장 트리 — 각 보이는 쪽지는 '첫 부모'의 자식으로만 (여분 緣은 좌표만 따라옴)
  const kidsM = new Map(nodes.map((n) => [n.id, []]))
  for (const n of nodes) {
    if (hidden.has(n.id)) continue
    const pe = parentEdgeOf(edges, n.id)
    if (pe && byIdM.has(pe.a) && !hidden.has(pe.a)) kidsM.get(pe.a).push(n)
  }
  for (const n of nodes) if (n.collapsed) kidsM.set(n.id, []) // 접힌 쪽지는 잎
  for (const arr of kidsM.values()) arr.sort((p, q) => p.y - q.y)

  // 서브트리 밴드 높이 — 자기 높이와 자식 블록 높이 중 큰 쪽
  const H = new Map()
  const calcH = (n) => {
    if (H.has(n.id)) return H.get(n.id)
    H.set(n.id, nodeBox(n).h) // 재귀 전 선등록 — 순환 가드
    const kids = kidsM.get(n.id)
    let h = nodeBox(n).h
    if (kids.length) {
      let block = -gapY
      for (const k of kids) block += calcH(k) + gapY
      h = Math.max(h, block)
    }
    H.set(n.id, h)
    return h
  }
  const pos = new Map()
  const place = (n, x, bandY) => {
    if (pos.has(n.id)) return
    const b = nodeBox(n)
    pos.set(n.id, { x, y: bandY + (calcH(n) - b.h) / 2 })
    const kids = kidsM.get(n.id)
    if (!kids.length) return
    let block = -gapY
    for (const k of kids) block += calcH(k) + gapY
    let cy = bandY + (calcH(n) - block) / 2
    for (const k of kids) {
      place(k, x + b.w + gapX, cy)
      cy += calcH(k) + gapY
    }
  }
  const roots = rootId
    ? [byIdM.get(rootId)].filter((n) => n && !hidden.has(n.id))
    : nodes.filter((n) => {
        if (hidden.has(n.id)) return false
        const pe = parentEdgeOf(edges, n.id)
        return !pe || hidden.has(pe.a) || !byIdM.has(pe.a)
      })
  for (const r of roots) {
    place(r, r.x, r.y - (calcH(r) - nodeBox(r).h) / 2) // 뿌리는 제자리 고정
  }
  // 접힌 쪽지의 숨은 후손 동행 — 같은 dx/dy로 이동
  for (const n of nodes) {
    if (!n.collapsed || !pos.has(n.id)) continue
    const p = pos.get(n.id)
    const dx = p.x - n.x, dy = p.y - n.y
    if (!dx && !dy) continue
    const stack = childIdsOf(edges, n.id)
    const seen = new Set([n.id])
    while (stack.length) {
      const id = stack.pop()
      if (seen.has(id)) continue
      seen.add(id)
      const d = byIdM.get(id)
      if (!d || !hidden.has(id) || pos.has(id)) continue
      pos.set(id, { x: d.x + dx, y: d.y + dy })
      for (const cid of childIdsOf(edges, id)) stack.push(cid)
    }
  }
  return pos
}
