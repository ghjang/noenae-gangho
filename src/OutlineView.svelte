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
  import { outlineRows, childCounts, parentEdgeOf } from './lib/graph.ts';
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
  const rows = $derived(outlineRows(graph.nodes, graph.edges, scopeNode ? scopeNode.id : null));
  const kidCount = $derived(childCounts(graph.edges));
  const firstLine = (n: NoteNode) => (n.text || t.mdEmptyNode).split('\n')[0]; // 크럼(경로) 전용 — 행은 전문

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
    {#if rows.length === 0}
      <p class="none">{t.emptyTitle}</p>
    {:else}
      <ul>
        {#each rows as r, i (r.node.id + ':' + i)}
          <li style={`--d: ${r.depth}`} class:root={r.depth === 0}>
            {#if !r.revisit && (kidCount.get(r.node.id) ?? 0) > 0}
              <!-- 봉문 삼각형 — collapsed 필드 그 자체: 캔버스 ▸배지·오행진 ▸N과 한 데이터 -->
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
              class:revisit={r.revisit}
              data-id={r.node.id}
              title={t.outlineRowTitle}
              onclick={() => selectNode(r.node.id)}
              ondblclick={() => onJump(r.node)}
            >
              <span class="txt">{r.node.text || t.mdEmptyNode}</span>{#if r.revisit}<span
                  class="cyc"
                  title="↻">&nbsp;↻</span
                >{/if}
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
    padding: 26px 32px 64px;
  }
  .outline .scroll {
    max-width: 880px; /* 행 글줄의 호흡 — 가운데 띄우지 않고 왼쪽에 정박 */
  }
  .outline .scope {
    position: sticky; /* 긴 족보를 내려가도 사다리(크럼)는 머리에 — 길 잃지 않게 */
    top: 0;
    z-index: 1;
    background: var(--hanji); /* 스크롤 시 행이 비쳐 보이지 않게 — 컨테이너 그라데이션 머리색과 동일 */
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 0 14px;
    padding: 10px 6px;
    border-bottom: 1px solid rgba(42, 36, 28, 0.18);
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
    font: 600 18px/1 var(--sans);
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
  .outline .none {
    margin: 8px 0 2px;
    text-align: center;
    font-family: var(--serif);
    color: var(--ink-dim);
  }
</style>
