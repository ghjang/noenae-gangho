// ──────────────────────────────────────────────
// 문구 팩 정합성 검사 — `npm run check` (build 전 prebuild로도 돈다)
// 1) 모든 팩이 같은 키 집합인가
// 2) App.svelte가 쓰는 t.* 키가 모든 팩에 있는가 + 그 역(고아 키 금지)
// 3) 팩이 순수 데이터인가 — 함수가 섞이면 JSON 팩(외부 로드)의 길이 막힌다
// 4) colorLabel이 store의 COLORS를 전부 덮는가 / helpItems가 [키, 설명] 쌍인가
// ──────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { STRINGS, TONES } from '../src/lib/strings.ts';

let fail = 0;
const err = (m) => {
  console.error('✗ ' + m);
  fail++;
};
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// 1) 키 집합 비교 — 첫 팩(기본 톤) 기준, 팩이 몇 벌이든 동작
const [base, ...rest] = TONES;
const baseKeys = Object.keys(STRINGS[base]);
for (const tone of rest) {
  const keys = Object.keys(STRINGS[tone]);
  for (const k of baseKeys) if (!keys.includes(k)) err(`${tone} 팩에 '${k}' 없음`);
  for (const k of keys) if (!baseKeys.includes(k)) err(`${base} 팩에 '${k}' 없음`);
}

// 2) 사용 키 — 컴포넌트(App/BoardView)의 정적 t.xxx + store의 STRINGS[톤].xxx + 동적 합성 키
const app = read('../src/App.svelte') + read('../src/BoardView.svelte');
const storeSrc = read('../src/lib/store.svelte.js');
const used = new Set([...app.matchAll(/\bt\.([A-Za-z]+)/g)].map((m) => m[1]));
for (const m of storeSrc.matchAll(/STRINGS\[[^\]]+\]\.([A-Za-z]+)/g)) used.add(m[1]);
// t[ui.overlay.mode + 'Title']와 sheetMsg(strings 키 보관)의 간접 참조분 — App 쪽을 바꾸면 여기도 갱신
for (const k of [
  'exportTitle',
  'importTitle',
  'mdTitle',
  'docsTitle',
  'importBadShape',
  'importParseFail',
  'copyOk',
  'copyFail',
])
  used.add(k);
for (const tone of TONES)
  for (const k of used) if (!(k in STRINGS[tone])) err(`App이 쓰는 '${k}'가 ${tone} 팩에 없음`);
// 역방향 — 팩에는 있는데 App이 안 쓰는 고아 키 (문구를 걷어낼 땐 팩에서도 걷어낼 것)
for (const k of baseKeys) if (!used.has(k)) err(`고아 키 '${k}' — App 어디에서도 안 씀`);

// 3) 순수 데이터 — 함수 금지
const findFns = (v, path) =>
  typeof v === 'function'
    ? [path]
    : v && typeof v === 'object'
      ? Object.entries(v).flatMap(([k, sub]) => findFns(sub, `${path}.${k}`))
      : [];
for (const p of findFns(STRINGS, 'STRINGS'))
  err(`함수 발견: ${p} — 팩은 순수 데이터여야 함 ('{placeholder}' + fmt() 사용)`);

// 4) 오행 색 라벨 / 도움말 쌍 — COLORS는 store 소스에서 그대로 읽어 중복 정의를 피한다
const colors =
  read('../src/lib/store.svelte.js')
    .match(/export const COLORS = \[([^\]]*)\]/)?.[1]
    .match(/\w+/g) ?? [];
if (colors.length === 0) err('store.svelte.js에서 COLORS를 못 읽음 — 이 스크립트의 정규식 갱신 필요');
for (const tone of TONES) {
  for (const c of colors) if (!STRINGS[tone].colorLabel?.[c]) err(`${tone}.colorLabel.${c} 없음`);
  if (!STRINGS[tone].helpItems?.every((p) => Array.isArray(p) && p.length === 2))
    err(`${tone}.helpItems가 [키, 설명] 쌍 배열이 아님`);
  // helpQuick(퀵 카드 노출 목록)은 helpItems 키의 부분집합 — 오타/유실 즉시 적발
  const itemKeys = new Set((STRINGS[tone].helpItems ?? []).map((p) => p[0]));
  if (!Array.isArray(STRINGS[tone].helpQuick) || STRINGS[tone].helpQuick.length === 0)
    err(`${tone}.helpQuick이 비어 있음 — 퀵 카드가 텅 빈다`);
  else
    for (const k of STRINGS[tone].helpQuick)
      if (!itemKeys.has(k)) err(`${tone}.helpQuick의 '${k}'가 helpItems에 없음`);
  // helpSections(전체 시트 묶음) — 전수 분배: 합집합=전체, 중복 0, 실존 키만
  const secs = STRINGS[tone].helpSections;
  if (
    !Array.isArray(secs) ||
    !secs.every((s) => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string' && Array.isArray(s[1]))
  )
    err(`${tone}.helpSections가 [제목, 키 배열] 쌍 목록이 아님`);
  else {
    const flat = secs.flatMap((s) => s[1]);
    const fset = new Set(flat);
    if (flat.length !== fset.size) err(`${tone}.helpSections에 중복 키`);
    for (const k of flat) if (!itemKeys.has(k)) err(`${tone}.helpSections의 '${k}'가 helpItems에 없음`);
    for (const k of itemKeys)
      if (!fset.has(k)) err(`${tone}.helpItems '${k}'가 어느 묶음에도 없음 — 시트에서 증발한다`);
  }
}

if (fail) {
  console.error(`문구 검사 실패 — ${fail}건`);
  process.exit(1);
}
console.log(`문구 검사 통과 — 팩 ${TONES.length}벌 · 키 ${baseKeys.length}개 · App 사용 키 ${used.size}개`);
