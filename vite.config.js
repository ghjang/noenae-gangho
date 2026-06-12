import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base: './' — 나중에 VSCode 웹뷰/정적 호스팅에 그대로 얹기 좋게 상대경로로.
export default defineConfig({
  plugins: [svelte()],
  base: './',
});
