<script>
  // ──────────────────────────────────────────────
  // 오행진(五行陣) — 색별 종대 칸반 (#42 v1, 읽기 전용).
  // 단일 컴포넌트 원칙의 첫 분리: 캔버스(App)와 형제, 표현만 다르다.
  // 데이터 불변 — 노드/緣/좌표는 그대로, 정렬은 y→x
  // (캔버스에서 위에 둔 쪽지가 여기서도 위 — 무연결 쪽지의 순서 규칙).
  // 편집·색칠·삭제는 캔버스 몫: 카드 클릭=선택, 두 번=강호의 그 자리로 점프(onJump).
  // ──────────────────────────────────────────────
  import { crossfade } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import { graph, ui, COLORS, selectNode } from './lib/store.svelte.js'
  import { STRINGS } from './lib/strings.js'
  import { computeHidden } from './lib/graph.js'

  let { onJump } = $props()
  // 색을 갈아입으면 카드가 옛 종대에서 새 종대로 날아간다(crossfade) —
  // 같은 종대 안 자리 이동은 flip. 첫 등장은 무음(fallback 0ms): 진열이 아니라 이동만 연출
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [send, receive] = crossfade({ duration: REDUCED ? 0 : 280, fallback: () => ({ duration: 0 }) })
  const t = $derived(STRINGS[ui.tone])
  // 봉문은 오행진에서도 존중 — '치웠다'는 의지는 뷰를 가리지 않는다 (집중은 캔버스 전용)
  const hidden = $derived(computeHidden(graph.nodes, graph.edges))
  const cols = $derived(
    COLORS.map((c) => [
      c,
      graph.nodes
        .filter((n) => n.color === c && !hidden.has(n.id))
        .sort((p, q) => p.y - q.y || p.x - q.x),
    ])
  )
</script>

<div class="board" role="region" aria-label={t.viewKanbanAria}>
  {#each cols as [c, nodes] (c)}
    <section class="col">
      <h3><i style={`background: var(--c-${c})`}></i>{t.colorLabel[c]}<em>{nodes.length}</em></h3>
      <div class="cards">
        {#each nodes as n (n.id)}
          <button
            class="card"
            class:sel={ui.selectedIds.includes(n.id)}
            data-color={n.color}
            title={t.boardCardTitle}
            animate:flip={{ duration: REDUCED ? 0 : 220 }}
            in:receive={{ key: n.id }}
            out:send={{ key: n.id }}
            onclick={() => selectNode(n.id)}
            ondblclick={() => onJump(n)}
          >{n.text || t.mdEmptyNode}</button>
        {/each}
        {#if nodes.length === 0}<p class="none">—</p>{/if}
      </div>
    </section>
  {/each}
</div>
