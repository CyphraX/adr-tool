/**
 * What is measured inside Source Files, and the propagation cost of a level, the slow way,
 * straight from their definitions (docs/structure-format.md, section 5): what `structure` is
 * checked against, as the metrics of section 5 are by `metrics-by-definition.ts`. Never used
 * by the app.
 */
import type { Level } from '../src/levels'
import type { MethodUses } from '../src/measures'

/**
 * The complexity of Java code from its words and operators: 1, and one for each `if`, `for`,
 * `while` — a `do … while` has one —, `case`, `when`, `catch`, `?:`, `&&` and `||` written
 * in it, comments and literals taken out first. `text` is what a function spans.
 */
export function javaComplexityByWords(text: string): number {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  const words = code.match(/\b(?:if|for|while|case|when|catch)\b/g) ?? []
  const operators = code.match(/&&|\|\|/g) ?? []
  // A wildcard of a type argument is no `?:`.
  const conditionals = code.match(/(?<![<,]\s*)\?(?!\s*(?:[>,]|extends\b|super\b))/g) ?? []
  return 1 + words.length + operators.length + conditionals.length
}

/**
 * LCOM4 by its definition: which methods are connected — sharing a field, or one using the
 * other — closed over every path (Warshall), and the groups counted as the distinct sets
 * each method reaches. A method that uses no member and is used by no other one is left out
 * first.
 */
export function lcom4ByDefinition(all: readonly MethodUses[]): number | undefined {
  const methods = all.filter(
    (method) =>
      method.fields.size > 0 ||
      method.calls.size > 0 ||
      all.some((other) => other.calls.has(method.name))
  )
  if (methods.length === 0) return undefined
  const linked = methods.map((a) =>
    methods.map(
      (b) =>
        a === b ||
        [...a.fields].some((field) => b.fields.has(field)) ||
        a.calls.has(b.name) ||
        b.calls.has(a.name)
    )
  )
  for (let via = 0; via < methods.length; via++) {
    for (let from = 0; from < methods.length; from++) {
      for (let to = 0; to < methods.length; to++) {
        if (linked[from]![via] && linked[via]![to]) linked[from]![to] = true
      }
    }
  }
  return new Set(linked.map((row) => row.map(Number).join(''))).size
}

/**
 * Propagation cost by its definition: the transitive closure of the level's Dependencies as a
 * matrix (Warshall), its cells off the diagonal counted, divided by all such cells.
 */
export function propagationCostByDefinition(
  level: Pick<Level, 'nodes' | 'edges'>
): number | undefined {
  const ids = level.nodes.filter((node) => node.kind !== 'unassigned').map((node) => node.id)
  const n = ids.length
  if (n < 2) return undefined
  const reach = ids.map((from) =>
    ids.map((to) => level.edges.some((edge) => edge.from === from && edge.to === to))
  )
  for (let via = 0; via < n; via++) {
    for (let from = 0; from < n; from++) {
      for (let to = 0; to < n; to++) {
        if (reach[from]![via] && reach[via]![to]) reach[from]![to] = true
      }
    }
  }
  let cells = 0
  for (let from = 0; from < n; from++) {
    for (let to = 0; to < n; to++) if (from !== to && reach[from]![to]) cells++
  }
  return cells / (n * (n - 1))
}
