<script>
  // ──────────────────────────────────────────────
  // 오행진(五行陣) — 색별 종대 칸반 (#42 + #111 항법 + #105 경량 편집).
  // 단일 컴포넌트 원칙의 첫 분리: 캔버스(App)와 형제, 표현만 다르다.
  // 데이터 불변 — 노드/緣/좌표는 그대로, 정렬은 y→x
  // (캔버스에서 위에 둔 쪽지가 여기서도 위 — 무연결 쪽지의 순서 규칙).
  // 조작: 클릭=선택, 더블클릭=캔버스 점프(onJump), ↑↓←→/Tab/Enter 항법과
  // 경량 편집(팔레트 칠하기·Ctrl+←→ 색 이동·Delete 베기·+ 추가)은 App 키 경로가
  // 캔버스 변이 함수를 재사용 — 보드 전용 변이 경로는 두지 않는다. 緣·배치는 캔버스 몫
  // ──────────────────────────────────────────────
  import { crossfade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { graph, ui, COLORS, selectNode } from './lib/store.svelte.ts';
  import { STRINGS } from './lib/strings.ts';
  import { boardColumns, childCounts } from './lib/graph.ts';

  let { onJump, hue = null } = $props(); // hue: 빈손 팔레트 호버 색 — 캔버스 '같은 색 비추기'의 보드 번역
  // 앵커 카드의 색 — 그 종대 머리 동그라미에 팔레트식 .cur 링 (키 항법의 나침반)
  const selColor = $derived(graph.nodes.find((n) => n.id === ui.selectedId)?.color);
  // 색을 갈아입으면 카드가 옛 종대에서 새 종대로 날아간다(crossfade) —
  // 같은 종대 안 자리 이동은 flip. 첫 등장은 무음(fallback 0ms): 진열이 아니라 이동만 연출
  const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [send, receive] = crossfade({ duration: REDUCED ? 0 : 280, fallback: () => ({ duration: 0 }) });
  const t = $derived(STRINGS[ui.tone]);
  const kidCount = $derived(childCounts(graph.edges)); // 접힌 카드의 ▸N 배지용 — 캔버스와 같은 표기
  // 봉문은 오행진에서도 존중 — '치웠다'는 의지는 뷰를 가리지 않는다 (집중은 캔버스 전용).
  // 진형(색별 y→x)은 boardColumns — App의 키보드 항법(#111)과 같은 한 벌
  const cols = $derived(boardColumns(graph.nodes, graph.edges, COLORS).map((ns, i) => [COLORS[i], ns]));
</script>

<div class="board" role="region" aria-label={t.viewKanbanAria}>
  {#each cols as [c, nodes] (c)}
    <section class="col" class:cur={c === selColor} class:fade={hue && c !== hue}>
      <!-- 색명 글자는 떼고 동그라미가 곧 라벨 — 오행에선 색이 의미다 (이름은 툴팁·보조기기 몫) -->
      <h3 title={t.colorLabel[c]}>
        <i
          class:cur={c === selColor}
          style={`background: var(--c-${c})`}
          role="img"
          aria-label={t.colorLabel[c]}
        ></i><em>{nodes.length}</em>
      </h3>
      <div class="cards">
        {#each nodes as n (n.id)}
          <button
            class="card"
            class:sel={ui.selectedIds.includes(n.id)}
            data-color={n.color}
            data-id={n.id}
            title={t.boardCardTitle}
            animate:flip={{ duration: REDUCED ? 0 : 220 }}
            in:receive={{ key: n.id }}
            out:send={{ key: n.id }}
            onclick={() => selectNode(n.id)}
            ondblclick={() => onJump(n)}
            ><span class="txt">{n.text || t.mdEmptyNode}</span
            >{#if n.collapsed && (kidCount.get(n.id) ?? 0) > 0}<i class="fold" title={t.foldBadgeTitle}
                >▸{kidCount.get(n.id)}</i
              >{/if}</button
          >
        {/each}
        {#if nodes.length === 0}<p class="none">—</p>{/if}
      </div>
    </section>
  {/each}
</div>
