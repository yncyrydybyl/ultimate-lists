import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [svelte({
    onwarn: (warning, handler) => {
        const { code } = warning;
        if (code === "css_unused_selector")
            return;

        handler(warning);
    },
  })],
})
