/**
 * The uses a TypeScript, JavaScript or Svelte file makes of other modules
 * (docs/structure-format.md, section 3): what its code imports, as written, before
 * anything is resolved. This is what the app caches per file and content; it depends on
 * nothing but the file's path and text.
 *
 * Files are parsed one by one with TypeScript's parser. No program is built and no type
 * checker runs.
 */
import ts from 'typescript'
import type { Extraction } from '../extraction'
import { measuring } from '../measures'
import { measureTypeScript } from './measure'
import { scriptOfSvelte } from './svelte'

export interface Use {
  /** The module specifier as written: `./cart`, `@acme/shared`, `node:fs`. */
  readonly specifier: string
  /** The line, from 1, on which the import, export or call that makes the use begins. */
  readonly line: number
  /** The use exists for the compiler only and is gone at run time. */
  readonly typeOnly: boolean
}

const SCRIPT_KINDS: readonly (readonly [RegExp, ts.ScriptKind])[] = [
  [/\.[cm]?ts$/, ts.ScriptKind.TS],
  [/\.tsx$/, ts.ScriptKind.TSX],
  [/\.[cm]?js$/, ts.ScriptKind.JS],
  [/\.jsx$/, ts.ScriptKind.JSX],
  // The concatenation of its script blocks, read as TypeScript.
  [/\.svelte$/, ts.ScriptKind.TS]
]

/** Files that are ES modules whatever they contain: their top level may `await`. */
const ALWAYS_A_MODULE = /\.(?:svelte|mjs|mts)$/

export function extractUses(path: string, text: string): Extraction {
  const isSvelte = path.endsWith('.svelte')
  const kind = SCRIPT_KINDS.find(([extension]) => extension.test(path))?.[1] ?? ts.ScriptKind.TS
  const code = isSvelte ? scriptOfSvelte(text) : text
  const source = ts.createSourceFile(
    // TypeScript tells a declaration file by its name; a component is read as a module.
    isSvelte ? `${path}.ts` : path,
    // TypeScript takes a file without import or export for a script, in which `await` is a
    // name. An empty export after the last line makes it a module and moves nothing.
    ALWAYS_A_MODULE.test(path) ? `${code}\nexport {}` : code,
    ts.ScriptTarget.Latest,
    // The measures ask what a function is assigned to (./measure.ts).
    true,
    kind
  )

  const error = syntaxErrorOf(source)
  if (error) {
    return {
      analysed: false,
      // Not beyond the file's own text, should the complaint be about what ends it.
      line: lineOf(source, Math.min(error.start ?? 0, code.length)),
      message: ts.flattenDiagnosticMessageText(error.messageText, '\n')
    }
  }

  const uses: Use[] = []
  const add = (node: ts.Node, literal: ts.Node | undefined, typeOnly: boolean): void => {
    if (literal === undefined || !ts.isStringLiteralLike(literal)) return
    uses.push({
      specifier: literal.text,
      line: lineOf(source, node.getStart(source)),
      typeOnly
    })
  }

  // The walk keeps a stack of its own, in the order of the file, as the measures do: a chain of
  // 4,000 `+` is as deep a tree. Each node with whether it lies in what does not exist at run
  // time — a declaration file, a module declared with `declare`.
  const stack: [ts.Node, boolean][] = []
  const nextChildren = (node: ts.Node, ambient: boolean): void => {
    const from = stack.length
    ts.forEachChild(node, (child) => {
      stack.push([child, ambient])
    })
    for (let a = from, b = stack.length - 1; a < b; a++, b--) {
      const task = stack[a]!
      stack[a] = stack[b]!
      stack[b] = task
    }
  }
  nextChildren(source, source.isDeclarationFile)
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [node, ambient] = top
    if (ts.isModuleDeclaration(node) && !ambient && isDeclared(node)) {
      nextChildren(node, true)
      continue
    }
    if (ts.isImportDeclaration(node)) {
      add(node, node.moduleSpecifier, ambient || isTypeOnlyImport(node.importClause))
      continue
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node, node.moduleSpecifier, ambient || isTypeOnlyExport(node))
      continue
    }
    if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        add(node, node.moduleReference.expression, ambient || node.isTypeOnly)
      }
      continue
    }
    if (ts.isImportTypeNode(node)) {
      // `import('./x').T` and `typeof import('./x')`, in the position of a type.
      const argument = node.argument
      if (ts.isLiteralTypeNode(argument)) add(node, argument.literal, true)
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isImport = callee.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require'
      if (isImport || isRequire) add(node, node.arguments[0], ambient)
    }
    nextChildren(node, ambient)
  }
  // A component is named by its file: `Row` for `Row.svelte`.
  const component = isSvelte ? path.slice(path.lastIndexOf('/') + 1, -'.svelte'.length) : undefined
  return { analysed: true, uses, ...measuring(() => measureTypeScript(source, component)) }
}

const isDeclared = (node: ts.ModuleDeclaration): boolean =>
  node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) ?? false

/** `import type …`, or an import whose every named binding is marked `type`. */
function isTypeOnlyImport(clause: ts.ImportClause | undefined): boolean {
  if (clause === undefined) return false
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true
  const bindings = clause.namedBindings
  return (
    clause.name === undefined &&
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  )
}

/** `export type … from`, `export type * from`, or every named export marked `type`. */
function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true
  const clause = node.exportClause
  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    clause.elements.length > 0 &&
    clause.elements.every((element) => element.isTypeOnly)
  )
}

const lineOf = (source: ts.SourceFile, position: number): number =>
  source.getLineAndCharacterOfPosition(position).line + 1

/**
 * The first syntax error TypeScript's parser found. The parser keeps them on the source file
 * without making the list public; the alternative, a program per file, doubles the time and
 * adds complaints that are not about syntax (types written into a `.js` file, as Flow does).
 * The test of a broken file fails should the list ever move.
 */
function syntaxErrorOf(source: ts.SourceFile): ts.Diagnostic | undefined {
  const { parseDiagnostics } = source as ts.SourceFile & {
    readonly parseDiagnostics?: readonly ts.Diagnostic[]
  }
  return parseDiagnostics?.[0]
}
