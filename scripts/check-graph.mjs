// ──────────────────────────────────────────────
// 봉문(접기) 규칙 검증 — `npm run check`의 일부.
// 하루에 세 번 규칙이 바뀐 사고 다발 지역이라 시나리오로 못 박는다.
// 규칙 본체는 src/lib/graph.js의 computeHidden().
// ──────────────────────────────────────────────
import { computeHidden, tidyLayout, neighborhood } from '../src/lib/graph.js'

let fail = 0
const err = (m) => { console.error('✗ ' + m); fail++ }
const N = (id, collapsed = false) => (collapsed ? { id, collapsed: true } : { id })
const E = (a, b) => ({ a, b })
const ids = (s) => [...s].sort().join(',')

// 1) 평범한 트리 — 접으면 후손 전부 숨고, 자신은 남는다
{
  const h = computeHidden([N('a', true), N('b'), N('c')], [E('a', 'b'), E('b', 'c')])
  if (ids(h) !== 'b,c') err(`트리 접기: ${ids(h)} (기대 b,c)`)
}
// 2) 중첩 봉문 — 접힌 자식도 부모를 접으면 같이 숨는다
{
  const h = computeHidden([N('a', true), N('b', true), N('c')], [E('a', 'b'), E('b', 'c')])
  if (ids(h) !== 'b,c') err(`중첩 봉문: ${ids(h)} (기대 b,c)`)
}
// 3) 순환 — 접은 쪽지가 순환을 타고 자기 자신을 숨기지 못한다 (잠금 방지)
{
  const h = computeHidden([N('a', true), N('b'), N('c')], [E('a', 'b'), E('b', 'c'), E('c', 'a')])
  if (h.has('a')) err('순환 자기 잠금: 접은 쪽지가 숨었다')
}
// 4) Space 증발 시나리오 — 순환 속 두 봉문이 서로를 삼키지 못한다
{
  const edges = [E('s', 'm'), E('m', 'd'), E('d', 's'), E('d', 'z')]
  const h1 = computeHidden([N('s', true), N('m'), N('d', true), N('z')], edges)
  if (h1.has('s') || h1.has('d')) err(`순환 상호: 봉문 뿌리가 숨었다 (${ids(h1)})`)
  // s를 펼친 직후 — d의 봉문이 깨어나도 순환 동료 s는 못 삼킨다
  const h2 = computeHidden([N('s'), N('m'), N('d', true), N('z')], edges)
  if (h2.has('s')) err('Space 증발: 펼친 쪽지를 순환 동료가 삼켰다')
  if (!h2.has('z')) err('순수 후손 z는 숨어야 한다')
}
// 5) DAG 다이아몬드 — 한 갈래를 접으면 합류점은 숨는다 (조상이 아니므로)
{
  const h = computeHidden(
    [N('x'), N('a', true), N('b'), N('y')],
    [E('x', 'a'), E('x', 'b'), E('a', 'y'), E('b', 'y')]
  )
  if (!h.has('y')) err('다이아몬드: 합류점이 안 숨었다')
  if (h.has('x') || h.has('b')) err('다이아몬드: 무관한 쪽지가 숨었다')
}

// 6) 정돈(Tidy) 레이아웃 — 뿌리 제자리, 자식은 오른쪽(+부모폭+90),
//    형제는 현재 y 순서 유지, 부모는 자식 블록의 세로 중앙
{
  const nodes = [
    { id: 'r', x: 100, y: 100, w: 100, h: 40 },
    { id: 'a', x: 0, y: 0, w: 80, h: 40 },
    { id: 'b', x: 0, y: 999, w: 80, h: 40 },
  ]
  const pos = tidyLayout(nodes, [E('r', 'a'), E('r', 'b')])
  const r = pos.get('r'), a = pos.get('a'), b = pos.get('b')
  if (!r || r.x !== 100 || r.y !== 100) err(`정돈: 뿌리가 제자리를 떠남 (${r?.x},${r?.y})`)
  if (a?.x !== 290) err(`정돈: 자식 x 기대 290, 실제 ${a?.x}`)
  if (!(a && b && a.y < b.y)) err('정돈: 형제 y 순서(현재 배치 존중) 깨짐')
  const mid = (a.y + b.y + 40) / 2
  if (Math.abs(mid - (r.y + 20)) > 1) err('정돈: 부모가 자식 블록 세로 중앙이 아님')
}

// 7) 정돈 — 뿌리 없는 순환 덩어리도 전체 정돈에서 빠짐없이 배치된다
{
  const nodes = [
    { id: 'a', x: 0, y: 0, w: 80, h: 40 },
    { id: 'b', x: 10, y: 50, w: 80, h: 40 },
    { id: 'c', x: 20, y: 100, w: 80, h: 40 },
    { id: 'z', x: 500, y: 500, w: 80, h: 40 },
  ]
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a'), E('a', 'z')]
  const pos = tidyLayout(nodes, edges)
  for (const id of ['a', 'b', 'c', 'z'])
    if (!pos.has(id)) err(`정돈 순환 구제: '${id}' 미배치`)
  const a = pos.get('a'), z = pos.get('z')
  if (a && z && !(z.x > a.x)) err('정돈 순환 구제: 자식 z가 첫 부모 a의 오른쪽이 아님')
}

// 8) 이웃(포커스) — 무방향 1촌/2촌: 부모·자식·또 다른 부모 가리지 않는다
{
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd'), E('x', 'b')]
  const n1 = neighborhood(edges, 'b', 1)
  if (ids(n1) !== 'a,b,c,x') err(`이웃 1촌: ${ids(n1)} (기대 a,b,c,x)`)
  const n2 = neighborhood(edges, 'b', 2)
  if (ids(n2) !== 'a,b,c,d,x') err(`이웃 2촌: ${ids(n2)} (기대 a,b,c,d,x)`)
}
// 9) 이웃 — 순환 안전(무한 반경도 멈춘다), 0촌은 자기 자신만
{
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a')]
  if (ids(neighborhood(edges, 'a', 9)) !== 'a,b,c') err('이웃 순환: 한 바퀴에서 멈춰야')
  if (ids(neighborhood(edges, 'a', 0)) !== 'a') err('이웃 0촌: 자기 자신만이어야')
}

if (fail) {
  console.error(`봉문 검사 실패 — ${fail}건`)
  process.exit(1)
}
console.log('봉문 검사 통과 — 시나리오 9종 (접기 5 + 정돈 2 + 이웃 2)')
