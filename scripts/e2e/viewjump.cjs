// 뷰 전환 점프 (#178) — 비캔버스(족보/오행진)에서 선택한 채 캔버스로 가면 그 念을 화면
// 중앙으로(팬만, 줌 유지). 선택이 없으면 센터링 없음(저장 뷰포트 복원 그대로).
// 멀리 떨어진 노드를 시드해 센터링을 좌표로 관찰. (빌드 게이트 아님 · 수동 실행)
const { chromium } = require('playwright');
const fail = (m) => {
  console.error('✗ ' + m);
  process.exitCode = 1;
};
const ok = (c, m) => (c ? console.log('✓ ' + m) : fail(m));

(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const nodes = [
      { id: 'A', x: 0, y: 0, text: '가까운 부모', color: 'muk' },
      { id: 'B', x: 2200, y: 1600, text: '멀리 떨어진 자식', color: 'dan' },
    ];
    // 레거시 단일 키 — 첫 실행 이주가 '강호 1'로 편입 (CLAUDE.md 시드 요령)
    localStorage.setItem(
      'noenae-gangho-v1',
      JSON.stringify({ app: 'noenae-gangho', v: 3, nodes, edges: [{ id: 'e1', a: 'A', b: 'B' }] }),
    );
  });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const worldT = () => p.locator('.world').evaluate((el) => el.style.transform);
  const offCenter = async (text) =>
    p.evaluate((t) => {
      const vp = document.querySelector('.viewport').getBoundingClientRect();
      const el = [...document.querySelectorAll('.node')].find((n) => n.textContent.includes(t));
      const r = el.getBoundingClientRect();
      return {
        dx: Math.abs(r.left + r.width / 2 - (vp.left + vp.width / 2)),
        dy: Math.abs(r.top + r.height / 2 - (vp.top + vp.height / 2)),
      };
    }, text);

  // 1) 족보에서 멀리 있는 B 선택 → 1(캔버스 직행) → B가 화면 중앙
  await p.keyboard.press('Escape');
  await p.keyboard.press('v');
  await p.keyboard.press('v');
  await p.waitForTimeout(300);
  await p.locator('.outline button.row', { hasText: '멀리 떨어진 자식' }).click();
  await p.waitForTimeout(150);
  await p.keyboard.press('1');
  await p.waitForTimeout(400);
  let c = await offCenter('멀리 떨어진 자식');
  ok(c.dx < 8 && c.dy < 8, `족보 선택 후 1 → B 화면 중앙 (dx=${c.dx.toFixed(1)} dy=${c.dy.toFixed(1)})`);

  // 2) 무선택 전환 → 뷰포트 불변 (캔버스 Esc로 해제 후 2→1)
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  ok((await p.locator('.node.selected').count()) === 0, '캔버스 Esc로 선택 해제');
  const t1 = await worldT();
  await p.keyboard.press('2');
  await p.waitForTimeout(250);
  await p.keyboard.press('1');
  await p.waitForTimeout(400);
  ok((await worldT()) === t1, '무선택 전환 → 뷰포트 불변 (센터링/줌 없음)');

  // 3) 오행진에서 선택 → 1 → 그 카드 화면 중앙 (보드도 같은 goView 경로)
  await p.keyboard.press('2');
  await p.waitForTimeout(250);
  await p.locator('.board .card', { hasText: '가까운 부모' }).click();
  await p.waitForTimeout(150);
  await p.keyboard.press('1');
  await p.waitForTimeout(400);
  c = await offCenter('가까운 부모');
  ok(c.dx < 8 && c.dy < 8, `오행진 선택 후 1 → A 화면 중앙 (dx=${c.dx.toFixed(1)} dy=${c.dy.toFixed(1)})`);

  await browser.close();
  console.log(process.exitCode ? '검증 실패' : '#178 뷰 전환 점프 — 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
