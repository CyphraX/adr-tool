import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { treeSitterWasm } from '../cli/command.config'
import { notices } from '../cli/notices'

// Everything the main process and its analysis worker run is bundled into `out/`, so that the
// packaged app holds no `node_modules` and pnpm's links never have to be followed
// (docs/release.md). That is why the app lists no `dependencies`: electron-vite leaves only
// those as runtime requires. The workspace packages are source-only and are bundled the same
// way. TypeScript, about 9 MB, ends up in the worker alone, the one place that loads it
// (ADR-0008), and the WebAssembly of tree-sitter goes into the worker as base64, as into the
// command line, so that the packaged app has no file to find. Each build writes the notices of
// what it bundled beside it, and the installers carry them (cli/notices.ts).
export default defineConfig({
  main: {
    plugins: [treeSitterWasm(), notices()],
    build: {
      // The worker is large on purpose: TypeScript alone is most of it.
      chunkSizeWarningLimit: 20_000,
      rollupOptions: {
        onwarn(warning, warn) {
          // Emscripten's loader in web-tree-sitter evaluates the JavaScript a WebAssembly module
          // carries. It only ever loads the grammars bundled here, never a file of a repository.
          if (warning.code === 'EVAL' && warning.id?.includes('web-tree-sitter')) return
          warn(warning)
        }
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [svelte(), notices()],
    build: {
      rollupOptions: {
        output: {
          // elkjs, under the EPL-2.0, is a file of its own beside the MIT code (ADR-0024). The
          // helpers of CommonJS that it needs, as other packages do, stay out of it: otherwise
          // every diagram of Mermaid would load elkjs for them.
          manualChunks: (id) =>
            id.includes('/node_modules/elkjs/')
              ? 'elkjs'
              : id.includes('commonjsHelpers')
                ? 'commonjs-helpers'
                : undefined
        }
      }
    }
  }
})
