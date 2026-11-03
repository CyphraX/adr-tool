/**
 * What the Go adapter needs from one file (docs/structure-format.md, section 3, "Go"): its
 * package, its imports, what it declares at the top level, and the names it uses — read with
 * `tree-sitter-go` as WebAssembly (ADR-0008). Which file a name lands on depends on the other
 * files of its package and of the packages it imports, so it is resolved once every file is
 * read (`resolve.ts`).
 *
 * Nothing here touches the disk: the caller hands in the bytes of the two `.wasm` files.
 */
import type { Node } from 'web-tree-sitter'
import type { Extraction } from '../extraction'
import { detailed } from '../sentences'
import { firstError, parserOf, type Grammar } from '../tree-sitter'

export interface GoImport {
  /** The import path, unquoted: `example.com/shop/cart`, `fmt`. */
  readonly path: string
  /** What is written before the path: an alias, `.` or `_`. Missing where nothing is. */
  readonly name?: string
  /** From 1. */
  readonly line: number
}

/** A name, and the line it is first used on. */
export interface GoName {
  readonly name: string
  readonly line: number
}

/** `cart.New`: a name selected from an identifier, which may be an import. */
export interface GoSelection extends GoName {
  readonly qualifier: string
  /**
   * The file declares the qualifier inside as well — a parameter, a variable —, and the
   * selection stands where a value may: `cart.Add(1)`, with a parameter `cart`, may select from
   * that value. A selection in the position of a type never is one: `cart.Cart` there is the
   * package's.
   */
  readonly local?: true
}

export interface GoOutline {
  /** As the package clause names it: `cart`, or `cart_test` for an external test. */
  readonly package: string
  readonly imports: readonly GoImport[]
  /**
   * What the file declares at the top level — functions, types, variables and constants — and
   * so contributes to its package. Methods belong to their type; `init` and `_` cannot be named.
   */
  readonly declares: readonly string[]
  /** Every `x.Name` where `x` is an identifier, once, with the line it is first used on. */
  readonly selections: readonly GoSelection[]
  /**
   * Every name used without a qualifier that the file declares neither at the top level nor
   * inside — a parameter, a variable of a function — once, with its first line. Such a name
   * may be one of its package, or of a package imported with `.`. The key of an element in a
   * composite literal is left out: in a struct it names a field.
   */
  readonly names: readonly GoName[]
}

/** Reads one Go file. Prepared once per thread; it keeps its parser. */
export type GoReader = (text: string) => Extraction

/** `wasm` holds `web-tree-sitter.wasm` and `tree-sitter-go.wasm`. */
export async function prepareGo(wasm: Grammar): Promise<GoReader> {
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
            ? { code: 'go-missing', values: { what: error.type } }
            : { code: 'go-unreadable', values: {} }
        )
        return { analysed: false, line: error.startPosition.row + 1, message, said }
      }
      return { analysed: true, go: outline(root) }
    } finally {
      tree.delete()
    }
  }
}

const SPECS = ['var_spec', 'const_spec', 'type_spec', 'type_alias']
const lineOf = (node: Node): number => node.startPosition.row + 1
const fields = (node: Node | null | undefined, field: string): Node[] =>
  (node?.childrenForFieldName(field) ?? []).filter((child): child is Node => child !== null)
/** The identifiers of a name — of a type as well —, or of a list of them: `a, b := …`. */
const identifiersIn = (node: Node): Node[] =>
  node.type === 'identifier' || node.type === 'type_identifier'
    ? [node]
    : node.namedChildren.filter((child): child is Node => child?.type === 'identifier')

function outline(root: Node): GoOutline {
  let packageName = ''
  const imports: GoImport[] = []
  const declares = new Set<string>()
  const declare = (name: string): void => {
    if (name !== '_' && name !== 'init') declares.add(name)
  }

  for (const node of root.namedChildren) {
    if (!node) continue
    switch (node.type) {
      case 'package_clause':
        packageName =
          node.namedChildren.find((child) => child?.type === 'package_identifier')?.text ?? ''
        break
      case 'import_declaration':
        for (const spec of node.descendantsOfType('import_spec')) {
          const path = spec?.childForFieldName('path')
          if (!spec || !path) continue
          const name = spec.childForFieldName('name')?.text
          imports.push({
            path: path.text.slice(1, -1),
            ...(name === undefined ? {} : { name }),
            line: lineOf(spec)
          })
        }
        break
      case 'function_declaration':
        declare(node.childForFieldName('name')?.text ?? '_')
        break
      case 'var_declaration':
      case 'const_declaration':
      case 'type_declaration':
        for (const spec of node.descendantsOfType(SPECS)) {
          // Only the specs of the declaration itself, not those of a function literal in its
          // value: `var handler = func() { var cfg int }` declares `handler` alone.
          if (spec && isTopLevelSpec(spec))
            for (const name of fields(spec, 'name')) declare(name.text)
        }
        break
    }
  }

  // What is declared inside the file's functions hides the package's names for the whole
  // file: the syntax has no scopes, and a lower bound is better than a guess.
  const local = new Set<string>()
  const declareLocally = (nodes: readonly Node[]): void => {
    for (const node of nodes) for (const name of identifiersIn(node)) local.add(name.text)
  }
  for (const node of root.descendantsOfType([
    'parameter_declaration',
    'variadic_parameter_declaration',
    'type_parameter_declaration',
    ...SPECS
  ])) {
    if (node && !isTopLevelSpec(node)) declareLocally(fields(node, 'name'))
  }
  for (const node of root.descendantsOfType(['short_var_declaration', 'range_clause'])) {
    if (node) declareLocally(fields(node, 'left'))
  }
  for (const node of root.descendantsOfType('receive_statement')) {
    // `case v := <-ch` declares, `case v = <-ch` does not.
    if (node?.children.some((child) => child?.type === ':=')) declareLocally(fields(node, 'left'))
  }
  for (const node of root.descendantsOfType('type_switch_statement')) {
    if (node) declareLocally(fields(node, 'alias'))
  }

  const keys = new Set<number>()
  for (const node of root.descendantsOfType('keyed_element')) {
    const key = node?.childForFieldName('key')
    for (const name of key ? identifiersIn(key) : []) keys.add(name.startIndex)
  }

  const names = new Map<string, number>()
  for (const node of root.descendantsOfType(['identifier', 'type_identifier'])) {
    if (!node || keys.has(node.startIndex)) continue
    const name = node.text
    if (name === '_' || declares.has(name) || local.has(name) || names.has(name)) continue
    names.set(name, lineOf(node))
  }

  const selections = new Map<string, GoSelection>()
  const select = (
    qualifier: Node | null | undefined,
    name: Node | null | undefined,
    value: boolean
  ): void => {
    if (!qualifier || !name) return
    const key = `${qualifier.text}.${name.text}`
    const inside = value && local.has(qualifier.text)
    const line = lineOf(name)
    const known = selections.get(key)
    // A use that may be of a value never stands for one that is the package's: the first line
    // of those counts.
    if (known && (inside || (known.local === undefined && known.line <= line))) return
    selections.set(key, {
      qualifier: qualifier.text,
      name: name.text,
      line,
      ...(inside ? { local: true as const } : {})
    })
  }
  for (const node of root.descendantsOfType('selector_expression')) {
    const operand = node?.childForFieldName('operand')
    if (operand?.type === 'identifier') select(operand, node?.childForFieldName('field'), true)
  }
  for (const node of root.descendantsOfType('qualified_type')) {
    select(node?.childForFieldName('package'), node?.childForFieldName('name'), false)
  }

  return {
    package: packageName,
    imports,
    declares: [...declares],
    selections: [...selections.values()],
    names: [...names].map(([name, line]) => ({ name, line }))
  }
}

/** A spec of a declaration that stands at the top level of the file. */
function isTopLevelSpec(node: Node): boolean {
  if (!SPECS.includes(node.type)) return false
  let declaration = node.parent
  // `var ( … )` puts its specs into a list of their own.
  if (declaration?.type === 'var_spec_list') declaration = declaration.parent
  return declaration?.parent?.type === 'source_file'
}
