// ──────────────────────────────────────────────
// 도메인 타입 (#115) — 念(쪽지)·緣(연결)의 형상.
// 영속 포맷(v3)의 화이트리스트(DESIGN.md 2장)와 한 몸: id,x,y,text,color,bw?,collapsed?
// 가 저장 필드, w/h는 실측(세션 전용)이라 선택 필드 — snapshot()이 걸러낸다.
// ──────────────────────────────────────────────

export type Color = 'muk' | 'cheong' | 'dan' | 'hwang' | 'nam';

export interface NoteNode {
  id: string;
  x: number;
  y: number;
  text: string;
  color: Color;
  w?: number; // 실측 너비 (bind:offsetWidth — 테두리 포함, 영속 안 됨)
  h?: number; // 실측 높이
  bw?: number; // 사용자 지정 너비 (v2 — 선택 영속 필드)
  collapsed?: boolean; // 봉문 (v3 — 선택 영속 필드)
}

export interface Edge {
  id: string;
  a: string; // 부모
  b: string; // 자식
}

// 기하 계산이 요구하는 최소 형상 — geometry.ts는 스토어 무관이라 이걸로 받는다
export interface NodeLike {
  x: number;
  y: number;
  w?: number;
  h?: number;
}
