import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, UserConfig } from 'vite'

const require = createRequire(import.meta.url)

/**
 * The WebAssembly of tree-sitter goes into the command as base64 text (ADR-0017), so that the
 * one file reads Java, Python and Go wherever it is copied to: `src/tree-sitter-wasm.ts`, which
 * reads the files from the installed packages, is replaced by them. The tests read the same
 * module.
 */
function treeSitterWasm(): Plugin {
  const file = fileURLToPath(new URL('src/tree-sitter-wasm.ts', import.meta.url))
  const base64 = (path: string): string => readFileSync(require.resolve(path)).toString('base64')
  const constant = (name: string, path: string): string =>
    `export const ${name} = () => Buffer.from(${JSON.stringify(base64(path))}, 'base64')`
  return {
    name: 'tree-sitter-wasm',
    enforce: 'pre',
    load: (id) =>
      normalize(id.split('?')[0]!) === file
        ? [
            constant('runtime', 'web-tree-sitter/web-tree-sitter.wasm'),
            constant('javaGrammar', 'tree-sitter-java/tree-sitter-java.wasm'),
            constant('pythonGrammar', 'tree-sitter-python/tree-sitter-python.wasm'),
            constant('goGrammar', 'tree-sitter-go/tree-sitter-go.wasm')
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

/**
 * How a command that analyses code is built — `adr` and `adr-mcp`: one file that Node.js runs
 * as it is, `src/main.ts` of the package bundled into `dist/<file>`. The workspace packages,
 * TypeScript, tree-sitter and `yaml` are in it, Node's own modules are not; the workspace
 * packages are source-only, as for the app.
 */
export function commandConfig(file: string): UserConfig {
  return {
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
          entryFileNames: file,
          inlineDynamicImports: true,
          banner: COMMONJS
        }
      }
    },
    ssr: {
      noExternal: true,
      target: 'node'
    }
  }
}
