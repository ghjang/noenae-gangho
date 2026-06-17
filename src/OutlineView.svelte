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
  const firstLine = (n: NoteNode) => (n.text || t.mdEmptyNode).split('\n')[0];
  const multiline = (n: NoteNode) => n.text.includes('\n');

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
              <span class="txt">{firstLine(r.node)}</span>{#if multiline(r.node) && !r.revisit}<span
                  class="more"
                  aria-hidden="true">⋯</span
                >{/if}{#if r.revisit}<span class="cyc" title="↻">&nbsp;↻</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
