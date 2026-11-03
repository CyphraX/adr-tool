/**
 * What is measured inside a TypeScript, JavaScript or Svelte file (docs/structure-format.md,
 * section 5, "Inside a Source File"), from the tree TypeScript's parser built for its uses:
 * the cyclomatic complexity of each function, the LCOM4 of each class, the declarations that
 * abstractness counts. No type checker runs (ADR-0008).
 *
 * Complexity is counted as ESLint's rule `complexity` counts it, in its classic variant: 1 for
 * the function, and 1 for each `if`, `?:`, `&&`, `||`, `??`, `&&=`, `||=`, `??=`, loop, `case`
 * with a value, `catch`, default value of a parameter or of a destructuring, and optional
 * call or access `?.`. Every function counts on its own, an arrow function passed as an
 * argument too: what it decides is not counted for the function it is written in.
 */
import ts from 'typescript'
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

/** Where the walk is: the names of what contains it, and the function its decisions count for. */
interface Scope {
  readonly names: readonly string[]
  /** `undefined` outside a function: a module's top level, a class field's value, a static block. */
  readonly counting: Counting | undefined
}

/** The operators that decide whether their right side runs. */
const SHORT_CIRCUIT = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken
])

const DECISIONS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.CaseClause
])

/** A function with a body: what has a complexity. Overloads and abstract methods have none. */
type Body =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration

const FUNCTIONS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor
])

// The walk asks these of every node: by its kind, which is quicker than asking TypeScript.
function hasBody(node: ts.Node): node is Body {
  return FUNCTIONS.has(node.kind) && (node as Body).body !== undefined
}

/** What a value is once the parentheses and the assertions around it are taken off. */
function unwrapped(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression
  }
  return node
}

/** The node a value stands in, past what `unwrapped` takes off. */
function holderOf(node: ts.Node): { holder: ts.Node; value: ts.Node } {
  let value = node
  let holder = node.parent
  while (
    ts.isParenthesizedExpression(holder) ||
    ts.isAsExpression(holder) ||
    ts.isSatisfiesExpression(holder) ||
    ts.isTypeAssertionExpression(holder) ||
    ts.isNonNullExpression(holder)
  ) {
    value = holder
    holder = holder.parent
  }
  return { holder, value }
}

/** The name of a property, a method, a field: as written, `[expression]` when computed. */
function propertyName(
  name: ts.PropertyName | undefined,
  source: ts.SourceFile
): string | undefined {
  if (name === undefined) return undefined
  if (ts.isComputedPropertyName(name)) return `[${name.expression.getText(source)}]`
  if (
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text
  }
  return undefined
}

/**
 * The name a value is given where it stands: the variable, property or field it is assigned
 * to, `default` for what a module exports by default; `undefined` where it is given none.
 */
function givenName(node: ts.Node, source: ts.SourceFile): string | undefined {
  const { holder, value } = holderOf(node)
  if (ts.isVariableDeclaration(holder) && holder.initializer === value) {
    return ts.isIdentifier(holder.name) ? holder.name.text : undefined
  }
  if (ts.isPropertyAssignment(holder) && holder.initializer === value) {
    return propertyName(holder.name, source)
  }
  if (ts.isPropertyDeclaration(holder) && holder.initializer === value) {
    return propertyName(holder.name, source)
  }
  if (
    ts.isBinaryExpression(holder) &&
    holder.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    holder.right === value
  ) {
    const target = holder.left
    if (ts.isIdentifier(target)) return target.text
    if (ts.isPropertyAccessExpression(target)) return target.name.text
    if (ts.isElementAccessExpression(target) && ts.isStringLiteralLike(target.argumentExpression)) {
      return target.argumentExpression.text
    }
    return undefined
  }
  if (ts.isExportAssignment(holder) && holder.expression === value) return 'default'
  return undefined
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false)

/** The name of a function, as the file gives it. */
function functionName(node: Body, source: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) return 'constructor'
  if (ts.isMethodDeclaration(node)) return propertyName(node.name, source) ?? ANONYMOUS
  if (ts.isGetAccessorDeclaration(node)) return `get ${propertyName(node.name, source) ?? ''}`
  if (ts.isSetAccessorDeclaration(node)) return `set ${propertyName(node.name, source) ?? ''}`
  if (ts.isFunctionDeclaration(node)) {
    return (
      node.name?.text ?? (hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default' : ANONYMOUS)
    )
  }
  return givenName(node, source) ?? (node.name?.text || calledWith(node) || ANONYMOUS)
}

/** The name of a class, as the file gives it. */
function className(node: ts.ClassLikeDeclaration, source: ts.SourceFile): string {
  if (ts.isClassDeclaration(node)) {
    return (
      node.name?.text ?? (hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default' : ANONYMOUS)
    )
  }
  return givenName(node, source) ?? node.name?.text ?? calledWith(node) ?? ANONYMOUS
}

/**
 * The name of a value passed to a call, by the call: `load.map()` for the callback of
 * `load.map(…)`, `new Promise()` for that of `new Promise(…)`, `items.filter().map()` along a
 * chain; `undefined` where the value is no argument, or the call names nothing.
 */
function calledWith(node: ts.Node): string | undefined {
  const { holder, value } = holderOf(node)
  if (!(ts.isCallExpression(holder) || ts.isNewExpression(holder))) return undefined
  if (!holder.arguments?.some((argument) => argument === value)) return undefined
  const callee = calleeName(holder.expression)
  if (callee === undefined) return undefined
  return ts.isNewExpression(holder) ? `new ${callee}()` : `${callee}()`
}

/**
 * What a call calls, as written without its arguments: `liveMarks.iterate`,
 * `items.filter().map`, `this.view.dispatch`. Where it begins with what has no name — `[1].map`
 * —, from the first name on: `map`.
 */
function calleeName(expression: ts.Expression): string | undefined {
  let written = ''
  for (let at: ts.Expression = expression; ;) {
    at = unwrapped(at)
    if (ts.isIdentifier(at) || ts.isPrivateIdentifier(at)) return at.text + written
    if (at.kind === ts.SyntaxKind.ThisKeyword) return `this${written}`
    if (at.kind === ts.SyntaxKind.SuperKeyword) return `super${written}`
    if (ts.isPropertyAccessExpression(at)) {
      written = `.${at.name.text}${written}`
      at = at.expression
    } else if (ts.isCallExpression(at)) {
      written = `()${written}`
      at = at.expression
    } else if (ts.isElementAccessExpression(at)) {
      written = `[]${written}`
      at = at.expression
    } else {
      const named = written.replace(/^(?:\(\)|\[\])*\.?/, '')
      return named === '' ? undefined : named
    }
  }
}

/**
 * Where a function or class begins: past its decorators, which are written above it and
 * belong to what contains it.
 */
function startOf(node: ts.Node, source: ts.SourceFile): number {
  const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined
  if (!decorators?.length) return node.getStart(source)
  const after = decorators[decorators.length - 1]!.end
  const tokens = node
    .getChildren(source)
    .flatMap((child) =>
      child.kind === ts.SyntaxKind.SyntaxList ? child.getChildren(source) : [child]
    )
  return tokens.find((token) => token.pos >= after)?.getStart(source) ?? node.getStart(source)
}

/** `[a = 1] = list`, `({ a: b = 1 } = object)`: a default in a destructuring assignment. */
function isDestructuringDefault(node: ts.BinaryExpression): boolean {
  if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false
  let pattern: ts.Node = node
  for (;;) {
    const parent = pattern.parent
    if (
      ts.isArrayLiteralExpression(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isSpreadAssignment(parent) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === pattern) ||
      (ts.isObjectLiteralExpression(parent) && pattern !== node)
    ) {
      pattern = parent
      continue
    }
    break
  }
  if (
    pattern === node ||
    (!ts.isArrayLiteralExpression(pattern) && !ts.isObjectLiteralExpression(pattern))
  ) {
    return false
  }
  const top = pattern.parent
  return (
    (ts.isBinaryExpression(top) &&
      top.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      top.left === pattern) ||
    ((ts.isForOfStatement(top) || ts.isForInStatement(top)) && top.initializer === pattern)
  )
}

// The kinds `decides` asks about, read from TypeScript once: a switch over `ts.SyntaxKind.…`
// would look each of them up again for every node.
const BINARY = ts.SyntaxKind.BinaryExpression
const PARAMETER = ts.SyntaxKind.Parameter
const BINDING_ELEMENT = ts.SyntaxKind.BindingElement
const SHORTHAND = ts.SyntaxKind.ShorthandPropertyAssignment
const PROPERTY_ACCESS = ts.SyntaxKind.PropertyAccessExpression
const ELEMENT_ACCESS = ts.SyntaxKind.ElementAccessExpression
const CALL = ts.SyntaxKind.CallExpression

/** Whether a node decides which way the function goes: one more for its complexity. */
function decides(node: ts.Node): boolean {
  switch (node.kind) {
    case BINARY: {
      const binary = node as ts.BinaryExpression
      return SHORT_CIRCUIT.has(binary.operatorToken.kind) || isDestructuringDefault(binary)
    }
    case PARAMETER:
    case BINDING_ELEMENT:
      return (node as ts.ParameterDeclaration | ts.BindingElement).initializer !== undefined
    case SHORTHAND:
      return (node as ts.ShorthandPropertyAssignment).objectAssignmentInitializer !== undefined
    case PROPERTY_ACCESS:
    case ELEMENT_ACCESS:
    case CALL:
      return (
        (node as ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression)
          .questionDotToken !== undefined
      )
    default:
      return DECISIONS.has(node.kind)
  }
}

const CLASS = ts.SyntaxKind.ClassDeclaration
const CLASS_EXPRESSION = ts.SyntaxKind.ClassExpression
/** What the walk treats in a way of its own; everything else it only walks through. */
const SPECIAL = new Set([
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.ModuleDeclaration,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.ClassStaticBlockDeclaration
])
/**
 * The kinds of the nodes of types — what TypeScript's `isTypeNode` says by the kind alone —
 * but not `extends Base<T>`, whose `Base` is a value.
 */
const TYPES = new Set(
  Object.values(ts.SyntaxKind)
    .filter((kind): kind is ts.SyntaxKind => typeof kind === 'number')
    .filter(
      (kind) =>
        kind !== ts.SyntaxKind.ExpressionWithTypeArguments && ts.isTypeNode({ kind } as ts.Node)
    )
)
const isType = (node: ts.Node): boolean => TYPES.has(node.kind)

const lineOf = (source: ts.SourceFile, position: number): number =>
  source.getLineAndCharacterOfPosition(position).line + 1

/** What the walk does next: a node to visit where it stands, or what follows on what it visited. */
type Task = { readonly node: ts.Node; readonly scope: Scope } | (() => void)

/**
 * Measure a parsed file. `component` is the name of a Svelte component, which counts as one
 * concrete declaration of its own, whatever its scripts declare.
 *
 * The walk keeps a stack of its own, in the order of the file: a chain of 4,000 `+` or 1,000
 * nested `if`s is as deep a tree, which would exhaust the runtime's.
 */
export function measureTypeScript(source: ts.SourceFile, component?: string): FileMeasures {
  const names = new Names()
  const functions: (Omit<FunctionMeasure, 'complexity'> & { readonly counting: Counting })[] = []
  const classes: ClassMeasure[] = []
  const stack: Task[] = []
  /** Do the tasks next, the first first. */
  const next = (...tasks: Task[]): void => {
    for (let index = tasks.length - 1; index >= 0; index--) stack.push(tasks[index]!)
  }
  /** Visit the children of a node next, in their order. */
  const nextChildren = (node: ts.Node, scope: Scope): void => {
    const from = stack.length
    ts.forEachChild(node, (child) => {
      stack.push({ node: child, scope })
    })
    for (let a = from, b = stack.length - 1; a < b; a++, b--) {
      const task = stack[a]!
      stack[a] = stack[b]!
      stack[b] = task
    }
  }
  const decoratorsOf = (node: ts.Node, scope: Scope): Task[] =>
    ((ts.canHaveDecorators(node) && ts.getDecorators(node)) || []).map((decorator) => ({
      node: decorator,
      scope
    }))

  const visit = (node: ts.Node, scope: Scope): void => {
    // Types decide nothing at run time.
    if (isType(node)) return
    if (hasBody(node)) {
      enterFunction(node, scope)
      return
    }
    if (node.kind === CLASS || node.kind === CLASS_EXPRESSION) {
      enterClass(node as ts.ClassLikeDeclaration, scope)
      return
    }
    if (scope.counting && decides(node)) scope.counting.complexity++
    if (!SPECIAL.has(node.kind)) {
      nextChildren(node, scope)
      return
    }
    if (ts.isObjectLiteralExpression(node)) {
      // A named object holds its methods as a class does: `api.load`; one passed to a call is
      // named by the call, `liveMarks.iterate().enter`.
      const name = givenName(node, source) ?? calledWith(node)
      nextChildren(node, name === undefined ? scope : { ...scope, names: [...scope.names, name] })
      return
    }
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.body)
        next({ node: node.body, scope: { ...scope, names: [...scope.names, node.name.text] } })
      return
    }
    if (ts.isPropertyDeclaration(node) && node.initializer !== undefined) {
      // A field's value is computed apart from every function, unless it is one.
      next(
        ...decoratorsOf(node, scope),
        ...(ts.isComputedPropertyName(node.name) ? [{ node: node.name, scope }] : []),
        { node: node.initializer, scope: { ...scope, counting: undefined } }
      )
      return
    }
    if (ts.isClassStaticBlockDeclaration(node)) {
      next({ node: node.body, scope: { ...scope, counting: undefined } })
      return
    }
    nextChildren(node, scope)
  }

  const enterFunction = (node: Body, scope: Scope): void => {
    // Decorators and a computed name are evaluated where the function stands, not inside it.
    const computed =
      !ts.isConstructorDeclaration(node) && node.name && ts.isComputedPropertyName(node.name)
        ? [{ node: node.name, scope }]
        : []
    next(...decoratorsOf(node, scope), ...computed, () => {
      const name = names.take([...scope.names, functionName(node, source)].join('.'))
      const counting: Counting = { complexity: 1 }
      functions.push({
        name,
        line: lineOf(source, startOf(node, source)),
        endLine: lineOf(source, node.end),
        counting
      })
      const inner: Scope = { names: [name], counting }
      next(
        ...node.parameters.map((parameter) => ({ node: parameter, scope: inner })),
        ...(node.body ? [{ node: node.body, scope: inner }] : [])
      )
    })
  }

  const enterClass = (node: ts.ClassLikeDeclaration, scope: Scope): void => {
    const heritage = (node.heritageClauses ?? []).map((clause) => ({ node: clause, scope }))
    next(...decoratorsOf(node, scope), ...heritage, () => {
      const name = names.take([...scope.names, className(node, source)].join('.'))
      classes.push({
        name,
        line: lineOf(source, startOf(node, source)),
        endLine: lineOf(source, node.end),
        ...cohesionOf(methodsOf(node, source))
      })
      const inner: Scope = { names: [name], counting: scope.counting }
      next(...node.members.map((member) => ({ node: member, scope: inner })))
    })
  }

  nextChildren(source, { names: [], counting: undefined })
  for (let task = stack.pop(); task !== undefined; task = stack.pop()) {
    if (typeof task === 'function') task()
    else visit(task.node, task.scope)
  }
  return {
    functions: functions.map(({ counting, ...measured }) => ({
      ...measured,
      complexity: counting.complexity
    })),
    classes,
    declarations:
      component === undefined
        ? declarationsOf(source)
        : [{ name: component, line: 1, abstract: false }]
  }
}

/** The assignments: `=`, `+=`, `??=` and the others. */
const ASSIGNING = new Set(
  Object.values(ts.SyntaxKind)
    .filter((kind): kind is ts.SyntaxKind => typeof kind === 'number')
    .filter(
      (kind) =>
        kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastCompoundAssignment
    )
)

/** Whether a node is written to: the left side of an assignment, or what `++` and `--` change. */
function isWritten(node: ts.Node): boolean {
  const { holder, value } = holderOf(node)
  if (ts.isBinaryExpression(holder)) {
    return holder.left === value && ASSIGNING.has(holder.operatorToken.kind)
  }
  return (
    (ts.isPrefixUnaryExpression(holder) || ts.isPostfixUnaryExpression(holder)) &&
    (holder.operator === ts.SyntaxKind.PlusPlusToken ||
      holder.operator === ts.SyntaxKind.MinusMinusToken)
  )
}

/**
 * What a member of a class uses of its class: `this.x`, `Class.x` for a static one,
 * `const { x } = this`; and of them, what it writes to, `this.x = …`.
 */
function selfUses(
  member: ts.Node,
  own: string | undefined
): { readonly used: Set<string>; readonly written: Set<string> } {
  const used = new Set<string>()
  const written = new Set<string>()
  // The walk keeps a stack of its own, as `measureTypeScript` does; each node with whether its
  // `this` is the instance. Every function inside but an arrow function has a `this` of its
  // own — written with `function`, a method or accessor of an object —, and so does a class.
  const stack: [ts.Node, boolean][] = []
  ts.forEachChild(member, (child) => {
    stack.push([child, true])
  })
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [node, ownThis] = top
    if (ts.isClassLike(node)) continue
    const keepsThis = !(hasBody(node) && !ts.isArrowFunction(node))
    const isSelf = (expression: ts.Expression): boolean =>
      (ownThis && expression.kind === ts.SyntaxKind.ThisKeyword) ||
      (own !== undefined && ts.isIdentifier(expression) && expression.text === own)
    const use = (name: string): void => {
      used.add(name)
      if (isWritten(node)) written.add(name)
    }
    if (ts.isPropertyAccessExpression(node) && isSelf(node.expression)) use(node.name.text)
    if (
      ts.isElementAccessExpression(node) &&
      isSelf(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      use(node.argumentExpression.text)
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      isSelf(unwrapped(node.initializer)) &&
      ts.isObjectBindingPattern(node.name)
    ) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name
        const name = ts.isIdentifier(key) ? key.text : undefined
        if (name !== undefined) used.add(name)
      }
    }
    // The order does not matter here: what is used is a set.
    ts.forEachChild(node, (child) => {
      stack.push([child, ownThis && keepsThis])
    })
  }
  return { used, written }
}

/**
 * The methods of a class with what each uses, for LCOM4; constructors are left out. The
 * fields are what the class declares as properties — in its body, or as parameter properties —
 * and what it writes to as `this.x` anywhere in its members, as JavaScript declares them.
 */
function methodsOf(node: ts.ClassLikeDeclaration, source: ts.SourceFile): MethodUses[] {
  const fields = new Set<string>()
  const methods: { name: string; body: ts.Node }[] = []
  /** The members that only write fields: constructors, static blocks, field values. */
  const others: ts.Node[] = []
  for (const member of node.members) {
    if (ts.isConstructorDeclaration(member)) {
      // Parameter properties are fields: `constructor(private readonly lines: Line[])`.
      for (const parameter of member.parameters) {
        if (
          ts.isParameterPropertyDeclaration(parameter, member) &&
          ts.isIdentifier(parameter.name)
        ) {
          fields.add(parameter.name.text)
        }
      }
      others.push(member)
      continue
    }
    if (ts.isClassStaticBlockDeclaration(member)) {
      others.push(member)
      continue
    }
    const name = ts.isClassElement(member) ? propertyName(member.name, source) : undefined
    if (name === undefined) continue
    if (
      (ts.isMethodDeclaration(member) ||
        ts.isGetAccessorDeclaration(member) ||
        ts.isSetAccessorDeclaration(member)) &&
      member.body !== undefined
    ) {
      methods.push({ name, body: member })
    } else if (ts.isPropertyDeclaration(member)) {
      const value = member.initializer && unwrapped(member.initializer)
      if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
        // Called as a method, a function written with `function` has the instance as `this`.
        methods.push({ name, body: value })
      } else {
        fields.add(name)
        if (member.initializer) others.push(member)
      }
    }
  }
  const methodNames = new Set(methods.map((method) => method.name))
  const own = node.name?.text
  const uses = methods.map(({ name, body }) => ({ name, ...selfUses(body, own) }))
  for (const { written } of [...uses, ...others.map((member) => selfUses(member, own))]) {
    for (const field of written) if (!methodNames.has(field)) fields.add(field)
  }
  return uses.map(({ name, used }) => ({
    name,
    fields: new Set([...used].filter((member) => fields.has(member))),
    calls: new Set([...used].filter((member) => methodNames.has(member)))
  }))
}

/**
 * What abstractness counts in a module (section 5, "Abstractness"): what it declares at its
 * top level and inside its namespaces — classes, interfaces, type aliases, enums and
 * functions, a function also as a variable initialised with one. Abstract are interfaces, type
 * aliases, abstract classes, and what is declared without an implementation: in a declaration
 * file or under `declare`.
 */
function declarationsOf(source: ts.SourceFile): DeclarationMeasure[] {
  const found: DeclarationMeasure[] = []
  const add = (name: string, node: ts.Node, abstract: boolean): void => {
    found.push({ name, line: lineOf(source, startOf(node, source)), abstract })
  }
  const walk = (
    statements: readonly ts.Statement[],
    names: readonly string[],
    ambient: boolean
  ): void => {
    /** Functions declared without a body, by name: counted once, and not beside their implementation. */
    const signatures = new Set<string>()
    const implemented = new Set(
      statements.flatMap((statement) =>
        ts.isFunctionDeclaration(statement) && statement.body && statement.name
          ? [statement.name.text]
          : []
      )
    )
    const qualified = (name: string): string => [...names, name].join('.')
    for (const statement of statements) {
      const declared = ambient || hasModifier(statement, ts.SyntaxKind.DeclareKeyword)
      const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      const named = (name: ts.Identifier | undefined): string =>
        qualified(name?.text ?? (isDefault ? 'default' : ANONYMOUS))
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
        add(named(statement.name), statement, true)
      } else if (ts.isClassDeclaration(statement)) {
        add(
          named(statement.name),
          statement,
          declared || hasModifier(statement, ts.SyntaxKind.AbstractKeyword)
        )
      } else if (ts.isEnumDeclaration(statement)) {
        add(named(statement.name), statement, declared)
      } else if (ts.isFunctionDeclaration(statement)) {
        const name = named(statement.name)
        if (statement.body) add(name, statement, false)
        else if (
          declared &&
          !implemented.has(statement.name?.text ?? '') &&
          !signatures.has(name)
        ) {
          signatures.add(name)
          add(name, statement, true)
        }
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const value = declaration.initializer && unwrapped(declaration.initializer)
          if (
            value &&
            ts.isIdentifier(declaration.name) &&
            (ts.isArrowFunction(value) ||
              ts.isFunctionExpression(value) ||
              ts.isClassExpression(value))
          ) {
            add(qualified(declaration.name.text), declaration, false)
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        const value = unwrapped(statement.expression)
        if (
          ts.isArrowFunction(value) ||
          ts.isFunctionExpression(value) ||
          ts.isClassExpression(value)
        ) {
          add(qualified('default'), statement, false)
        }
      } else if (ts.isModuleDeclaration(statement)) {
        // `namespace a.b {}` is a namespace inside a namespace; `declare module 'x' {}` names none.
        let body: ts.ModuleDeclaration['body'] = statement.body
        const inner = ts.isIdentifier(statement.name) ? [...names, statement.name.text] : [...names]
        while (body && ts.isModuleDeclaration(body)) {
          if (ts.isIdentifier(body.name)) inner.push(body.name.text)
          body = body.body
        }
        if (body && ts.isModuleBlock(body)) walk(body.statements, inner, declared)
      }
    }
  }
  walk(source.statements, [], source.isDeclarationFile)
  return found
}
