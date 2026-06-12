const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (c, m) => { if (c) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  // 사용자 캡처와 같은 좁은 화면
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // 무협 톤(기본)에서 — 원래 더 길어서 닫기가 증발하던 케이스
  await page.$eval('button[aria-label="도움말"]', (el) => el.click())
  ok(await page.locator('.help-card dt').count() === 8, '퀵 카드: 요결 8수만')
  const closeBtn = page.locator('.help-card .close-row button').nth(1)
  const cb = await closeBtn.boundingBox()
  ok(cb && cb.y + cb.height <= 800, `닫기 버튼이 화면 안 (y바닥 ${Math.round(cb.y + cb.height)} ≤ 800)`)
  await page.screenshot({ path: '/tmp/help-quick.png' })

  // 전부 보기 → 전체 요결 시트 (스크롤)
  await page.locator('.help-card .close-row button').first().click()
  ok(await page.locator('.sheet.help').count() === 1, '전부 보기 → 전체 시트 등장')
  ok(await page.locator('.sheet.help dt').count() === 34, "전체 시트: 요결 34수")
  // PR #89/#97 이후: 시트는 고정, 본문(.cols — 6묶음 다단)만 스크롤
  const dlScroll = await page.locator('.sheet.help .cols').evaluate((el) => el.scrollHeight > el.clientHeight)
  const sheetFixed = await page.locator('.sheet.help').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)
  ok(dlScroll && sheetFixed, '전체 시트: 본문만 스크롤(시트 고정)')
  ok((await page.locator('.sheet.help h3').count()) === 7, '묶음 7개')
  await page.screenshot({ path: '/tmp/help-full.png' })
  await page.keyboard.press('Escape')
  ok(await page.locator('.sheet.help').count() === 0, 'Esc → 시트 닫힘')

  // plain 톤 왕복
  await page.$eval('.bar button.tone', (el) => el.click())
  await page.$eval('button[aria-label="도움말"]', (el) => el.click())
  ok(await page.locator('.help-card dt').count() === 8, 'plain 퀵 카드: 8수')
  ok((await page.locator('.help-card .close-row button').first().textContent()) === '전체 도움말', 'plain 버튼 문구')
  await page.locator('.help-card .close-row button').first().click()
  ok(await page.locator('.sheet.help dt').count() === 34, "plain 전체 시트: 34수")
  await page.keyboard.press('Escape')

  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '퀵 카드 + 전체 요결 시트 — 통과')
})().catch((e) => { console.error(e); process.exit(1) })
