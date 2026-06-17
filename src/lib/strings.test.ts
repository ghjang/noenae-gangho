// 문구 팩 정합 — strings.ts + 컴포넌트 사용 키 (#166).
// 자작 scripts/check-strings.mjs의 충실 이주: 키 일치·사용 키·고아 금지·순수 데이터·
// colorLabel·helpItems 쌍·helpQuick 부분집합·helpSections 전수 분배 — 검사 의미 그대로.
// (타입체크 받는 위치라 동적 키 인덱싱엔 캐스트를 넣되 런타임 검사는 동일)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STRINGS, TONES } from './strings.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// 컴포넌트(App/CanvasView/BoardView/OutlineView)의 t.xxx + store의 STRINGS[톤].xxx + 동적 합성 키
const app =
  read('../App.svelte') +
  read('../CanvasView.svelte') +
  read('../BoardView.svelte') +
  read('../OutlineView.svelte');
const storeSrc = read('./store.svelte.ts');
const used = new Set([...app.matchAll(/\bt\.([A-Za-z]+)/g)].map((m) => m[1]));
for (const m of storeSrc.matchAll(/STRINGS\[[^\]]+\]\.([A-Za-z]+)/g)) used.add(m[1]);
// t[ui.overlay.mode + 'Title']와 sheetMsg(strings 키 보관)의 간접 참조분 — App을 바꾸면 여기도 갱신
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

const [base, ...rest] = TONES;
const baseKeys = Object.keys(STRINGS[base]);

// 오행 색 — store 소스에서 그대로 읽어 중복 정의 회피 (정규식이 타입 주석 'readonly Color[]'를 건너뛰게 [^=]*)
const colors =
  read('./store.svelte.ts')
    .match(/export const COLORS[^=]*= \[([^\]]*)\]/)?.[1]
    .match(/\w+/g) ?? [];

// 함수 탐지 — 팩은 순수 데이터(JSON 직렬화 가능)여야
const findFns = (v: unknown, path: string): string[] =>
  typeof v === 'function'
    ? [path]
    : v && typeof v === 'object'
      ? Object.entries(v as Record<string, unknown>).flatMap(([k, sub]) => findFns(sub, `${path}.${k}`))
      : [];

describe('문구 팩 정합 (check-strings 이주)', () => {
  it('1) 모든 팩이 같은 키 집합', () => {
    for (const tone of rest) {
      const keys = Object.keys(STRINGS[tone]);
      for (const k of baseKeys) expect(keys, `${tone} 팩에 '${k}' 없음`).toContain(k);
      for (const k of keys) expect(baseKeys, `${base} 팩에 '${k}' 없음`).toContain(k);
    }
  });

  it('2) App이 쓰는 키가 모든 팩에 존재', () => {
    for (const tone of TONES)
      for (const k of used) expect(k in STRINGS[tone], `App이 쓰는 '${k}'가 ${tone} 팩에 없음`).toBe(true);
  });

  it('3) 고아 키 없음 — 팩엔 있는데 App이 안 쓰는 키', () => {
    for (const k of baseKeys) expect(used.has(k), `고아 키 '${k}' — App 어디에서도 안 씀`).toBe(true);
  });

  it('4) 순수 데이터 — 함수 금지', () => {
    expect(findFns(STRINGS, 'STRINGS')).toEqual([]);
  });

  it('5) store 소스에서 COLORS를 읽어온다', () => {
    expect(colors.length, 'COLORS 정규식 갱신 필요').toBeGreaterThan(0);
  });

  it('6) colorLabel이 COLORS를 전부 덮는다', () => {
    for (const tone of TONES) {
      const cl = STRINGS[tone].colorLabel as Record<string, string | undefined>;
      for (const c of colors) expect(cl[c], `${tone}.colorLabel.${c} 없음`).toBeTruthy();
    }
  });

  it('7) helpItems가 [키, 설명] 쌍 배열', () => {
    for (const tone of TONES)
      expect(
        STRINGS[tone].helpItems.every((p) => Array.isArray(p) && p.length === 2),
        `${tone}.helpItems가 [키,설명] 쌍이 아님`,
      ).toBe(true);
  });

  it('8) helpQuick ⊆ helpItems', () => {
    for (const tone of TONES) {
      const itemKeys = new Set(STRINGS[tone].helpItems.map((p) => p[0]));
      expect(
        Array.isArray(STRINGS[tone].helpQuick) && STRINGS[tone].helpQuick.length > 0,
        `${tone}.helpQuick이 비어 있음`,
      ).toBe(true);
      for (const k of STRINGS[tone].helpQuick)
        expect(itemKeys.has(k), `${tone}.helpQuick의 '${k}'가 helpItems에 없음`).toBe(true);
    }
  });

  it('9) helpSections 전수 분배 — 합집합=전체·중복 0·실존 키만', () => {
    for (const tone of TONES) {
      const itemKeys = new Set(STRINGS[tone].helpItems.map((p) => p[0]));
      const secs = STRINGS[tone].helpSections;
      expect(
        Array.isArray(secs) &&
          secs.every(
            (s) => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string' && Array.isArray(s[1]),
          ),
        `${tone}.helpSections가 [제목, 키 배열] 쌍 목록이 아님`,
      ).toBe(true);
      const flat = secs.flatMap((s) => s[1]);
      const fset = new Set(flat);
      expect(flat.length, `${tone}.helpSections에 중복 키`).toBe(fset.size);
      for (const k of flat)
        expect(itemKeys.has(k), `${tone}.helpSections의 '${k}'가 helpItems에 없음`).toBe(true);
      for (const k of itemKeys)
        expect(fset.has(k), `${tone}.helpItems '${k}'가 어느 묶음에도 없음`).toBe(true);
    }
  });
});
