<script lang="ts">
  // ──────────────────────────────────────────────
  // 족보(族譜) — 트리 아웃라인 뷰 (#42 셋째 식구).
  // 렌즈 질문: "이 가지(또는 강호)를 위계로 읽으면 어떤 글인가".
  // 비급.md(toMarkdown)와 같은 순회 율법(graph.outlineRows)의 화면판 —
  // 마크다운 텍스트를 거치지 않고 트리를 직접 행 목록으로 그린다.
  // 재방문(순환·다중 부모)은 ↻ 한 줄, 봉문 삼각형은 collapsed 필드 그 자체(뷰 동기 공짜).
  // rootId가 있으면 그 가지만(스코프 — 진입 시점의 선택, Workflowy zoom 국룰).
  // 행 클릭=선택 · 더블클릭=캔버스 점프 · ▸/▾=봉문 토글(캔버스 변이 재사용) — 그 외 편집은 본진 몫
  // ──────────────────────────────────────────────
  import { tick, untrack } from 'svelte';
  import { graph, ui, selectNode, toggleCollapse, byId, setOutlineScope } from './lib/store.svelte.ts';
  import { STRINGS } from './lib/strings.ts';
  import { outlineRows, outlineFilterRows, childCounts, parentEdgeOf } from './lib/graph.ts';
  import type { NoteNode } from './lib/types.ts';

  let {
    onJump,
    rootId = null,
    onScopeClear,
  }: { onJump: (n: NoteNode) => void; rootId?: string | null; onScopeClear: () => void } = $props();

  const t = $derived(STRINGS[ui.tone]);
  // 스코프 뿌리가 베여 사라졌으면 전체로 폴백 (rootId는 진입 시점 포착 — 살아있을 때만 유효)
  const scopeNode = $derived(rootId ? byId(rootId) : undefined);
  // 크럼 = 구조적 조상 경로 (온 길이 아니라 '있는 자리' — 브레드크럼 정석. 직행 조준에도
  // 조상이 전부 보인다. 첫 부모 신장 트리 — 행 순회와 같은 율법, 순환 가드)
  const crumbs = $derived.by(() => {
    const out: NoteNode[] = [];
    const seen = new Set<string>();
    let pe = scopeNode ? parentEdgeOf(graph.edges, scopeNode.id) : null;
    while (pe) {
      const p = byId(pe.a);
      if (!p || seen.has(p.id)) break;
      seen.add(p.id);
      out.unshift(p);
      pe = parentEdgeOf(graph.edges, p.id);
    }
    return out;
  });
  // ── 검색 필터 (#154) — Ctrl+F로 열고(openSearch) Esc로 닫는다(closeSearch). 비파괴 오버레이:
  // 질의가 있으면 collapsed를 무시하고 매칭 ∪ 조상만 드러낸다(outlineFilterRows) — 접기 상태는
  // 읽지도 쓰지도 않아 닫으면 원래 족보 복원. 닫힘=null, 열림·빈질의=''(전체), 질의 있으면 필터.
  let query = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  const q = $derived(query?.trim() ?? '');
  const filtering = $derived(q !== '');
  const rows = $derived(
    filtering
      ? outlineFilterRows(graph.nodes, graph.edges, scopeNode ? scopeNode.id : null, q)
      : outlineRows(graph.nodes, graph.edges, scopeNode ? scopeNode.id : null),
  );
  // 필터 중 키보드 커서 — 선택(ui.selectedId)과 분리한다: 접힌 가지 속 매칭을 선택하면
  // store의 봉문 가지치기($effect의 pruneSelection)가 곧장 깎아버리기 때문(캔버스 검색이
  // searchIdx로 결과를 가리키되 점프할 때만 선택하는 것과 같은 결). activeRowId는 늘 유효한
  // 커서 — 질의가 바뀌면 첫 매칭으로 떨어진다. Enter가 점프할 표적이자 골드 링의 자리
  let activeId = $state<string | null>(null);
  const activeRowId = $derived.by(() => {
    if (!filtering) return null;
    const nav = rows.filter((r) => !r.revisit);
    if (activeId && nav.some((r) => r.node.id === activeId)) return activeId;
    return nav.length ? nav[0].node.id : null;
  });
  const kidCount = $derived(childCounts(graph.edges));
  const firstLine = (n: NoteNode) => (n.text || t.mdEmptyNode).split('\n')[0]; // 크럼(경로) 전용 — 행은 전문

  // 셸(App)의 Ctrl+F가 부른다 — 이미 열려 있으면 질의 유지 + 전체 선택(찾기 관행)
  export function openSearch() {
    if (query === null) query = '';
    tick().then(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }
  // 셸의 단계식 Esc도 부른다 — 열려 있었으면 닫고 true(그 Esc는 거기서 멈춤, 스코프 팝은 다음)
  export function closeSearch(): boolean {
    if (query === null) return false;
    query = null;
    activeId = null;
    return true;
  }
  // 셸의 3(전체 족보 직행)이 부른다 — 선택 행을 화면 중앙으로(#185). 캔버스 centerOn의 족보판.
  // 선택은 봉문 가지치기(App $effect)를 이미 통과했으니(숨은 念은 선택 못 함) 전체 족보에 늘
  // 행이 있다 — 개문 없이 스크롤만. 'center'로 가운데, 짧아 안 넘치면 자연히 무동작
  export function centerSelected() {
    const id = ui.selectedId;
    if (!id) return;
    tick().then(() =>
      document
        .querySelector(`.outline button.row[data-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'center' }),
    );
  }
  // 검색창 키 — ↑↓ 필터 커서(골드 링) 순회(포커스는 input에 둔 채 커서만 이동·시야로),
  // Enter 캔버스 점프, Esc 닫기. 포커스가 input에 있어 전역 라우터는 inField로 비켜선다(이중 처리 없음)
  function onFilterKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation(); // 전역 Esc(단계식)가 같은 키로 또 동작하지 않게
      closeSearch();
      return;
    }
    const nav = rows.filter((r) => !r.revisit); // 재방문(↻) 행은 항법에서 건너뛴다
    if (!nav.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = Math.max(
        0,
        nav.findIndex((r) => r.node.id === activeRowId),
      ); // 커서 자리(없으면 0)
      const ni = (cur + (e.key === 'ArrowDown' ? 1 : -1) + nav.length) % nav.length; // 양끝 순환
      activeId = nav[ni].node.id;
      tick().then(() =>
        document
          .querySelector(`.outline button.row[data-id="${CSS.escape(nav[ni].node.id)}"]`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cur = nav.find((r) => r.node.id === activeRowId) ?? nav[0];
      if (cur) onJump(cur.node); // 캔버스로 점프(개문+선택+중앙) — 캔버스 검색 Enter와 같은 결
    }
  }
  // 매칭 텍스트를 질의 기준으로 토막 — <mark> 강조용(대소문자 무시, 모든 출현). 자른 조각을
  // 이으면 원문과 동일(highlight.ts 토크나이저와 같은 불변식)
  function segs(text: string, needle: string): { s: string; hit: boolean }[] {
    if (!needle) return [{ s: text, hit: false }];
    const out: { s: string; hit: boolean }[] = [];
    const low = text.toLowerCase();
    let i = 0;
    for (;;) {
      const j = low.indexOf(needle, i);
      if (j < 0) {
        if (i < text.length) out.push({ s: text.slice(i), hit: false });
        break;
      }
      if (j > i) out.push({ s: text.slice(i, j), hit: false });
      out.push({ s: text.slice(j, j + needle.length), hit: true });
      i = j + needle.length;
    }
    return out;
  }

  // 스코프가 바뀌면(0/Esc 확장·크럼·3 조준) 선택 앵커 행을 시야로 끌어온다 —
  // 캔버스 ensureVisible의 족보판(보기를 바꿔도 작업 대상은 시야에, DESIGN 8장).
  // 스코프 확장이 세로로 길면 선택이 스크롤 밖으로 밀려 길을 잃던 버그(#153) 봉합.
  // rootId만 추적(선택 이동엔 무반응 — 클릭/항법은 이미 제 시야, focusRow 몫), focus()는
  // 안 건드림(키보드 포커스 도둑질 방지 — 스크롤만). 'nearest' = 이미 보이면 무동작
  $effect(() => {
    void rootId; // 스코프 변경에만 반응 (값은 안 쓰고 의존성만 등록)
    const id = untrack(() => ui.selectedId);
    if (!id) return;
    tick().then(() => {
      document
        .querySelector(`.outline button.row[data-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  });
</script>

<div class="outline" role="region" aria-label={t.viewOutlineAria}>
  <div class="scroll">
    {#if query !== null || scopeNode}
      <!-- sticky 머리 — 검색 필터 + 스코프 크럼을 한 데 (스크롤해도 머리에, #154) -->
      <div class="head">
        {#if query !== null}
          <!-- 인라인 검색 필터 (#154) — 입력에 따라 매칭 ∪ 조상만 남는다(접기 무시) -->
          <div class="filter">
            <input
              bind:this={inputEl}
              type="text"
              aria-label={t.searchPlaceholder}
              placeholder={t.searchPlaceholder}
              value={query}
              oninput={(e) => (query = e.currentTarget.value)}
              onkeydown={onFilterKey}
            />
          </div>
        {/if}
        {#if scopeNode}
          <!-- 조상 경로 브레드크럼 — 全 › 조상들 › 현재 가지. 조상 클릭 = 그 가지로 -->
          <nav class="scope" aria-label={t.outlineCrumbsAria}>
            <button class="crumb" onclick={onScopeClear}>{t.outlineCrumbAll}</button>
            {#each crumbs as a (a.id)}
              <span class="sep" aria-hidden="true">›</span>
              <button class="crumb" onclick={() => setOutlineScope(a.id)}>{firstLine(a)}</button>
            {/each}
            <span class="sep" aria-hidden="true">›</span>
            <span class="cur">{firstLine(scopeNode)}</span>
          </nav>
        {/if}
      </div>
    {/if}
    {#if rows.length === 0}
      <p class="none">{filtering ? t.searchEmpty : t.emptyTitle}</p>
    {:else}
      <ul>
        {#each rows as r, i (r.node.id + ':' + i)}
          <li style={`--d: ${r.depth}`} class:root={r.depth === 0}>
            {#if !filtering && !r.revisit && (kidCount.get(r.node.id) ?? 0) > 0}
              <!-- 봉문 삼각형 — collapsed 필드 그 자체: 캔버스 ▸배지·오행진 ▸N과 한 데이터.
                   검색 중엔 접기를 멈추고(filtering) 점으로: 필터는 '드러내기'라 접기와 모순 (#154) -->
              <button
                class="fold"
                title={t.foldBadgeTitle}
                aria-label={t.foldBadgeAria}
                style={`color: var(--c-${r.node.color})`}
                onclick={() => toggleCollapse(r.node.id)}>{r.node.collapsed ? '▸' : '▾'}</button
              >
            {:else}
              <i class="dot" style={`background: var(--c-${r.node.color})`} aria-hidden="true"></i>
            {/if}
            <button
              class="row"
              class:sel={!r.revisit && ui.selectedIds.includes(r.node.id)}
              class:active={r.node.id === activeRowId}
              class:revisit={r.revisit}
              data-id={r.node.id}
              title={t.outlineRowTitle}
              onclick={() => (filtering ? (activeId = r.node.id) : selectNode(r.node.id))}
              ondblclick={() => onJump(r.node)}
            >
              <span class="txt"
                >{#if r.match}{#each segs(r.node.text, q.toLowerCase()) as g}{#if g.hit}<mark>{g.s}</mark
                      >{:else}{g.s}{/if}{/each}{:else}{r.node.text || t.mdEmptyNode}{/if}</span
              >{#if r.revisit}<span class="cyc" title="↻">&nbsp;↻</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  /* ── 족보(族譜) — 트리 아웃라인 뷰 (#42 셋째 식구) ──
   두루마리를 활짝 편다 — 뷰 영역 전체가 한지, 트리는 좌측 정박 (사용자 결).
   중앙 부유 카드(테두리+그림자)는 면 위계상 '시트(팝업)'의 어휘라 뷰엔 부적격 */
  .outline {
    position: absolute;
    inset: var(--bar-h) 0 0 0;
    overflow-y: auto;
    background: linear-gradient(173deg, var(--hanji), var(--hanji-2));
    color: var(--ink);
    /* 상단 패딩 0 — sticky 머리(검색/크럼)가 스크롤포트 꼭대기에 빈틈없이 도킹하게.
       패딩을 주면 sticky top:0이 콘텐츠 박스(패딩 아래)에 붙어, 그 위 패딩 띠로 스크롤된
       행이 머리 위로 비쳐 보였다(#183). 상단 숨은 머리 없을 때만 첫 콘텐츠에 따로 준다 */
    padding: 0 32px 64px;
  }
  .outline .scroll {
    max-width: 880px; /* 행 글줄의 호흡 — 가운데 띄우지 않고 왼쪽에 정박 */
  }
  /* 머리(검색 필터·스코프 크럼)가 없을 때만 상단 숨 — 있으면 머리가 꼭대기에 flush 도킹(#183) */
  .outline .scroll > ul:first-child,
  .outline .scroll > .none:first-child {
    padding-top: 26px;
  }
  /* sticky 머리 — 검색 필터 + 스코프 크럼을 한 데 묶는다 (#154). 둘 다 top:0 sticky라
     따로 두면 충돌(겹침) — 한 머리로 묶어 한 줄의 구분선·여백을 공유 */
  .outline .head {
    position: sticky; /* 긴 족보를 내려가도 검색창·사다리(크럼)는 머리에 — 길 잃지 않게 */
    top: 0;
    z-index: 1;
    background: var(--hanji); /* 스크롤 시 행이 비쳐 보이지 않게 — 컨테이너 그라데이션 머리색과 동일 */
    margin: 0 0 14px;
    border-bottom: 1px solid rgba(42, 36, 28, 0.18);
  }
  .outline .filter {
    padding: 10px 6px;
  }
  .outline .filter input {
    width: 100%;
    box-sizing: border-box;
    font: 14px var(--sans);
    color: var(--ink);
    background: var(--hanji-2);
    border: 1px solid rgba(42, 36, 28, 0.3);
    border-radius: 8px;
    padding: 8px 12px;
  }
  .outline .filter input::placeholder {
    color: var(--ink-dim);
  }
  .outline .filter input:focus-visible {
    outline: 2px solid var(--c-hwang); /* 조준 금테 — 행/카드 포커스와 같은 어휘 */
    outline-offset: 0;
    border-color: transparent;
  }
  .outline .scope {
    /* sticky·배경·여백·구분선은 .head로 — 필터 바와 한 머리(#154) */
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 10px;
    font: 12.5px var(--sans); /* 행 본문과 같은 산세리프 — 명조/고딕 뒤섞임 정리 (사용자 제보) */
    color: var(--ink-dim);
  }
  .outline .scope .sep {
    flex: none;
    opacity: 0.55;
  }
  .outline .scope .cur {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    color: var(--ink); /* 현재 가지 — 크럼 끝, 또렷하게 */
  }
  .outline .scope button.crumb {
    flex: none;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 600 12px/1 var(--sans);
    color: var(--ink);
    background: rgba(42, 36, 28, 0.06);
    border: 1px solid rgba(42, 36, 28, 0.25);
    border-radius: 999px; /* 알약 — 머릿수 칩·팔레트와 같은 결 */
    padding: 5px 11px;
    cursor: var(--cursor-pointer), pointer;
  }
  .outline .scope button.crumb:hover {
    background: rgba(42, 36, 28, 0.12);
  }
  .outline button.row:focus-visible {
    outline: 3px solid var(--c-hwang); /* 조준 금테 — 보드 카드와 같은 어휘 (.sel 인주가 이긴다) */
    outline-offset: 0;
  }
  .outline ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .outline li {
    display: flex;
    align-items: flex-start; /* 멀티라인 행에서 배지/점이 첫 줄에 붙게 (전문 표시, #173) */
    gap: 7px;
    padding-left: calc(var(--d) * 20px); /* 깊이 들여쓰기 — 행=쪽지, 열=깊이 (비급.md와 같은 격자 감각) */
    /* 들여쓰기 가이드 선 (IDE 트리 국룰) — 조상 열(20px 단위)마다 중앙에 옅은 세로선:
     같은 깊이의 잎/가지가 누구 밑인지 선으로 읽힌다 (x 정렬만으론 부족 — 사용자 제보) */
    background-image: repeating-linear-gradient(
      to right,
      transparent 0 9.5px,
      rgba(42, 36, 28, 0.14) 9.5px 10.5px,
      transparent 10.5px 20px
    );
    background-size: calc(var(--d) * 20px) 100%;
    background-repeat: no-repeat;
  }
  /* 무관한 무리(뿌리 다른 트리) 사이 호흡 — 간격 + 얇은 먹선. 깊이 0 행이 곧 무리 머리,
   :not(:first-child)로 '2개 사이에만'(첫 무리 위엔 없음). 가이드 세로선(0.14)보다 한 끗
   진한 0.2로 무리 경계를 위계보다 또렷이. 스코프 모드는 뿌리가 하나라 자연 무영향
   (#142, 사용자 발의 — 간격만으론 구분이 약해 구분선 동반) */
  .outline li.root:not(:first-child) {
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px solid rgba(42, 36, 28, 0.2);
  }
  .outline .dot {
    flex: none;
    width: 9px;
    height: 9px;
    margin: 8px 5.5px 0; /* 점(9px)도 삼각형(20px)과 같은 거터 폭 — 잎/가지 행의 글줄 x를 맞춰 위계 헛읽힘 방지. 위 8px = 첫 줄 세로 중앙 */
    border-radius: 50%;
    border: 1px solid rgba(42, 36, 28, 0.35); /* 한지 위 오행 점 — 먹 점도 또렷 */
  }
  .outline button.fold {
    flex: none;
    width: 20px;
    height: 23px; /* 행 첫 줄 높이 — 글리프를 그 안에서 세로 중앙 (멀티라인 행 대응) */
    margin-top: 2px; /* 행 padding-top(2px) 보정 → 첫 줄 세로 중앙 */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    /* 삼각형을 잎 오행 점(9px)과 시각 무게 맞춤 — 너무 작아 색 인지가 약하던 것 키움 (#174 후속) */
    font: 600 20px/1 var(--sans);
    /* 색은 인라인 style로 그 노드의 오행색 — 가지 노드도 색을 잃지 않게 (#174) */
    background: none;
    border: none;
  }
  .outline button.row {
    flex: 1;
    min-width: 0;
    text-align: left;
    font: 13.5px/1.7 var(--sans);
    color: var(--ink);
    background: none;
    border: none;
    border-radius: 4px;
    padding: 2px 6px;
    display: flex;
    align-items: baseline;
    cursor: var(--cursor-pointer), pointer;
  }
  .outline button.row:hover {
    background: rgba(42, 36, 28, 0.07);
  }
  .outline button.row.sel {
    outline: 2px solid var(--inju); /* 낙관 — 카드/쪽지 선택 링과 같은 어휘 */
    outline-offset: 0;
  }
  .outline button.row.active {
    /* 필터 키보드 커서 — 골드 링(조준). 행 :focus-visible과 같은 어휘지만 포커스는 input에
       있으니 이 클래스가 커서를 그린다. .sel(인주)과 겹치면 인주가 이긴다(아래 순서) */
    outline: 2px solid var(--c-hwang);
    outline-offset: 0;
  }
  .outline button.row.active.sel {
    outline-color: var(--inju); /* 선택과 커서가 한 행이면 낙관(선택)을 우선 */
  }
  .outline button.row .txt {
    flex: 1;
    min-width: 0;
    white-space: pre-wrap; /* 전문 표시 — 줄바꿈 보존 + 자동 줄바꿈 (족보 = 읽기 렌즈, #173) */
    overflow-wrap: anywhere; /* 끊을 데 없는 긴 문자열도 가로 넘침 없이 */
  }
  .outline button.row.revisit {
    color: var(--ink-dim); /* 재방문(순환·다중 부모) — 본문은 위에 이미 한 번 */
  }
  .outline button.row .cyc {
    color: var(--inju);
  }
  .outline mark {
    /* 한지에 스민 치자빛 형광 — 검색 매칭 강조 (#154, 보드 카드 색섞임과 같은 어휘) */
    background: color-mix(in srgb, var(--c-hwang) 38%, var(--hanji));
    color: var(--ink);
    border-radius: 2px;
    padding: 0 1px;
  }
  .outline .none {
    margin: 8px 0 2px;
    text-align: center;
    font-family: var(--serif);
    color: var(--ink-dim);
  }
</style>
