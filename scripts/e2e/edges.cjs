// 緣 중복/역사 내부 처리 검증 — 같은 쌍 한 가닥(무방향)·유령 undo 없음·redo 보존
const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (c, m) => { if (c) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const b = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  const edgeCount = () => p.locator('.edge').count()
  const dataEdges = () => p.evaluate(() => {
    const docs = JSON.parse(localStorage.getItem('noenae-gangho-docs'))
    return JSON.parse(localStorage.getItem('noenae-gangho-doc-' + docs.current)).edges.length
  })
  const posX = async (t) => parseFloat(await p.locator('.node', { hasText: t }).first().evaluate((el) => el.style.left))
  const dupTry = async (fromText, toText) => {
    const f = p.locator('.node', { hasText: fromText }).first()
    await f.hover()
    const h = await f.locator('.handle').boundingBox()
    await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await p.mouse.down()
    const tb = await p.locator('.node', { hasText: toText }).first().boundingBox()
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 4 })
    await p.mouse.up()
    await p.waitForTimeout(700)
  }
  const dragBy = async (t, dx) => {
    const nb = await p.locator('.node', { hasText: t }).first().boundingBox()
    await p.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2)
    await p.mouse.down()
    await p.mouse.move(nb.x + nb.width / 2 + dx, nb.y + nb.height / 2, { steps: 3 })
    await p.mouse.up()
    await p.waitForTimeout(200)
  }

  await dupTry('깨다름', 'difference')
  ok((await edgeCount()) === 3 && (await dataEdges()) === 3, '같은 방향 재시도: 화면 3·데이터 3 (불변)')
  await dupTry('difference', '깨다름')
  ok((await edgeCount()) === 3 && (await dataEdges()) === 3, '역방향 시도: 여전히 한 가닥 (A⇄B 불가)')

  // 유령 undo — 무산된 시도가 역사에 걸음을 남기면 Ctrl+Z 첫 방이 헛방이 된다
  const x0 = await posX('미분')
  await dragBy('미분', 60)
  await dupTry('깨다름', 'difference')
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  ok((await posX('미분')) === x0, '유령 undo 없음: Ctrl+Z 한 방에 드래그 원복')

  // redo 보존 — 무산된 시도가 redo 스택을 비우면 안 된다
  await dragBy('미분', 60)
  const x1 = await posX('미분')
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(300)
  await dupTry('깨다름', 'difference')
  await p.keyboard.press('Control+y')
  await p.waitForTimeout(300)
  ok((await posX('미분')) === x1, 'redo 보존: 중복 시도 후에도 Ctrl+Y 동작')

  await b.close()
  console.log(process.exitCode ? '검증 실패' : '緣 중복/역사 내부 처리 — 통과')
})().catch((e) => { console.error(e); process.exit(1) })
