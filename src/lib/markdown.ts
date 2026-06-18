// ──────────────────────────────────────────────
// 비급.md 역해석 — 들여쓰기 불릿 개요를 그래프(念/緣)로 환생 (#5).
// App.svelte toMarkdown()의 역함수. 순수 함수 — DOM·스토어 무관.
// 스토어를 import하면 runes 탓에 Vitest(node 환경)가 못 읽는다 —
// 그래서 id 생성기를 자체로 갖는다 (store.uid와 같은 꼴).
// 한계(이슈 #5 명시): ↻(순환 재방문 표시) 줄은 건너뛰고 다중 부모는
// 불릿 트리로 표현 불가 — 트리만 지원, 무손실 라운드트립은 목표 아님.
// ──────────────────────────────────────────────
import type { Edge } from './types.ts';

// 색 없는 갓난 쪽지 — loadData()가 기본 색을 입힌다
interface MdNode {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface MdDoc {
  app: 'noenae-gangho';
  v: 3;
  nodes: MdNode[];
  edges: Edge[];
}

const uid = (): string => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// 배치 격자 — 행은 불릿 줄 순서 그대로(원문 개요와 1:1), 열은 깊이.
// 칸은 실측 전 폴백 박스(180×48, geometry.nodeBox)+정돈 간격(90/24)에 맞춤.
// 자동 너비 상한(230)이 열 간격(270)보다 좁아 겹칠 일 없다
const COL_W = 270;
const ROW_H = 72;

// text → loadData()에 바로 먹일 { app, v, nodes, edges } | 불릿이 한 줄도 없으면 null
// emptyTexts: 각 톤 팩의 mdEmptyNode 라벨 — '(빈 쪽지)' 따위는 빈 글로 환원
export function fromMarkdown(text: string, emptyTexts: string[] = []): MdDoc | null {
  const nodes: MdNode[] = [];
  const edges: Edge[] = [];
  const stack: MdNode[] = []; // stack[d] = 깊이 d에서 마지막으로 태어난 쪽지 — 조상 경로
  let unit: number | null = null; // 들여쓰기 한 단의 칸수 — 첫 들여쓴 줄이 정한다 (우리 출력은 2, 손글씨 4·탭도 수용)
  let row = 0;
  for (const line of String(text).split('\n')) {
    const m = line.match(/^([ \t]*)[-*+]\s+(.*)$/);
    if (!m) continue; // 제목(#…)·빈 줄·잡문은 조용히 통과
    let body = m[2].trim();
    if (body.endsWith('↻')) continue; // 순환 재방문 표시 — 이미 위에서 태어난 쪽지
    if (emptyTexts.includes(body)) body = '';
    const indent = m[1].replace(/\t/g, '  ').length;
    if (indent > 0 && unit == null) unit = indent;
    // 깊이는 조상 경로보다 깊이 점프할 수 없다 — 이상 들여쓰기도 緣 양끝은 늘 실존
    const depth = Math.min(unit ? Math.round(indent / unit) : 0, stack.length);
    const node: MdNode = { id: uid(), x: depth * COL_W, y: row * ROW_H, text: body };
    if (depth > 0) edges.push({ id: uid(), a: stack[depth - 1].id, b: node.id }); // a=부모 b=자식
    stack[depth] = node;
    stack.length = depth + 1;
    nodes.push(node);
    row++;
  }
  return nodes.length ? { app: 'noenae-gangho', v: 3, nodes, edges } : null;
}
