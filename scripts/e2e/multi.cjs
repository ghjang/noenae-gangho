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
    await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  ).newPage();
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const sel = () => page.locator('.node.selected').count();
  const pos = (text) =>
    page
      .locator('.node', { hasText: text })
      .first()
      .evaluate((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]);

  // 1) Shift+클릭 토글
  await page.locator('.node', { hasText: '깨다름' }).click();
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });
  ok((await sel()) === 2, 'Shift+클릭 → 무리 2');
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });
  ok((await sel()) === 1, 'Shift+재클릭 → 빠짐 (1)');
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });

  // 2) 무리 클릭(이동 없음) → 단독 수렴
  await page.locator('.node', { hasText: '깨다름' }).click();
  ok((await sel()) === 1, '무리 멤버 맨클릭 → 단독 수렴');

  // 3) Ctrl+A
  await page.keyboard.press('Control+a');
  ok((await sel()) === 4, 'Ctrl+A → 보이는 4쪽지 전부');

  // 4) 그룹 드래그 — 두 쪽지만 무리로, 한 놈을 끌면 같이 움직인다
  await page.locator('.node', { hasText: '깨다름' }).click();
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });
  const [ax0, ay0] = await pos('깨다름');
  const [bx0, by0] = await pos('difference');
  const [cx0, cy0] = await pos('미분');
  const nb = await page.locator('.node', { hasText: '깨다름' }).boundingBox();
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  await page.mouse.move(nb.x + nb.width / 2 + 60, nb.y + nb.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const [ax1, ay1] = await pos('깨다름');
  const [bx1, by1] = await pos('difference');
  const [cx1, cy1] = await pos('미분');
  ok(
    Math.round(ax1 - ax0) === 60 && Math.round(ay1 - ay0) === 40,
    `그룹 드래그: 잡은 쪽지 +60/+40 (${Math.round(ax1 - ax0)},${Math.round(ay1 - ay0)})`,
  );
  ok(Math.round(bx1 - bx0) === 60 && Math.round(by1 - by0) === 40, '그룹 드래그: 동료도 같은 변위');
  ok(cx1 === cx0 && cy1 === cy0, '무리 밖 쪽지는 부동');
  ok((await sel()) === 2, '드래그 후 무리 유지 (2)');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  const [ax2, ay2] = await pos('깨다름');
  const [bx2] = await pos('difference');
  ok(ax2 === ax0 && ay2 === ay0 && bx2 === bx0, 'Ctrl+Z 한 방 → 둘 다 원위치 (한 걸음)');

  // 5) 그룹 넛지 — 무리째 화살표
  await page.locator('.node', { hasText: '깨다름' }).click();
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  const [ax3] = await pos('깨다름');
  const [bx3] = await pos('difference');
  ok(ax3 - ax0 === 8 && bx3 - bx0 === 8, '그룹 넛지: 둘 다 +8');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(120);

  // 6) 그룹 색칠 — 팔레트 한 번에 무리 전체
  await page.locator('.node', { hasText: '깨다름' }).click();
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });
  await page.locator('.palette button').nth(4).click(); // 남(nam)
  await page.waitForTimeout(120);
  const colors = await page.$$eval('.node', (els) =>
    els.map((el) => [
      el.textContent.includes('깨다름') || el.textContent.includes('difference'),
      el.dataset.color,
    ]),
  );
  ok(
    colors.filter(([m]) => m).every(([, c]) => c === 'nam'),
    '그룹 색칠: 무리 둘 다 남(nam)',
  );
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(120);
  ok((await page.locator('.node[data-color="nam"]').count()) === 0, 'Ctrl+Z 한 방 → 색 원복 (한 걸음)');

  // 7) 올가미 — Shift+빈 곳 드래그, 드래그 중 사각형 + 닿는 쪽지 편입
  await page.keyboard.press('Escape');
  ok((await sel()) === 0, 'Esc → 무리 해산');
  const vp = await page.locator('.viewport').boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(vp.x + 40, vp.y + 40);
  await page.mouse.down();
  await page.mouse.move(vp.x + 700, vp.y + 420, { steps: 6 });
  ok((await page.locator('.marquee').count()) === 1, '올가미 사각형 표시 중');
  const inLasso = await sel();
  ok(inLasso >= 2, `올가미에 쪽지 편입 (${inLasso})`);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  ok((await page.locator('.marquee').count()) === 0, '손 떼면 올가미 소멸');
  ok((await sel()) === inLasso, '선택은 유지');
  await page.screenshot({ path: '/tmp/multi-select.png' });

  // 8) 그룹 베기 — Delete 한 방 + undo 한 걸음
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(250);
  ok((await page.locator('.node').count()) === 0, 'Ctrl+A + Delete → 강호 비움');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  ok((await page.locator('.node').count()) === 4, 'Ctrl+Z 한 방 → 4쪽지 환생 (한 걸음)');

  // 9) 앵커 단일 작업 — 무리 중 Tab은 앵커에만 가지
  await page.locator('.node', { hasText: '깨다름' }).click();
  await page.locator('.node', { hasText: 'difference' }).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  ok((await page.locator('.node').count()) === 5, 'Tab → 앵커(difference)에 가지 1 (총 5)');
  await page.keyboard.press('Control+z');

  await browser.close();
  console.log(process.exitCode ? '검증 실패' : '#39 다중 선택 — 전 시나리오 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
