const { chromium } = require('playwright')
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (cond, m) => { if (cond) console.log('✓ ' + m); else fail(m) }

;(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] })
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  const cur = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).cursor)

  const body = await page.evaluate(() => getComputedStyle(document.body).cursor)
  ok(body.includes('data:image/svg+xml') && / 3,? 3,? .*default/.test(body.replace(/"/g, '')), `body: 커스텀 화살표 + 핫스팟 3 3 (${body.slice(-40)})`)
  const btn = await cur('.bar button')
  ok(btn.includes('data:image') && /11,? 3/.test(btn), 'bar 버튼: 손가락 + 핫스팟 11 3')
  const vp = await cur('.viewport')
  ok(vp.includes('data:image') && /12,? 12/.test(vp) && vp.includes('grab'), '뷰포트: 손바닥 + 12 12 (grab 폴백)')
  const node = await cur('.node')
  ok(node.includes('data:image') && node.includes('grab'), '쪽지: 손바닥 커스텀')

  // 편집 진입 → textarea I빔
  await page.locator('.node').first().dblclick()
  await page.waitForTimeout(200)
  const ta = await cur('.node textarea')
  ok(ta.includes('data:image') && /12,? 12/.test(ta) && ta.includes('text'), '편집 textarea: I빔 커스텀 + 12 12')
  await page.keyboard.press('Escape')

  // 7종 데이터 URI 전부 디코드되는지 (24×24)
  const sizes = await page.evaluate(async () => {
    const names = ['default', 'pointer', 'grab', 'grabbing', 'cross', 'ew', 'text']
    const root = getComputedStyle(document.documentElement)
    const out = []
    for (const n of names) {
      const v = root.getPropertyValue('--cursor-' + n).trim()
      const url = v.match(/url\("(.+?)"\)/)?.[1]
      const img = new Image()
      const p = new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false) })
      img.src = url
      out.push([n, (await p) ? `${img.naturalWidth}x${img.naturalHeight}` : 'DECODE-FAIL'])
    }
    return out
  })
  for (const [n, s] of sizes) ok(s === '24x24', `--cursor-${n} 디코드 ${s}`)

  // 견본판 — 한지/먹 두 배경 위에 7종 렌더 (4배 확대)
  await page.evaluate((sizes) => {
    const names = sizes.map(([n]) => n)
    const root = getComputedStyle(document.documentElement)
    const sheet = document.createElement('div')
    sheet.id = 'cursor-proof'
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;grid-template-rows:1fr 1fr;font:12px sans-serif'
    for (const bg of ['#f2e9d6', '#20242c']) {
      const row = document.createElement('div')
      row.style.cssText = `background:${bg};display:flex;align-items:center;justify-content:space-evenly`
      for (const n of names) {
        const v = root.getPropertyValue('--cursor-' + n).trim()
        const url = v.match(/url\("(.+?)"\)/)?.[1]
        const cell = document.createElement('div')
        cell.style.cssText = 'text-align:center;color:' + (bg === '#20242c' ? '#f2e9d6' : '#2a241c')
        cell.innerHTML = `<img src="${url}" width="96" height="96" style="image-rendering:auto"><div>${n}</div>`
        row.appendChild(cell)
      }
      sheet.appendChild(row)
    }
    document.body.appendChild(sheet)
  }, sizes)
  await page.waitForTimeout(250)
  await page.screenshot({ path: '/tmp/cursor-set-proof.png' })

  await browser.close()
  console.log(process.exitCode ? '검증 실패' : '커서 셋 v2 검증 통과')
})().catch((e) => { console.error(e); process.exit(1) })
