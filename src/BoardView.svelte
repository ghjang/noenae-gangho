<script lang="ts">
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
  import type { Color, NoteNode } from './lib/types.ts';

  // hue: 빈손 팔레트 호버 색 — 캔버스 '같은 색 비추기'의 보드 번역
  let { onJump, hue = null }: { onJump: (n: NoteNode) => void; hue?: Color | null } = $props();
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
  const cols = $derived(
    boardColumns(graph.nodes, graph.edges, COLORS).map((ns, i): [Color, NoteNode[]] => [COLORS[i], ns]),
  );
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

<style>
  /* ── 오행진(五行陣) — 색별 종대 칸반 (#42 + #111 항법 + #105 경량 편집) ── */
  .board {
    position: absolute;
    inset: var(--bar-h) 0 0 0;
    display: flex;
    gap: 12px;
    padding: 16px;
    overflow-x: auto;
    background: var(--muk-void);
  }
  .board .col {
    flex: 1 0 200px;
    max-width: 320px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* 허공보다 한 단 또렷이 띄운 단(壇) — 허연 외곽선 대신 먹빛 베젤: 어두운 윤곽 +
     안쪽 미광 림 + 윗변 하이라이트(위 광원)로 입체를 새긴다. 바디(.cards)는
     우물처럼 파서 머리(갓돌)와 바닥이 명암으로 갈린다 */
    background: color-mix(in srgb, var(--panel) 86%, var(--hanji));
    border: 1px solid rgba(0, 0, 0, 0.55);
    border-radius: 8px;
    box-shadow:
      inset 0 1px 0 rgba(242, 233, 214, 0.14),
      inset 0 0 0 1px rgba(242, 233, 214, 0.06),
      0 10px 24px -12px rgba(0, 0, 0, 0.8);
  }
  .board .col.cur {
    /* 선택 카드가 머무는 종대 — 한 단 더 솟는다: 밝아지고, 들리고, 그림자가 깊어진다 */
    background: color-mix(in srgb, var(--panel) 76%, var(--hanji));
    box-shadow:
      inset 0 1px 0 rgba(242, 233, 214, 0.2),
      inset 0 0 0 1px rgba(242, 233, 214, 0.1),
      0 18px 34px -14px rgba(0, 0, 0, 0.95);
    translate: 0 -3px;
  }
  .board .col.fade {
    opacity: 0.4;
  } /* 빈손 팔레트 호버 — 그 색 종대만 또렷 (캔버스 .fade와 같은 어휘) */
  @media (prefers-reduced-motion: no-preference) {
    .board .col {
      transition:
        translate 0.18s ease,
        box-shadow 0.18s ease,
        background 0.18s ease,
        opacity 0.18s ease;
    }
  }
  .board .col h3 {
    margin: 0;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font: 600 13px var(--serif);
    color: var(--hanji);
    background: rgba(242, 233, 214, 0.07); /* 머리는 갓 한 톤 — 단의 갓돌 */
    border-radius: 7px 7px 0 0; /* 부모 8px 모서리의 안쪽 결 */
    border-bottom: 1px solid rgba(0, 0, 0, 0.4); /* 갓돌과 우물 사이 — 어두운 홈 */
  }
  .board .col h3 i {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid rgba(242, 233, 214, 0.4); /* 팔레트 점과 같은 한지빛 테 — 먹 동그라미도 어둠에서 또렷 */
  }
  .board .col h3 i.cur {
    /* 선택한 카드가 머무는 종대 — 팔레트 .cur(붓 색 링)과 같은 어휘 */
    border-color: var(--hanji);
    box-shadow: 0 0 0 2px var(--paper-dim);
  }
  .board .col h3 em {
    margin-left: auto;
    /* 머릿수 칩 — 명조 숫자(없어 보임)는 퇴역, 본문과 같은 산세리프 + 우물에 맞춘 파인 알약 */
    font: 600 11px/1 var(--sans);
    font-style: normal;
    font-variant-numeric: tabular-nums;
    color: var(--paper-dim);
    background: rgba(0, 0, 0, 0.28);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
    padding: 3px 8px;
    border-radius: 999px;
  }
  .board .cards {
    padding: 10px;
    overflow-y: auto;
    min-height: 0; /* 플렉스 자식 스크롤의 그 규칙 — 없으면 카드가 종대 밖으로 유출 (도움말 시트와 같은 함정) */
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* 안으로 파인 우물 — 윗변 안그림자가 갓돌(머리) 밑에 깊이를 판다 */
    background: rgba(0, 0, 0, 0.16);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.3);
    border-radius: 0 0 7px 7px;
    flex: 1; /* 카드가 적어도 우물 바닥이 종대 끝까지 — 파임이 토막나지 않게 */
  }
  .board .card {
    flex: none; /* 수축 금지 — 안 그러면 카드가 짜부되며 '다 들어간 척'한다 (스크롤 불발의 진범) */
    text-align: left;
    font: 13px/1.45 var(--sans);
    color: var(--ink);
    background: linear-gradient(173deg, var(--hanji), var(--hanji-2));
    border: 1px solid rgba(42, 36, 28, 0.35);
    /* 오행 띠 — 캔버스 쪽지와 같은 어휘·같은 7px. 단 한지 '안쪽'에 박는다(인셋):
     테두리 밖에 두면 먹 띠가 어두운 종대 바닥에 묻혀 증발한다 (사용자 제보).
     들림 그림자는 캔버스 쪽지의 어휘를 축소 계승 — 우물 바닥에서 종이가 떠 보이게 */
    box-shadow:
      inset 7px 0 0 var(--c, var(--c-muk)),
      0 1px 0 rgba(0, 0, 0, 0.35),
      0 5px 12px -6px rgba(0, 0, 0, 0.55);
    border-radius: 4px;
    padding: 11px 12px 11px 19px; /* 좌측 = 12 + 띠 7 */
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: var(--cursor-pointer), pointer;
  }
  .board .card .txt {
    flex: 1;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 4; /* 긴 메모는 4줄 갈무리 — 전문은 캔버스에서 */
    line-clamp: 4; /* 표준 짝 — svelte-check 호환 경고 억제 (동작은 -webkit가 담당) */
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .board .card .fold {
    flex: none;
    font-style: normal;
    font-size: 11px;
    color: var(--ink-dim); /* 캔버스의 ▸N 봉문 배지와 같은 어휘 — 카드에선 정보 표기만 */
  }
  /* Tab 조준(포커스)과 선택 — 같은 기하의 링 두 벌: 조준은 황금, 낙관(선택)은 인주.
   브라우저 기본 흰 테 퇴출. 선택 규칙이 뒤에 와서 '조준+선택'이 겹치면 인주가 이긴다 —
   Enter 1타(조준 카드 선택)에 금테가 인주로 갈아입는 연출이 공짜 */
  .board .card:focus-visible {
    outline: 3px solid var(--c-hwang);
    outline-offset: 1px;
  }
  .board .card.sel {
    outline: 3px solid var(--inju);
    outline-offset: 1px;
  }
  .board .none {
    margin: 6px 0;
    text-align: center;
    font-size: 12px;
    color: var(--paper-dim);
  }
</style>
