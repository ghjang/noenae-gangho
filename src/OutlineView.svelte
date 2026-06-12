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
  import { graph, ui, selectNode, toggleCollapse, byId } from './lib/store.svelte.ts';
  import { STRINGS, fmt } from './lib/strings.ts';
  import { outlineRows, childCounts } from './lib/graph.ts';
  import type { NoteNode } from './lib/types.ts';

  let {
    onJump,
    rootId = null,
    onScopeClear,
  }: { onJump: (n: NoteNode) => void; rootId?: string | null; onScopeClear: () => void } = $props();

  const t = $derived(STRINGS[ui.tone]);
  // 스코프 뿌리가 베여 사라졌으면 전체로 폴백 (rootId는 진입 시점 포착 — 살아있을 때만 유효)
  const scopeNode = $derived(rootId ? byId(rootId) : undefined);
  const rows = $derived(outlineRows(graph.nodes, graph.edges, scopeNode ? scopeNode.id : null));
  const kidCount = $derived(childCounts(graph.edges));
  const firstLine = (n: NoteNode) => (n.text || t.mdEmptyNode).split('\n')[0];
  const multiline = (n: NoteNode) => n.text.includes('\n');
</script>

<div class="outline" role="region" aria-label={t.viewOutlineAria}>
  <div class="scroll">
    {#if scopeNode}
      <div class="scope">
        <span>{fmt(t.outlineScope, { label: firstLine(scopeNode) })}</span>
        <button onclick={onScopeClear}>{t.outlineScopeAll}</button>
      </div>
    {/if}
    {#if rows.length === 0}
      <p class="none">{t.emptyTitle}</p>
    {:else}
      <ul>
        {#each rows as r, i (r.node.id + ':' + i)}
          <li style={`--d: ${r.depth}`}>
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
              <span class="txt">{firstLine(r.node)}</span
              >{#if multiline(r.node) && !r.revisit}<span class="more" aria-hidden="true">⋯</span
                >{/if}{#if r.revisit}<span class="cyc" title="↻">&nbsp;↻</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
