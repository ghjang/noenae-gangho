// ──────────────────────────────────────────────
// 緣 그래프 순수 함수 — 방향은 a(부모) → b(자식).
// DOM·스토어 무관, node로 직접 검증 가능 (scripts/check-graph.mjs).
// ──────────────────────────────────────────────

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
