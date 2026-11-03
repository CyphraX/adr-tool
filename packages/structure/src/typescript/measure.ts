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
  lcom4Of,
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

function hasBody(node: ts.Node): node is Body {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.body !== undefined
  )
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
  return givenName(node, source) ?? (node.name?.text || ANONYMOUS)
}

/** The name of a class, as the file gives it. */
function className(node: ts.ClassLikeDeclaration, source: ts.SourceFile): string {
  if (ts.isClassDeclaration(node)) {
    return (
      node.name?.text ?? (hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? 'default' : ANONYMOUS)
    )
  }
  return givenName(node, source) ?? node.name?.text ?? ANONYMOUS
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

/** Whether a node decides which way the function goes: one more for its complexity. */
function decides(node: ts.Node): boolean {
  if (DECISIONS.has(node.kind)) return true
  if (ts.isBinaryExpression(node)) {
    return SHORT_CIRCUIT.has(node.operatorToken.kind) || isDestructuringDefault(node)
  }
  if (ts.isParameter(node) || ts.isBindingElement(node)) return node.initializer !== undefined
  if (ts.isShorthandPropertyAssignment(node)) return node.objectAssignmentInitializer !== undefined
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    return node.questionDotToken !== undefined
  }
  return false
}

const lineOf = (source: ts.SourceFile, position: number): number =>
  source.getLineAndCharacterOfPosition(position).line + 1

/**
 * Measure a parsed file. `component` is the name of a Svelte component, which counts as one
 * concrete declaration of its own, whatever its scripts declare.
 */
export function measureTypeScript(source: ts.SourceFile, component?: string): FileMeasures {
  const names = new Names()
  const functions: FunctionMeasure[] = []
  const classes: ClassMeasure[] = []

  const visit = (node: ts.Node, scope: Scope): void => {
    // Types decide nothing at run time.
    if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return
    if (hasBody(node)) {
      enterFunction(node, scope)
      return
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      enterClass(node, scope)
      return
    }
    if (scope.counting && decides(node)) scope.counting.complexity++
    if (ts.isObjectLiteralExpression(node)) {
      // A named object holds its methods as a class does: `api.load`.
      const name = givenName(node, source)
      const inner = name === undefined ? scope : { ...scope, names: [...scope.names, name] }
      ts.forEachChild(node, (child) => visit(child, inner))
      return
    }
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      const inner = { ...scope, names: [...scope.names, node.name.text] }
      if (node.body) visit(node.body, inner)
      return
    }
    if (ts.isPropertyDeclaration(node) && node.initializer !== undefined) {
      // A field's value is computed apart from every function, unless it is one.
      for (const decorator of ts.getDecorators(node) ?? []) visit(decorator, scope)
      if (ts.isComputedPropertyName(node.name)) visit(node.name, scope)
      visit(node.initializer, { ...scope, counting: undefined })
      return
    }
    if (ts.isClassStaticBlockDeclaration(node)) {
      visit(node.body, { ...scope, counting: undefined })
      return
    }
    ts.forEachChild(node, (child) => visit(child, scope))
  }

  const enterFunction = (node: Body, scope: Scope): void => {
    // Decorators and a computed name are evaluated where the function stands, not inside it.
    for (const decorator of (ts.canHaveDecorators(node) && ts.getDecorators(node)) || []) {
      visit(decorator, scope)
    }
    if (!ts.isConstructorDeclaration(node) && node.name && ts.isComputedPropertyName(node.name)) {
      visit(node.name, scope)
    }
    const name = names.take([...scope.names, functionName(node, source)].join('.'))
    const counting: Counting = { complexity: 1 }
    const at = functions.length
    functions.push({ name, line: 0, endLine: 0, complexity: 0 })
    const inner: Scope = { names: [name], counting }
    for (const parameter of node.parameters) visit(parameter, inner)
    if (node.body) visit(node.body, inner)
    functions[at] = {
      name,
      line: lineOf(source, startOf(node, source)),
      endLine: lineOf(source, node.end),
      complexity: counting.complexity
    }
  }

  const enterClass = (node: ts.ClassLikeDeclaration, scope: Scope): void => {
    for (const decorator of (ts.canHaveDecorators(node) && ts.getDecorators(node)) || []) {
      visit(decorator, scope)
    }
    for (const clause of node.heritageClauses ?? []) visit(clause, scope)
    const name = names.take([...scope.names, className(node, source)].join('.'))
    const at = classes.length
    classes.push({ name, line: 0, endLine: 0, methods: 0, lcom4: undefined })
    const inner: Scope = { names: [name], counting: scope.counting }
    for (const member of node.members) visit(member, inner)
    const methods = methodsOf(node, source)
    classes[at] = {
      name,
      line: lineOf(source, startOf(node, source)),
      endLine: lineOf(source, node.end),
      methods: methods.length,
      lcom4: lcom4Of(methods)
    }
  }

  ts.forEachChild(source, (child) => visit(child, { names: [], counting: undefined }))
  return {
    functions,
    classes,
    declarations:
      component === undefined
        ? declarationsOf(source)
        : [{ name: component, line: 1, abstract: false }]
  }
}

/** The members a method uses: `this.x`, `Class.x` for a static one, `const { x } = this`. */
function usesOf(body: ts.Node, own: string | undefined): Set<string> {
  const used = new Set<string>()
  const visit = (node: ts.Node, ownThis: boolean): void => {
    // A class inside has a `this` of its own; a function written with `function` too.
    if (ts.isClassLike(node)) return
    const keepsThis = !(ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node))
    const isSelf = (expression: ts.Expression): boolean =>
      (ownThis && expression.kind === ts.SyntaxKind.ThisKeyword) ||
      (own !== undefined && ts.isIdentifier(expression) && expression.text === own)
    if (ts.isPropertyAccessExpression(node) && isSelf(node.expression)) used.add(node.name.text)
    if (
      ts.isElementAccessExpression(node) &&
      isSelf(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      used.add(node.argumentExpression.text)
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
    ts.forEachChild(node, (child) => visit(child, ownThis && keepsThis))
  }
  visit(body, true)
  return used
}

/** The methods of a class with what each uses, for LCOM4; constructors are left out. */
function methodsOf(node: ts.ClassLikeDeclaration, source: ts.SourceFile): MethodUses[] {
  const fields = new Set<string>()
  const methods: { name: string; body: ts.Node }[] = []
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
        methods.push({ name, body: ts.isFunctionExpression(value) ? value.body : value })
      } else fields.add(name)
    }
  }
  const methodNames = new Set(methods.map((method) => method.name))
  const own = node.name?.text
  return methods.map(({ name, body }) => {
    const used = usesOf(body, own)
    return {
      name,
      fields: new Set([...used].filter((member) => fields.has(member))),
      calls: new Set([...used].filter((member) => methodNames.has(member)))
    }
  })
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
