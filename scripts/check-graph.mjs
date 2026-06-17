// ──────────────────────────────────────────────
// 봉문(접기) 규칙 검증 — `npm run check`의 일부.
// 하루에 세 번 규칙이 바뀐 사고 다발 지역이라 시나리오로 못 박는다.
// 규칙 본체는 src/lib/graph.ts의 computeHidden().
// ──────────────────────────────────────────────
import {
  computeHidden,
  tidyLayout,
  separateComponents,
  neighborhood,
  outlineRows,
} from '../src/lib/graph.ts';

let fail = 0;
const err = (m) => {
  console.error('✗ ' + m);
  fail++;
};
const N = (id, collapsed = false) => (collapsed ? { id, collapsed: true } : { id });
const E = (a, b) => ({ a, b });
const ids = (s) => [...s].sort().join(',');

// 1) 평범한 트리 — 접으면 후손 전부 숨고, 자신은 남는다
{
  const h = computeHidden([N('a', true), N('b'), N('c')], [E('a', 'b'), E('b', 'c')]);
  if (ids(h) !== 'b,c') err(`트리 접기: ${ids(h)} (기대 b,c)`);
}
// 2) 중첩 봉문 — 접힌 자식도 부모를 접으면 같이 숨는다
{
  const h = computeHidden([N('a', true), N('b', true), N('c')], [E('a', 'b'), E('b', 'c')]);
  if (ids(h) !== 'b,c') err(`중첩 봉문: ${ids(h)} (기대 b,c)`);
}
// 3) 순환 — 접은 쪽지가 순환을 타고 자기 자신을 숨기지 못한다 (잠금 방지)
{
  const h = computeHidden([N('a', true), N('b'), N('c')], [E('a', 'b'), E('b', 'c'), E('c', 'a')]);
  if (h.has('a')) err('순환 자기 잠금: 접은 쪽지가 숨었다');
}
// 4) Space 증발 시나리오 — 순환 속 두 봉문이 서로를 삼키지 못한다
{
  const edges = [E('s', 'm'), E('m', 'd'), E('d', 's'), E('d', 'z')];
  const h1 = computeHidden([N('s', true), N('m'), N('d', true), N('z')], edges);
  if (h1.has('s') || h1.has('d')) err(`순환 상호: 봉문 뿌리가 숨었다 (${ids(h1)})`);
  // s를 펼친 직후 — d의 봉문이 깨어나도 순환 동료 s는 못 삼킨다
  const h2 = computeHidden([N('s'), N('m'), N('d', true), N('z')], edges);
  if (h2.has('s')) err('Space 증발: 펼친 쪽지를 순환 동료가 삼켰다');
  if (!h2.has('z')) err('순수 후손 z는 숨어야 한다');
}
// 5) DAG 다이아몬드 — 한 갈래를 접으면 합류점은 숨는다 (조상이 아니므로)
{
  const h = computeHidden(
    [N('x'), N('a', true), N('b'), N('y')],
    [E('x', 'a'), E('x', 'b'), E('a', 'y'), E('b', 'y')],
  );
  if (!h.has('y')) err('다이아몬드: 합류점이 안 숨었다');
  if (h.has('x') || h.has('b')) err('다이아몬드: 무관한 쪽지가 숨었다');
}

// 6) 정돈(Tidy) 레이아웃 — 뿌리 제자리, 자식은 오른쪽(+부모폭+90),
//    형제는 현재 y 순서 유지, 부모는 자식 블록의 세로 중앙
{
  const nodes = [
    { id: 'r', x: 100, y: 100, w: 100, h: 40 },
    { id: 'a', x: 0, y: 0, w: 80, h: 40 },
    { id: 'b', x: 0, y: 999, w: 80, h: 40 },
  ];
  const pos = tidyLayout(nodes, [E('r', 'a'), E('r', 'b')]);
  const r = pos.get('r'),
    a = pos.get('a'),
    b = pos.get('b');
  if (!r || r.x !== 100 || r.y !== 100) err(`정돈: 뿌리가 제자리를 떠남 (${r?.x},${r?.y})`);
  if (a?.x !== 290) err(`정돈: 자식 x 기대 290, 실제 ${a?.x}`);
  if (!(a && b && a.y < b.y)) err('정돈: 형제 y 순서(현재 배치 존중) 깨짐');
  const mid = (a.y + b.y + 40) / 2;
  if (Math.abs(mid - (r.y + 20)) > 1) err('정돈: 부모가 자식 블록 세로 중앙이 아님');
}

// 7) 정돈 — 뿌리 없는 순환 덩어리도 전체 정돈에서 빠짐없이 배치된다
{
  const nodes = [
    { id: 'a', x: 0, y: 0, w: 80, h: 40 },
    { id: 'b', x: 10, y: 50, w: 80, h: 40 },
    { id: 'c', x: 20, y: 100, w: 80, h: 40 },
    { id: 'z', x: 500, y: 500, w: 80, h: 40 },
  ];
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a'), E('a', 'z')];
  const pos = tidyLayout(nodes, edges);
  for (const id of ['a', 'b', 'c', 'z']) if (!pos.has(id)) err(`정돈 순환 구제: '${id}' 미배치`);
  const a = pos.get('a'),
    z = pos.get('z');
  if (a && z && !(z.x > a.x)) err('정돈 순환 구제: 자식 z가 첫 부모 a의 오른쪽이 아님');
}

// 7.5) 정돈 겹침 제거 — 무관한 두 트리(연결 성분)가 겹치면 떼어놓는다 (#125)
{
  // r1·c1 트리와 r2·c2 트리: 뿌리가 거의 포개져((0,0)/(0,30)) 정돈하면 좌우 같은 폭이라 겹친다
  const nodes = [
    { id: 'r1', x: 0, y: 0, w: 80, h: 40 },
    { id: 'c1', x: 0, y: 0, w: 80, h: 40 },
    { id: 'r2', x: 0, y: 30, w: 80, h: 40 },
    { id: 'c2', x: 0, y: 30, w: 80, h: 40 },
  ];
  const edges = [E('r1', 'c1'), E('r2', 'c2')];
  const box = (pos, mem) => {
    let mnx = Infinity,
      mny = Infinity,
      mxx = -Infinity,
      mxy = -Infinity;
    for (const id of mem) {
      const p = pos.get(id),
        n = nodes.find((x) => x.id === id);
      mnx = Math.min(mnx, p.x);
      mny = Math.min(mny, p.y);
      mxx = Math.max(mxx, p.x + n.w);
      mxy = Math.max(mxy, p.y + n.h);
    }
    return { mnx, mny, mxx, mxy };
  };
  const hit = (A, B) => A.mnx < B.mxx && B.mnx < A.mxx && A.mny < B.mxy && B.mny < A.mxy;
  // 거짓 통과 방지 — tidy만으로는 두 트리가 실제로 겹쳐 있어야 이 시나리오가 유의미하다
  // (안 겹치면 패스가 무동작이어도 통과해버린다. 이른바 negative control)
  const raw = tidyLayout(nodes, edges);
  if (!hit(box(raw, ['r1', 'c1']), box(raw, ['r2', 'c2'])))
    err('정돈 겹침제거: 사전 조건 — tidy만으로는 두 트리가 겹쳐 있어야 한다');
  // 겹침 제거 후 — 교집합 0
  const sep = separateComponents(nodes, edges, tidyLayout(nodes, edges));
  if (hit(box(sep, ['r1', 'c1']), box(sep, ['r2', 'c2']))) err('정돈 겹침제거: 패스 뒤에도 두 트리가 겹친다');
}

// 8) 이웃(포커스) — 무방향 1촌/2촌: 부모·자식·또 다른 부모 가리지 않는다
{
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd'), E('x', 'b')];
  const n1 = neighborhood(edges, 'b', 1);
  if (ids(n1) !== 'a,b,c,x') err(`이웃 1촌: ${ids(n1)} (기대 a,b,c,x)`);
  const n2 = neighborhood(edges, 'b', 2);
  if (ids(n2) !== 'a,b,c,d,x') err(`이웃 2촌: ${ids(n2)} (기대 a,b,c,d,x)`);
}
// 9) 이웃 — 순환 안전(무한 반경도 멈춘다), 0촌은 자기 자신만
{
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a')];
  if (ids(neighborhood(edges, 'a', 9)) !== 'a,b,c') err('이웃 순환: 한 바퀴에서 멈춰야');
  if (ids(neighborhood(edges, 'a', 0)) !== 'a') err('이웃 0촌: 자기 자신만이어야');
}

// ── 족보(아웃라인) 행 시나리오 (#42 — toMarkdown과 같은 순회 율법) ──
// A) 사슬 트리 — 행 4개, 깊이 0/1/2/3, 재방문 없음
{
  const ns = [N('a'), N('b'), N('c'), N('d')];
  const rows = outlineRows(ns, [E('a', 'b'), E('b', 'c'), E('c', 'd')]);
  const sig = rows.map((r) => r.node.id + r.depth + (r.revisit ? '↻' : '')).join(' ');
  if (sig !== 'a0 b1 c2 d3') err(`족보 사슬: ${sig} (기대 a0 b1 c2 d3)`);
}
// B) 순환 a→b→c→a — 첫 방문은 본문, 재방문은 ↻ 한 줄로 멈춤
{
  const rows = outlineRows([N('a'), N('b'), N('c')], [E('a', 'b'), E('b', 'c'), E('c', 'a')]);
  const sig = rows.map((r) => r.node.id + r.depth + (r.revisit ? '↻' : '')).join(' ');
  if (sig !== 'a0 b1 c2 a3↻') err(`족보 순환: ${sig} (기대 a0 b1 c2 a3↻)`);
}
// C) 다중 부모 — 두 번째 길에서는 ↻
{
  const rows = outlineRows([N('a'), N('b'), N('c')], [E('a', 'b'), E('a', 'c'), E('b', 'c')]);
  const sig = rows.map((r) => r.node.id + r.depth + (r.revisit ? '↻' : '')).join(' ');
  if (sig !== 'a0 b1 c2 c1↻') err(`족보 다중 부모: ${sig} (기대 a0 b1 c2 c1↻)`);
}
// D) 봉문 — 접힌 가지는 행만 남고 후손 생략 (삼각형이 곧 collapsed)
{
  const rows = outlineRows([N('a'), N('b', true), N('c')], [E('a', 'b'), E('b', 'c')]);
  const sig = rows.map((r) => r.node.id + r.depth).join(' ');
  if (sig !== 'a0 b1') err(`족보 봉문: ${sig} (기대 a0 b1)`);
}
// E) 스코프 — rootId를 주면 그 가지만
{
  const ns = [N('a'), N('b'), N('c')];
  const rows = outlineRows(ns, [E('a', 'b'), E('b', 'c')], 'b');
  const sig = rows.map((r) => r.node.id + r.depth).join(' ');
  if (sig !== 'b0 c1') err(`족보 스코프: ${sig} (기대 b0 c1)`);
}

if (fail) {
  console.error(`봉문 검사 실패 — ${fail}건`);
  process.exit(1);
}
console.log('봉문 검사 통과 — 시나리오 15종 (접기 5 + 정돈 3 + 이웃 2 + 족보 5)');
