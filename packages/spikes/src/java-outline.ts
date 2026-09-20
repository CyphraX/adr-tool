/**
 * Spike (a) of docs/plan-structure.md: read what the Java adapter needs from a file — its
 * package, its imports, its top-level types and the simple type names it uses — with
 * tree-sitter as WebAssembly.
 *
 * Nothing here touches the disk. Whoever runs it — the app, the CLI, a test — finds the two
 * `.wasm` files and hands their bytes in. That keeps the question of where the files lie
 * in a packaged app out of the analysis.
 */
import { Language, Parser, type Node } from 'web-tree-sitter'

export interface JavaImport {
  /** As written, without `.*`: `java.util.List`, `java.util`. */
  readonly name: string
  readonly isStatic: boolean
  /** `import a.b.*` */
  readonly onDemand: boolean
  /** Zero-based. */
  readonly line: number
}

export interface JavaOutline {
  readonly package: string | undefined
  readonly imports: readonly JavaImport[]
  readonly topLevelTypes: readonly string[]
  /** Every simple name that stands where a type stands, annotations included, once, in order of first use. */
  readonly typeNames: readonly string[]
  /**
   * Every simple name something is accessed on: `Totals` in `Totals.sum()`, but also `lines` in
   * `lines.size()`. The syntax cannot tell a class from a variable; only a name that the symbol
   * table knows as a type is a use.
   */
  readonly qualifierNames: readonly string[]
  /** The file has syntax errors. What could be read is still here. */
  readonly hasErrors: boolean
}

const TYPE_DECLARATIONS = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration'
])

let runtime: Promise<void> | undefined

export async function prepareJavaOutline(wasm: {
  /** `web-tree-sitter.wasm` */
  readonly runtime: Uint8Array
  /** `tree-sitter-java.wasm` */
  readonly grammar: Uint8Array
}): Promise<(source: string) => JavaOutline> {
  // The runtime can be initialised once per thread.
  runtime ??= Parser.init({ wasmBinary: wasm.runtime })
  await runtime
  const parser = new Parser()
  parser.setLanguage(await Language.load(wasm.grammar))

  return (source) => {
    const tree = parser.parse(source)
    if (!tree) throw new Error('tree-sitter returned no tree')
    try {
      return outline(tree.rootNode)
    } finally {
      tree.delete()
    }
  }
}

function outline(root: Node): JavaOutline {
  let packageName: string | undefined
  const imports: JavaImport[] = []
  const topLevelTypes: string[] = []

  for (const node of root.namedChildren) {
    if (!node) continue
    if (node.type === 'package_declaration') {
      packageName = nameIn(node)
    } else if (node.type === 'import_declaration') {
      const name = nameIn(node)
      if (name === undefined) continue
      imports.push({
        name,
        isStatic: node.children.some((child) => child?.type === 'static'),
        onDemand: node.namedChildren.some((child) => child?.type === 'asterisk'),
        line: node.startPosition.row
      })
    } else if (TYPE_DECLARATIONS.has(node.type)) {
      const name = node.childForFieldName('name')?.text
      if (name !== undefined) topLevelTypes.push(name)
    }
  }

  const typeNames = new Set<string>()
  for (const node of root.descendantsOfType('type_identifier')) {
    if (node) typeNames.add(node.text)
  }
  // An annotation names its type with a plain identifier, not with a type_identifier.
  for (const node of root.descendantsOfType(['marker_annotation', 'annotation'])) {
    const name = node?.childForFieldName('name')
    if (name?.type === 'identifier') typeNames.add(name.text)
  }

  const qualifierNames = new Set<string>()
  for (const node of root.descendantsOfType(['method_invocation', 'field_access'])) {
    const object = node?.childForFieldName('object')
    if (object?.type === 'identifier') qualifierNames.add(object.text)
  }

  return {
    package: packageName,
    imports,
    topLevelTypes,
    typeNames: [...typeNames],
    qualifierNames: [...qualifierNames],
    hasErrors: root.hasError
  }
}

const nameIn = (node: Node): string | undefined =>
  node.namedChildren.find(
    (child) => child?.type === 'scoped_identifier' || child?.type === 'identifier'
  )?.text
