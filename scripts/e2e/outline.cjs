// 족보(아웃라인 뷰, #42 셋째 식구) 검증 — V 순환 진입/행·깊이/선택·점프/봉문 토글/스코프/영속/검색 필터(#154)
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

  // Space — 봉문/개문 키 토글 (캔버스 C·Space와 일관, #168). 선택 행에 하위가 있을 때만
  await p.locator('.outline button.row', { hasText: '미분' }).click(); // 미분 = 자식 '브로' 있음
  await p.waitForTimeout(150);
  await p.keyboard.press('Space');
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 3, 'Space → 봉문: 후손(브로) 숨음 (행 4→3)');
  await p.keyboard.press('Space');
  await p.waitForTimeout(250);
  ok((await p.locator('.outline button.row').count()) === 4, 'Space 또 → 개문: 행 복원');

  // 더블클릭 = 캔버스 점프 + 그 쪽지 선택 (오행진 카드와 같은 어휘)
  await p.locator('.outline button.row', { hasText: '깨다름' }).dblclick();
  await p.waitForTimeout(400);
  ok((await p.locator('.viewport').count()) === 1, '더블클릭 → 캔버스 점프');
  ok((await p.locator('.node.selected').textContent()).includes('깨다름'), '점프: 그 쪽지가 선택돼 있다');

  // #185 — 선택해 두고 직행(3)은 '전체 족보 + 선택 念 화면 중앙'(1·2와 같은 결, 시야만 비춤)
  await p.locator('.node', { hasText: 'difference' }).click();
  await p.keyboard.press('3'); // 캔버스 → 족보 직행 (전체)
  await p.waitForTimeout(300);
  ok(
    (await p.locator('.outline .scope').count()) === 0 &&
      (await p.locator('.outline button.row').count()) === 4,
    '3 직행 → 전체 족보(4행·스코프 없음)',
  );
  ok(
    (await p.locator('.outline button.row.sel .txt').textContent()).includes('difference'),
    '3 직행 → 선택(difference)이 족보에서도 선택',
  );
  // Shift+3 = 선택 가지로 집중(스코프, Workflowy zoom)
  await p.keyboard.press('Shift+3');
  await p.waitForTimeout(300);
  ok((await p.locator('.outline .scope').count()) === 1, 'Shift+3 → 스코프 배지 등장');
  const sub = await p.$$eval('.outline button.row .txt', (els) => els.map((e) => e.textContent));
  ok(sub.length === 3 && sub[0].includes('difference'), `Shift+3 → 그 가지만 3행 (실측 ${sub.length})`);
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
  await p.keyboard.press('Shift+3'); // 족보 복귀 — 브로 선택 가지로 집중
  await p.waitForTimeout(250);
  ok(
    (await p.locator('.outline .scope').count()) === 1 &&
      (await p.locator('.outline button.row').count()) === 1,
    'Shift+3 재진입 = 선택 가지(잎 하나)로 집중',
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
  await p.keyboard.press('Shift+3'); // 전체에서 미분으로 집중(직행 스코프)
  await p.waitForTimeout(200);
  ok((await p.locator('.outline button.row').count()) === 2, 'Shift+3 집중 — 미분 가지(2행)');
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
  await p.keyboard.press('Shift+3');
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
  await p.keyboard.press('Shift+3'); // 그 가지로 집중
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
  await q.keyboard.press('Shift+3'); // 스코프 — 크럼 등장
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

  // #153 — 스코프 확장(0/Esc) 시 선택 행을 시야로 (캔버스 ensureVisible의 족보판, DESIGN 8장).
  // 깊은 막내 선택 → 3으로 그 잎만(1행, 상단) → 0으로 전체 30행 확장: 선택이 목록 바닥이라
  // 스크롤 밖 → 확장 시 자동으로 시야에 들어와야. (Esc도 같은 applyOutlineScope 문을 지난다)
  await q.setViewportSize({ width: 1280, height: 400 }); // 30행이 확실히 넘치게
  await q.keyboard.press('0'); // 전체로 리셋
  await q.waitForTimeout(200);
  await q.locator('.outline button.row', { hasText: '계보 29' }).click(); // 깊은 막내 (Playwright가 스크롤해 클릭)
  await q.keyboard.press('Shift+3'); // 그 잎만 스코프 (1행, scrollTop 0)
  await q.waitForTimeout(200);
  await q.keyboard.press('0'); // 전체 30행 확장 — 선택(계보 29)은 목록 바닥
  await q.waitForTimeout(250);
  const selBox = await q.locator('.outline button.row.sel').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, ih: window.innerHeight };
  });
  ok(
    selBox.top >= 0 && selBox.bottom <= selBox.ih + 1,
    `#153 0 확장 시 선택 행이 시야 안으로 (top=${Math.round(selBox.top)} bottom=${Math.round(selBox.bottom)} vh=${selBox.ih})`,
  );

  // #183 — 스크롤된 상태에서 Ctrl+F 시 검색바(sticky 머리)가 스크롤포트 꼭대기에 빈틈없이
  // 도킹해야 그 위로 행이 비치지 않는다. 상단 패딩이 머리 위에 26px 틈을 남기던 버그 보초.
  await q.keyboard.press('0'); // 전체 30행 (스코프 해제)
  await q.waitForTimeout(150);
  await q.locator('.outline').evaluate((el) => (el.scrollTop = 300)); // 중간으로 스크롤
  await q.waitForTimeout(120);
  await q.keyboard.press('Control+f');
  await q.waitForTimeout(250);
  const dock = await q.evaluate(() => {
    const out = document.querySelector('.outline').getBoundingClientRect();
    const head = document.querySelector('.outline .head').getBoundingClientRect();
    // 머리 띠 한가운데가 행으로 덮이면(=행이 머리 위로 비침) 버그 — 입력/머리여야 정상
    const mid = document.elementFromPoint(out.left + 120, (head.top + head.bottom) / 2);
    return {
      gap: Math.round(head.top - out.top),
      rowOnTop: !!(mid && mid.closest && mid.closest('button.row')),
    };
  });
  ok(dock.gap <= 1, `#183 Ctrl+F → 검색바 꼭대기에 flush 도킹 (머리 위 틈=${dock.gap}px)`);
  ok(!dock.rowOnTop, '#183 검색바 띠 위로 행이 비치지 않음 (머리가 덮음)');

  // #185 — 3 직행 = 전체 족보 + 선택 행 화면 중앙(스코프 아님), Shift+3만 집중, V 순환도 전체.
  // 긴 족보(30행·뷰포트 400)라 '중앙'을 좌표로 관찰.
  await q.keyboard.press('Escape'); // #183 검색 필터 닫기
  await q.waitForTimeout(120);
  await q.keyboard.press('0'); // 전체
  await q.waitForTimeout(150);
  await q.locator('.outline button.row', { hasText: '계보 20' }).click(); // 중간 깊이 선택
  await q.keyboard.press('1'); // 캔버스로 (선택 가져감)
  await q.waitForTimeout(300);
  await q.keyboard.press('3'); // 다시 족보 — 전체 + 선택 중앙
  await q.waitForTimeout(350);
  const c185 = await q.evaluate(() => {
    const out = document.querySelector('.outline').getBoundingClientRect();
    const sel = document.querySelector('.outline button.row.sel');
    if (!sel) return { rows: 0 };
    const r = sel.getBoundingClientRect();
    return {
      scope: document.querySelectorAll('.outline .scope').length,
      rows: document.querySelectorAll('.outline button.row').length,
      selText: sel.textContent.trim(),
      offFromCenter: Math.abs((r.top + r.bottom) / 2 - (out.top + out.height / 2)),
      vh: out.height,
    };
  });
  ok(c185.scope === 0 && c185.rows === 30, `#185 3 직행 → 전체 족보(30행·스코프 없음, 실측 ${c185.rows})`);
  ok(c185.selText.includes('계보 20'), '#185 3 직행 → 선택(계보 20) 유지·표시');
  ok(
    c185.offFromCenter < c185.vh * 0.25,
    `#185 3 직행 → 선택 행이 화면 중앙 부근 (중앙서 ${Math.round(c185.offFromCenter)}px / vh ${Math.round(c185.vh)})`,
  );
  await q.keyboard.press('Shift+3'); // 그 가지로 집중
  await q.waitForTimeout(250);
  ok((await q.locator('.outline .scope').count()) === 1, '#185 Shift+3 → 집중(스코프)');
  // V 순환 진입도 전체(스코프 아님) — 1·2·3과 일관
  await q.keyboard.press('0'); // 스코프 해제
  await q.waitForTimeout(150);
  await q.locator('.outline button.row', { hasText: '계보 10' }).click();
  await q.keyboard.press('v'); // → 캔버스
  await q.keyboard.press('v'); // → 오행진
  await q.keyboard.press('v'); // → 족보
  await q.waitForTimeout(300);
  ok(
    (await q.locator('.outline .scope').count()) === 0 &&
      (await q.locator('.outline button.row').count()) === 30,
    '#185 V 순환 진입도 전체 족보(스코프 아님)',
  );

  await ctx2.close();

  // ── #154 족보 검색 필터 ── Ctrl+F 인라인 필터: 매칭 ∪ 조상만, 접기 무시(드러내기),
  // <mark> 강조, 접기 멈춤(점만), Enter 캔버스 점프, Esc 비파괴 복원. 텍스트 통제용 별도 시드.
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx3.addInitScript(() => {
    const nodes = [
      { id: 'A', x: 0, y: 0, text: 'apple 사과', color: 'muk' },
      { id: 'B', x: 0, y: 100, text: 'banana 바나나', color: 'cheong', collapsed: true }, // 접힘 — 필터가 무시?
      { id: 'C', x: 0, y: 200, text: 'cherry 체리', color: 'dan' },
      { id: 'D', x: 0, y: 300, text: 'date 대추', color: 'hwang' },
    ];
    const edges = [
      { id: 'e1', a: 'A', b: 'B' },
      { id: 'e2', a: 'B', b: 'C' },
      { id: 'e3', a: 'A', b: 'D' },
    ];
    localStorage.setItem('noenae-gangho-v1', JSON.stringify({ app: 'noenae-gangho', v: 3, nodes, edges }));
  });
  const f = await ctx3.newPage();
  await f.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await f.waitForTimeout(400);
  await f.keyboard.press('Escape');
  await f.keyboard.press('v');
  await f.keyboard.press('v');
  await f.waitForTimeout(300);
  // B가 접혀 있어 평소엔 C 생략 — A·B·D 3행 (봉문 존중)
  ok((await f.locator('.outline button.row').count()) === 3, '필터 전: B 봉문이라 C 숨음 (3행)');

  // Ctrl+F → 인라인 검색 입력 등장
  await f.keyboard.press('Control+f');
  await f.waitForTimeout(200);
  ok((await f.locator('.outline .filter input').count()) === 1, 'Ctrl+F → 족보 검색 입력 등장');

  // 'cherry' → C 매칭 + 조상(A·B) 유지, D 탈락. 접힌 B 속 C도 드러난다(접기 무시)
  await f.locator('.outline .filter input').fill('cherry');
  await f.waitForTimeout(250);
  const ftxt = await f.$$eval('.outline button.row .txt', (els) => els.map((e) => e.textContent));
  ok(
    ftxt.length === 3 &&
      ftxt[0].includes('apple') &&
      ftxt[1].includes('banana') &&
      ftxt[2].includes('cherry'),
    `'cherry' → A>B>C 경로만 (접힌 B 속 C도 드러남, 실측 ${ftxt.length}: ${ftxt})`,
  );
  ok((await f.locator('.outline button.fold').count()) === 0, '필터 중 접기 삼각형 멈춤(모두 점)');
  ok((await f.locator('.outline mark').count()) === 1, '매칭 1건 <mark> 강조');
  ok((await f.locator('.outline mark').first().textContent()) === 'cherry', '<mark> 텍스트 = 질의');

  // 부분 매칭 다건 — 'a'는 apple/banana/date에, cherry엔 없음 → C 탈락
  await f.locator('.outline .filter input').fill('a');
  await f.waitForTimeout(250);
  const atxt = await f.$$eval('.outline button.row .txt', (els) => els.map((e) => e.textContent));
  ok(
    atxt.length === 3 && atxt.some((x) => x.includes('date')) && !atxt.some((x) => x.includes('cherry')),
    `'a' → apple·banana·date (cherry 탈락, 실측 ${atxt.length})`,
  );

  // 매칭 없음 → 행 0 + 안내
  await f.locator('.outline .filter input').fill('zzzznope');
  await f.waitForTimeout(250);
  ok(
    (await f.locator('.outline button.row').count()) === 0 &&
      (await f.locator('.outline .none').count()) === 1,
    '매칭 없음 → 행 0 + 안내',
  );

  // Esc(입력 포커스) → 필터 닫힘 + 봉문 복원(B 다시 접힘 3행 · 삼각형 부활) — 비파괴 증명
  await f.locator('.outline .filter input').fill('cherry');
  await f.waitForTimeout(200);
  await f.keyboard.press('Escape');
  await f.waitForTimeout(200);
  ok((await f.locator('.outline .filter input').count()) === 0, 'Esc → 검색 입력 사라짐');
  ok(
    (await f.locator('.outline button.row').count()) === 3 &&
      (await f.locator('.outline button.fold').count()) >= 1,
    'Esc → 봉문 복원(3행·삼각형 부활) — 필터는 collapsed를 안 건드린다',
  );

  // #190 — 필터도 평소 항법: ↑↓·클릭 = 선택링(빨강) 직접 이동, Enter = 점프. 접힌 가지 속
  // 매칭을 선택해도 검색 중엔 prune이 봉인돼 안 깎인다(골드 커서 폐지).
  await f.keyboard.press('Control+f');
  await f.waitForTimeout(150);
  await f.locator('.outline .filter input').fill('cherry');
  await f.waitForTimeout(200);
  await f.keyboard.press('ArrowDown'); // 첫 매칭(apple) 선택
  await f.waitForTimeout(120);
  ok(
    await f.evaluate(() => document.activeElement?.tagName === 'INPUT'),
    '↓ 후에도 포커스는 검색 입력에 (계속 타이핑 가능)',
  );
  ok(
    (await f.locator('.outline button.row.sel .txt').textContent()) === 'apple 사과',
    '↓ → 첫 매칭이 선택링(빨강) — 골드 아님',
  );
  await f.keyboard.press('ArrowDown'); // banana
  await f.keyboard.press('ArrowDown'); // cherry (접힌 가지 속 매칭)
  await f.waitForTimeout(120);
  ok(
    (await f.locator('.outline button.row.sel .txt').textContent()).includes('cherry') &&
      (await f.locator('.outline button.row.sel').count()) === 1,
    '↓↓↓ → 접힌 매칭 cherry가 선택링 유지 (검색 중 prune 봉인 — 안 깎임)',
  );
  // 클릭도 선택링(빨강), 그리고 클릭 후에도 ↑↓는 필터 항법 유지(포커스 input 복귀)
  await f.locator('.outline button.row', { hasText: 'apple' }).click();
  await f.waitForTimeout(120);
  ok((await f.locator('.outline button.row.sel .txt').textContent()) === 'apple 사과', '클릭 → 선택링(빨강)');
  await f.keyboard.press('ArrowDown'); // apple→banana (필터 항법 유지)
  await f.waitForTimeout(120);
  ok(
    (await f.locator('.outline button.row.sel .txt').textContent()).includes('banana'),
    '클릭 후 ↓ → 필터 항법 유지(다음 매칭 선택)',
  );
  await f.keyboard.press('ArrowDown'); // banana→cherry
  await f.waitForTimeout(120);
  await f.keyboard.press('Enter');
  await f.waitForTimeout(400);
  ok((await f.locator('.viewport').count()) === 1, 'Enter → 캔버스 점프');
  ok(
    (await f.locator('.node.selected').first().textContent()).includes('cherry'),
    '점프: cherry 쪽지 선택(접힌 B 개문돼 드러남)',
  );

  await ctx3.close();
  await browser.close();
  console.log(process.exitCode ? '검증 실패' : '#42 족보(아웃라인) — 전 시나리오 통과');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
