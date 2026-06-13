// 족보(아웃라인 뷰, #42 셋째 식구) 검증 — V 순환 진입/행·깊이/선택·점프/봉문 토글/스코프/영속
const { chromium } = require('playwright');
const fail = (m) => {
  console.error('✗ ' + m);
  process.exitCode = 1;
};
const ok = (c, m) => {
  if (c) console.log('✓ ' + m);
  else fail(m);
};

(async () => {
  const browser = await chromium.launch({ args: ['--proxy-bypass-list=<-loopback>'] });
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);

  // 빈손 진입 — V 두 번 (캔버스 → 오행진 → 족보).
  // 시드 직후엔 마지막 쪽지가 선택돼 있어(addNodeAt) Esc로 빈손을 만들고 들어간다
  await p.keyboard.press('Escape');
  await p.keyboard.press('v');
  await p.keyboard.press('v');
  await p.waitForTimeout(300);
  ok((await p.locator('.outline').count()) === 1, 'V V → 족보 등장');
  const rows = await p.$$eval('.outline button.row .txt', (els) => els.map((e) => e.textContent));
  ok(
    rows.length === 4 && rows[0].includes('깨다름') && rows[3].includes('브로'),
    `시드 사슬 4행, 순서 보존 (실측 ${rows.length})`,
  );
  const depths = await p.$$eval('.outline li', (els) =>
    els.map((e) => e.style.getPropertyValue('--d').trim()),
  );
  ok(JSON.stringify(depths) === JSON.stringify(['0', '1', '2', '3']), `깊이 0~3 들여쓰기 (실측 ${depths})`);

  // 행 클릭 = 선택 (낙관 링 — 뷰를 넘어 공유되는 그 선택)
  await p.locator('.outline button.row', { hasText: '미분' }).click();
  ok((await p.locator('.outline button.row.sel').count()) === 1, '행 클릭 → 선택 링');

  // 봉문 삼각형 = collapsed 필드 그 자체 — 접으면 후손 행 생략, 펼치면 복원
  await p.locator('.outline li', { hasText: 'difference' }).locator('button.fold').click();
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 2, '▾ 토글 → 접힘: 행 4→2 (후손 생략)');
  await p.locator('.outline li', { hasText: 'difference' }).locator('button.fold').click();
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 4, '▸ 토글 → 개문: 행 복원');

  // 더블클릭 = 캔버스 점프 + 그 쪽지 선택 (오행진 카드와 같은 어휘)
  await p.locator('.outline button.row', { hasText: '깨다름' }).dblclick();
  await p.waitForTimeout(400);
  ok((await p.locator('.viewport').count()) === 1, '더블클릭 → 캔버스 점프');
  ok((await p.locator('.node.selected').textContent()).includes('깨다름'), '점프: 그 쪽지가 선택돼 있다');

  // 스코프 — 선택해 두고 들어가면 그 가지만 (Workflowy zoom 국룰, 진입 시점 동결)
  await p.locator('.node', { hasText: 'difference' }).click();
  await p.keyboard.press('v');
  await p.keyboard.press('v');
  await p.waitForTimeout(300);
  ok((await p.locator('.outline .scope').count()) === 1, '스코프 배지 등장');
  const sub = await p.$$eval('.outline button.row .txt', (els) => els.map((e) => e.textContent));
  ok(sub.length === 3 && sub[0].includes('difference'), `그 가지만 3행 (실측 ${sub.length})`);
  await p.locator('.outline .scope button.crumb').first().click(); // 全 크럼 — 전체로
  await p.waitForTimeout(250);
  ok(
    (await p.locator('.outline button.row').count()) === 4 &&
      (await p.locator('.outline .scope').count()) === 0,
    '전체 족보 보기 → 4행·스코프 해제',
  );

  // 키보드 항법 — 트리 뷰 국룰: ↑↓ 순회(순환)·← 접기/부모·→ 펼치기/자식·Enter 점프·Delete 베기
  await p.keyboard.press('Escape'); // 빈손에서
  await p.keyboard.press('ArrowDown');
  ok(
    (await p.locator('.outline button.row.sel .txt').textContent()).includes('깨다름'),
    '빈손 화살표 → 첫 행 선택',
  );
  await p.keyboard.press('ArrowUp');
  ok(
    (await p.locator('.outline button.row.sel .txt').textContent()).includes('브로'),
    '↑ 머리에서 바닥으로 순환',
  );
  await p.keyboard.press('ArrowLeft');
  ok((await p.locator('.outline button.row.sel .txt').textContent()).includes('미분'), '← 잎에서 부모로');
  await p.keyboard.press('ArrowLeft'); // 미분(자식 있음·펼침) → 접기
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 3, '← 펼친 가지(미분)에서 = 접기 (행 4→3)');
  await p.keyboard.press('ArrowLeft'); // 접힌 미분 → 부모(difference)로
  await p.keyboard.press('ArrowRight'); // difference(펼침) → 첫 자식(접힌 미분)으로
  await p.keyboard.press('ArrowRight'); // 접힌 미분 → 개문
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 4, '→ 접힌 가지에서 = 펼치기 (행 복원)');
  await p.keyboard.press('ArrowRight'); // 미분(펼침) → 첫 자식 브로
  ok(
    (await p.locator('.outline button.row.sel .txt').textContent()).includes('브로'),
    '→ 펼친 가지에서 = 첫 자식으로',
  );
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  ok((await p.locator('.viewport').count()) === 1, 'Enter → 캔버스 점프');
  await p.keyboard.press('3'); // 족보 복귀 (브로 선택 중 — 스코프 재조준)
  await p.waitForTimeout(250);
  ok(
    (await p.locator('.outline .scope').count()) === 1 &&
      (await p.locator('.outline button.row').count()) === 1,
    '3 재진입 = 선택 가지(잎 하나)로 재조준',
  );
  await p.keyboard.press('0'); // 숫자 가족의 귀환 번호
  await p.waitForTimeout(250);
  ok(
    (await p.locator('.outline .scope').count()) === 0 &&
      (await p.locator('.outline button.row').count()) === 4,
    '0 → 전체 족보 복귀',
  );
  // 크럼 = 구조적 조상 경로 (온 길이 아니라 '있는 자리' — 직행 조준에도 조상 전부) · Esc = 부모로 한 단
  await p.locator('.outline button.row', { hasText: '미분' }).click();
  await p.keyboard.press('3'); // 전체에서 미분으로 다이렉트 조준
  await p.waitForTimeout(200);
  ok((await p.locator('.outline button.row').count()) === 2, '직행 조준 — 미분 가지(2행)');
  ok(
    (await p.locator('.outline .scope button.crumb').count()) === 3,
    '직행에도 크럼은 조상 경로 전부: 全 › 깨다름 › difference',
  );
  await p.locator('.outline .scope button.crumb').nth(2).click(); // 조상 difference 클릭
  await p.waitForTimeout(200);
  ok(
    (await p.locator('.outline button.row').count()) === 3 &&
      (await p.locator('.outline .scope button.crumb').count()) === 2,
    '크럼 클릭 → 그 조상 가지로',
  );
  await p.locator('.outline button.row', { hasText: '미분' }).click(); // 다시 미분으로 — Esc 시나리오
  await p.keyboard.press('3');
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok(
    (await p.locator('.outline button.row').count()) === 3 &&
      (await p.locator('.outline .scope').count()) === 1,
    'Esc → 부모(difference) 가지로 한 단',
  );
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok(
    (await p.locator('.outline button.row').count()) === 4 &&
      (await p.locator('.outline .scope').count()) === 1,
    'Esc 또 → 조부(깨다름 — 뿌리) 가지로',
  );
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ok((await p.locator('.outline .scope').count()) === 0, 'Esc 셋째 → 전체 (뿌리 위는 全)');
  ok((await p.locator('.outline button.row.sel').count()) === 1, 'Esc는 선택을 살려둔다');
  await p.keyboard.press('Delete'); // 선택 = 미분
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 3, 'Delete → 베기 (3행)');
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(300);
  ok((await p.locator('.outline button.row').count()) === 4, 'Ctrl+Z → 4행 귀환 (undo는 뷰 불문 전역)');

  // Ctrl ±/0 — 비캔버스엔 줌 대상이 없다: preventDefault로 막기만(브라우저 페이지 줌 봉인, #150 버그 보초)
  await p.evaluate(() => {
    window.__zdp = null;
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) window.__zdp = e.defaultPrevented;
    });
  });
  for (const zk of ['Control+Equal', 'Control+Minus', 'Control+Digit0']) {
    await p.evaluate(() => (window.__zdp = null));
    await p.keyboard.press(zk);
    await p.waitForTimeout(80);
    ok((await p.evaluate(() => window.__zdp)) === true, `족보에서 ${zk} 차단 (페이지 줌 봉인)`);
  }
  ok((await p.locator('.outline').count()) === 1, '줌키 눌러도 족보 그대로');

  // 뷰 직행(1/2/3)·역순환(Shift+V) — 전 뷰 공통
  await p.keyboard.press('1');
  await p.waitForTimeout(250);
  ok((await p.locator('.viewport').count()) === 1, '1 → 캔버스 직행');
  await p.keyboard.press('2');
  await p.waitForTimeout(250);
  ok((await p.locator('.board').count()) === 1, '2 → 오행진 직행');
  await p.keyboard.press('Shift+V');
  await p.waitForTimeout(250);
  ok((await p.locator('.viewport').count()) === 1, 'Shift+V → 역순환(오행진→캔버스)');
  await p.keyboard.press('Escape'); // 빈손 — 직행 3이 전체 족보가 되게
  await p.keyboard.press('3');
  await p.waitForTimeout(250);
  ok((await p.locator('.outline').count()) === 1, '3 → 족보 직행');

  // 모드·스코프 영속 — '보던 가지'는 뷰포트와 같은 결 (Workflowy zoom 국룰, 사용자 결)
  await p.locator('.outline button.row', { hasText: 'difference' }).click();
  await p.keyboard.press('3'); // 그 가지로 조준
  await p.waitForTimeout(250);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  ok((await p.locator('.outline').count()) === 1, '새로고침 후에도 족보 (문서별 저장)');
  ok(
    (await p.locator('.outline .scope').count()) === 1 &&
      (await p.locator('.outline button.row').count()) === 3,
    '스코프도 그대로 — 보던 가지 복원',
  );
  await p.keyboard.press('0');
  await p.waitForTimeout(250);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  ok((await p.locator('.outline button.row').count()) === 4, '0(전체)로 푼 것도 기억');

  await p.screenshot({ path: '/tmp/outline-view.png' });
  await p.context().close();

  // 긴 족보(30 사슬) — 세로 스크롤 + sticky 크럼 (스크롤해도 사다리는 머리에)
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 700 } });
  await ctx2.addInitScript(() => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 30; i++) {
      nodes.push({ id: 'n' + i, x: i * 40, y: i * 60, text: '계보 ' + i, color: 'muk' });
      if (i) edges.push({ id: 'e' + i, a: 'n' + (i - 1), b: 'n' + i });
    }
    // 레거시 단일 키 — 첫 실행 이주가 '강호 1'로 편입한다 (CLAUDE.md 시드 요령)
    localStorage.setItem('noenae-gangho-v1', JSON.stringify({ app: 'noenae-gangho', v: 3, nodes, edges }));
  });
  const q = await ctx2.newPage();
  await q.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await q.waitForTimeout(400);
  await q.keyboard.press('Escape');
  await q.keyboard.press('v');
  await q.keyboard.press('v');
  await q.waitForTimeout(300);
  ok((await q.locator('.outline button.row').count()) === 30, '긴 족보 30행');
  await q.locator('.outline button.row').first().click();
  await q.keyboard.press('3'); // 스코프 — 크럼 등장
  await q.waitForTimeout(250);
  await q.locator('.outline').evaluate((el) => (el.scrollTop = el.scrollHeight)); // 바닥까지
  await q.waitForTimeout(200);
  const lastVisible = await q
    .locator('.outline button.row')
    .last()
    .evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight + 1);
  const crumbBox = await q.locator('.outline .scope').boundingBox();
  ok(lastVisible, '바닥 행까지 스크롤 도달');
  ok(crumbBox && crumbBox.y <= 120, `sticky 크럼 — 스크롤해도 머리에 (y=${Math.round(crumbBox.y)})`);
  await ctx2.close();
  await browser.close();
  console.log(process.exitCode ? '검증 실패' : '#42 족보(아웃라인) — 전 시나리오 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
