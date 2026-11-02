import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'

const require = createRequire(import.meta.url)

/**
 * The WebAssembly of tree-sitter goes into the command as base64 text (ADR-0017), so that the
 * one file reads Java wherever it is copied to. The tests read the same module.
 */
function treeSitterWasm(): Plugin {
  const id = 'virtual:tree-sitter-wasm'
  const base64 = (path: string): string => readFileSync(require.resolve(path)).toString('base64')
  return {
    name: 'tree-sitter-wasm',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (loaded) =>
      loaded === `\0${id}`
        ? [
            `export const runtime = ${JSON.stringify(base64('web-tree-sitter/web-tree-sitter.wasm'))}`,
            `export const grammar = ${JSON.stringify(base64('tree-sitter-java/tree-sitter-java.wasm'))}`
          ].join('\n')
        : undefined
  }
}

/**
 * TypeScript is a CommonJS package that asks for `require`, `__filename` and `__dirname`, which
 * a module does not have; the command gives them to it.
 */
const COMMONJS = [
  '#!/usr/bin/env node',
  "import { createRequire as __adrCreateRequire } from 'node:module'",
  "import { dirname as __adrDirname } from 'node:path'",
  "import { fileURLToPath as __adrFileURLToPath } from 'node:url'",
  'const require = __adrCreateRequire(import.meta.url)',
  'const __filename = __adrFileURLToPath(import.meta.url)',
  'const __dirname = __adrDirname(__filename)'
].join('\n')

// The command is one file that Node.js runs as it is: `core`, `structure`, `conformance`,
// TypeScript, tree-sitter and `yaml` are bundled into it, Node's own modules are not. The
// workspace packages are source-only, as for the app.
export default defineConfig({
  plugins: [treeSitterWasm()],
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node22',
    emptyOutDir: true,
    minify: false,
    // The bundle is large on purpose: TypeScript alone is most of it.
    chunkSizeWarningLimit: 20_000,
    rollupOptions: {
      onwarn(warning, warn) {
        // Emscripten's loader in web-tree-sitter evaluates the JavaScript a WebAssembly module
        // carries. It only ever loads the two bundled here, never a file of the analysed repository.
        if (warning.code === 'EVAL' && warning.id?.includes('web-tree-sitter')) return
        warn(warning)
      },
      output: {
        entryFileNames: 'adr.mjs',
        inlineDynamicImports: true,
        banner: COMMONJS
      }
    }
  },
  ssr: {
    noExternal: true,
    target: 'node'
  }
})
