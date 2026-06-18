// 캔버스 메커니즘 보초 (#152 분리 前 선보강) — e2e 12종이 안 덮던 사각지대를 못박는다.
// 감사 결과 무(無)검증/약검증이던 단위: 휠 줌·줌 리셋·빈곳 팬·화살표 팬·전체 맞춤(Shift+1)·
// 쪽지 맞춤(Shift+2)·미니맵 점프·너비 리사이즈·緣 뒤집기(F)·검색 점프.
// CanvasView 추출(#152) 전후 '동작 동일'의 안전망 — 추출이 이걸 깨면 여기서 잡힌다.
// 관찰: .world 인라인 transform(translate/scale) 파싱 + 데이터는 localStorage doc.
const { chromium } = require('playwright');
const fail = (m) => {
  console.error('✗ ' + m);
  process.exitCode = 1;
};
const ok = (c, m) => {
  if (c) console.log('✓ ' + m);
  else fail(m);
};
const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

(async () => {
  const b = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);

  // .world의 인라인 transform = ui.pan/scale 그 자체 (translate(x px, y px) scale(s))
  const world = () =>
    p.locator('.world').evaluate((el) => {
      const m = (el.getAttribute('style') || '').match(
        /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)\s*scale\(\s*([-\d.]+)\s*\)/,
      );
      return m ? { x: +m[1], y: +m[2], s: +m[3] } : null;
    });
  const vp = await p.locator('.viewport').boundingBox();
  const cx = vp.x + vp.width / 2,
    cy = vp.y + vp.height / 2;

  // ── 휠 줌 (사각지대: 휠 줌 검증 전무) ──
  await p.mouse.move(cx, cy);
  const z0 = await world();
  await p.mouse.wheel(0, -120); // 위로 = 줌인
  await p.waitForTimeout(150);
  const z1 = await world();
  ok(z1.s > z0.s, `휠 위로 → 줌인 (s ${z0.s.toFixed(2)}→${z1.s.toFixed(2)})`);
  await p.mouse.wheel(0, 240); // 아래 = 줌아웃
  await p.waitForTimeout(150);
  ok((await world()).s < z1.s, '휠 아래로 → 줌아웃');

  // ── 줌 리셋 (Ctrl+0) — 배율 100% ──
  await p.keyboard.press('Control+0');
  await p.waitForTimeout(150);
  ok(near((await world()).s, 1, 0.01), 'Ctrl+0 → 배율 100%');

  // ── 빈곳 드래그 = 팬 (사각지대) ──
  const pan0 = await world();
  const ex = vp.x + vp.width * 0.82,
    ey = vp.y + vp.height * 0.82; // 노드 없는 우하단(빈 캔버스)
  await p.mouse.move(ex, ey);
  await p.mouse.down();
  await p.mouse.move(ex + 150, ey, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(150);
  const pan1 = await world();
  ok(
    near(pan1.x - pan0.x, 150, 8) && near(pan1.y, pan0.y, 8),
    `빈곳 드래그 → 팬 (Δx≈150, 실측 ${(pan1.x - pan0.x).toFixed(0)})`,
  );

  // ── 화살표 팬 (빈손) ── ArrowRight → pan.x -= 48
  await p.keyboard.press('Escape');
  const pa0 = await world();
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(100);
  ok((await world()).x < pa0.x - 40, 'ArrowRight(빈손) → 팬 (pan.x 감소)');

  // ── Shift+1 전체 맞춤 (사각지대) ── 일부러 확대 어긋낸 뒤 전체가 시야로
  await p.mouse.move(cx, cy);
  await p.mouse.wheel(0, -360);
  await p.waitForTimeout(150);
  await p.keyboard.press('Shift+1');
  await p.waitForTimeout(200);
  const allIn = await p.locator('.node').evaluateAll(
    (els, vh) =>
      els.every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= -1 && r.left >= -1 && r.bottom <= vh + 2;
      }),
    vp.height,
  );
  ok(allIn, 'Shift+1 → 전체 맞춤(모든 노드 시야 안)');

  // ── Shift+2 쪽지 맞춤 (사각지대) ── 선택 쪽지로 줌 → 배율↑
  await p.locator('.node', { hasText: '깨다름' }).first().click();
  const sB = (await world()).s;
  await p.keyboard.press('Shift+2');
  await p.waitForTimeout(200);
  ok(
    (await world()).s > sB,
    `Shift+2 → 선택 쪽지로 줌 (배율 ${sB.toFixed(2)}→${(await world()).s.toFixed(2)})`,
  );

  // ── 미니맵 클릭 점프 (사각지대: 렌더만 검증됐음) ──
  await p.keyboard.press('Control+0');
  await p.waitForTimeout(120);
  const mm = await p.locator('.minimap').boundingBox();
  const mp0 = await world();
  await p.mouse.click(mm.x + mm.width * 0.8, mm.y + mm.height * 0.8);
  await p.waitForTimeout(180);
  const mp1 = await world();
  ok(!near(mp1.x, mp0.x, 4) || !near(mp1.y, mp0.y, 4), '미니맵 클릭 → 팬 점프');

  // ── 너비 리사이즈 (사각지대) ── 우변 띠 드래그 → 너비 확장
  await p.keyboard.press('Control+0');
  await p.waitForTimeout(120);
  await p.keyboard.press('Shift+1');
  await p.waitForTimeout(180);
  const node = p.locator('.node', { hasText: '깨다름' }).first();
  await node.hover();
  const nb = await node.boundingBox();
  const w0 = await node.evaluate((el) => el.offsetWidth);
  // 우변 띠를 '위쪽 20%'에서 잡는다 — 한가운데의 잇기 핸들(빨간 점, z-index↑)을 피해야 리사이즈가 잡힌다
  const hx = nb.x + nb.width - 1,
    hy = nb.y + nb.height * 0.2;
  await p.mouse.move(hx, hy);
  await p.mouse.down();
  await p.mouse.move(hx + 120, hy, { steps: 6 });
  await p.mouse.up();
  await p.waitForTimeout(250);
  const w1 = await node.evaluate((el) => el.offsetWidth);
  ok(w1 > w0 + 15, `우변 드래그 → 너비 확장 (${w0}→${w1})`);

  // ── 緣 뒤집기 F (사각지대) ── 첫 緣 선택 후 F → a/b 스왑(localStorage)
  const edge0 = () =>
    p.evaluate(() => {
      const docs = JSON.parse(localStorage.getItem('noenae-gangho-docs'));
      const g = JSON.parse(localStorage.getItem('noenae-gangho-doc-' + docs.current));
      const e = g.edges[0];
      return { a: e.a, b: e.b };
    });
  const ab0 = await edge0();
  // 緣 stroke 한가운데로 마우스 이동 → edgeHover 세팅(.hit는 pointer-events:stroke라 bbox중심 아닌
  // 경로 위 점이어야) → F. getPointAtLength(경로 중점) → getScreenCTM(.world 변환 반영)으로 화면 좌표
  const pt = await p
    .locator('.edge .hit')
    .first()
    .evaluate((path) => {
      const mid = path.getPointAtLength(path.getTotalLength() / 2);
      const sp = new DOMPoint(mid.x, mid.y).matrixTransform(path.getScreenCTM());
      return { x: sp.x, y: sp.y };
    });
  await p.mouse.move(pt.x, pt.y);
  await p.waitForTimeout(150);
  await p.keyboard.press('f');
  await p.waitForTimeout(700); // 저장 디바운스
  const ab1 = await edge0();
  ok(ab1.a === ab0.b && ab1.b === ab0.a, `F → 緣 방향 뒤집힘 (${ab0.a}→${ab0.b} ⇒ ${ab1.a}→${ab1.b})`);

  // ── 검색 Ctrl+F (약검증: open만) — 열기→입력→Enter 점프 ──
  await p.keyboard.press('Control+0');
  await p.waitForTimeout(120);
  await p.keyboard.press('Control+f');
  await p.waitForTimeout(180);
  ok((await p.locator('.search-card').count()) === 1, 'Ctrl+F → 검색 카드 등장');
  await p.locator('.search-card input').fill('difference');
  await p.waitForTimeout(220);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(220);
  ok(
    (await p.locator('.node.selected').filter({ hasText: 'difference' }).count()) === 1,
    '검색 Enter → 결과 쪽지 선택+점프',
  );

  await b.close();
  console.log(process.exitCode ? '검증 실패' : '캔버스 메커니즘 보초 — 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
