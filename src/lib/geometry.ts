// ──────────────────────────────────────────────
// 緣 기하 — 순수 함수만 (DOM·스토어 무관, node로도 실행 가능).
// 노드 인자는 { x, y, w?, h? } 모양이면 충분하다 (NodeLike).
// ──────────────────────────────────────────────
import type { NodeLike } from './types.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

// 끝점 앵커 — (ax, ay)는 진입 축 단위벡터: 가로 진입 ax=±1 / 세로 진입 ay=±1
export interface Anchor extends Pt {
  ax: number;
  ay: number;
}

// 실측(bind:offsetWidth/Height) 전의 폴백 — store 초기값과 같은 180×48
export function nodeBox(n: NodeLike): Box {
  return { x: n.x, y: n.y, w: n.w || 180, h: n.h || 48 };
}

export function center(n: NodeLike): Pt {
  const b = nodeBox(n);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// 緣의 끝점 — 자식 박스 4변 중 부모를 향한 변 (화살촉이 박스 밑에 숨지 않게).
// 가로·세로 선택은 중심 간 변위의 우세 축으로.
export function edgeEnd(a: NodeLike, b: NodeLike): Anchor {
  const A = center(a),
    B = center(b);
  const box = nodeBox(b);
  const dx = B.x - A.x,
    dy = B.y - A.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const fromLeft = dx >= 0;
    return { x: fromLeft ? box.x : box.x + box.w, y: B.y, ax: fromLeft ? 1 : -1, ay: 0 };
  }
  const fromTop = dy >= 0;
  return { x: B.x, y: fromTop ? box.y : box.y + box.h, ax: 0, ay: fromTop ? 1 : -1 };
}

// 緣의 시작점 — 출발 박스 4변 중 표적 t({x,y})를 향한 변의 중앙.
// 중심 출발은 드래그 강조(緣이 노드 위층으로 부상)에서 선이 박스 위로 드러났다.
// 우세 축 판정이 edgeEnd와 동일(중심 간 변위) — 같은 緣의 양끝이 늘 같은 축으로 짝 맞아
// edgePath의 가로/세로 탄젠트 분기가 양끝 모두에서 성립한다.
export function edgeStart(a: NodeLike, t: Pt): Pt {
  const A = center(a);
  const box = nodeBox(a);
  const dx = t.x - A.x,
    dy = t.y - A.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? box.x + box.w : box.x, y: A.y };
  return { x: A.x, y: dy >= 0 ? box.y + box.h : box.y };
}

// 곡선 경로 — S는 edgeStart, E는 edgeEnd를 한 번만 계산해 받는다.
// 선은 화살촉 뒤까지만 — 반투명 촉 밑으로 선이 비치지 않게.
export function edgePath(S: Pt, E: Anchor): string {
  const ex = E.x - 7 * E.ax,
    ey = E.y - 7 * E.ay;
  if (E.ax !== 0) {
    const mx = (S.x + ex) / 2;
    return `M ${S.x} ${S.y} C ${mx} ${S.y}, ${mx} ${ey}, ${ex} ${ey}`;
  }
  const my = (S.y + ey) / 2;
  return `M ${S.x} ${S.y} C ${S.x} ${my}, ${ex} ${my}, ${ex} ${ey}`;
}

// 방향 화살촉 — 진입 축으로 7px, 날개 ±4px
export function arrowPath(E: Anchor): string {
  const bx = E.x - 7 * E.ax,
    by = E.y - 7 * E.ay;
  return `M ${E.x} ${E.y} L ${bx - 4 * E.ay} ${by + 4 * E.ax} L ${bx + 4 * E.ay} ${by - 4 * E.ax} Z`;
}

// 연결 드래그 중의 임시 직선 — 시작도 변 앵커 (마우스를 향한 변의 중앙)
export function ghostPath(s: NodeLike, x: number, y: number): string {
  const S = edgeStart(s, { x, y });
  return `M ${S.x} ${S.y} L ${x} ${y}`;
}
