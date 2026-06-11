// ──────────────────────────────────────────────
// 뇌내강호 상태 저장소 (Svelte 5 runes)
// 그래프(念/緣) 데이터와 UI 상태, 영속화 어댑터.
// ──────────────────────────────────────────────
import { STRINGS, TONES, fmt } from './strings.js'
import { nodeBox } from './geometry.js'
import { ancestorIds, parentEdgeOf, tidyLayout } from './graph.js'

const KEY = 'noenae-gangho-v1' // 레거시 단일 문서 본문 — 첫 이주 후엔 읽지 않는다 (화석 백업, 지우지 않음)
const DOCS_KEY = 'noenae-gangho-docs' // 문서(강호) 인덱스 — { current, list: [{ id, title, updatedAt }] } (#62)
const docKey = (id) => 'noenae-gangho-doc-' + id // 문서별 본문 (v3 snapshot — 포맷은 문서 단위로 불변)
const viewKey = (id) => 'noenae-gangho-view-' + id // 문서별 뷰(팬/줌)

// 줌 한계 — zoomAt/fitAll/뷰 복원이 같은 값을 쓴다. 하한 0.1: 큰 강호도
// 전체 보기(全)가 한 화면에 다 담을 수 있게 (0.35는 잘림 사고의 원인이었다)
export const SCALE_MIN = 0.1
export const SCALE_MAX = 2.5
export const clampScale = (s) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))
const TONE_KEY = 'noenae-gangho-tone' // 말투 취향 — 그래프 데이터(snapshot)와 별개, 문서와 무관하게 전역
const LEGACY_VIEW_KEY = 'noenae-gangho-view' // 단일 문서 시절의 뷰 키 — 이주 때 한 번만 읽는다

function loadTone() {
  try {
    const t = localStorage.getItem(TONE_KEY)
    return TONES.includes(t) ? t : TONES[0]
  } catch {
    return TONES[0]
  }
}

// 문서별 뷰(팬/줌) 읽기 — 깨진 저장값은 무시
function loadView(docId) {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(docId)))
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.s))
      return { x: v.x, y: v.y, s: clampScale(v.s) }
  } catch {
    /* 무시 */
  }
  return null
}

export const graph = $state({ nodes: [], edges: [] })

export const ui = $state({
  pan: { x: 0, y: 0 }, // 부팅 시 init()이 현재 문서의 뷰를 입힌다
  scale: 1,
  selectedId: null, // 앵커 — 단일 표적 작업(Tab/F2/Z/Alt+화살표)의 기준. 항상 selectedIds 안에 있다
  selectedIds: [], // 선택 무리 (#39 다중 선택) — 재할당 금지, 제자리 변이만
  selectedEdgeId: null,
  editingId: null,
  linking: null, // { from, x, y } — 연결 드래그 중
  overlay: null, // { mode: 'export'|'import'|'md' }
  showHelp: false,
  focusId: null, // 집중(포커스) 표적 — 세션 전용 뷰 상태: snapshot/undo 밖 (#47)
  focusDepth: 1, // 집중 반경(촌수) — [ ]로 조절
  docSwitching: false, // 문서 전환 중 — 퇴장/입장 애니를 꺼서 두 강호가 겹쳐 보이지 않게
  tone: loadTone(), // 'muhyeop'(무협, 기본) | 'plain'(일반) — strings.js 팩 선택
  ink: 'muk', // 현재 붓 색 — 새 쪽지(+/더블클릭)의 기본색. 칠하기/빈손 클릭이 갱신
})

export const COLORS = ['muk', 'cheong', 'dan', 'hwang', 'nam']

function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function byId(id) {
  return graph.nodes.find((n) => n.id === id)
}

// ── 선택 ─────────────────────────────────────
// 선택 변경은 전부 이 함수들 경유 — 쪽지 무리/緣 선택은 상호 배타.
// selectedIds가 무리, selectedId는 앵커(가장 최근/대표 — 단일 표적 작업 기준)
export function selectNode(id) {
  // 단독 선택 — 무리를 해산하고 이 쪽지만
  ui.selectedIds.length = 0
  ui.selectedIds.push(id)
  ui.selectedId = id
  ui.selectedEdgeId = null
}
export function selectEdge(id) {
  ui.selectedEdgeId = id
  ui.selectedId = null
  ui.selectedIds.length = 0
}
export function clearSelection() {
  ui.selectedId = null
  ui.selectedEdgeId = null
  ui.selectedIds.length = 0
}
// Shift/Ctrl+클릭 토글 — 빠지는 쪽지가 앵커였다면 무리의 마지막이 승계
export function addToSelection(id) {
  ui.selectedEdgeId = null
  const i = ui.selectedIds.indexOf(id)
  if (i >= 0) {
    ui.selectedIds.splice(i, 1)
    if (ui.selectedId === id) ui.selectedId = ui.selectedIds.at(-1) ?? null
  } else {
    ui.selectedIds.push(id)
    ui.selectedId = id
  }
}
// 올가미/Ctrl+A 일괄 — 앵커는 살아남으면 유지, 아니면 마지막
export function selectMany(ids) {
  ui.selectedEdgeId = null
  ui.selectedIds.length = 0
  ui.selectedIds.push(...ids)
  ui.selectedId = ids.includes(ui.selectedId) ? ui.selectedId : (ids.at(-1) ?? null)
}
export const isSelected = (id) => ui.selectedIds.includes(id)
// 무리에서 죽은/숨은 쪽지 솎아내기 — 삭제·봉문이 부른다
export function pruneSelection(dead) {
  if (!ui.selectedIds.some((id) => dead.has(id))) return
  const keep = ui.selectedIds.filter((id) => !dead.has(id))
  ui.selectedIds.length = 0
  ui.selectedIds.push(...keep)
  if (!keep.includes(ui.selectedId)) ui.selectedId = keep.at(-1) ?? null
}

// ── 문서(강호) 서가 — 다중 캔버스 인덱스 (#62) ──
// list/current는 제자리 변이만. 인덱스 영속은 persistDocs() 경유 —
// VSCode 이식 때 본문 어댑터와 함께 갈아끼우는 항구(港口)다
export const docs = $state({ current: null, list: [] })

function persistDocs() {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify({ current: docs.current, list: docs.list }))
  } catch {
    /* 조용히 */
  }
}

// 인덱스 적재 — 없으면 레거시(단일 문서) 이주 또는 첫 문서 창건.
// 반환: 갓 태어난 빈 강호면 true (init이 창세 시드를 심는 신호)
function ensureDocs() {
  try {
    const raw = JSON.parse(localStorage.getItem(DOCS_KEY))
    if (raw && Array.isArray(raw.list) && raw.list.length) {
      docs.list.push(...raw.list.filter((d) => d && d.id != null && typeof d.title === 'string'))
      docs.current = docs.list.some((d) => d.id === raw.current) ? raw.current : docs.list[0].id
      if (docs.list.length) return false
    }
  } catch {
    /* 깨진 인덱스 — 아래에서 재건 */
  }
  // 인덱스가 없거나 깨졌어도 본문 키가 남아 있으면 서가를 재건 — 문서 유실 방지
  try {
    const orphans = Object.keys(localStorage)
      .filter((k) => k.startsWith('noenae-gangho-doc-'))
      .map((k) => k.slice('noenae-gangho-doc-'.length))
    if (orphans.length) {
      orphans.forEach((oid, i) =>
        docs.list.push({ id: oid, title: fmt(STRINGS[ui.tone].docDefaultTitle, { n: i + 1 }), updatedAt: Date.now() })
      )
      docs.current = docs.list[0].id
      persistDocs()
      return false
    }
  } catch {
    /* 조용히 — 아래 창건 경로로 */
  }
  const id = uid()
  docs.list.push({ id, title: fmt(STRINGS[ui.tone].docDefaultTitle, { n: 1 }), updatedAt: Date.now() })
  docs.current = id
  let legacy = null
  try {
    legacy = localStorage.getItem(KEY)
    if (legacy) {
      // 단일 문서 시절의 저장본을 '강호 1'로 편입 — 원본 키는 화석으로 남긴다
      localStorage.setItem(docKey(id), legacy)
      const lv = localStorage.getItem(LEGACY_VIEW_KEY)
      if (lv) localStorage.setItem(viewKey(id), lv)
    }
  } catch {
    /* 조용히 */
  }
  persistDocs()
  return !legacy
}

// 인덱스의 시간 도장 — 본문이 저장될 때마다
function touchDoc(id) {
  const d = docs.list.find((x) => x.id === id)
  if (d) {
    d.updatedAt = Date.now()
    persistDocs()
  }
}

// ── 저장 어댑터 ──────────────────────────────
// 웹 버전은 localStorage. VSCode 웹뷰로 이식할 때는 이 어댑터만
// postMessage 기반으로 갈아끼우면 된다 (파일 하나 = 문서 하나).
let adapter = {
  async load(docId) {
    try {
      const raw = localStorage.getItem(docKey(docId))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  async save(docId, data) {
    try {
      localStorage.setItem(docKey(docId), JSON.stringify(data))
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
  saveTimer = setTimeout(() => {
    adapter.save(docs.current, snapshot())
    touchDoc(docs.current)
  }, 500)
}

// 즉시 저장 — 탭 닫힘/숨김 직전(pagehide)과 문서 전환 직전.
// 디바운스 타이머를 걷어내고 현재 문서의 본문+뷰를 그 자리에서 적는다
export function flushSave() {
  clearTimeout(saveTimer)
  adapter.save(docs.current, snapshot())
  touchDoc(docs.current)
  clearTimeout(viewTimer)
  try {
    localStorage.setItem(viewKey(docs.current), JSON.stringify({ x: ui.pan.x, y: ui.pan.y, s: ui.scale }))
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
      localStorage.setItem(viewKey(docs.current), JSON.stringify({ x: ui.pan.x, y: ui.pan.y, s: ui.scale }))
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
  // 손으로 고친 JSON 검역 — 중복/무명 id 쪽지는 버리고, 緣은 addEdge와 같은
  // 규칙(양끝 실존·자기 자신 금지·같은 두 쪽지 사이 무방향 한 가닥)으로 거른다.
  // undo/내부 스냅샷은 언제나 깨끗해서 이 검역이 손대지 않는다
  const ids = new Set()
  for (const n of data.nodes) {
    if (!n || n.id == null || ids.has(n.id)) continue
    ids.add(n.id)
    const old = prev.get(n.id)
    const { w: _w, h: _h, ...rest } = n // 실측값은 포맷 밖 — 손으로 고친 JSON이 앵커를 오염 못 하게
    graph.nodes.push({ w: old?.w ?? 180, h: old?.h ?? 48, color: 'muk', text: '', ...rest })
  }
  const pairs = new Set()
  const eids = new Set()
  for (const e of data.edges ?? []) {
    if (!e || !e.a || !e.b || e.a === e.b || !ids.has(e.a) || !ids.has(e.b)) continue
    const pair = [e.a, e.b].sort().join('\0') // 구분자 NUL — id에 못 들어가는 글자라 쌍 충돌 원천 차단
    if (pairs.has(pair)) continue
    pairs.add(pair)
    const id = e.id != null && !eids.has(e.id) ? e.id : uid()
    eids.add(id)
    graph.edges.push({ id, a: e.a, b: e.b })
  }
  clearSelection()
  ui.editingId = null
  // focusId는 여기서 안 끈다 — 언두/리두도 loadData를 타므로 표적이 살아 있으면
  // 집중 유지. 가져오기로 표적이 사라진 경우는 App의 정리 $effect가 끈다
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

// 문서 활성화 — 본문+뷰 적재, 역사 리셋. 전환/삭제 후/부팅이 공용으로 쓴다.
// (직전 문서의 저장은 호출부 몫 — 디바운스 잔당이 새 문서에 적히는 사고 방지)
// 전환은 동기식 절단: 애니를 끄고 즉시 갈아끼운다 — 두 강호가 겹쳐 보이면 주화입마
async function activateDoc(id) {
  ui.docSwitching = true
  try {
    docs.current = id
    persistDocs()
    const saved = await adapter.load(id)
    if (!saved || !loadData(saved)) {
      graph.nodes.length = 0
      graph.edges.length = 0
      clearSelection()
      ui.editingId = null
      ui.focusId = null
    }
    resetHistory() // 문서 전환은 역사를 가르는 일 — undo는 문서 안에서만
    const v = loadView(id)
    ui.pan.x = v?.x ?? 40
    ui.pan.y = v?.y ?? 40
    ui.scale = v?.s ?? 1
  } finally {
    setTimeout(() => (ui.docSwitching = false), 60) // 교체 플러시가 지나간 뒤 애니 복권
  }
}

export async function init() {
  const fresh = ensureDocs() // 인덱스 적재 — 레거시 이주/창건 포함
  await activateDoc(docs.current)
  if (fresh && graph.nodes.length === 0) {
    seed() // 갓 태어난 강호에만 창세 사연을
    resetHistory() // 부팅/시드 과정은 역사에 남기지 않는다
  }
}

// ── 문서(강호) 다루기 (#62) ───────────────────
export async function switchDoc(id) {
  if (id === docs.current || !docs.list.some((d) => d.id === id)) return
  flushSave() // 떠나는 문서의 본문+뷰를 그 자리에서 봉인
  await activateDoc(id)
}

export async function createDoc() {
  flushSave()
  const id = uid()
  docs.list.push({
    id,
    title: fmt(STRINGS[ui.tone].docDefaultTitle, { n: docs.list.length + 1 }),
    updatedAt: Date.now(),
  })
  await activateDoc(id) // 본문 없음 → 빈 강호로 시작
  adapter.save(id, snapshot()) // 신생 문서도 즉시 실존 — 새로고침해도 안 사라진다
}

export function renameDoc(id, title) {
  const d = docs.list.find((x) => x.id === id)
  if (!d) return
  d.title = title.trim() || STRINGS[ui.tone].docUntitled
  d.updatedAt = Date.now()
  persistDocs()
}

// 문서 베기 — 마지막 문서를 베면 빈 강호를 새로 창건한다
export async function removeDoc(id) {
  const i = docs.list.findIndex((d) => d.id === id)
  if (i === -1) return
  const wasCurrent = docs.current === id
  docs.list.splice(i, 1)
  try {
    localStorage.removeItem(docKey(id))
    localStorage.removeItem(viewKey(id))
  } catch {
    /* 조용히 */
  }
  if (!wasCurrent) {
    persistDocs()
    return
  }
  // 베인 문서의 디바운스 유작이 부활하지 않게 — 타이머부터 무장 해제
  clearTimeout(saveTimer)
  clearTimeout(viewTimer)
  if (docs.list.length === 0) {
    const nid = uid()
    docs.list.push({ id: nid, title: fmt(STRINGS[ui.tone].docDefaultTitle, { n: 1 }), updatedAt: Date.now() })
    await activateDoc(nid)
    adapter.save(nid, snapshot())
  } else {
    await activateDoc(docs.list[Math.min(i, docs.list.length - 1)].id)
  }
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
export function addNodeAt(x, y, text = '', color = ui.ink, edit = true) {
  markUndo()
  const node = { id: uid(), x, y, text, color, w: 180, h: 48 }
  graph.nodes.push(node)
  selectNode(node.id)
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

// 칠하기 — 무리째 한 붓에 (undo 한 걸음). 단일도 ids 하나짜리로 부른다
export function setColorMany(ids, color) {
  asOneStep(() => {
    for (const id of ids) {
      const n = byId(id)
      if (n) n.color = color
    }
    ui.ink = color // 칠한 색이 곧 다음 붓 색
    scheduleSave()
  })
}

// 붓 색만 고르기 — 도구 상태라 undo/저장 대상 아님 (선택 없을 때 팔레트 클릭)
export function setInk(color) {
  if (COLORS.includes(color)) ui.ink = color
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
  pruneSelection(new Set([id]))
  if (ui.editingId === id) ui.editingId = null
  scheduleSave()
}

// 무리 베기 — undo 한 걸음
export function removeNodes(ids) {
  asOneStep(() => {
    for (const id of [...ids]) removeNode(id)
  })
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
  if (ui.selectedEdgeId === id) clearSelection()
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
  clearSelection()
  ui.editingId = null
  ui.focusId = null
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
