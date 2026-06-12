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
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] });

  // ── 폰 화면 (390×844, 아이폰급) ──
  const mob = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
  ).newPage();
  await mob.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await mob.waitForTimeout(400);

  const barBB = await mob.locator('.bar').boundingBox();
  const titleBB = await mob.locator('.bar .title').boundingBox();
  const palBB = await mob.locator('.bar .palette').boundingBox();
  ok(
    palBB.y >= titleBB.y + titleBB.height - 2,
    `팔레트가 둘째 줄로 (title y${Math.round(titleBB.y)} → palette y${Math.round(palBB.y)})`,
  );
  ok(Math.round(barBB.height) === 86, `바 높이 = --bar-h 86 (실측 ${Math.round(barBB.height)})`);
  const vpBB = await mob.locator('.viewport').boundingBox();
  ok(
    Math.round(vpBB.y) === Math.round(barBB.height),
    `뷰포트 상단 == 바 하단 (틈/겹침 없음, ${Math.round(vpBB.y)})`,
  );
  // 우상단 끝 '?' 버튼이 화면 폭 안에 (스크롤 없이) 들어오는지
  const q = await mob.locator('.bar button[aria-label="도움말"]').boundingBox();
  ok(q && q.x + q.width <= 390, `'?' 버튼까지 한 화면 (우변 ${Math.round(q.x + q.width)} ≤ 390)`);
  ok(await mob.locator('.colophon').isHidden(), '콜로폰(낙관) 폰에서 숨김');
  ok(
    (await mob.evaluate(() => getComputedStyle(document.documentElement).touchAction)) === 'manipulation',
    'html touch-action: manipulation (더블탭 줌 차단)',
  );
  ok(
    (await mob.locator('.viewport').evaluate((el) => getComputedStyle(el).touchAction)) === 'none',
    '캔버스 touch-action: none 유지 (자체 핀치)',
  );
  ok(
    (await mob
      .locator('.bar button')
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect)) === 'none',
    '버튼 user-select: none (꾹 눌러도 선택 안 됨)',
  );
  await mob.screenshot({ path: '/tmp/mobile-bar.png', clip: { x: 0, y: 0, width: 390, height: 300 } });
  await mob.screenshot({ path: '/tmp/mobile-full.png' });

  // ── 데스크톱 회귀 (1280) ──
  const desk = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  ).newPage();
  await desk.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(300);
  const dBar = await desk.locator('.bar').boundingBox();
  ok(Math.round(dBar.height) === 52, `데스크톱 바 높이 52 유지 (${Math.round(dBar.height)})`);
  const dTitle = await desk.locator('.bar .title').boundingBox();
  const dPal = await desk.locator('.bar .palette').boundingBox();
  ok(Math.abs(dPal.y + dPal.height / 2 - (dTitle.y + dTitle.height / 2)) < 8, '데스크톱 한 줄 유지');
  ok(await desk.locator('.colophon').isVisible(), '데스크톱 콜로폰 보임');

  await browser.close();
  console.log(process.exitCode ? '검증 실패' : '모바일 응급 다듬기 — 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
