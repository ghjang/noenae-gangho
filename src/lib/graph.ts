// ──────────────────────────────────────────────
// 緣 그래프 순수 함수 — 방향은 a(부모) → b(자식).
// DOM·스토어 무관, node로 직접 검증 가능 (scripts/check-graph.mjs).
// ──────────────────────────────────────────────
import { nodeBox } from './geometry.ts';
import type { Color, Edge, NoteNode } from './types.ts';

// 접힌 가지 아래 숨은 쪽지 집합 — 봉문 뿌리를 순서대로 적용한다.
// 규칙: ① 이미 숨은 뿌리의 봉문은 효력 없음 (상호 잠금 방지)
//       ② 봉문은 자기 조상(순환 동료 포함)을 절대 숨기지도, 그 너머로
//          건너가지도 않는다 — 순환 緣에서 펼치기 단추가 증발하는 참사 방지
// 중첩 봉문(접힌 자식)은 정상으로 숨는다. 규칙을 바꾸면 check-graph.mjs도 같이.
export function computeHidden(nodes: NoteNode[], edges: Edge[]): Set<string> {
  const out = new Set<string>();
  for (const root of nodes) {
    if (!root.collapsed || out.has(root.id)) continue;
    // 정방향 BFS — 조상(ancestorIds)은 숨기지도, 그 너머로 건너가지도 않는다
    const seen = ancestorIds(edges, root.id);
    const stack: string[] = [];
    for (const e of edges) if (e.a === root.id) stack.push(e.b);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.add(id);
      for (const e of edges) if (e.a === id) stack.push(e.b);
    }
  }
  return out;
}

// id의 모든 조상 집합 (자기 자신 포함) — 역방향 BFS, 순환 안전
export function ancestorIds(edges: Edge[], id: string): Set<string> {
  const anc = new Set<string>([id]);
  const stack: string[] = [];
  for (const e of edges) if (e.b === id) stack.push(e.a);
  while (stack.length) {
    const x = stack.pop()!;
    if (anc.has(x)) continue;
    anc.add(x);
    for (const e of edges) if (e.b === x) stack.push(e.a);
  }
  return anc;
}

// 이웃 집합 — id에서 무방향 BFS로 depth촌까지 (자기 자신 포함, 순환 안전).
// 포커스 모드(#47)용: 緣 방향은 혈연이 아니라 인연이므로 무시한다
export function neighborhood(edges: Edge[], id: string, depth = 1): Set<string> {
  let ring = new Set<string>([id]);
  const out = new Set<string>(ring);
  for (let d = 0; d < depth && ring.size; d++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (ring.has(e.a) && !out.has(e.b)) next.add(e.b);
      if (ring.has(e.b) && !out.has(e.a)) next.add(e.a);
    }
    for (const x of next) out.add(x);
    ring = next;
  }
  return out;
}

// 부모 緣 — 여럿이면 첫 가닥 (없으면 null)
export function parentEdgeOf(edges: Edge[], id: string): Edge | null {
  return edges.find((e) => e.b === id) ?? null;
}

// 자식 id 목록
export function childIdsOf(edges: Edge[], id: string): string[] {
  const out: string[] = [];
  for (const e of edges) if (e.a === id) out.push(e.b);
  return out;
}

// 자식 수 Map — 렌더에서 노드마다 edges를 다시 돌지 않게 한 번에
export function childCounts(edges: Edge[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of edges) m.set(e.a, (m.get(e.a) ?? 0) + 1);
  return m;
}

// 뿌리(들어오는 緣 없음) id 목록
export function rootIds(nodes: NoteNode[], edges: Edge[]): string[] {
  const incoming = new Set(edges.map((e) => e.b));
  return nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
}

// 오행진 종대 — 색별로 보이는(봉문 밖) 쪽지를 보드 순서(y→x)로.
// BoardView(진열)와 키보드 항법(#111, App)이 같은 진형을 공유한다 — 따로 세면 어긋난다
export function boardColumns(nodes: NoteNode[], edges: Edge[], colors: readonly Color[]): NoteNode[][] {
  const hidden = computeHidden(nodes, edges);
  return colors.map((c) =>
    nodes.filter((n) => n.color === c && !hidden.has(n.id)).sort((p, q) => p.y - q.y || p.x - q.x),
  );
}

// 족보(아웃라인) 행 — 비급.md(toMarkdown)와 같은 순회 율법의 화면판 (#42):
// 뿌리부터 DFS(자식은 緣 순서), 재방문(순환·다중 부모)은 revisit 표지 한 줄로 멈춤(↻),
// 접힌 쪽지는 행만 남기고 후손 생략(삼각형이 곧 collapsed — 뷰 불문 한 데이터).
// rootId를 주면 그 가지만(스코프) — 빈손이면 뿌리들 + 잔여(순환 덩어리)까지 전부
export interface OutlineRow {
  node: NoteNode;
  depth: number;
  revisit: boolean;
}
export function outlineRows(nodes: NoteNode[], edges: Edge[], rootId: string | null = null): OutlineRow[] {
  const byIdM = new Map(nodes.map((n) => [n.id, n]));
  const out: OutlineRow[] = [];
  const seen = new Set<string>();
  const kidsOf = (id: string) =>
    childIdsOf(edges, id)
      .map((k) => byIdM.get(k))
      .filter((m): m is NoteNode => !!m); // 緣 순서 보존 — toMarkdown과 동일
  const walk = (n: NoteNode, d: number): void => {
    if (seen.has(n.id)) {
      out.push({ node: n, depth: d, revisit: true });
      return;
    }
    seen.add(n.id);
    out.push({ node: n, depth: d, revisit: false });
    if (n.collapsed) return; // 봉문 존중 — 접힌 가지의 후손은 족보에서도 접힌다
    for (const k of kidsOf(n.id)) walk(k, d + 1);
  };
  const root = rootId ? byIdM.get(rootId) : undefined;
  if (root) {
    walk(root, 0);
  } else {
    const incoming = new Set(edges.map((e) => e.b));
    for (const r of nodes.filter((n) => !incoming.has(n.id))) walk(r, 0);
    // 뿌리 없는 순환 덩어리 잔여 — 단 봉문 그늘 속은 구제 금지(접힌 가지가 뿌리로 부활하는 사고)
    const hidden = computeHidden(nodes, edges);
    for (const n of nodes) if (!seen.has(n.id) && !hidden.has(n.id)) walk(n, 0);
  }
  return out;
}

// 정돈(Tidy) 레이아웃 — 첫 부모 기준 신장 트리, 보이는 쪽지만.
// 뿌리(rootId 지정 시 그 쪽지)는 제자리에 두고 후손을 오른쪽으로 펼친다.
// 형제 순서는 현재 y를 존중. 접힌 쪽지는 잎으로 치되 숨은 후손은 같은
// 이동량으로 동행(개문 시 난장판 방지). 순환 덩어리(서로가 첫 부모)는 불변.
// 반환: Map<id, {x, y}> — 움직일 쪽지만 담긴다
export function tidyLayout(
  nodes: NoteNode[],
  edges: Edge[],
  rootId: string | null = null,
  gapX = 90,
  gapY = 24,
): Map<string, { x: number; y: number }> {
  const byIdM = new Map(nodes.map((n) => [n.id, n]));
  const hidden = computeHidden(nodes, edges);
  // 신장 트리 — 각 보이는 쪽지는 '첫 부모'의 자식으로만 (여분 緣은 좌표만 따라옴)
  const kidsM = new Map<string, NoteNode[]>(nodes.map((n) => [n.id, []]));
  for (const n of nodes) {
    if (hidden.has(n.id)) continue;
    const pe = parentEdgeOf(edges, n.id);
    if (pe && byIdM.has(pe.a) && !hidden.has(pe.a)) kidsM.get(pe.a)!.push(n);
  }
  for (const n of nodes) if (n.collapsed) kidsM.set(n.id, []); // 접힌 쪽지는 잎
  for (const arr of kidsM.values()) arr.sort((p, q) => p.y - q.y);

  // 서브트리 밴드 높이 — 자기 높이와 자식 블록 높이 중 큰 쪽
  const H = new Map<string, number>();
  const calcH = (n: NoteNode): number => {
    if (H.has(n.id)) return H.get(n.id)!;
    H.set(n.id, nodeBox(n).h); // 재귀 전 선등록 — 순환 가드
    const kids = kidsM.get(n.id)!;
    let h = nodeBox(n).h;
    if (kids.length) {
      let block = -gapY;
      for (const k of kids) block += calcH(k) + gapY;
      h = Math.max(h, block);
    }
    H.set(n.id, h);
    return h;
  };
  const pos = new Map<string, { x: number; y: number }>();
  const place = (n: NoteNode, x: number, bandY: number): void => {
    if (pos.has(n.id)) return;
    const b = nodeBox(n);
    pos.set(n.id, { x, y: bandY + (calcH(n) - b.h) / 2 });
    const kids = kidsM.get(n.id)!;
    if (!kids.length) return;
    let block = -gapY;
    for (const k of kids) block += calcH(k) + gapY;
    let cy = bandY + (calcH(n) - block) / 2;
    for (const k of kids) {
      place(k, x + b.w + gapX, cy);
      cy += calcH(k) + gapY;
    }
  };
  const roots = rootId
    ? [byIdM.get(rootId)].filter((n): n is NoteNode => !!n && !hidden.has(n.id))
    : nodes.filter((n) => {
        if (hidden.has(n.id)) return false;
        const pe = parentEdgeOf(edges, n.id);
        return !pe || hidden.has(pe.a) || !byIdM.has(pe.a);
      });
  for (const r of roots) {
    place(r, r.x, r.y - (calcH(r) - nodeBox(r).h) / 2); // 뿌리는 제자리 고정
  }
  // 전체 정돈일 때 — 뿌리가 없는 순환 덩어리(서로가 첫 부모)와 거기 매달린
  // 가지들은 출발점이 없어 통째로 미배치로 남는다. 미배치 쪽지를 차례로
  // 닻 삼아 마저 전개 (pos.has 가드가 중복·순환을 막는다)
  if (!rootId) {
    for (const n of nodes) {
      if (hidden.has(n.id) || pos.has(n.id)) continue;
      place(n, n.x, n.y - (calcH(n) - nodeBox(n).h) / 2);
    }
  }
  // 접힌 쪽지의 숨은 후손 동행 — 같은 dx/dy로 이동
  for (const n of nodes) {
    if (!n.collapsed || !pos.has(n.id)) continue;
    const p = pos.get(n.id)!;
    const dx = p.x - n.x,
      dy = p.y - n.y;
    if (!dx && !dy) continue;
    const stack = childIdsOf(edges, n.id);
    const seen = new Set<string>([n.id]);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const d = byIdM.get(id);
      if (!d || !hidden.has(id) || pos.has(id)) continue;
      pos.set(id, { x: d.x + dx, y: d.y + dy });
      for (const cid of childIdsOf(edges, id)) stack.push(cid);
    }
  }
  return pos;
}
