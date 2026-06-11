const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (cond, m) => { if (cond) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // 아이콘 버튼 3종 — 라벨/툴팁/키(높이) 정렬
  const icons = page.locator('.bar button.icon')
  ok(await icons.count() === 3, '아이콘 버튼 3종')
  const arias = []
  for (let i = 0; i < 3; i++) arias.push(await icons.nth(i).getAttribute('aria-label'))
  ok(JSON.stringify(arias) === JSON.stringify(['내보내기', '불러오기', '강호 비우기']), `aria 3종: ${arias}`)
  const hs = []
  for (const sel of ['.bar button.icon', '.bar button.md', '.bar .actions > button.primary']) {
    hs.push((await page.locator(sel).first().boundingBox()).height)
  }
  ok(hs.every((h) => Math.abs(h - hs[0]) <= 1), `버튼 키 정렬 (${hs})`)
  await page.locator('.bar').screenshot({ path: '/tmp/iconbar-muhyeop.png' })

  // 비우기 확인 카드 플로우
  await page.locator('.bar button.icon').nth(2).click()
  ok(await page.locator('.sheet.confirm').count() === 1, '빗자루 → 확인 카드 등장')
  ok((await page.locator('.sheet.confirm h2').textContent()) === '진짜 비움?', '카드 제목 = 진짜 비움?')
  await page.screenshot({ path: '/tmp/confirm-card.png' })
  await page.locator('.sheet.confirm .row button').first().click() // 취소
  ok(await page.locator('.sheet.confirm').count() === 0 && (await page.locator('.node').count()) === 4, '취소 → 강호 무사')

  await page.locator('.bar button.icon').nth(2).click()
  await page.keyboard.press('Escape')
  ok(await page.locator('.sheet.confirm').count() === 0, 'Esc → 카드 닫힘')

  await page.locator('.bar button.icon').nth(2).click()
  await page.locator('.sheet.confirm button.armed').click() // 강호 비우기
  await page.waitForTimeout(300)
  ok((await page.locator('.node').count()) === 0, '실행 → 강호 비워짐')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  ok((await page.locator('.node').count()) === 4, 'Ctrl+Z → 강호 복구 (한 걸음)')

  // plain 톤 — 문구 전환
  await page.locator('.bar button.tone').click()
  await page.waitForTimeout(200)
  ok((await page.locator('.bar button.icon').nth(2).getAttribute('aria-label')) === '모두 지우기', 'plain 톤 aria 전환')
  await page.locator('.bar button.icon').nth(2).click()
  ok((await page.locator('.sheet.confirm h2').textContent()) === '정말 지울까요?', 'plain 카드 제목')
  await page.locator('.bar').screenshot({ path: '/tmp/iconbar-plain.png' }).catch(() => {})
  await page.keyboard.press('Escape')

  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '아이콘 바 + 확인 카드 — 전 시나리오 통과')
})().catch((e) => { console.error(e); process.exit(1) })
