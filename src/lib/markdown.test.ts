// 비급 역해석 — 순수층(markdown.ts) 단위 테스트 (#166).
// 자작 scripts/check-markdown.mjs(7시나리오)의 충실 이주 — 입력·기대값 그대로.
import { describe, it, expect } from 'vitest';
import { fromMarkdown } from './markdown.ts';

type MdData = NonNullable<ReturnType<typeof fromMarkdown>>;

// 글로 쪽지를 찾아 부모 쪽지의 글을 돌려준다 (a=부모 b=자식 검증용)
const parentTextOf = (d: MdData, text: string): string | null => {
  const n = d.nodes.find((x) => x.text === text);
  const e = d.edges.find((x) => x.b === n?.id);
  return e ? (d.nodes.find((x) => x.id === e.a)?.text ?? null) : null;
};

describe('비급 역해석(fromMarkdown) — 7시나리오', () => {
  it('1) 기본 트리 — toMarkdown 출력 꼴(제목·빈 줄 통과, 2칸 들여쓰기, 숲)', () => {
    const d = fromMarkdown(
      ['# 비급', '', '- 뿌리', '  - 자식 갑', '    - 손주', '  - 자식 을', '- 둘째 뿌리'].join('\n'),
    );
    expect(d).not.toBeNull();
    expect(d!.nodes.length).toBe(5);
    expect(d!.edges.length).toBe(3);
    expect(parentTextOf(d!, '손주')).toBe('자식 갑');
    expect(parentTextOf(d!, '자식 을')).toBe('뿌리');
    expect(parentTextOf(d!, '둘째 뿌리')).toBeNull();
    expect(d!.app).toBe('noenae-gangho');
    expect(d!.v).toBe(3);
  });

  it('2) 들여쓰기 변형 — 4칸·탭·별표 불릿도 같은 구조', () => {
    const four = fromMarkdown('- a\n    - b\n        - c');
    expect(four).not.toBeNull();
    expect(four!.edges.length).toBe(2);
    expect(parentTextOf(four!, 'c')).toBe('b');
    const tab = fromMarkdown('- a\n\t- b\n\t\t- c');
    expect(tab).not.toBeNull();
    expect(tab!.edges.length).toBe(2);
    expect(parentTextOf(tab!, 'c')).toBe('b');
    const star = fromMarkdown('* a\n  * b');
    expect(star).not.toBeNull();
    expect(star!.edges.length).toBe(1);
  });

  it('3) ↻(순환 재방문 표시) 줄은 건너뛴다 — 같은 쪽지가 다시 태어나면 안 됨', () => {
    const d = fromMarkdown('- 갑\n  - 을\n    - 갑 ↻');
    expect(d).not.toBeNull();
    expect(d!.nodes.length).toBe(2);
    expect(d!.edges.length).toBe(1);
  });

  it('4) 빈 쪽지 라벨 환원 — 두 팩의 mdEmptyNode 모두 빈 글로', () => {
    const d = fromMarkdown('- (빈 쪽지)\n- (빈 노트)', ['(빈 쪽지)', '(빈 노트)']);
    expect(d).not.toBeNull();
    expect(d!.nodes.every((n) => n.text === '')).toBe(true);
  });

  it('5) 불릿이 한 줄도 없으면 null — App이 importBadShape로 알린다', () => {
    expect(fromMarkdown('그냥 산문 한 줄')).toBeNull();
    expect(fromMarkdown('')).toBeNull();
  });

  it('6) 이상 들여쓰기(깊이 점프) — 무너지지 않고 緣 양끝이 늘 실존', () => {
    const d = fromMarkdown('- a\n        - b\n  - c');
    expect(d).not.toBeNull();
    const idset = new Set(d!.nodes.map((n) => n.id));
    expect(d!.edges.every((e) => idset.has(e.a) && idset.has(e.b))).toBe(true);
    expect(d!.nodes.length).toBe(3);
  });

  it('7) 격자 배치 — 행은 줄 순서, 열은 깊이(원문 개요와 1:1)', () => {
    const d = fromMarkdown('- a\n  - b\n- c');
    expect(d).not.toBeNull();
    const [a, b, c] = d!.nodes;
    expect(a.x).toBe(0);
    expect(b.x).toBeGreaterThan(0);
    expect(c.x).toBe(0); // 열=깊이
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y); // 행=줄 순서
  });
});
