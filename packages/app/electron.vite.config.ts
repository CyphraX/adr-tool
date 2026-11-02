import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// @adr-tool/core and @adr-tool/structure are source-only workspace packages and are listed
// under devDependencies on purpose: electron-vite leaves only `dependencies` as runtime
// requires, so they get bundled into every process that imports them. `typescript` is a
// dependency for the opposite reason: the analysis worker requires it at run time, and its
// 9 MB are not bundled into anything (ADR-0008).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [svelte()]
  }
})
