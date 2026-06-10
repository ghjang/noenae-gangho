// ──────────────────────────────────────────────
// 緣 기하 — 순수 함수만 (DOM·스토어 무관, node로도 실행 가능).
// 노드 인자는 { x, y, w?, h? } 모양이면 충분하다.
// ──────────────────────────────────────────────

// 실측(bind:offsetWidth/Height) 전의 폴백 — store 초기값과 같은 180×48
export function nodeBox(n) {
  return { x: n.x, y: n.y, w: n.w || 180, h: n.h || 48 }
}

export function center(n) {
  const b = nodeBox(n)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

// 緣의 끝점 — 자식 박스 4변 중 부모를 향한 변 (화살촉이 박스 밑에 숨지 않게).
// (ax, ay)는 진입 축 단위벡터: 가로 진입 ax=±1 / 세로 진입 ay=±1.
// 가로·세로 선택은 중심 간 변위의 우세 축으로.
export function edgeEnd(a, b) {
  const A = center(a), B = center(b)
  const box = nodeBox(b)
  const dx = B.x - A.x, dy = B.y - A.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const fromLeft = dx >= 0
    return { x: fromLeft ? box.x : box.x + box.w, y: B.y, ax: fromLeft ? 1 : -1, ay: 0 }
  }
  const fromTop = dy >= 0
  return { x: B.x, y: fromTop ? box.y : box.y + box.h, ax: 0, ay: fromTop ? 1 : -1 }
}

// 곡선 경로 — E는 edgeEnd(a, b)를 한 번만 계산해 받는다.
// 선은 화살촉 뒤까지만 — 반투명 촉 밑으로 선이 비치지 않게.
export function edgePath(a, E) {
  const A = center(a)
  const ex = E.x - 7 * E.ax, ey = E.y - 7 * E.ay
  if (E.ax !== 0) {
    const mx = (A.x + ex) / 2
    return `M ${A.x} ${A.y} C ${mx} ${A.y}, ${mx} ${ey}, ${ex} ${ey}`
  }
  const my = (A.y + ey) / 2
  return `M ${A.x} ${A.y} C ${A.x} ${my}, ${ex} ${my}, ${ex} ${ey}`
}

// 방향 화살촉 — 진입 축으로 7px, 날개 ±4px
export function arrowPath(E) {
  const bx = E.x - 7 * E.ax, by = E.y - 7 * E.ay
  return `M ${E.x} ${E.y} L ${bx - 4 * E.ay} ${by + 4 * E.ax} L ${bx + 4 * E.ay} ${by - 4 * E.ax} Z`
}

// 연결 드래그 중의 임시 직선
export function ghostPath(s, x, y) {
  const A = center(s)
  return `M ${A.x} ${A.y} L ${x} ${y}`
}
