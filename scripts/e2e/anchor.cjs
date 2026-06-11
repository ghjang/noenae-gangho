const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (cond, m) => { if (cond) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // world 좌표계(스케일1·팬0)에서: 모든 緣의 시작점 M이 어느 쪽지 박스 '변 위'에 있는지
  const anchorReport = (layerSel) => page.evaluate((sel) => {
    const O = document.querySelector('.world').getBoundingClientRect()
    const boxes = [...document.querySelectorAll('.node')].map((el) => {
      const r = el.getBoundingClientRect()
      return { l: r.x - O.x, t: r.y - O.y, r: r.x - O.x + r.width, b: r.y - O.y + r.height }
    })
    const onSide = (x, y) => boxes.some((B) =>
      ((Math.abs(x - B.l) < 1 || Math.abs(x - B.r) < 1) && y >= B.t - 1 && y <= B.b + 1) ||
      ((Math.abs(y - B.t) < 1 || Math.abs(y - B.b) < 1) && x >= B.l - 1 && x <= B.r + 1))
    const inside = (x, y) => boxes.some((B) => x > B.l + 1 && x < B.r - 1 && y > B.t + 1 && y < B.b - 1)
    return [...document.querySelectorAll(sel)].map((p) => {
      const m = p.getAttribute('d').match(/^M ([-\d.]+) ([-\d.]+)/)
      const x = +m[1], y = +m[2]
      return { x, y, onSide: onSide(x, y), inside: inside(x, y) }
    })
  }, layerSel)

  const checkAll = async (label, sel = 'svg.edges:not(.lift-layer) path.vis') => {
    const rep = await anchorReport(sel)
    ok(rep.length > 0 && rep.every((r) => r.onSide && !r.inside),
      `${label}: 緣 ${rep.length}가닥 시작점 전부 변 위 (박스 내부 0)`)
    return rep
  }

  await checkAll('시드 직후')

  // Tab 가지치기 → 새 緣 앵커
  await page.locator('.node', { hasText: 'difference' }).click()
  await page.keyboard.press('Tab')
  await page.waitForTimeout(250)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  ok(await page.locator('.node').count() === 5, 'Tab 가지치기: 쪽지 5')
  await checkAll('가지치기 직후')

  // 언두/리두 — 과거 '허공 찌르기' 사고 지점
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  ok(await page.locator('.node').count() === 4, '언두: 4쪽지 복귀')
  await checkAll('언두 후')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(300)
  ok(await page.locator('.node').count() === 5, '리두: 5쪽지 복귀')
  await checkAll('리두 후')

  // 가지런히(R) — 재배치 후 앵커
  await page.locator('.viewport').click({ position: { x: 600, y: 500 } }) // 선택 해제(빈 곳)
  await page.keyboard.press('r')
  await page.waitForTimeout(600)
  await checkAll('타이디(R) 후')
  await page.screenshot({ path: '/tmp/anchor-tidy.png' })

  // 드래그 동결 — 부상층(lift-layer) 緣의 시작점이 박스 변에 붙는지 (원 제보 상황)
  const nb = await page.locator('.node', { hasText: 'difference' }).boundingBox()
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 4; i++) await page.mouse.move(nb.x + nb.width / 2 + i * 15, nb.y + nb.height / 2 + i * 12)
  await page.waitForTimeout(200)
  ok(await page.locator('.lift-layer').count() === 1, '드래그 중 부상층 존재')
  await checkAll('드래그 동결 중 (부상층)', 'svg.lift-layer path.vis')
  const db = await page.locator('.node', { hasText: 'difference' }).boundingBox()
  await page.screenshot({ path: '/tmp/anchor-drag.png', clip: { x: Math.max(0, db.x - 260), y: Math.max(0, db.y - 160), width: 620, height: 400 } })
  await page.mouse.up()

  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '緣 양끝 변 앵커 — 전 시나리오 통과')
})().catch((e) => { console.error(e); process.exit(1) })
