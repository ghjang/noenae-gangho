const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (c, m) => { if (c) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })).newPage()
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const vis = () => page.locator('.node').count()

  // 진입: 선택 → L (시드 사슬: 깨다름→difference→미분→브로)
  await page.locator('.node', { hasText: 'difference' }).click()
  await page.keyboard.press('l')
  await page.waitForTimeout(320)
  ok((await vis()) === 3, `L → 1촌만 보임 (3쪽지: 깨다름·difference·미분, 실측 ${await vis()})`)
  const pill = page.locator('.focus-pill')
  ok((await pill.count()) === 1 && (await pill.textContent()).includes('1촌'), '배지: 集中 1촌')
  ok((await page.locator('.minimap .mm-node').count()) === 3, '전도(미니맵)도 집중 집합만')

  // 반경 조절
  await page.keyboard.press(']')
  await page.waitForTimeout(320)
  ok((await vis()) === 4 && (await pill.textContent()).includes('2촌'), '] → 2촌 (4쪽지)')
  await page.keyboard.press('[')
  await page.waitForTimeout(320)
  ok((await vis()) === 3, '[ → 1촌 복귀')

  // 검색 점프 = 표적 갈아타기
  await page.keyboard.press('Control+f')
  await page.keyboard.type('브로')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(350)
  ok((await vis()) === 2, `점프 → 표적 갈아타기 (브로+미분 = 2, 실측 ${await vis()})`)
  ok((await page.locator('.node.selected').count()) === 1, '점프 후 선택 1')
  await page.keyboard.press('Escape') // 검색 닫기(stopPropagation — 집중은 유지)
  ok((await pill.count()) === 1, '검색 닫아도 집중 유지')
  await page.screenshot({ path: '/tmp/focus-mode.png' })

  // 같은 표적 L = 해제
  await page.keyboard.press('l')
  await page.waitForTimeout(320)
  ok((await vis()) === 4 && (await pill.count()) === 0, '같은 표적 L → 해제 (4쪽지·배지 소멸)')

  // Esc 단계식 해제 — 첫 Esc는 집중만, 선택은 유지
  await page.keyboard.press('l')
  await page.waitForTimeout(320)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(320)
  ok((await pill.count()) === 0 && (await vis()) === 4, 'Esc → 집중 해제')
  ok((await page.locator('.node.selected').count()) === 1, 'Esc 첫 단계에선 선택 유지')

  // 집중 중 가지치기 — 앵커의 자식(1촌)은 바로 보인다
  await page.locator('.node', { hasText: 'difference' }).click()
  await page.keyboard.press('l')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(350)
  await page.keyboard.press('Escape') // 편집 종료 (집중은 다음 Esc)
  ok((await vis()) === 4, `집중 중 Tab → 새 가지(1촌)가 곧장 보임 (3+1, 실측 ${await vis()})`)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(320)

  // 배지 클릭 해제
  await page.locator('.focus-pill').click()
  await page.waitForTimeout(320)
  ok((await page.locator('.focus-pill').count()) === 0 && (await vis()) === 4, '배지 클릭 → 해제')

  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '#47 집중(포커스) — 전 시나리오 통과')
})().catch((e) => { console.error(e); process.exit(1) })
