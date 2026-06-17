import { defineConfig } from 'vitest/config';

// 순수층(graph/geometry/markdown/highlight)·문구 팩 단위 테스트 (#166).
// 자작 check-*.mjs를 대체 — 시나리오는 그대로, 러너만 표준으로.
// environment: 'node' + svelte 플러그인 없음 → runes(store.svelte.ts)는 여기서 안 굴러간다.
// 그게 곧 '순수층은 스토어 무관' 율법의 자연 보초: 순수 함수가 store를 import하면 테스트가 깨진다.
// devDependency라 번들엔 0바이트 — '런타임 의존성 0'(DESIGN 12장)과 무충돌.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
