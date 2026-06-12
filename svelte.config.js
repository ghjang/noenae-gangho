// svelte-check가 설정 부재 시 vite.config 자동 탐지를 시도하다(vite 5와 API 불일치)
// 넘어지는 것을 막는 명시적 빈 설정 — lang="ts"는 svelte2tsx가 자체 처리라 전처리 불요 (#115)
export default {};
