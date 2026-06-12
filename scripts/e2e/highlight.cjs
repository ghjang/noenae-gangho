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
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })
  ).newPage();
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // 내보내기(JSON) — PC 확대 + 토큰
  await page.locator('.bar button[aria-label="내보내기"]').click();
  const sb = await page.locator('.sheet').boundingBox();
  ok(Math.round(sb.width) === 840, `PC 내보내기 시트 폭 840 (실측 ${Math.round(sb.width)})`);
  const ch = await page.locator('.sheet .code').boundingBox();
  ok(ch.height > 400, `코드 표면 높이 56vh급 (실측 ${Math.round(ch.height)})`);
  ok((await page.locator('.sheet .code .tk-key').count()) > 5, 'JSON 키 토큰 색칠');
  ok((await page.locator('.sheet .code .tk-num').count()) > 5, 'JSON 숫자 토큰 색칠');
  // pre 본문과 sheetText 일치(토큰 이어붙임 무손실) — 복사 본문 신뢰성
  const preText = await page.locator('.sheet .code').innerText();
  ok(
    preText.includes('"app": "noenae-gangho"') || preText.includes('"app":"noenae-gangho"'),
    'pre 본문에 원문 보존',
  );
  await page.screenshot({ path: '/tmp/hl-export.png' });
  await page.keyboard.press('Escape');

  // 비급(md) — 제목/불릿 토큰
  await page.locator('.bar button.md').click();
  ok((await page.locator('.sheet .code .tk-head').count()) === 1, 'md 제목 토큰');
  ok((await page.locator('.sheet .code .tk-bullet').count()) === 4, 'md 불릿 토큰 4 (시드 4쪽지)');
  await page.keyboard.press('Escape');

  // 가져오기 — 편집 overlay: 입력하면 pre가 따라 색칠 + 스크롤 동기화 + 흡수 동작
  await page.locator('.bar button[aria-label="불러오기"]').click();
  const ta = page.locator('.code-wrap textarea');
  await ta.fill('# 비급\n\n- 갑\n  - 을\n- 병');
  await page.waitForTimeout(100);
  ok((await page.locator('.code-wrap .code .tk-bullet').count()) === 3, '가져오기: 입력 즉시 불릿 색칠 3');
  ok((await page.locator('.code-wrap .code .tk-head').count()) === 1, '가져오기: 제목 색칠');
  // 정렬 — pre와 textarea의 박스 일치
  const tb = await ta.boundingBox();
  const pb = await page.locator('.code-wrap .code').boundingBox();
  ok(
    Math.abs(tb.x - pb.x) < 1 && Math.abs(tb.y - pb.y) < 1 && Math.abs(tb.width - pb.width) < 1,
    'overlay 박스 정렬 일치',
  );
  // 긴 내용 스크롤 동기화
  await ta.fill(Array.from({ length: 80 }, (_, i) => `- 쪽지 ${i}`).join('\n'));
  await ta.evaluate((el) => {
    el.scrollTop = 300;
    el.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);
  const preTop = await page.locator('.code-wrap .code').evaluate((el) => el.scrollTop);
  ok(preTop === 300, `스크롤 동기화 (pre.scrollTop ${preTop})`);
  await page.screenshot({ path: '/tmp/hl-import.png' });
  // 흡수 동작 회귀
  await ta.fill('- 환생 갑\n  - 환생 을');
  await page.locator('.sheet button.primary').click();
  await page.waitForTimeout(300);
  ok((await page.locator('.node').count()) === 2, '흡수 회귀: 쪽지 2 환생');

  await browser.close();
  console.log(process.exitCode ? '검증 실패' : '시트 확대 + 신택스 하이라이트 — 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
