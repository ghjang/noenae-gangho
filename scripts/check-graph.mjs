// ──────────────────────────────────────────────
// 봉문(접기) 규칙 검증 — `npm run check`의 일부.
// 하루에 세 번 규칙이 바뀐 사고 다발 지역이라 시나리오로 못 박는다.
// 규칙 본체는 src/lib/graph.js의 computeHidden().
// ──────────────────────────────────────────────
import { computeHidden } from '../src/lib/graph.js'

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

if (fail) {
  console.error(`봉문 검사 실패 — ${fail}건`)
  process.exit(1)
}
console.log('봉문 검사 통과 — 시나리오 5종')
