// ──────────────────────────────────────────────
// 뇌내강호 상태 저장소 (Svelte 5 runes)
// 그래프(念/緣) 데이터와 UI 상태, 영속화 어댑터.
// ──────────────────────────────────────────────
const KEY = 'noenae-gangho-v1'

export const graph = $state({ nodes: [], edges: [] })

export const ui = $state({
  pan: { x: 0, y: 0 },
  scale: 1,
  selectedId: null,
  selectedEdgeId: null,
  editingId: null,
  linking: null, // { from, x, y } — 연결 드래그 중
  overlay: null, // { mode: 'export'|'import'|'md', title, text }
  showHelp: false,
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

export function snapshot() {
  return {
    app: 'noenae-gangho',
    v: 1,
    nodes: graph.nodes.map(({ id, x, y, text, color }) => ({ id, x, y, text, color })),
    edges: graph.edges.map(({ id, a, b }) => ({ id, a, b })),
  }
}

export function loadData(data) {
  if (!data || !Array.isArray(data.nodes)) return false
  graph.nodes.length = 0
  graph.edges.length = 0
  for (const n of data.nodes) {
    graph.nodes.push({ w: 180, h: 48, color: 'muk', text: '', ...n })
  }
  for (const e of data.edges ?? []) {
    if (e && e.a && e.b) graph.edges.push({ id: e.id ?? uid(), a: e.a, b: e.b })
  }
  ui.selectedId = ui.selectedEdgeId = ui.editingId = null
  return true
}

export async function init() {
  const saved = await adapter.load()
  if (saved && loadData(saved)) return
  seed()
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
  const count = graph.edges.filter((e) => e.a === parentId).length
  const node = addNodeAt(p.x + (p.w || 180) + 90, p.y + count * 92, text, p.color, edit)
  addEdge(parentId, node.id)
  return node
}

export function updateText(id, text) {
  const n = byId(id)
  if (!n) return
  n.text = text
  scheduleSave()
}

export function setColor(id, color) {
  const n = byId(id)
  if (!n) return
  n.color = color
  scheduleSave()
}

export function removeNode(id) {
  const i = graph.nodes.findIndex((n) => n.id === id)
  if (i === -1) return
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
  graph.edges.push({ id: uid(), a, b })
  scheduleSave()
}

export function removeEdge(id) {
  const i = graph.edges.findIndex((e) => e.id === id)
  if (i !== -1) graph.edges.splice(i, 1)
  if (ui.selectedEdgeId === id) ui.selectedEdgeId = null
  scheduleSave()
}

export function clearAll() {
  graph.nodes.length = 0
  graph.edges.length = 0
  ui.selectedId = ui.selectedEdgeId = ui.editingId = null
  scheduleSave()
}
