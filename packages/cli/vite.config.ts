import { defineConfig } from 'vite'

// The command is one file that Node.js runs as it is: `core`, `structure` and `yaml` are bundled
// into it, Node's own modules are not. The workspace packages are source-only, as for the app.
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node22',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'adr.js',
        banner: '#!/usr/bin/env node'
      }
    }
  },
  ssr: {
    noExternal: true,
    target: 'node'
  }
})
