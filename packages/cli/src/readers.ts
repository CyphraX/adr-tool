import {
  prepareGo,
  prepareJava,
  preparePython,
  type GoReader,
  type JavaReader,
  type PythonReader
} from '@adr-tool/structure'
import { goGrammar, javaGrammar, pythonGrammar, runtime } from './tree-sitter-wasm'

let java: Promise<JavaReader> | undefined
let python: Promise<PythonReader> | undefined
let go: Promise<GoReader> | undefined

// The readers of the languages read with tree-sitter, each prepared once and only for a
// repository that has the language. The `.wasm` files of tree-sitter are in the command
// itself, as base64 (ADR-0017): it is one file with nothing beside it, wherever it is copied to.

export function javaReader(): Promise<JavaReader> {
  java ??= prepareJava({ runtime: runtime(), grammar: javaGrammar() })
  return java
}

export function pythonReader(): Promise<PythonReader> {
  python ??= preparePython({ runtime: runtime(), grammar: pythonGrammar() })
  return python
}

export function goReader(): Promise<GoReader> {
  go ??= prepareGo({ runtime: runtime(), grammar: goGrammar() })
  return go
}
