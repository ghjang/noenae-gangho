// 오행진(칸반 보드, #42 v1) 검증 — 토글/컬럼/정렬(y→x)/선택/점프/키 가드/undo/문서별 모드
const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (c, m) => { if (c) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })).newPage()
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)

  // 같은 색(먹) 빈 쪽지 하나 더 — 정렬 검증용 (시드 깨다름보다 위쪽, 타이핑 없이
  // 생성만 = undo 한 걸음 — 보드 Ctrl+Z 검증이 한 방에 떨어지게)
  await p.locator('.viewport').dblclick({ position: { x: 700, y: 120 } })
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)

  // 토글 → 오행진
  await p.locator('button[aria-label="오행진"]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('.board').count()) === 1 && (await p.locator('.viewport').count()) === 0, '토글: 오행진 등장·캔버스 퇴장')
  ok((await p.locator('.board .col').count()) === 5, '오행 5종대')
  ok((await p.locator('.hud').count()) === 0 && (await p.locator('.minimap').count()) === 0, '캔버스 전용 UI(HUD/전도) 숨김')
  const counts = await p.$$eval('.board .col h3 em', (els) => els.map((e) => e.textContent))
  ok(JSON.stringify(counts) === JSON.stringify(['2', '1', '1', '1', '0']), `종대 머릿수 [2,1,1,1,0] (실측 ${counts})`)
  ok((await p.locator('.board .none').count()) === 1, '빈 종대(남)엔 — 표시')

  // 정렬 y→x — 먹 종대: 위쪽 먹(y≈) 이 깨다름(y220)보다 먼저
  const mukCards = await p.$$eval('.board .col:first-child .card', (els) => els.map((e) => e.textContent))
  ok(mukCards[0].includes('빈 쪽지') && mukCards[1].includes('깨다름'), `정렬 y→x: 빈 쪽지(위) → 깨다름 (실측 ${mukCards})`)

  // 카드 클릭 = 선택
  await p.locator('.board .card', { hasText: '깨다름' }).click()
  ok((await p.locator('.board .card.sel').count()) === 1, '카드 클릭 → 선택 링')

  // 키 가드 — Tab/L 침묵
  const cardCount = await p.locator('.board .card').count()
  await p.keyboard.press('Tab')
  await p.waitForTimeout(250)
  ok((await p.locator('.board .card').count()) === cardCount, '보드에서 Tab 침묵 (가지 안 침)')
  await p.keyboard.press('l')
  await p.waitForTimeout(200)
  ok((await p.locator('.focus-pill').count()) === 0, '보드에서 L 침묵 (집중 배지 없음)')

  // 보드에서 Ctrl+Z — 데이터 되돌리기는 통한다 (위쪽 먹 생성 취소)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  const counts2 = await p.$$eval('.board .col h3 em', (els) => els.map((e) => e.textContent))
  ok(counts2[0] === '1', `보드에서 Ctrl+Z → 먹 종대 2→1 (실측 ${counts2[0]})`)

  // 더블클릭 점프 — 캔버스로 + 그 쪽지 선택
  await p.locator('.board .card', { hasText: '깨다름' }).dblclick()
  await p.waitForTimeout(400)
  ok((await p.locator('.viewport').count()) === 1, '점프: 캔버스 복귀')
  const sel = await p.locator('.node.selected').textContent()
  ok(sel.includes('깨다름'), '점프: 그 쪽지가 선택돼 있다')

  // 문서별 모드 영속 — 오행진 켜고 새로고침 → 유지, 새 문서는 캔버스 기본
  await p.locator('button[aria-label="오행진"]').click()
  await p.waitForTimeout(200)
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  ok((await p.locator('.board').count()) === 1, '새로고침 후에도 오행진 (문서별 저장)')
  await p.locator('button[aria-label="서가"]').click()
  await p.locator('.sheet.docs button.primary').click() // 새 강호
  await p.waitForTimeout(400)
  ok((await p.locator('.viewport').count()) === 1, '새 문서는 캔버스 기본')
  await p.locator('button[aria-label="서가"]').click()
  await p.locator('.doc-list li:not(.cur) .open').click() // 강호 1 복귀
  await p.waitForTimeout(400)
  ok((await p.locator('.board').count()) === 1, '강호 1 복귀 → 오행진 복원')

  // 개명 중복 — 같은 이름 입력 시 ' (2)' 꼬리표
  await p.locator('button[aria-label="서가"]').click()
  const curName = await p.locator('.doc-list li.cur .open span').textContent()
  await p.locator('.doc-list li:not(.cur) button[aria-label="이름 고치기"]').click()
  await p.locator('.doc-list input').fill(curName)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(200)
  const names = await p.$$eval('.doc-list .open span', (els) => els.map((e) => e.textContent))
  ok(names.includes(`${curName} (2)`), `개명 중복 → 꼬리표 (실측 ${names})`)
  await p.keyboard.press('Escape')

  await p.locator('button[aria-label="서가"]').click().catch(() => {})
  await p.keyboard.press('Escape')
  await p.screenshot({ path: '/tmp/board-view.png' })
  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '#42 오행진 — 전 시나리오 통과')
})().catch((e) => { console.error(e); process.exit(1) })
