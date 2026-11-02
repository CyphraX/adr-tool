/**
 * What the Java adapter needs from one file (docs/structure-format.md, section 3, "Java"):
 * its package, its imports, the types it declares and the simple names it uses where a type
 * stands — read with `tree-sitter-java` as WebAssembly (ADR-0008).
 *
 * Nothing here touches the disk. Whoever runs it — the app, the CLI, a test — finds the two
 * `.wasm` files and hands their bytes in. That keeps the question of where the files lie in
 * a packaged app out of the analysis.
 */
import { Language, Parser, type Node } from 'web-tree-sitter'
import type { Extraction } from '../extraction'
import { detailed } from '../sentences'

export interface JavaImport {
  /** As written, without `.*`: `java.util.List`, `java.util`. */
  readonly name: string
  readonly isStatic: boolean
  /** `import a.b.*` */
  readonly onDemand: boolean
  /** From 1. */
  readonly line: number
}

/** A simple name, and the line it is first used on. */
export interface JavaName {
  readonly name: string
  readonly line: number
}

export interface JavaOutline {
  /** The empty string for a file in the default package. */
  readonly package: string
  readonly imports: readonly JavaImport[]
  /** The top-level types: what the file contributes to its package. */
  readonly types: readonly string[]
  /**
   * The names that mean something inside the file only: nested types and type parameters.
   * Where the file uses one of them, it uses nothing of its package.
   */
  readonly local: readonly string[]
  /** Every simple name that stands where a type stands, annotations included, once. */
  readonly typeNames: readonly JavaName[]
  /**
   * Every simple name something is accessed on: `Totals` in `Totals.sum()`, but also `lines` in
   * `lines.size()`. The syntax cannot tell a class from a variable; only a name that the symbol
   * table knows as a type is a use.
   */
  readonly qualifiers: readonly JavaName[]
}

/** Reads one Java file. Prepared once per thread; it keeps its parser. */
export type JavaReader = (text: string) => Extraction

const TYPE_DECLARATIONS = [
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration'
]

let runtime: Promise<void> | undefined

export async function prepareJava(wasm: {
  /** `web-tree-sitter.wasm` */
  readonly runtime: Uint8Array
  /** `tree-sitter-java.wasm` */
  readonly grammar: Uint8Array
}): Promise<JavaReader> {
  // The runtime can be initialised once per thread.
  runtime ??= Parser.init({ wasmBinary: wasm.runtime })
  await runtime
  const parser = new Parser()
  parser.setLanguage(await Language.load(wasm.grammar))

  return (text) => {
    const tree = parser.parse(text)
    if (!tree) throw new Error('tree-sitter returned no tree')
    try {
      const root = tree.rootNode
      const error = root.hasError ? firstError(root) : undefined
      if (error) {
        const { detail: message, said } = detailed(
          error.isMissing
            ? { code: 'java-missing', values: { what: error.type } }
            : { code: 'java-unreadable', values: {} }
        )
        return { analysed: false, line: error.startPosition.row + 1, message, said }
      }
      return { analysed: true, java: outline(root) }
    } finally {
      tree.delete()
    }
  }
}

/** The first node the parser could not read, or put in where something was missing. */
function firstError(root: Node): Node | undefined {
  let node: Node | null = root
  while (node) {
    if (node.isError || node.isMissing) return node
    node =
      node.children.find((child) => child !== null && (child.hasError || child.isMissing)) ?? null
  }
  return undefined
}

function outline(root: Node): JavaOutline {
  let packageName = ''
  const imports: JavaImport[] = []
  const types: string[] = []

  for (const node of root.namedChildren) {
    if (!node) continue
    if (node.type === 'package_declaration') {
      packageName = nameIn(node) ?? ''
    } else if (node.type === 'import_declaration') {
      const name = nameIn(node)
      if (name === undefined) continue
      imports.push({
        name,
        isStatic: node.children.some((child) => child?.type === 'static'),
        onDemand: node.namedChildren.some((child) => child?.type === 'asterisk'),
        line: node.startPosition.row + 1
      })
    } else if (TYPE_DECLARATIONS.includes(node.type)) {
      const name = node.childForFieldName('name')?.text
      if (name !== undefined) types.push(name)
    }
  }

  const local = new Set<string>()
  for (const node of root.descendantsOfType(TYPE_DECLARATIONS)) {
    const name = node?.childForFieldName('name')?.text
    // Node objects are made afresh on every access: the parent is known by its type.
    if (name !== undefined && node?.parent?.type !== 'program') local.add(name)
  }
  for (const node of root.descendantsOfType('type_parameter')) {
    const name = node?.namedChildren.find((child) => child?.type === 'type_identifier')?.text
    if (name !== undefined) local.add(name)
  }

  const typeNames = new Map<string, number>()
  const add = (names: Map<string, number>, node: Node | null | undefined): void => {
    if (node && !names.has(node.text)) names.set(node.text, node.startPosition.row + 1)
  }
  for (const node of root.descendantsOfType('type_identifier')) add(typeNames, node)
  // An annotation names its type with a plain identifier, not with a type_identifier.
  for (const node of root.descendantsOfType(['marker_annotation', 'annotation'])) {
    const name = node?.childForFieldName('name')
    if (name?.type === 'identifier') add(typeNames, name)
  }

  const qualifiers = new Map<string, number>()
  for (const node of root.descendantsOfType(['method_invocation', 'field_access'])) {
    const object = node?.childForFieldName('object')
    if (object?.type === 'identifier') add(qualifiers, object)
  }

  const listed = (names: Map<string, number>): JavaName[] =>
    [...names].map(([name, line]) => ({ name, line }))
  return {
    package: packageName,
    imports,
    types,
    local: [...local].filter((name) => !types.includes(name)),
    typeNames: listed(typeNames),
    qualifiers: listed(qualifiers)
  }
}

const nameIn = (node: Node): string | undefined =>
  node.namedChildren.find(
    (child) => child?.type === 'scoped_identifier' || child?.type === 'identifier'
  )?.text
