// ──────────────────────────────────────────────
// 시트 신택스 하이라이트 — 순수 토크나이저 (DOM·스토어 무관).
// 외부 라이브러리 금지(런타임 의존성 0 원칙)라 직접 짠다 — 다행히
// 우리가 다루는 양식은 둘뿐: JSON(내보내기/가져오기)과 비급.md(불릿 개요).
// 반환: [{ c, t }] — c는 토큰 클래스('key'|'str'|'num'|'kw'|'pun'|'head'|'bullet'|'cyc'|''),
// t는 원문 그대로. 이어 붙이면 입력과 1글자도 다르지 않다(편집 overlay 정렬의 전제).
// ──────────────────────────────────────────────

const JSON_RE =
  /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g

export function highlightJson(text) {
  const s = String(text)
  const out = []
  let last = 0
  for (const m of s.matchAll(JSON_RE)) {
    if (m.index > last) out.push({ c: '', t: s.slice(last, m.index) })
    if (m[1] != null) {
      out.push({ c: 'key', t: m[1] }, { c: 'pun', t: m[2] })
    } else if (m[3] != null) out.push({ c: 'str', t: m[3] })
    else if (m[4] != null) out.push({ c: 'num', t: m[4] })
    else if (m[5] != null) out.push({ c: 'kw', t: m[5] })
    else out.push({ c: 'pun', t: m[6] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ c: '', t: s.slice(last) })
  return out
}

export function highlightMd(text) {
  const out = []
  const lines = String(text).split('\n')
  lines.forEach((line, i) => {
    const nl = i < lines.length - 1 ? '\n' : ''
    const m = line.match(/^(\s*)([-*+] )(.*?)( ↻)?$/)
    if (/^#/.test(line)) out.push({ c: 'head', t: line + nl })
    else if (m) {
      if (m[1]) out.push({ c: '', t: m[1] })
      out.push({ c: 'bullet', t: m[2] })
      if (m[3]) out.push({ c: '', t: m[3] })
      if (m[4]) out.push({ c: 'cyc', t: m[4] })
      if (nl) out.push({ c: '', t: nl })
    } else out.push({ c: '', t: line + nl })
  })
  return out
}

// 가져오기용 양식 자동 판별 — applyImport와 같은 규칙({/[ 시작 = JSON)
export function highlightAuto(text) {
  const s = String(text).trimStart()
  return s.startsWith('{') || s.startsWith('[') ? highlightJson(text) : highlightMd(text)
}
