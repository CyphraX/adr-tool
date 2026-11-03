/**
 * What is measured inside one Source File (docs/structure-format.md, section 5, "Inside a
 * Source File"): the cyclomatic complexity of each function, the LCOM4 of each class, and the
 * declarations that abstractness counts. Each language's adapter reads them from the tree its
 * parser already builds — TypeScript's for TypeScript, JavaScript and Svelte, tree-sitter's for
 * Java (ADR-0008) — and they are extracted and cached with the file's uses (section 7): what one
 * file yields depends on that file alone. A language whose adapter measures nothing yet has
 * none, and counts towards no metric of this file.
 *
 * Nothing here parses: the adapters do. What they share is here, so that another language's
 * adapter — Python's, Go's — names its functions, counts LCOM4 and lists its declarations the
 * same way.
 */

/** A function and its cyclomatic complexity, McCabe's: 1 and one more for each decision point. */
export interface FunctionMeasure {
  /**
   * Qualified by what contains it, joined by `.`: `Cart.total`, `formatDate`, `outer.inner`,
   * `<anonymous>` for a function without a name. Unique within its Source File: where a name
   * comes again, the later ones carry `#2`, `#3`, … in the order of the file.
   */
  readonly name: string
  /** The line, from 1, on which the function begins. */
  readonly line: number
  /** The line on which it ends. */
  readonly endLine: number
  readonly complexity: number
}

/** A class and its LCOM4: how many groups its methods fall into. */
export interface ClassMeasure {
  /** Qualified as a function is: `Cart`, `Cart.Line` for a nested class. Unique within its file. */
  readonly name: string
  readonly line: number
  readonly endLine: number
  /**
   * The methods LCOM4 counts: constructors are left out, and so is a method that uses no
   * member of its class and is used by none (`cohesionOf`).
   */
  readonly methods: number
  /** The connected groups among those methods; `undefined` where there is none. */
  readonly lcom4: number | undefined
}

/** What abstractness counts: a declaration, and whether it is abstract. */
export interface DeclarationMeasure {
  readonly name: string
  readonly line: number
  readonly abstract: boolean
}

/** Everything measured in one Source File. */
export interface FileMeasures {
  /** In the order of the file. */
  readonly functions: readonly FunctionMeasure[]
  /** In the order of the file. */
  readonly classes: readonly ClassMeasure[]
  /** In the order of the file. */
  readonly declarations: readonly DeclarationMeasure[]
}

/** A Source File whose inside could not be measured. It keeps its uses all the same. */
export interface NotMeasured {
  readonly file: string
  /** What went wrong, as the runtime says it. */
  readonly message: string
}

/**
 * Measure one file, or say why it could not be: what fails measuring a file fails nothing
 * else. The file keeps its Dependencies and counts towards no metric of its inside.
 */
export function measuring(
  measure: () => FileMeasures
): { readonly measures: FileMeasures } | { readonly notMeasured: string } {
  try {
    return { measures: measure() }
  } catch (error) {
    return { notMeasured: error instanceof Error ? error.message : String(error) }
  }
}

/** The name of a function or class that has none. */
export const ANONYMOUS = '<anonymous>'

/**
 * The names of a file's functions and classes, made unique as they are met in the order of the
 * file: the first keeps its name, a later one with the same name gets `#2`, `#3`, … — so that
 * two Violations never share a fingerprint, and a function keeps its name when another one is
 * added after it. What contains a function is named by the name it was given here, so that
 * `<anonymous>#2.inner` lies in the second anonymous function. No identifier of TypeScript or
 * Java holds `#` followed by a digit, so a suffix never meets a name as written.
 */
export class Names {
  private readonly seen = new Map<string, number>()

  take(name: string): string {
    const count = (this.seen.get(name) ?? 0) + 1
    this.seen.set(name, count)
    return count === 1 ? name : `${name}#${count}`
  }
}

/** One method of a class, as LCOM4 sees it: the members of its class it uses. */
export interface MethodUses {
  readonly name: string
  /** The fields of its class it reads or writes. */
  readonly fields: ReadonlySet<string>
  /** The methods of its class it calls or names. */
  readonly calls: ReadonlySet<string>
}

/**
 * LCOM4 (Hitz and Montazeri, 1995): the number of connected groups among the methods of a
 * class, two methods being connected when both use one field of the class, or one of them uses
 * the other. A call of a name that several methods have — overloads — connects to each of
 * them. `undefined` for a class without methods.
 */
export function lcom4Of(methods: readonly MethodUses[]): number | undefined {
  if (methods.length === 0) return undefined
  const parent = methods.map((_, index) => index)
  const root = (index: number): number => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]!]!
    return index
  }
  const join = (a: number, b: number): void => {
    parent[root(a)] = root(b)
  }
  const byName = new Map<string, number[]>()
  methods.forEach((method, index) =>
    byName.set(method.name, [...(byName.get(method.name) ?? []), index])
  )
  /** The first method that uses each field. */
  const firstUser = new Map<string, number>()
  methods.forEach((method, index) => {
    for (const field of method.fields) {
      const first = firstUser.get(field)
      if (first === undefined) firstUser.set(field, index)
      else join(index, first)
    }
    for (const called of method.calls)
      for (const other of byName.get(called) ?? []) join(index, other)
  })
  return new Set(methods.map((_, index) => root(index))).size
}

/**
 * The cohesion of a class: LCOM4 over the methods that take part in it, those that use a
 * member of the class or are used by another method. A method that uses no field, calls no
 * method and is called by none — an override that answers a constant, a hook left empty —
 * says nothing about how the class holds together, and would count as a group of its own:
 * it is left out, as a constructor is.
 */
export function cohesionOf(methods: readonly MethodUses[]): {
  readonly methods: number
  readonly lcom4: number | undefined
} {
  const called = new Set(methods.flatMap((method) => [...method.calls]))
  const taking = methods.filter(
    (method) => method.fields.size > 0 || method.calls.size > 0 || called.has(method.name)
  )
  return { methods: taking.length, lcom4: lcom4Of(taking) }
}
