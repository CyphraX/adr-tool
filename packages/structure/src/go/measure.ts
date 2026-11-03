/**
 * What is measured inside a Go file (docs/structure-format.md, section 5, "Inside a Source
 * File"), from the tree `tree-sitter-go` built for its outline (ADR-0008): the cyclomatic
 * complexity of each function and method, and the types and functions that abstractness
 * counts. Go has no classes: the methods of a type may lie in any file of its package, and
 * what one file holds is no class to measure LCOM4 on.
 *
 * Complexity is counted as gocyclo counts it: 1 for the function, and 1 for each `if` — an
 * `else if` is an `if` of its own —, each `for`, `range` included, each `case` of a `switch`, a
 * type switch or a `select` but `default`, and each `&&` and `||`. A function literal counts
 * towards the function it is written in; one assigned to a variable of the package is a
 * function of its own, named by the variable.
 */
import type { Node } from 'web-tree-sitter'
import {
  ANONYMOUS,
  Names,
  type DeclarationMeasure,
  type FileMeasures,
  type FunctionMeasure
} from '../measures'

/** A function being counted: what its decision points are added to. */
interface Counting {
  complexity: number
}

const DECISIONS = new Set([
  'if_statement',
  'for_statement',
  'expression_case',
  'type_case',
  'communication_case'
])

/** Whether a node decides which way the function goes: one more for its complexity. */
function decides(node: Node): boolean {
  if (DECISIONS.has(node.type)) return true
  if (node.type !== 'binary_expression') return false
  const operator = node.childForFieldName('operator')?.type
  return operator === '&&' || operator === '||'
}

const lineOf = (node: Node): number => node.startPosition.row + 1
const endLineOf = (node: Node): number => node.endPosition.row + 1
const children = (node: Node): Node[] => node.namedChildren.filter((child) => child !== null)

/** The type a method is declared on, without `*` and type arguments: `Cart` for `(c *Cart)`. */
function receiverOf(method: Node): string {
  const parameter = children(method.childForFieldName('receiver') ?? method).find(
    (child) => child.type === 'parameter_declaration'
  )
  let type = parameter?.childForFieldName('type') ?? null
  while (type && (type.type === 'pointer_type' || type.type === 'generic_type')) {
    type = type.type === 'pointer_type' ? children(type)[0]! : type.childForFieldName('type')
  }
  return type?.text ?? ANONYMOUS
}

/**
 * Measure a parsed Go file. The walk keeps a stack of its own: a deep expression is as deep a
 * tree, which would exhaust the runtime's.
 */
export function measureGo(root: Node): FileMeasures {
  const names = new Names()
  const functions: FunctionMeasure[] = []
  const declarations: DeclarationMeasure[] = []
  /** Count the decisions of a function, everything it holds included. */
  const measure = (node: Node, written: string, body: Node | null): void => {
    const name = names.take(written)
    const counting: Counting = { complexity: 1 }
    const stack: Node[] = body ? [body] : []
    for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
      if (decides(current)) counting.complexity++
      for (const child of children(current)) stack.push(child)
    }
    functions.push({
      name,
      line: lineOf(node),
      endLine: endLineOf(node),
      complexity: counting.complexity
    })
  }

  for (const node of children(root)) {
    switch (node.type) {
      case 'function_declaration': {
        const name = node.childForFieldName('name')?.text ?? ANONYMOUS
        measure(node, name, node.childForFieldName('body'))
        // `init` runs as the package is loaded, and cannot be named: it declares nothing.
        if (name !== 'init') declarations.push({ name, line: lineOf(node), abstract: false })
        break
      }
      case 'method_declaration':
        measure(
          node,
          `${receiverOf(node)}.${node.childForFieldName('name')?.text ?? ANONYMOUS}`,
          node.childForFieldName('body')
        )
        break
      case 'var_declaration':
        for (const spec of node.descendantsOfType('var_spec')) {
          if (!spec) continue
          const declared = spec.childrenForFieldName('name').filter((name) => name !== null)
          const values = children(spec.childForFieldName('value') ?? spec)
          values.forEach((value, index) => {
            if (value.type !== 'func_literal') return
            measure(value, declared[index]?.text ?? ANONYMOUS, value.childForFieldName('body'))
          })
        }
        break
      case 'type_declaration':
        // An alias names a type declared elsewhere, and is none of its own.
        for (const spec of children(node)) {
          if (spec.type !== 'type_spec') continue
          declarations.push({
            name: spec.childForFieldName('name')?.text ?? ANONYMOUS,
            line: lineOf(spec),
            abstract: spec.childForFieldName('type')?.type === 'interface_type'
          })
        }
        break
    }
  }
  return { functions, classes: [], declarations }
}
