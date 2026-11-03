import { defineConfig } from 'vite'

// The server is one file that Node.js runs as it is: `core`, `structure`, the command line's git,
// `yaml` and `diff` are bundled into it, Node's own modules are not. The workspace packages are source-only, as for the app.
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node22',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'adr-mcp.mjs',
        banner: '#!/usr/bin/env node'
      }
    }
  },
  ssr: {
    noExternal: true,
    target: 'node'
  }
})
