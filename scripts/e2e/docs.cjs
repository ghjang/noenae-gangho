// 서가(다중 문서, #62) 검증 — 이주/격리/전환/개창/개명/베기/영속
const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (c, m) => { if (c) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })

  // ── A. 첫 손님 (레거시 없음) — 창건 + 시드 ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } })
    const p = await ctx.newPage()
    await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
    await p.waitForTimeout(400)
    ok((await p.locator('.node').count()) === 4, 'A 첫 손님: 창세 시드 4쪽지')
    await p.locator('button[aria-label="서가"]').click()
    ok((await p.locator('.doc-list li').count()) === 1, 'A 서가: 강호 1권')
    ok((await p.locator('.doc-list li.cur').count()) === 1, 'A 현재 문서 표시')
    await ctx.close()
  }

  // ── B. 레거시 이주 + 본편 ──
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } })
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('noenae-gangho-docs')) {
      localStorage.setItem('noenae-gangho-v1', JSON.stringify({
        app: 'noenae-gangho', v: 3,
        nodes: [
          { id: 'a1', x: 100, y: 100, text: 'A고전', color: 'muk' },
          { id: 'b1', x: 400, y: 200, text: 'B고전', color: 'dan' },
        ],
        edges: [{ id: 'e1', a: 'a1', b: 'b1' }],
      }))
      localStorage.setItem('noenae-gangho-view', JSON.stringify({ x: 30, y: 20, s: 1.5 }))
    }
  })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  ok((await p.locator('.node').count()) === 2, 'B 이주: 레거시 2쪽지 편입')
  ok((await p.locator('.hud .pct').textContent()) === '150%', 'B 이주: 옛 뷰(150%)도 승계')
  ok(await p.evaluate(() => !!localStorage.getItem('noenae-gangho-v1')), 'B 레거시 키는 화석으로 보존')

  // 새 강호 개창 — 빈 캔버스
  await p.locator('button[aria-label="서가"]').click()
  await p.locator('.sheet.docs button.primary').click()
  await p.waitForTimeout(400)
  ok((await p.locator('.node').count()) === 0, 'B 개창: 빈 강호')
  await p.locator('button[aria-label="서가"]').click()
  ok((await p.locator('.doc-list li').count()) === 2, 'B 서가 2권')
  ok((await p.locator('.doc-list li.cur .open span').textContent()).includes('2'), 'B 현재 = 강호 2')
  await p.keyboard.press('Escape')

  // 강호 2에 쪽지 심기
  await p.locator('.viewport').dblclick({ position: { x: 500, y: 360 } })
  await p.keyboard.type('신생')
  await p.keyboard.press('Escape')
  await p.waitForTimeout(700) // 디바운스 저장 너머까지
  ok((await p.locator('.node').count()) === 1, 'B 강호 2: 쪽지 1')

  // 전환 격리 — 강호 1로
  await p.locator('button[aria-label="서가"]').click()
  await p.locator('.doc-list li:not(.cur) .open').click()
  await p.waitForTimeout(400)
  ok((await p.locator('.node').count()) === 2, 'B 전환: 강호 1 본문 그대로 (격리)')
  ok((await p.locator('.hud .pct').textContent()) === '150%', 'B 전환: 강호 1 뷰 복원')
  // undo 격리 — 전환 후 Ctrl+Z 무반응 (역사는 문서 안에서만)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  ok((await p.locator('.node').count()) === 2, 'B undo 격리: 전환 후 Ctrl+Z 무반응')

  // 이름 고치기 (인라인)
  await p.locator('button[aria-label="서가"]').click()
  await p.locator('.doc-list li.cur button[aria-label="이름 고치기"]').click()
  await p.locator('.doc-list input').fill('내 강호')
  await p.keyboard.press('Enter')
  ok((await p.locator('.doc-list li.cur .open span').textContent()) === '내 강호', 'B 개명: 내 강호')

  // 베기 (인라인 확인) — 현재 아닌 강호 2를 벤다
  await p.locator('.doc-list li:not(.cur) button[aria-label="강호 베기"]').click()
  ok((await p.locator('.doc-list .ask').count()) === 1, 'B 베기 확인 문구')
  await p.locator('.doc-list .mini.armed').click()
  await p.waitForTimeout(300)
  ok((await p.locator('.doc-list li').count()) === 1, 'B 베기: 1권 남음')
  ok(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('noenae-gangho-doc-')).length === 1), 'B 벤 문서의 본문 키도 제거')
  await p.keyboard.press('Escape')

  // 새로고침 영속 — 개명·본문·뷰 전부
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  ok((await p.locator('.node').count()) === 2, 'B 재방문: 본문 영속')
  await p.locator('button[aria-label="서가"]').click()
  ok((await p.locator('.doc-list li.cur .open span').textContent()) === '내 강호', 'B 재방문: 이름 영속')

  // 마지막 문서 베기 → 빈 강호 자동 창건
  await p.locator('.doc-list li.cur button[aria-label="강호 베기"]').click()
  await p.locator('.doc-list .mini.armed').click()
  await p.waitForTimeout(400)
  ok((await p.locator('.doc-list li').count()) === 1, 'B 마지막 베기: 새 강호 자동 창건')
  await p.keyboard.press('Escape')
  ok((await p.locator('.node').count()) === 0, 'B 자동 창건: 빈 캔버스')

  await p.locator('button[aria-label="서가"]').click()
  await p.screenshot({ path: '/tmp/docs-sheet.png' })
  await ctx.close()

  // ── C. 인덱스 유실 복구 + 가져오기 격리 ──
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 720 } })
    await ctx2.addInitScript(() => {
      // 인덱스 없이 본문 키만 둘 — 부분 유실/오염 상황 재현
      if (!localStorage.getItem('noenae-gangho-docs')) {
        const doc = (nodes) => JSON.stringify({ app: 'noenae-gangho', v: 3, nodes, edges: [] })
        localStorage.setItem('noenae-gangho-doc-x1', doc([{ id: 'p', x: 80, y: 80, text: '고아 일권', color: 'muk' }]))
        localStorage.setItem('noenae-gangho-doc-x2', doc([
          { id: 'q', x: 80, y: 80, text: '고아 이권 갑', color: 'dan' },
          { id: 'r', x: 300, y: 180, text: '고아 이권 을', color: 'nam' },
        ]))
      }
    })
    const p2 = await ctx2.newPage()
    await p2.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
    await p2.waitForTimeout(400)
    await p2.locator('button[aria-label="서가"]').click()
    ok((await p2.locator('.doc-list li').count()) === 2, 'C 인덱스 유실: 본문 키로 서가 재건 (2권)')
    await p2.keyboard.press('Escape')
    ok((await p2.locator('.node').count()) === 1, 'C 재건: 일권 본문 적재')
    // 가져오기 격리 — 일권에 비급을 흡수해도 이권은 무사
    await p2.locator('.bar button.icon').nth(1).click()
    await p2.locator('.code-wrap textarea').fill('- 흡수 갑\n  - 흡수 을\n- 흡수 병')
    await p2.locator('.sheet button.primary').click()
    await p2.waitForTimeout(700)
    ok((await p2.locator('.node').count()) === 3, 'C 가져오기: 일권 본문 교체 (3쪽지)')
    await p2.locator('button[aria-label="서가"]').click()
    await p2.locator('.doc-list li:not(.cur) .open').click()
    await p2.waitForTimeout(400)
    ok((await p2.locator('.node').count()) === 2, 'C 격리: 이권은 흡수와 무관 (2쪽지)')
    await ctx2.close()
  }
  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '#62 서가 — 전 시나리오 통과')
})().catch((e) => { console.error(e); process.exit(1) })
