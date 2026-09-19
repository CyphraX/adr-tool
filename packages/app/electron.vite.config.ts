import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// @adr-tool/core is a source-only workspace package and is listed under
// devDependencies on purpose: electron-vite leaves only `dependencies` as
// runtime requires, so core gets bundled into every process that imports it.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [svelte()]
  }
})
