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
  ok((await p.locator('.board .col:first-child h3 i.cur').count()) === 1, '그 종대 머리 동그라미에 .cur 링 (팔레트 어휘 나침반)')
  ok((await p.locator('.board .col.cur').count()) === 1, '선택 종대만 솟음(.cur) — 단 하나')

  // 키보드 항법 (#111) — 빈손 진입 / ↑↓ 종대 내(끝 멈춤) / ←→ 이웃 종대(인덱스 클램프·빈 종대 멈춤) / Enter 점프
  await p.keyboard.press('Escape') // 선택 해제 — 빈손에서 시작
  await p.keyboard.press('ArrowDown')
  let selTxt = await p.locator('.board .card.sel').textContent()
  ok(selTxt.includes('빈 쪽지'), '빈손 화살표 → 첫 종대 첫 카드 선택 (진입점)')
  await p.keyboard.press('ArrowDown')
  selTxt = await p.locator('.board .card.sel').textContent()
  ok(selTxt.includes('깨다름'), '↓ 같은 종대 아래 카드로')
  await p.keyboard.press('ArrowDown')
  selTxt = await p.locator('.board .card.sel').textContent()
  ok(selTxt.includes('깨다름'), '↓ 종대 끝에서 멈춤 (순환 없음)')
  await p.keyboard.press('ArrowRight')
  ok((await p.locator('.board .col:nth-child(2) .card.sel').count()) === 1, '→ 청 종대로 (높이 1→0 클램프)')
  ok((await p.locator('.board .col:nth-child(2) h3 i.cur').count()) === 1, '나침반 링도 청 종대로 동행')
  await p.keyboard.press('ArrowRight')
  await p.keyboard.press('ArrowRight')
  ok((await p.locator('.board .col:nth-child(4) .card.sel').count()) === 1, '→→ 황 종대까지 전진')
  await p.keyboard.press('ArrowRight')
  ok((await p.locator('.board .col:nth-child(4) .card.sel').count()) === 1, '→ 남은 게 빈 종대(남)뿐이면 멈춤')
  await p.keyboard.press('ArrowLeft')
  ok((await p.locator('.board .col:nth-child(3) .card.sel').count()) === 1, '← 단 종대로 귀환')
  const jumpTxt = (await p.locator('.board .card.sel .txt').textContent()).trim()
  await p.keyboard.press('Enter')
  await p.waitForTimeout(400)
  ok((await p.locator('.viewport').count()) === 1, 'Enter → 캔버스 점프 (화살표 항법은 포커스=선택 — 한 방)')
  ok((await p.locator('.node.selected').textContent()).includes(jumpTxt), 'Enter 점프: 그 쪽지가 선택돼 있다')
  await p.locator('button[aria-label="오행진"]').click()
  await p.waitForTimeout(300)

  // Tab 조준 → Enter 2단 — 첫 Enter는 조준 카드 선택(보드 유지·금테→인주), 둘째가 점프
  await p.locator('.board .card', { hasText: '깨다름' }).click() // 출발: 선택=포커스=깨다름
  await p.keyboard.press('Tab')
  const aimId = await p.evaluate(() =>
    document.activeElement?.classList?.contains('card') ? document.activeElement.dataset.id : null)
  const selId = await p.locator('.board .card.sel').getAttribute('data-id')
  ok(aimId && aimId !== selId, 'Tab → 다음 카드 조준 (포커스≠선택)')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(150)
  ok((await p.locator('.board').count()) === 1, '첫 Enter — 점프 아님, 보드 유지')
  ok((await p.locator('.board .card.sel').getAttribute('data-id')) === aimId, '첫 Enter = 조준 카드 선택')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(400)
  ok((await p.locator('.viewport').count()) === 1, '둘째 Enter → 이제 캔버스 점프')
  await p.locator('button[aria-label="오행진"]').click() // 다음 시나리오 전제(보드) 복원
  await p.waitForTimeout(300)

  // 집중 × 오행진 — 렌즈 끄고 입장: 버블 밖 카드 선택이 증발하지 않는다 (3차 체크포인트 버그)
  await p.locator('button[aria-label="강호 캔버스"]').click()
  await p.waitForTimeout(300)
  await p.locator('.node', { hasText: 'difference' }).click()
  await p.keyboard.press('l')
  await p.waitForTimeout(350)
  await p.locator('button[aria-label="오행진"]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('.board .card').count()) >= 4, '오행진 입장 시 집중 해제 — 전 카드 보임')
  await p.locator('.board .card', { hasText: '브로' }).click()
  await p.waitForTimeout(200)
  ok((await p.locator('.board .card.sel').count()) === 1, '버블 밖이던 카드 선택 생존 (증발 버그 수술)')

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

  // 종대 초과 — 머리 고정 + 카드 영역만 내부 스크롤 (트렐로 국룰), 카드 짜부 금지
  const colScroll = await p.locator('.board .col:first-child .cards').evaluate((el) => el.scrollHeight >= el.clientHeight)
  const cardH = await p.locator('.board .col:first-child .card').first().evaluate((el) => el.getBoundingClientRect().height)
  ok(colScroll && cardH > 30, `종대 카드 영역 스크롤 가능·카드 정상 키 (${Math.round(cardH)}px)`)

  // 색 갈아입기 = 종대 비행 (crossfade) — 카드 선택 → 팔레트 남
  await p.locator('.board .card', { hasText: '깨다름' }).click()
  await p.locator('.palette button').nth(4).click()
  await p.waitForTimeout(600)
  const cFly = await p.$$eval('.board .col h3 em', (els) => els.map((e) => e.textContent))
  ok(cFly[0] === '0' && cFly[4] === '1', `색 갈아입기 → 먹→남 종대 이동 (실측 ${cFly})`)
  ok((await p.locator('.board .card.sel').count()) === 1, '선택 링 동행')
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(600)
  const cBack = await p.$$eval('.board .col h3 em', (els) => els.map((e) => e.textContent))
  ok(cBack[0] === '1' && cBack[4] === '0', 'Ctrl+Z → 귀환 비행')

  // 접힌 쪽지 카드 더블클릭 — 점프는 데려가기지 펼치기가 아니다 (봉문 보존)
  // difference(자식 둘)를 접고 보드에서 그 카드를 두드린다
  await p.locator('.board .card', { hasText: 'difference' }).dblclick()
  await p.waitForTimeout(400)
  await p.keyboard.press('Escape') // 점프 후 선택 정리... 편집 아님 — 캔버스 복귀 상태
  await p.locator('.node', { hasText: 'difference' }).click()
  await p.keyboard.press('c') // 봉문
  await p.waitForTimeout(350)
  const foldedNodes = await p.locator('.node').count()
  await p.locator('button[aria-label="오행진"]').click()
  await p.waitForTimeout(300)
  ok((await p.locator('.board .card .fold').textContent()) === '▸1', '접힌 카드에 ▸1 배지 (직계 수 — 캔버스와 같은 표기)')
  {
    const cb = await p.locator('.board .card', { hasText: 'difference' }).boundingBox()
    const fb = await p.locator('.board .card .fold').boundingBox()
    ok(fb && fb.x >= cb.x && fb.x + fb.width <= cb.x + cb.width + 1 && fb.y >= cb.y, '배지가 카드 안에 실재 (순간이동·투명화 보초)')
  }
  await p.locator('.board .card', { hasText: 'difference' }).dblclick()
  await p.waitForTimeout(400)
  ok((await p.locator('.node').count()) === foldedNodes, `접힌 카드 점프 → 봉문 보존 (쪽지 ${foldedNodes} 그대로)`)
  ok((await p.locator('.node .fold.on').count()) === 1, '▸ 접힘 배지 건재')
  await p.locator('.node', { hasText: 'difference' }).click()
  await p.keyboard.press('c') // 개문 원복
  await p.waitForTimeout(350)
  await p.locator('button[aria-label="오행진"]').click()
  await p.waitForTimeout(300)

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
