// #195 — 편집 중 빈 입력서 Backspace = 그 念 바로 베기 (아웃라이너 국룰).
//  · 빈 입력이면 그 念을 베고 편집 종료, Ctrl+Z로 되살아남(removeNodes 재사용 = undo 한 걸음)
//  · 글자가 있으면 안 벤다 — Backspace는 글자만 지운다
// (IME 한글 조합 중엔 안 베는 가드(isComposing)는 자동 검증 밖 — 수동 점검)
const { chromium } = require('playwright');
const fail = (m) => {
  console.error('✗ ' + m);
  process.exitCode = 1;
};
const ok = (c, m) => {
  if (c) console.log('✓ ' + m);
  else fail(m);
};

(async () => {
  const b = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const nodeCount = () => p.locator('.node').count();
  const editing = () => p.locator('.node textarea').count(); // 편집 중이면 textarea 1

  ok((await nodeCount()) === 4, '시드: 쪽지 4');

  // ── 핵심 — Tab 가지치기로 빈 念 편집 진입 → 빈 입력서 Backspace → 베기 ──
  await p.locator('.node', { hasText: '깨다름' }).first().click();
  await p.keyboard.press('Tab');
  await p.waitForTimeout(300);
  ok((await nodeCount()) === 5 && (await editing()) === 1, 'Tab: 새 念 5 + 빈 입력 편집 진입');
  await p.keyboard.press('Backspace');
  await p.waitForTimeout(450); // out 트랜지션(190ms) 여유
  ok((await nodeCount()) === 4 && (await editing()) === 0, '빈 입력 Backspace → 그 念 베기 + 편집 종료');

  // Ctrl+Z 복구 — removeNodes 재사용이라 undo 한 걸음
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(400);
  ok((await nodeCount()) === 5, 'Ctrl+Z → 베인 念 되살아남');
  await p.keyboard.press('Control+z'); // 생성까지 무르기 — 깨끗한 4로
  await p.waitForTimeout(300);
  ok((await nodeCount()) === 4, 'Ctrl+Z 또 한 방 → 생성까지 무름 (4)');

  // ── 가드 — 글자가 있으면 Backspace는 글자만 지운다(念은 안 벤다) ──
  await p.locator('.node', { hasText: 'difference' }).first().click();
  await p.keyboard.press('Tab');
  await p.waitForTimeout(300);
  ok((await nodeCount()) === 5 && (await editing()) === 1, 'Tab: 다시 빈 念 편집 진입');
  await p.keyboard.type('abc'); // 포커스된 편집 textarea에 입력
  await p.waitForTimeout(150);
  await p.keyboard.press('Backspace'); // value='abc'(비지 않음) → 念은 안 벤다, 'c'만 삭제
  await p.waitForTimeout(300);
  ok(
    (await nodeCount()) === 5 && (await editing()) === 1,
    '글자 있을 때 Backspace = 글자만 지움 (念 생존·편집 유지)',
  );

  await b.close();
  console.log(process.exitCode ? '검증 실패' : '#195 빈 입력 Backspace 베기 — 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
