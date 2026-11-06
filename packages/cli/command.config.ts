import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, UserConfig } from 'vite'
import { notices } from './notices'

const require = createRequire(import.meta.url)

/** The WebAssembly of tree-sitter, by the name `src/tree-sitter-wasm.ts` exports it under. */
const WASM = {
  runtime: 'web-tree-sitter/web-tree-sitter.wasm',
  javaGrammar: 'tree-sitter-java/tree-sitter-java.wasm',
  pythonGrammar: 'tree-sitter-python/tree-sitter-python.wasm',
  goGrammar: 'tree-sitter-go/tree-sitter-go.wasm'
} as const

/**
 * The WebAssembly of tree-sitter goes into the command as base64 text (ADR-0017), so that the
 * one file reads Java, Python and Go wherever it is copied to: `src/tree-sitter-wasm.ts`, which
 * reads the files from the installed packages, is replaced by them. The tests read the same
 * module. The app's analysis worker reads it too, and is built with this plugin as well.
 */
export function treeSitterWasm(): Plugin {
  const file = fileURLToPath(new URL('src/tree-sitter-wasm.ts', import.meta.url))
  const embedded = (name: string): string => `export const ${name} = () => Buffer.from(`
  return {
    name: 'tree-sitter-wasm',
    enforce: 'pre',
    load(id) {
      if (normalize(id.split('?')[0]!) !== file) return undefined
      // Each file read is announced to the build, whose notices list its package too.
      return Object.entries(WASM)
        .map(([name, path]) => {
          const wasm = require.resolve(path)
          this.addWatchFile(wasm)
          const base64 = JSON.stringify(readFileSync(wasm).toString('base64'))
          return `${embedded(name)}${base64}, 'base64')`
        })
        .join('\n')
    },
    // Should the module be bundled as it is — its id not the one above, as a path can be
    // written another way on Windows —, it would look for the files at runtime, where the
    // packaged app and a copied command have none, and Java, Python and Go would go unread
    // without a word. The build fails instead, in development as in a release.
    buildEnd(error) {
      if (error) return
      for (const id of this.getModuleIds()) {
        if (!id.split('?')[0]!.replaceAll('\\', '/').endsWith('/cli/src/tree-sitter-wasm.ts'))
          continue
        const code = this.getModuleInfo(id)?.code ?? ''
        const missing = Object.keys(WASM).filter((name) => !code.includes(embedded(name)))
        if (missing.length > 0) {
          this.error(
            `${id} was bundled without the WebAssembly of tree-sitter (${missing.join(', ')}): the plugin expected it at ${file}.`
          )
        }
      }
    }
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
 * packages are source-only, as for the app. The notices of what it bundles end the file, as a
 * comment, so that it stays one file (ADR-0010).
 */
export function commandConfig(file: string): UserConfig {
  return {
    plugins: [treeSitterWasm(), notices('comment')],
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
