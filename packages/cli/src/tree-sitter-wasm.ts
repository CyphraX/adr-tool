import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// The WebAssembly of tree-sitter, read from the installed packages. The build puts the files
// into the command instead, as base64 (vite.config.ts, ADR-0017), so that it reads Java,
// Python and Go wherever it is copied to; the tests read them the same way.

const require = createRequire(import.meta.url)
const read = (path: string): Uint8Array => readFileSync(require.resolve(path))

/** `web-tree-sitter.wasm`, the runtime. */
export const runtime = (): Uint8Array => read('web-tree-sitter/web-tree-sitter.wasm')

/** `tree-sitter-java.wasm`, the grammar of Java. */
export const javaGrammar = (): Uint8Array => read('tree-sitter-java/tree-sitter-java.wasm')

/** `tree-sitter-python.wasm`, the grammar of Python. */
export const pythonGrammar = (): Uint8Array => read('tree-sitter-python/tree-sitter-python.wasm')

/** `tree-sitter-go.wasm`, the grammar of Go. */
export const goGrammar = (): Uint8Array => read('tree-sitter-go/tree-sitter-go.wasm')
