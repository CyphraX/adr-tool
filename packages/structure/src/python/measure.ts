/**
 * What is measured inside a Python file (docs/structure-format.md, section 5, "Inside a Source
 * File"), from the tree `tree-sitter-python` built for its imports (ADR-0008): the cyclomatic
 * complexity of each function and method, the LCOM4 of each class, the classes and functions
 * that abstractness counts.
 *
 * Complexity is counted as radon counts it (`radon cc`): 1 for the function, and 1 for each
 * `if`, `elif` and conditional expression, each `and` and `or`, each loop and one more for its
 * `else`, each `except` and one more for the `else` of the `try`, each `for` and `if` of a
 * comprehension, each `case` but an irrefutable one, and each `assert`, of which nothing
 * inside is counted. A lambda counts towards the function it is written in; a function inside
 * a function is a function of its own. Only a function's body is counted: not its decorators,
 * nor the default values of its parameters.
 */
import type { Node } from 'web-tree-sitter'
import {
  ANONYMOUS,
  cohesionOf,
  Names,
  type ClassMeasure,
  type DeclarationMeasure,
  type FileMeasures,
  type FunctionMeasure,
  type MethodUses
} from '../measures'

/** A function being counted: what its decision points are added to. */
interface Counting {
  complexity: number
}

interface Scope {
  readonly names: readonly string[]
  /** `undefined` outside a function: the module's top level, a class's body. */
  readonly counting: Counting | undefined
}

/** What decides, one each. */
const DECISIONS = new Set([
  'assert_statement',
  'if_statement',
  'elif_clause',
  'conditional_expression',
  'boolean_operator',
  'for_in_clause'
])
/** What the comprehensions are, whose `if` decides. */
const COMPREHENSIONS = new Set([
  'list_comprehension',
  'set_comprehension',
  'dictionary_comprehension',
  'generator_expression'
])

const lineOf = (node: Node): number => node.startPosition.row + 1
const endLineOf = (node: Node): number => node.endPosition.row + 1
const children = (node: Node): Node[] => node.namedChildren.filter((child) => child !== null)

/** How much a node adds to the complexity of the function it is in. */
function decisionsOf(node: Node): number {
  if (DECISIONS.has(node.type)) return 1
  switch (node.type) {
    case 'for_statement':
    case 'while_statement':
      // A loop, and its `else`.
      return node.childForFieldName('alternative') ? 2 : 1
    case 'if_clause':
      // In a comprehension; the guard of a `case` decides nothing of its own.
      return COMPREHENSIONS.has(node.parent?.type ?? '') ? 1 : 0
    case 'try_statement': {
      const clauses = children(node)
      const handlers = clauses.filter((clause) => clause.type === 'except_clause')
      // radon counts a `try` with `except*` not at all.
      if (handlers.some((handler) => handler.children.some((child) => child?.type === '*'))) {
        return 0
      }
      return handlers.length + (clauses.some((clause) => clause.type === 'else_clause') ? 1 : 0)
    }
    case 'match_statement': {
      const cases = children(node.childForFieldName('body') ?? node).filter(
        (child) => child.type === 'case_clause'
      )
      // An irrefutable case, `case _:` or `case name:`, is the match's `else`.
      return Math.max(0, cases.length - (cases.some(isIrrefutable) ? 1 : 0))
    }
    default:
      return 0
  }
}

/** `case _:`, `case name:`: a case that matches whatever comes, as radon tells it. */
function isIrrefutable(clause: Node): boolean {
  const patterns = children(clause).filter((child) => child.type === 'case_pattern')
  if (patterns.length !== 1) return false
  const inner = children(patterns[0]!)
  if (inner.length === 0) return true
  const only = inner[0]!
  return inner.length === 1 && only.type === 'dotted_name' && children(only).length === 1
}

/** The definition a decorated one wraps; the node itself otherwise. */
const definitionOf = (node: Node): Node =>
  node.type === 'decorated_definition' ? (node.childForFieldName('definition') ?? node) : node

/** The names of the decorators of a definition, as written: `staticmethod`, `abc.abstractmethod`. */
function decoratorsOf(definition: Node): string[] {
  const parent = definition.parent
  if (parent?.type !== 'decorated_definition') return []
  return children(parent)
    .filter((child) => child.type === 'decorator')
    .map((decorator) => {
      const expression = children(decorator)[0]
      const called = expression?.type === 'call' ? expression.childForFieldName('function') : null
      return (called ?? expression)?.text ?? ''
    })
}

/**
 * Measure a parsed Python file. The walk keeps a stack of its own, in the order of the file: a
 * deep expression is as deep a tree, which would exhaust the runtime's.
 */
export function measurePython(root: Node): FileMeasures {
  const names = new Names()
  const functions: (Omit<FunctionMeasure, 'complexity'> & { readonly counting: Counting })[] = []
  const classes: ClassMeasure[] = []
  const stack: { readonly node: Node; readonly scope: Scope }[] = []
  const next = (nodes: readonly Node[], scope: Scope): void => {
    for (let index = nodes.length - 1; index >= 0; index--)
      stack.push({ node: nodes[index]!, scope })
  }

  next(children(root), { names: [], counting: undefined })
  for (let task = stack.pop(); task !== undefined; task = stack.pop()) {
    const { node, scope } = task
    if (node.type === 'function_definition') {
      // Its decorators and default values are not counted for anyone, as radon counts them.
      const name = names.take(
        [...scope.names, node.childForFieldName('name')?.text ?? ANONYMOUS].join('.')
      )
      const counting: Counting = { complexity: 1 }
      functions.push({ name, line: lineOf(node), endLine: endLineOf(node), counting })
      const body = node.childForFieldName('body')
      if (body) next([body], { names: [name], counting })
      continue
    }
    if (node.type === 'class_definition') {
      const name = names.take(
        [...scope.names, node.childForFieldName('name')?.text ?? ANONYMOUS].join('.')
      )
      classes.push({
        name,
        line: lineOf(node),
        endLine: endLineOf(node),
        ...cohesionOf(methodsOf(node))
      })
      // What a class's body computes besides its methods belongs to no function.
      const body = node.childForFieldName('body')
      if (body) next([body], { names: [name], counting: undefined })
      continue
    }
    if (node.type === 'decorated_definition') {
      const definition = node.childForFieldName('definition')
      if (definition) next([definition], scope)
      continue
    }
    if (scope.counting) {
      scope.counting.complexity += decisionsOf(node)
      // What an `assert` tests is not counted.
      if (node.type === 'assert_statement') continue
    }
    next(children(node), scope)
  }
  return {
    functions: functions.map(({ counting, ...measured }) => ({
      ...measured,
      complexity: counting.complexity
    })),
    classes,
    declarations: declarationsOf(root)
  }
}

/** What makes a class abstract: a base, a metaclass, a decorator of one of its methods. */
const ABSTRACT_BASES = new Set(['ABC', 'abc.ABC', 'Protocol', 'typing.Protocol'])
const ABSTRACT_METACLASSES = new Set(['ABCMeta', 'abc.ABCMeta'])
const ABSTRACT_METHODS = new Set(['abstractmethod', 'abc.abstractmethod'])
/** What a class is made with and initialised by: no method of its own, for LCOM4. */
const CONSTRUCTORS = new Set(['__init__', '__new__'])

/** The functions a class's body defines directly, decorated ones included. */
function methodNodesOf(type: Node): Node[] {
  const body = type.childForFieldName('body')
  return (body ? children(body) : [])
    .map(definitionOf)
    .filter((member) => member.type === 'function_definition')
}

/**
 * What abstractness counts in a module (section 5, "Abstractness"): the classes and functions
 * it defines at its top level. Abstract is a class that derives from `ABC` or `Protocol`, is
 * made by the metaclass `ABCMeta`, or has a method decorated `@abstractmethod`.
 */
function declarationsOf(root: Node): DeclarationMeasure[] {
  const found: DeclarationMeasure[] = []
  for (const statement of children(root)) {
    const definition = definitionOf(statement)
    const name = definition.childForFieldName('name')?.text ?? ANONYMOUS
    if (definition.type === 'function_definition') {
      found.push({ name, line: lineOf(definition), abstract: false })
    } else if (definition.type === 'class_definition') {
      const bases = children(definition.childForFieldName('superclasses') ?? definition)
      const abstract =
        bases.some((base) => ABSTRACT_BASES.has(base.text)) ||
        bases.some(
          (base) =>
            base.type === 'keyword_argument' &&
            base.childForFieldName('name')?.text === 'metaclass' &&
            ABSTRACT_METACLASSES.has(base.childForFieldName('value')?.text ?? '')
        ) ||
        methodNodesOf(definition).some((method) =>
          decoratorsOf(method).some((decorator) => ABSTRACT_METHODS.has(decorator))
        )
      found.push({ name, line: lineOf(definition), abstract })
    }
  }
  return found
}

/** The names a parameter list declares: `self`, `x`, `x=1`, `*args`, `**kwargs`. */
function parameterNames(parameters: Node | null): string[] {
  const declared: string[] = []
  for (const parameter of parameters ? children(parameters) : []) {
    const named =
      parameter.type === 'identifier'
        ? parameter
        : (parameter.childForFieldName('name') ??
          children(parameter).find((child) => child.type === 'identifier'))
    if (named) declared.push(named.text)
  }
  return declared
}

/**
 * The methods of a class with the members of the class each uses, for LCOM4. The fields are
 * what the class's body assigns, and what any of its methods assigns through its first
 * parameter, `self.items = []`; a use is `self.x` — `cls.x` in a class method — or `Cart.x`
 * with the class's own name. A method decorated `@staticmethod` has no `self`. Inside a class
 * within a method, and inside a function that takes a parameter of the same name, `self` is
 * another's.
 */
function methodsOf(type: Node): MethodUses[] {
  const own = type.childForFieldName('name')?.text
  const fields = new Set<string>()
  const body = type.childForFieldName('body')
  for (const statement of body ? children(body) : []) {
    if (statement.type !== 'expression_statement') continue
    for (let assigned = children(statement)[0]; assigned?.type === 'assignment';) {
      const target = assigned.childForFieldName('left')
      if (target?.type === 'identifier') fields.add(target.text)
      // `a = b = 1` assigns both.
      assigned = assigned.childForFieldName('right') ?? undefined
    }
  }

  const methods = methodNodesOf(type).map((node) => {
    const name = node.childForFieldName('name')?.text ?? ''
    const isStatic = decoratorsOf(node).includes('staticmethod')
    const self = isStatic ? undefined : parameterNames(node.childForFieldName('parameters'))[0]
    return { name, node, ...selfUses(node, self, own) }
  })
  const methodNames = new Set(
    methods.filter(({ name }) => !CONSTRUCTORS.has(name)).map(({ name }) => name)
  )
  for (const { written } of methods) {
    for (const field of written) if (!methodNames.has(field)) fields.add(field)
  }
  return methods
    .filter(({ name }) => !CONSTRUCTORS.has(name))
    .map(({ name, used }) => ({
      name,
      fields: new Set([...used].filter((member) => fields.has(member))),
      calls: new Set([...used].filter((member) => methodNames.has(member)))
    }))
}

/** What a method uses through its `self` or its class's name, and what of it it assigns. */
function selfUses(
  method: Node,
  self: string | undefined,
  own: string | undefined
): { readonly used: Set<string>; readonly written: Set<string> } {
  const used = new Set<string>()
  const written = new Set<string>()
  const body = method.childForFieldName('body')
  // The walk keeps a stack of its own; each node with the name its instance goes by there.
  const stack: [Node, string | undefined][] = body ? [[body, self]] : []
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [node, instance] = top
    if (node.type === 'class_definition') continue
    let inner = instance
    if (node.type === 'function_definition' || node.type === 'lambda') {
      const declared = parameterNames(node.childForFieldName('parameters') ?? null)
      if (instance !== undefined && declared.includes(instance)) inner = undefined
    }
    if (node.type === 'attribute') {
      const object = node.childForFieldName('object')
      const attribute = node.childForFieldName('attribute')?.text
      const isSelf =
        object?.type === 'identifier' &&
        ((instance !== undefined && object.text === instance) || object.text === own)
      if (isSelf && attribute !== undefined) {
        used.add(attribute)
        if (isAssigned(node)) written.add(attribute)
      }
    }
    for (const child of children(node)) stack.push([child, inner])
  }
  return { used, written }
}

/** Whether an attribute is assigned: the target of `=`, `+=`, `x: int =`, or within a tuple of them. */
function isAssigned(node: Node): boolean {
  let target = node
  while (
    target.parent &&
    (target.parent.type === 'pattern_list' ||
      target.parent.type === 'tuple_pattern' ||
      target.parent.type === 'list_pattern')
  ) {
    target = target.parent
  }
  const holder = target.parent
  return (
    holder !== null &&
    (holder.type === 'assignment' || holder.type === 'augmented_assignment') &&
    holder.childForFieldName('left')?.equals(target) === true
  )
}
