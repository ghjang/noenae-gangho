// ──────────────────────────────────────────────
// 비급 역해석 검사 — fromMarkdown 시나리오 (npm run check)
// 봉문 검사(check-graph)처럼 순수층(lib/markdown.ts)만 맨 node로 굴린다
// ──────────────────────────────────────────────
import { fromMarkdown } from '../src/lib/markdown.ts';

let fail = 0;
const err = (m) => {
  console.error('✗ ' + m);
  fail++;
};
const ok = (cond, m) => {
  if (!cond) err(m);
};

// 글로 쪽지를 찾아 부모 쪽지의 글을 돌려준다 (a=부모 b=자식 검증용)
const parentTextOf = (d, text) => {
  const n = d.nodes.find((x) => x.text === text);
  const e = d.edges.find((x) => x.b === n?.id);
  return e ? (d.nodes.find((x) => x.id === e.a)?.text ?? null) : null;
};

// 1) 기본 트리 — toMarkdown 출력 꼴 (제목·빈 줄 통과, 2칸 들여쓰기, 숲)
{
  const d = fromMarkdown(
    ['# 비급', '', '- 뿌리', '  - 자식 갑', '    - 손주', '  - 자식 을', '- 둘째 뿌리'].join('\n'),
  );
  ok(d?.nodes.length === 5, `기본: 쪽지 5 기대, 실제 ${d?.nodes.length}`);
  ok(d?.edges.length === 3, `기본: 緣 3 기대, 실제 ${d?.edges.length}`);
  ok(parentTextOf(d, '손주') === '자식 갑', '기본: 손주의 부모는 자식 갑이어야');
  ok(parentTextOf(d, '자식 을') === '뿌리', '기본: 자식 을의 부모는 뿌리여야');
  ok(parentTextOf(d, '둘째 뿌리') === null, '기본: 둘째 뿌리는 부모가 없어야');
  ok(d?.app === 'noenae-gangho' && d?.v === 3, '기본: loadData가 먹는 포맷(app/v)이어야');
}

// 2) 들여쓰기 변형 — 4칸·탭·별표 불릿도 같은 구조
{
  const four = fromMarkdown('- a\n    - b\n        - c');
  ok(four?.edges.length === 2 && parentTextOf(four, 'c') === 'b', '4칸 들여쓰기: a>b>c');
  const tab = fromMarkdown('- a\n\t- b\n\t\t- c');
  ok(tab?.edges.length === 2 && parentTextOf(tab, 'c') === 'b', '탭 들여쓰기: a>b>c');
  const star = fromMarkdown('* a\n  * b');
  ok(star?.edges.length === 1, '별표 불릿도 수용해야');
}

// 3) ↻(순환 재방문 표시) 줄은 건너뛴다 — 같은 쪽지가 다시 태어나면 안 됨
{
  const d = fromMarkdown('- 갑\n  - 을\n    - 갑 ↻');
  ok(
    d?.nodes.length === 2 && d?.edges.length === 1,
    `순환 표시: 쪽지 2·緣 1 기대, 실제 ${d?.nodes.length}·${d?.edges.length}`,
  );
}

// 4) 빈 쪽지 라벨 환원 — 두 팩의 mdEmptyNode 모두 빈 글로
{
  const d = fromMarkdown('- (빈 쪽지)\n- (빈 노트)', ['(빈 쪽지)', '(빈 노트)']);
  ok(
    d?.nodes.every((n) => n.text === ''),
    '빈 쪽지 라벨은 빈 글로 돌아와야',
  );
}

// 5) 불릿이 한 줄도 없으면 null — App이 importBadShape로 알린다
{
  ok(fromMarkdown('그냥 산문 한 줄') === null, '불릿 없음: null이어야');
  ok(fromMarkdown('') === null, '빈 입력: null이어야');
}

// 6) 이상 들여쓰기(깊이 점프) — 무너지지 않고 緣 양끝이 늘 실존
{
  const d = fromMarkdown('- a\n        - b\n  - c');
  const ids = new Set(d.nodes.map((n) => n.id));
  ok(
    d.edges.every((e) => ids.has(e.a) && ids.has(e.b)),
    '깊이 점프: 緣 양끝 실존해야',
  );
  ok(d.nodes.length === 3, `깊이 점프: 쪽지 3 기대, 실제 ${d.nodes.length}`);
}

// 7) 격자 배치 — 행은 줄 순서, 열은 깊이 (원문 개요와 1:1)
{
  const d = fromMarkdown('- a\n  - b\n- c');
  const [a, b, c] = d.nodes;
  ok(a.x === 0 && b.x > 0 && c.x === 0, '격자: 열=깊이여야');
  ok(a.y < b.y && b.y < c.y, '격자: 행=줄 순서여야');
}

if (fail) {
  console.error(`비급 역해석 검사 실패 — ${fail}건`);
  process.exit(1);
}
console.log('비급 역해석 검사 통과 — 시나리오 7종');
