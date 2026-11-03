/**
 * What the Python adapter needs from one file (docs/structure-format.md, section 3, "Python"):
 * its imports, as written, read with `tree-sitter-python` as WebAssembly (ADR-0008). Which
 * file an import lands on depends on the other files of the repository, so it is resolved
 * once every file is read (`resolve.ts`).
 *
 * Nothing here touches the disk: the caller hands in the bytes of the two `.wasm` files.
 */
import type { Node } from 'web-tree-sitter'
import type { Extraction } from '../extraction'
import { detailed } from '../sentences'
import { firstError, parserOf, type Grammar } from '../tree-sitter'

export interface PythonImport {
  /** The module as written, without its leading dots: `a.b`; empty for `from . import x`. */
  readonly module: string
  /** How many dots lead a relative import: 0 for an absolute one. */
  readonly level: number
  /**
   * What `from … import` names, aliases left out: `['c', 'd']`, or `['*']`. Missing for
   * `import a.b`, which uses the module itself.
   */
  readonly names?: readonly string[]
  /** Under `if TYPE_CHECKING:`: for the type checker only, and never at run time. */
  readonly typeOnly: boolean
  /** The line the statement begins on, from 1. */
  readonly line: number
}

export interface PythonOutline {
  readonly imports: readonly PythonImport[]
}

/** Reads one Python file. Prepared once per thread; it keeps its parser. */
export type PythonReader = (text: string) => Extraction

/** `wasm` holds `web-tree-sitter.wasm` and `tree-sitter-python.wasm`. */
export async function preparePython(wasm: Grammar): Promise<PythonReader> {
  const parser = await parserOf(wasm)

  return (text) => {
    const tree = parser.parse(text)
    if (!tree) throw new Error('tree-sitter returned no tree')
    try {
      const root = tree.rootNode
      const error = root.hasError ? firstError(root) : undefined
      if (error) {
        const { detail: message, said } = detailed(
          error.isMissing
            ? { code: 'python-missing', values: { what: error.type } }
            : { code: 'python-unreadable', values: {} }
        )
        return { analysed: false, line: error.startPosition.row + 1, message, said }
      }
      return { analysed: true, python: outline(root) }
    } finally {
      tree.delete()
    }
  }
}

function outline(root: Node): PythonOutline {
  const imports: PythonImport[] = []
  // `from __future__ import …` is a statement of its own, and the standard library's.
  for (const node of root.descendantsOfType(['import_statement', 'import_from_statement'])) {
    if (!node) continue
    const line = node.startPosition.row + 1
    const typeOnly = isTypeChecking(node)
    if (node.type === 'import_statement') {
      // `import a.b, c as d`: each module of its own.
      for (const name of node.childrenForFieldName('name')) {
        const module = moduleOf(name)
        if (module !== undefined) imports.push({ module, level: 0, typeOnly, line })
      }
      continue
    }
    const from = node.childForFieldName('module_name')
    if (!from) continue
    let level = 0
    let module: string | undefined
    if (from.type === 'relative_import') {
      const prefix = from.namedChildren.find((child) => child?.type === 'import_prefix')
      level = (prefix?.text.match(/\./g) ?? []).length
      const dotted = from.namedChildren.find((child) => child?.type === 'dotted_name')
      module = dotted ? dottedName(dotted) : ''
    } else {
      module = dottedName(from)
    }
    const names = node.namedChildren.some((child) => child?.type === 'wildcard_import')
      ? ['*']
      : node
          .childrenForFieldName('name')
          .map((name) => (name ? moduleOf(name) : undefined))
          .filter((name): name is string => name !== undefined)
    imports.push({ module, level, names, typeOnly, line })
  }
  return { imports }
}

/** `a.b`, read from its identifiers: `a . b` is the same module. */
const dottedName = (node: Node): string =>
  node.namedChildren
    .filter((child) => child?.type === 'identifier')
    .map((child) => child!.text)
    .join('.')

/** The module or name of `a.b`, or of `a.b as c`. */
function moduleOf(node: Node): string | undefined {
  if (node.type === 'dotted_name') return dottedName(node)
  if (node.type === 'aliased_import') {
    const name = node.childForFieldName('name')
    return name ? dottedName(name) : undefined
  }
  return undefined
}

/**
 * Whether a statement lies in the block of `if TYPE_CHECKING:` — or `if typing.TYPE_CHECKING:`
 * — at any depth: that block runs for the type checker only. Its `elif` and `else` run.
 */
function isTypeChecking(node: Node): boolean {
  for (let block = node.parent; block; block = block.parent) {
    if (block.type !== 'block') continue
    const statement = block.parent
    if (statement?.type !== 'if_statement') continue
    if (statement.childForFieldName('consequence')?.id !== block.id) continue
    const condition = statement.childForFieldName('condition')
    const name =
      condition?.type === 'attribute' ? condition.childForFieldName('attribute') : condition
    if (name?.type === 'identifier' && name.text === 'TYPE_CHECKING') return true
  }
  return false
}
