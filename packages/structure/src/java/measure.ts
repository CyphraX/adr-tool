/**
 * What is measured inside a Java file (docs/structure-format.md, section 5, "Inside a Source
 * File"), from the tree `tree-sitter-java` built for its outline (ADR-0008): the cyclomatic
 * complexity of each method and constructor, the LCOM4 of each class, the types that
 * abstractness counts.
 *
 * Complexity is counted as Checkstyle's `CyclomaticComplexity` counts it, each `case` on its
 * own: 1 for the method, and 1 for each `if`, loop, `case` label (not `default`), `when` guard,
 * `catch`, `?:`, `&&` and `||`. A lambda counts towards the method it is written in; one in
 * the initializer of a field is a function of its own, named by the field.
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

/** Types a file declares; all of them are counted for abstractness. */
const TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration'
])
/** The types that have state and methods of their own, for LCOM4. */
const CLASSES = new Set(['class_declaration', 'enum_declaration', 'record_declaration'])
const FUNCTIONS = new Set([
  'method_declaration',
  'constructor_declaration',
  'compact_constructor_declaration'
])
const DECISIONS = new Set([
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'catch_clause',
  'ternary_expression',
  'guard'
])

/** Whether a node decides which way the method goes: one more for its complexity. */
function decides(node: Node): boolean {
  if (DECISIONS.has(node.type)) return true
  if (node.type === 'binary_expression') {
    const operator = node.childForFieldName('operator')?.type
    return operator === '&&' || operator === '||'
  }
  // `case A, B ->` is one label; `default` is none.
  return node.type === 'switch_label' && node.child(0)?.type === 'case'
}

const lineOf = (node: Node): number => node.startPosition.row + 1
const endLineOf = (node: Node): number => node.endPosition.row + 1
const children = (node: Node): Node[] => node.namedChildren.filter((child) => child !== null)

/**
 * A type as a method's name writes it: as written, without annotations and type arguments,
 * and without spaces — `List`, `String[]`, `Map.Entry`.
 */
function typeText(text: string): string {
  let type = text.replace(/@[\w.]+(?:\([^()]*\))?/g, '')
  for (let before = ''; before !== type;) {
    before = type
    type = type.replace(/<[^<>]*>/g, '')
  }
  return type.replace(/\s+/g, '')
}

/** The parameter types of a method or constructor: `(Product)`, `(String...)`, `()`. */
function signatureOf(parameters: Node | null): string {
  const types: string[] = []
  for (const parameter of parameters === null ? [] : children(parameters)) {
    if (parameter.type === 'formal_parameter') {
      const type = parameter.childForFieldName('type')?.text ?? ''
      const dimensions = parameter.childForFieldName('dimensions')?.text ?? ''
      types.push(typeText(type + dimensions))
    } else if (parameter.type === 'spread_parameter') {
      const type = children(parameter).find(
        (child) =>
          !['modifiers', 'variable_declarator', 'annotation', 'marker_annotation'].includes(
            child.type
          )
      )
      types.push(`${typeText(type?.text ?? '')}...`)
    }
  }
  return `(${types.join(',')})`
}

/** A function being counted: what its decision points are added to. */
interface Counting {
  complexity: number
}

interface Scope {
  readonly names: readonly string[]
  /** `undefined` outside a method: in a field's initializer, an initializer block. */
  readonly counting: Counting | undefined
  /** In the initializer of a field: its name, which a lambda there takes. */
  readonly field?: string
}

/**
 * Measure a parsed Java file. The walk keeps a stack of its own, in the order of the file: a
 * constant concatenated over 2,000 lines is as deep a tree, which would exhaust the runtime's.
 */
export function measureJava(root: Node): FileMeasures {
  const names = new Names()
  const functions: (Omit<FunctionMeasure, 'complexity'> & { readonly counting: Counting })[] = []
  const classes: ClassMeasure[] = []
  const declarations: DeclarationMeasure[] = []
  const stack: { readonly node: Node; readonly scope: Scope }[] = []
  /** Visit the nodes next, the first first. */
  const next = (nodes: readonly Node[], scope: Scope): void => {
    for (let index = nodes.length - 1; index >= 0; index--)
      stack.push({ node: nodes[index]!, scope })
  }

  const visit = (node: Node, scope: Scope): void => {
    if (TYPES.has(node.type)) {
      enterType(node, scope)
      return
    }
    if (FUNCTIONS.has(node.type)) {
      const body = node.childForFieldName('body')
      if (body) {
        const own = node.childForFieldName('name')
        const signature =
          node.type === 'compact_constructor_declaration'
            ? signatureOf(node.parent?.parent?.childForFieldName('parameters') ?? null)
            : signatureOf(node.childForFieldName('parameters'))
        enter(node, own ?? node, `${own?.text ?? ANONYMOUS}${signature}`, scope, [body])
      }
      return
    }
    if (node.type === 'lambda_expression' && scope.counting === undefined && scope.field) {
      enter(node, node, scope.field, scope, children(node))
      return
    }
    if (node.type === 'object_creation_expression') {
      // An anonymous class: its methods are functions of their own, inside what makes it.
      const anonymous: Scope = { names: [...scope.names, ANONYMOUS], counting: undefined }
      const parts = children(node)
      for (let index = parts.length - 1; index >= 0; index--) {
        const part = parts[index]!
        stack.push({ node: part, scope: part.type === 'class_body' ? anonymous : scope })
      }
      return
    }
    if (node.type === 'field_declaration' || node.type === 'constant_declaration') {
      const values: { node: Node; scope: Scope }[] = []
      for (const child of children(node)) {
        if (child.type !== 'variable_declarator') continue
        const field = child.childForFieldName('name')?.text
        const value = child.childForFieldName('value')
        if (value)
          values.push({
            node: value,
            scope: { ...scope, counting: undefined, ...(field && { field }) }
          })
      }
      for (let index = values.length - 1; index >= 0; index--) stack.push(values[index]!)
      return
    }
    if (node.type === 'enum_constant') {
      const body = node.childForFieldName('body')
      const inner: Scope = {
        names: [...scope.names, node.childForFieldName('name')?.text ?? ANONYMOUS],
        counting: undefined
      }
      const parts = children(node)
      for (let index = parts.length - 1; index >= 0; index--) {
        const part = parts[index]!
        stack.push({ node: part, scope: body !== null && part.equals(body) ? inner : scope })
      }
      return
    }
    if (
      node.type === 'static_initializer' ||
      (node.type === 'block' && node.parent?.type === 'class_body')
    ) {
      // An initializer block runs apart from every method.
      next(children(node), { ...scope, counting: undefined })
      return
    }
    if (scope.counting && decides(node)) scope.counting.complexity++
    next(children(node), scope)
  }

  const enter = (node: Node, named: Node, written: string, scope: Scope, parts: Node[]): void => {
    const name = names.take([...scope.names, written].join('.'))
    const counting: Counting = { complexity: 1 }
    functions.push({ name, line: lineOf(named), endLine: endLineOf(node), counting })
    next(parts, { names: [name], counting })
  }

  const enterType = (node: Node, scope: Scope): void => {
    const own = node.childForFieldName('name')
    const name = names.take([...scope.names, own?.text ?? ANONYMOUS].join('.'))
    const modifiers = children(node).find((child) => child.type === 'modifiers')
    const isAbstract =
      node.type === 'interface_declaration' ||
      node.type === 'annotation_type_declaration' ||
      (modifiers?.children.some((child) => child?.type === 'abstract') ?? false)
    declarations.push({ name, line: lineOf(own ?? node), abstract: isAbstract })
    if (CLASSES.has(node.type)) {
      classes.push({
        name,
        line: lineOf(own ?? node),
        endLine: endLineOf(node),
        ...cohesionOf(methodsOf(node))
      })
    }
    // What a type's header computes — an annotation's value — belongs to no method.
    next(children(node), { names: [name], counting: undefined })
  }

  next(children(root), { names: [], counting: undefined })
  for (let task = stack.pop(); task !== undefined; task = stack.pop()) visit(task.node, task.scope)
  return {
    functions: functions.map(({ counting, ...measured }) => ({
      ...measured,
      complexity: counting.complexity
    })),
    classes,
    declarations
  }
}

/** The members of a class body, enum constants' bodies aside. */
function membersOf(type: Node): Node[] {
  const body = type.childForFieldName('body')
  if (!body) return []
  return children(body).flatMap((member) =>
    member.type === 'enum_body_declarations' ? children(member) : [member]
  )
}

/** Where the names a method declares are seen: innermost first. */
interface Locals {
  readonly names: Set<string>
  readonly outer: Locals | undefined
}

const declares = (locals: Locals | undefined, name: string): boolean => {
  for (let at = locals; at !== undefined; at = at.outer) if (at.names.has(name)) return true
  return false
}

/** What opens a scope for the names declared inside it, Java's blocks and their kin. */
const SCOPES = new Set([
  'block',
  'constructor_body',
  'switch_block',
  'switch_rule',
  'lambda_expression',
  'catch_clause',
  'for_statement',
  'enhanced_for_statement',
  'try_with_resources_statement'
])

/** What declares a name in its field `name`. */
const DECLARING = new Set([
  'variable_declarator',
  'formal_parameter',
  'catch_formal_parameter',
  'enhanced_for_statement',
  'instanceof_expression',
  'resource'
])

/** What declares each identifier among its children: lambda parameters, patterns. */
const LISTING = new Set(['inferred_parameters', 'type_pattern', 'record_pattern_component'])

/** Where a plain name is no member used: a label, an annotation, a package. */
const NOT_A_USE = new Set([
  'labeled_statement',
  'break_statement',
  'continue_statement',
  'marker_annotation',
  'annotation',
  'element_value_pair',
  'scoped_identifier'
])

/**
 * The methods of a class with the members of the class each uses, for LCOM4: a field read or
 * written by its plain name where no local of that name is seen, through `this.`, or through
 * the class's own name — `Line.TOTAL` —; a method called or referenced, `this::m`. A field a
 * method reference is taken on, `allowed::contains`, is used. In a class inside the method,
 * `this` is that class's own.
 */
function methodsOf(type: Node): MethodUses[] {
  const fields = new Set<string>()
  const methods: { name: string; node: Node }[] = []
  if (type.type === 'record_declaration') {
    for (const component of children(type.childForFieldName('parameters') ?? type)) {
      const name = component.childForFieldName('name')?.text
      if (component.type === 'formal_parameter' && name) fields.add(name)
    }
  }
  for (const member of membersOf(type)) {
    if (member.type === 'field_declaration') {
      for (const declarator of children(member)) {
        const name =
          declarator.type === 'variable_declarator' && declarator.childForFieldName('name')
        if (name) fields.add(name.text)
      }
    } else if (member.type === 'enum_constant') {
      const name = member.childForFieldName('name')?.text
      if (name) fields.add(name)
    } else if (member.type === 'method_declaration' && member.childForFieldName('body')) {
      methods.push({ name: member.childForFieldName('name')?.text ?? '', node: member })
    }
  }
  const methodNames = new Set(methods.map((method) => method.name))
  const own = type.childForFieldName('name')?.text

  return methods.map(({ name, node }) => {
    const usedFields = new Set<string>()
    const calls = new Set<string>()
    // The walk keeps a stack of its own, in the order of the method, so that a local is seen
    // only after it is declared and only inside its scope: `count++; { int count = 1; }` uses
    // the field. Each node with the locals seen there, and whether its `this` is the instance.
    type Task = { readonly node: Node; readonly locals: Locals; readonly ownThis: boolean }
    const stack: Task[] = []
    const next = (nodes: readonly Node[], locals: Locals, ownThis: boolean): void => {
      for (let index = nodes.length - 1; index >= 0; index--) {
        stack.push({ node: nodes[index]!, locals, ownThis })
      }
    }
    /** Whether an expression is the instance or the class, through which a member is used. */
    const isSelf = (object: Node | null, task: Task): boolean =>
      object === null ||
      (object.type === 'this' && task.ownThis) ||
      (object.type === 'identifier' && object.text === own && !declares(task.locals, own))
    const parameters = node.childForFieldName('parameters')
    next(
      [...(parameters ? [parameters] : []), node.childForFieldName('body')!],
      { names: new Set(), outer: undefined },
      true
    )
    for (let task = stack.pop(); task !== undefined; task = stack.pop()) {
      const current = task.node
      // A class declared inside the method is a class of its own.
      if (TYPES.has(current.type)) continue
      const locals = SCOPES.has(current.type)
        ? { names: new Set<string>(), outer: task.locals }
        : task.locals
      if (DECLARING.has(current.type)) {
        const declared = current.childForFieldName('name')
        if (declared) locals.names.add(declared.text)
      }
      if (LISTING.has(current.type)) {
        for (const child of children(current)) {
          if (child.type === 'identifier') locals.names.add(child.text)
        }
      }
      if (current.type === 'lambda_expression') {
        const declared = current.childForFieldName('parameters')
        if (declared?.type === 'identifier') locals.names.add(declared.text)
      }
      if (current.type === 'method_invocation') {
        const called = current.childForFieldName('name')?.text
        if (called !== undefined && isSelf(current.childForFieldName('object'), task)) {
          if (methodNames.has(called)) calls.add(called)
          // A record's component is read through the accessor of its name.
          else if (fields.has(called)) usedFields.add(called)
        }
      } else if (current.type === 'field_access') {
        const field = current.childForFieldName('field')?.text
        if (
          field !== undefined &&
          fields.has(field) &&
          isSelf(current.childForFieldName('object'), task)
        ) {
          usedFields.add(field)
        }
      } else if (current.type === 'method_reference') {
        const [first, ...rest] = children(current)
        const referenced = rest.at(-1)
        if (first?.type === 'this' && task.ownThis && referenced?.type === 'identifier') {
          if (methodNames.has(referenced.text)) calls.add(referenced.text)
        } else if (first) {
          // What the method is taken on is read: `allowed::contains` uses the field `allowed`.
          stack.push({ node: first, locals, ownThis: task.ownThis })
        }
        continue
      } else if (
        current.type === 'identifier' &&
        fields.has(current.text) &&
        !declares(locals, current.text)
      ) {
        const parent = current.parent
        const isMember =
          (parent?.type === 'field_access' && parent.childForFieldName('field')?.equals(current)) ||
          (parent?.type === 'method_invocation' &&
            parent.childForFieldName('name')?.equals(current))
        if (
          !isMember &&
          !NOT_A_USE.has(parent?.type ?? '') &&
          !LISTING.has(parent?.type ?? '') &&
          !declaresHere(current)
        ) {
          usedFields.add(current.text)
        }
      }
      if (current.type === 'class_body') {
        // The body of an anonymous class: its `this` is its own.
        next(children(current), locals, false)
      } else next(children(current), locals, task.ownThis)
    }
    return { name, fields: usedFields, calls }
  })
}

/** Whether an identifier is the name a declaration gives, not a use. */
function declaresHere(identifier: Node): boolean {
  const parent = identifier.parent
  return (
    parent !== null &&
    DECLARING.has(parent.type) &&
    parent.childForFieldName('name')?.equals(identifier) === true
  )
}
