import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/**
 * The WebAssembly of tree-sitter goes into the server as base64 text (ADR-0017), as into the
 * command: the module of the command that reads both files from the installed packages is
 * replaced by them, so that the one file reads Java wherever it is copied to.
 */
function treeSitterWasm(): Plugin {
  const file = fileURLToPath(new URL('../cli/src/tree-sitter-wasm.ts', import.meta.url))
  const from = createRequire(file)
  const base64 = (path: string): string => readFileSync(from.resolve(path)).toString('base64')
  const constant = (name: string, path: string): string =>
    `export const ${name} = () => Buffer.from(${JSON.stringify(base64(path))}, 'base64')`
  return {
    name: 'tree-sitter-wasm',
    enforce: 'pre',
    load: (id) =>
      normalize(id.split('?')[0]!) === file
        ? [
            constant('runtime', 'web-tree-sitter/web-tree-sitter.wasm'),
            constant('grammar', 'tree-sitter-java/tree-sitter-java.wasm')
          ].join('\n')
        : undefined
  }
}

/**
 * TypeScript is a CommonJS package that asks for `require`, `__filename` and `__dirname`, which
 * a module does not have; the server gives them to it.
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

// The server is one file that Node.js runs as it is: `core`, `structure`, TypeScript,
// tree-sitter, `yaml` and `diff` are bundled into it, Node's own modules are not. The workspace
// packages are source-only, as for the app.
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
        entryFileNames: 'adr-mcp.mjs',
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
