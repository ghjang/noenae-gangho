// 봉문/정돈/이웃/족보 규칙 — 순수층(graph.ts) 단위 테스트 (#166).
// 자작 scripts/check-graph.mjs(15시나리오)의 충실 이주: 시나리오·입력·기대값 그대로,
// 타입 보강(NoteNode/Edge 필수 필드)만 팩토리가 채운다(접기·위상 로직엔 무영향).
// 규칙을 바꾸면 여기 시나리오도 같이 — "시나리오 검사가 곧 명세"(DESIGN 12장).
import { describe, it, expect } from 'vitest';
import { computeHidden, tidyLayout, separateComponents, neighborhood, outlineRows } from './graph.ts';
import type { NoteNode, Edge } from './types.ts';

const N = (id: string, collapsed = false): NoteNode =>
  collapsed
    ? { id, x: 0, y: 0, text: '', color: 'muk', collapsed: true }
    : { id, x: 0, y: 0, text: '', color: 'muk' };
const E = (a: string, b: string): Edge => ({ id: `${a}>${b}`, a, b });
// 정돈 시나리오용 — x/y/w/h를 명시하는 노드
const P = (id: string, x: number, y: number, w: number, h: number): NoteNode => ({
  id,
  x,
  y,
  w,
  h,
  text: '',
  color: 'muk',
});
const ids = (s: Set<string>) => [...s].sort().join(',');
const sig = (rows: ReturnType<typeof outlineRows>) =>
  rows.map((r) => r.node.id + r.depth + (r.revisit ? '↻' : '')).join(' ');

describe('봉문(computeHidden) — 접기 5', () => {
  it('1) 평범한 트리 — 접으면 후손 전부 숨고 자신은 남는다', () => {
    const h = computeHidden([N('a', true), N('b'), N('c')], [E('a', 'b'), E('b', 'c')]);
    expect(ids(h)).toBe('b,c');
  });
  it('2) 중첩 봉문 — 접힌 자식도 부모를 접으면 같이 숨는다', () => {
    const h = computeHidden([N('a', true), N('b', true), N('c')], [E('a', 'b'), E('b', 'c')]);
    expect(ids(h)).toBe('b,c');
  });
  it('3) 순환 — 접은 쪽지가 순환을 타고 자기를 숨기지 못한다(잠금 방지)', () => {
    const h = computeHidden([N('a', true), N('b'), N('c')], [E('a', 'b'), E('b', 'c'), E('c', 'a')]);
    expect(h.has('a')).toBe(false);
  });
  it('4) Space 증발 — 순환 속 두 봉문이 서로를 삼키지 못한다', () => {
    const edges = [E('s', 'm'), E('m', 'd'), E('d', 's'), E('d', 'z')];
    const h1 = computeHidden([N('s', true), N('m'), N('d', true), N('z')], edges);
    expect(h1.has('s')).toBe(false);
    expect(h1.has('d')).toBe(false);
    // s를 펼친 직후 — d의 봉문이 깨어나도 순환 동료 s는 못 삼킨다
    const h2 = computeHidden([N('s'), N('m'), N('d', true), N('z')], edges);
    expect(h2.has('s')).toBe(false);
    expect(h2.has('z')).toBe(true); // 순수 후손 z는 숨어야 한다
  });
  it('5) DAG 다이아몬드 — 한 갈래를 접으면 합류점은 숨는다(조상 아님)', () => {
    const h = computeHidden(
      [N('x'), N('a', true), N('b'), N('y')],
      [E('x', 'a'), E('x', 'b'), E('a', 'y'), E('b', 'y')],
    );
    expect(h.has('y')).toBe(true);
    expect(h.has('x')).toBe(false);
    expect(h.has('b')).toBe(false);
  });
});

describe('정돈(tidyLayout/separateComponents) — 정돈 3', () => {
  it('6) 뿌리 제자리·자식 오른쪽(+부모폭+90)·형제 y순·부모 세로중앙', () => {
    const nodes = [P('r', 100, 100, 100, 40), P('a', 0, 0, 80, 40), P('b', 0, 999, 80, 40)];
    const pos = tidyLayout(nodes, [E('r', 'a'), E('r', 'b')]);
    const r = pos.get('r')!,
      a = pos.get('a')!,
      b = pos.get('b')!;
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    expect(a.x).toBe(290);
    expect(a.y).toBeLessThan(b.y); // 형제 y 순서(현재 배치 존중)
    const mid = (a.y + b.y + 40) / 2;
    expect(Math.abs(mid - (r.y + 20))).toBeLessThanOrEqual(1); // 부모가 자식 블록 세로 중앙
  });
  it('7) 뿌리 없는 순환 덩어리도 빠짐없이 배치', () => {
    const nodes = [
      P('a', 0, 0, 80, 40),
      P('b', 10, 50, 80, 40),
      P('c', 20, 100, 80, 40),
      P('z', 500, 500, 80, 40),
    ];
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a'), E('a', 'z')];
    const pos = tidyLayout(nodes, edges);
    for (const id of ['a', 'b', 'c', 'z']) expect(pos.has(id), `'${id}' 미배치`).toBe(true);
    const a = pos.get('a')!,
      z = pos.get('z')!;
    expect(z.x).toBeGreaterThan(a.x); // 자식 z가 첫 부모 a의 오른쪽
  });
  it('7.5) 겹침 제거 — 무관한 두 트리가 겹치면 떼어놓는다(#125, negative control 포함)', () => {
    const nodes = [
      P('r1', 0, 0, 80, 40),
      P('c1', 0, 0, 80, 40),
      P('r2', 0, 30, 80, 40),
      P('c2', 0, 30, 80, 40),
    ];
    const edges = [E('r1', 'c1'), E('r2', 'c2')];
    type Box = { mnx: number; mny: number; mxx: number; mxy: number };
    const box = (pos: Map<string, { x: number; y: number }>, mem: string[]): Box => {
      let mnx = Infinity,
        mny = Infinity,
        mxx = -Infinity,
        mxy = -Infinity;
      for (const id of mem) {
        const p = pos.get(id)!,
          n = nodes.find((x) => x.id === id)!;
        mnx = Math.min(mnx, p.x);
        mny = Math.min(mny, p.y);
        mxx = Math.max(mxx, p.x + (n.w ?? 0));
        mxy = Math.max(mxy, p.y + (n.h ?? 0));
      }
      return { mnx, mny, mxx, mxy };
    };
    const hit = (A: Box, B: Box) => A.mnx < B.mxx && B.mnx < A.mxx && A.mny < B.mxy && B.mny < A.mxy;
    // negative control — tidy만으로는 두 트리가 실제로 겹쳐 있어야 이 시나리오가 유의미
    const raw = tidyLayout(nodes, edges);
    expect(hit(box(raw, ['r1', 'c1']), box(raw, ['r2', 'c2'])), '사전조건: tidy만으론 겹쳐 있어야').toBe(
      true,
    );
    // 겹침 제거 후 — 교집합 0
    const sep = separateComponents(nodes, edges, tidyLayout(nodes, edges));
    expect(hit(box(sep, ['r1', 'c1']), box(sep, ['r2', 'c2'])), '패스 뒤에도 겹친다').toBe(false);
  });
});

describe('이웃(neighborhood) — 이웃 2', () => {
  it('8) 무방향 1촌·2촌', () => {
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd'), E('x', 'b')];
    expect(ids(neighborhood(edges, 'b', 1))).toBe('a,b,c,x');
    expect(ids(neighborhood(edges, 'b', 2))).toBe('a,b,c,d,x');
  });
  it('9) 순환 안전(무한 반경도 멈춤)·0촌은 자기만', () => {
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'a')];
    expect(ids(neighborhood(edges, 'a', 9))).toBe('a,b,c');
    expect(ids(neighborhood(edges, 'a', 0))).toBe('a');
  });
});

describe('족보(outlineRows) — toMarkdown과 같은 순회 율법, 족보 5', () => {
  it('A) 사슬 트리 — 깊이 0/1/2/3, 재방문 없음', () => {
    const rows = outlineRows([N('a'), N('b'), N('c'), N('d')], [E('a', 'b'), E('b', 'c'), E('c', 'd')]);
    expect(sig(rows)).toBe('a0 b1 c2 d3');
  });
  it('B) 순환 a→b→c→a — 재방문은 ↻ 한 줄로 멈춤', () => {
    const rows = outlineRows([N('a'), N('b'), N('c')], [E('a', 'b'), E('b', 'c'), E('c', 'a')]);
    expect(sig(rows)).toBe('a0 b1 c2 a3↻');
  });
  it('C) 다중 부모 — 두 번째 길은 ↻', () => {
    const rows = outlineRows([N('a'), N('b'), N('c')], [E('a', 'b'), E('a', 'c'), E('b', 'c')]);
    expect(sig(rows)).toBe('a0 b1 c2 c1↻');
  });
  it('D) 봉문 — 접힌 가지는 행만 남고 후손 생략', () => {
    const rows = outlineRows([N('a'), N('b', true), N('c')], [E('a', 'b'), E('b', 'c')]);
    expect(rows.map((r) => r.node.id + r.depth).join(' ')).toBe('a0 b1');
  });
  it('E) 스코프 — rootId를 주면 그 가지만', () => {
    const rows = outlineRows([N('a'), N('b'), N('c')], [E('a', 'b'), E('b', 'c')], 'b');
    expect(rows.map((r) => r.node.id + r.depth).join(' ')).toBe('b0 c1');
  });
});
