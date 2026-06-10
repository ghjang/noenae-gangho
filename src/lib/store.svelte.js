// ──────────────────────────────────────────────
// 뇌내강호 상태 저장소 (Svelte 5 runes)
// 그래프(念/緣) 데이터와 UI 상태, 영속화 어댑터.
// ──────────────────────────────────────────────
import { TONES } from './strings.js'
import { nodeBox } from './geometry.js'
import { ancestorIds, parentEdgeOf, tidyLayout } from './graph.js'

const KEY = 'noenae-gangho-v1'

// 줌 한계 — zoomAt/fitAll/뷰 복원이 같은 값을 쓴다. 하한 0.1: 큰 강호도
// 전체 보기(全)가 한 화면에 다 담을 수 있게 (0.35는 잘림 사고의 원인이었다)
export const SCALE_MIN = 0.1
export const SCALE_MAX = 2.5
const TONE_KEY = 'noenae-gangho-tone' // 말투 취향 — 그래프 데이터(snapshot)와 별개로 저장
const VIEW_KEY = 'noenae-gangho-view' // 마지막 뷰(팬/줌) — 역시 로컬 취향, snapshot 밖

function loadTone() {
  try {
    const t = localStorage.getItem(TONE_KEY)
    return TONES.includes(t) ? t : TONES[0]
  } catch {
    return TONES[0]
  }
}

function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY))
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.s))
      return { x: v.x, y: v.y, s: Math.min(SCALE_MAX, Math.max(SCALE_MIN, v.s)) }
  } catch {
    /* 깨진 저장값은 무시 */
  }
  return null
}
const view = loadView()

export const graph = $state({ nodes: [], edges: [] })

export const ui = $state({
  pan: { x: view?.x ?? 0, y: view?.y ?? 0 },
  scale: view?.s ?? 1,
  selectedId: null,
  selectedEdgeId: null,
  editingId: null,
  linking: null, // { from, x, y } — 연결 드래그 중
  overlay: null, // { mode: 'export'|'import'|'md' }
  showHelp: false,
  tone: loadTone(), // 'muhyeop'(무협, 기본) | 'plain'(일반) — strings.js 팩 선택
})

export const COLORS = ['muk', 'cheong', 'dan', 'hwang', 'nam']

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function byId(id) {
  return graph.nodes.find((n) => n.id === id)
}

// ── 저장 어댑터 ──────────────────────────────
// 웹 버전은 localStorage. VSCode 웹뷰로 이식할 때는
// 이 어댑터만 postMessage 기반으로 갈아끼우면 된다.
// (확장 호스트가 workspaceState나 *.noegang.json 파일에 저장)
let adapter = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  async save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* 저장 실패는 조용히 — 내보내기로 보관 가능 */
    }
  },
}

export function setStorageAdapter(a) {
  adapter = a
}

let saveTimer = null
export function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => adapter.save(snapshot()), 500)
}

// 즉시 저장 — 탭 닫힘/숨김 직전(pagehide), 디바운스 500ms를 못 기다릴 때
export function flushSave() {
  clearTimeout(saveTimer)
  adapter.save(snapshot())
  clearTimeout(viewTimer)
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ x: ui.pan.x, y: ui.pan.y, s: ui.scale }))
  } catch {
    /* 조용히 */
  }
}

// 뷰(팬/줌) 저장 — App의 $effect가 변화 감지 후 호출. 그래프 스냅샷과 무관
let viewTimer = null
export function scheduleViewSave() {
  clearTimeout(viewTimer)
  viewTimer = setTimeout(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ x: ui.pan.x, y: ui.pan.y, s: ui.scale }))
    } catch {
      /* 실패는 조용히 */
    }
  }, 300)
}

export function snapshot() {
  return {
    app: 'noenae-gangho',
    // v2: bw(사용자 지정 너비) / v3: collapsed(가지 접힘) — 모두 선택 필드라 구버전 그대로 읽힌다
    v: 3,
    nodes: graph.nodes.map(({ id, x, y, text, color, bw, collapsed }) => ({ id, x, y, text, color, bw, collapsed })),
    edges: graph.edges.map(({ id, a, b }) => ({ id, a, b })),
  }
}

export function loadData(data) {
  if (!data || !Array.isArray(data.nodes)) return false
  // 실측 w/h는 스냅샷 밖이라 새 객체는 기본 180×48로 태어난다. 그런데 같은 id면
  // keyed each가 DOM을 재사용해 ResizeObserver가 다시 안 울린다(크기 불변) —
  // 언두/리두 후 엣지 앵커가 허공을 찌르는 원인. 직전 실측을 물려받아 해결
  const prev = new Map(graph.nodes.map((n) => [n.id, n]))
  graph.nodes.length = 0
  graph.edges.length = 0
  for (const n of data.nodes) {
    const old = prev.get(n.id)
    const { w: _w, h: _h, ...rest } = n // 실측값은 포맷 밖 — 손으로 고친 JSON이 앵커를 오염 못 하게
    graph.nodes.push({ w: old?.w ?? 180, h: old?.h ?? 48, color: 'muk', text: '', ...rest })
  }
  for (const e of data.edges ?? []) {
    if (e && e.a && e.b) graph.edges.push({ id: e.id ?? uid(), a: e.a, b: e.b })
  }
  ui.selectedId = ui.selectedEdgeId = ui.editingId = null
  return true
}

// ── 되돌리기 (undo/redo) ──────────────────────
// 변이 직전의 스냅샷을 쌓는다. 같은 key의 연속 변이(타이핑·드래그·넛지)는
// 0.8초 슬라이딩 창 안에서 한 걸음으로 병합. ui(선택/뷰/톤)는 역사 밖이다.
const HISTORY_MAX = 100
let undoStack = []
let redoStack = []
let lastMark = { key: null, t: 0 }
let mutedDepth = 0 // asOneStep 내부의 변이는 따로 기록하지 않는다

export function markUndo(key = null) {
  if (mutedDepth) return
  const now = Date.now()
  if (key && lastMark.key === key && now - lastMark.t < 800) {
    lastMark.t = now
    return
  }
  lastMark = { key, t: now }
  undoStack.push(JSON.stringify(snapshot()))
  if (undoStack.length > HISTORY_MAX) undoStack.shift()
  redoStack.length = 0
}

// 여러 변이를 한 걸음(undo 1회)으로 묶는다 — 가지치기, 드롭 연결, 가져오기 등
export function asOneStep(fn) {
  markUndo()
  mutedDepth++
  try {
    fn()
  } finally {
    mutedDepth--
  }
}

function applyDoc(json) {
  loadData(JSON.parse(json))
  lastMark = { key: null, t: 0 }
  scheduleSave()
}

export function undo() {
  if (!undoStack.length) return
  redoStack.push(JSON.stringify(snapshot()))
  applyDoc(undoStack.pop())
}

export function redo() {
  if (!redoStack.length) return
  undoStack.push(JSON.stringify(snapshot()))
  applyDoc(redoStack.pop())
}

function resetHistory() {
  undoStack.length = 0
  redoStack.length = 0
  lastMark = { key: null, t: 0 }
}

export async function init() {
  const saved = await adapter.load()
  if (saved && loadData(saved)) {
    resetHistory() // 부팅/시드 과정은 역사에 남기지 않는다
    return
  }
  seed()
  resetHistory()
}

// 첫 방문 시 — 이 강호가 태어난 사연을 그대로 심어둔다 ㅋ
function seed() {
  const n1 = addNodeAt(120, 220, "'깨다름' (오타)", 'muk', false)
  const n2 = addNodeAt(430, 140, '다름 = difference', 'cheong', false)
  const n3 = addNodeAt(450, 300, '미분(微分) = 차이 따지기?!', 'dan', false)
  const n4 = addNodeAt(770, 220, '여기서부터는 브로의 강호', 'hwang', false)
  addEdge(n1.id, n2.id)
  addEdge(n2.id, n3.id)
  addEdge(n3.id, n4.id)
}

// ── 변이 함수들 ──────────────────────────────
export function addNodeAt(x, y, text = '', color = 'muk', edit = true) {
  markUndo()
  const node = { id: uid(), x, y, text, color, w: 180, h: 48 }
  graph.nodes.push(node)
  ui.selectedId = node.id
  ui.selectedEdgeId = null
  if (edit) ui.editingId = node.id
  scheduleSave()
  return node
}

export function addChild(parentId, text = '', edit = true) {
  const p = byId(parentId)
  if (!p) return null
  let node = null
  asOneStep(() => {
    if (p.collapsed) p.collapsed = undefined // 접힌 채 가지치면 새 가지가 숨는다 — 펼치고 진행
    const count = graph.edges.filter((e) => e.a === parentId).length
    const pb = nodeBox(p)
    node = addNodeAt(pb.x + pb.w + 90, pb.y + count * 92, text, p.color, edit)
    addEdge(parentId, node.id)
  })
  return node
}

// 형제 가지치기 — 같은 부모 밑, 그 쪽지 바로 아래에 (시선이 머무는 곳).
// 부모가 없으면(뿌리) 바로 아래에 새 뿌리. 부모 여럿이면 첫 緣 기준
export function addSibling(id) {
  const n = byId(id)
  if (!n) return null
  const pe = parentEdgeOf(graph.edges, id)
  const b = nodeBox(n)
  let node = null
  if (pe) {
    asOneStep(() => {
      const p = byId(pe.a)
      if (p?.collapsed) p.collapsed = undefined
      node = addNodeAt(b.x, b.y + b.h + 24, '', n.color)
      addEdge(pe.a, node.id)
    })
  } else {
    node = addNodeAt(b.x, b.y + b.h + 44, '', n.color)
  }
  return node
}

export function updateText(id, text) {
  const n = byId(id)
  if (!n) return
  markUndo('text:' + id) // 타이핑은 슬라이딩 창으로 병합
  n.text = text
  scheduleSave()
}

export function setColor(id, color) {
  const n = byId(id)
  if (!n) return
  markUndo()
  n.color = color
  scheduleSave()
}

// 쪽지 너비 — null이면 자동(내용 따라). 리사이즈 드래그가 매 프레임 호출해도
// 저장은 scheduleSave 디바운스가 받아준다. undefined는 JSON 직렬화에서 빠진다.
export function setNodeWidth(id, w) {
  const n = byId(id)
  if (!n) return
  markUndo('resize:' + id) // 드래그 연속 호출은 한 걸음으로
  n.bw = w == null ? undefined : Math.min(480, Math.max(120, Math.round(w)))
  scheduleSave()
}

export function removeNode(id) {
  const i = graph.nodes.findIndex((n) => n.id === id)
  if (i === -1) return
  markUndo()
  graph.nodes.splice(i, 1)
  for (let j = graph.edges.length - 1; j >= 0; j--) {
    const e = graph.edges[j]
    if (e.a === id || e.b === id) graph.edges.splice(j, 1)
  }
  if (ui.selectedId === id) ui.selectedId = null
  if (ui.editingId === id) ui.editingId = null
  scheduleSave()
}

export function addEdge(a, b) {
  if (!a || !b || a === b) return
  const dup = graph.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))
  if (dup) return
  markUndo()
  graph.edges.push({ id: uid(), a, b })
  scheduleSave()
}

export function removeEdge(id) {
  const i = graph.edges.findIndex((e) => e.id === id)
  if (i !== -1) {
    markUndo()
    graph.edges.splice(i, 1)
  }
  if (ui.selectedEdgeId === id) ui.selectedEdgeId = null
  scheduleSave()
}

// 가지런히(Tidy) — rootId의 하위 트리(없으면 전체)를 정돈. undo 한 걸음
export function arrange(rootId = null) {
  const pos = tidyLayout(graph.nodes, graph.edges, rootId)
  if (pos.size === 0) return
  markUndo()
  for (const n of graph.nodes) {
    const p = pos.get(n.id)
    if (p) { n.x = p.x; n.y = p.y }
  }
  scheduleSave()
}

// 숨은 쪽지를 세상에 드러낸다 — 접힌 조상을 전부 개문 (검색 점프용)
export function revealNode(id) {
  const anc = ancestorIds(graph.edges, id)
  const toOpen = graph.nodes.filter((n) => n.collapsed && anc.has(n.id))
  if (toOpen.length === 0) return
  asOneStep(() => {
    for (const n of toOpen) n.collapsed = undefined
    scheduleSave()
  })
}

// 가지 접기/펼치기 — collapsed는 선택 필드(undefined면 직렬화에서 빠짐)
export function toggleCollapse(id) {
  const n = byId(id)
  if (!n) return
  markUndo()
  n.collapsed = n.collapsed ? undefined : true
  scheduleSave()
}

// 緣 방향 뒤집기 (a=부모 ↔ b=자식) — 비급.md 트리 모양이 바뀐다
export function flipEdge(id) {
  const e = graph.edges.find((x) => x.id === id)
  if (!e) return
  markUndo()
  ;[e.a, e.b] = [e.b, e.a]
  scheduleSave()
}

export function clearAll() {
  markUndo()
  graph.nodes.length = 0
  graph.edges.length = 0
  ui.selectedId = ui.selectedEdgeId = ui.editingId = null
  scheduleSave()
}

// 무공봉인/해제 — scheduleSave() 없음: 톤은 그래프가 아니라 TONE_KEY에 직접 저장
export function setTone(tone) {
  if (!TONES.includes(tone)) return
  ui.tone = tone
  try {
    localStorage.setItem(TONE_KEY, tone)
  } catch {
    /* 취향 저장 실패는 조용히 — 이번 판만 새 말투로 산다 */
  }
}

export function toggleTone() {
  setTone(ui.tone === 'muhyeop' ? 'plain' : 'muhyeop')
}
