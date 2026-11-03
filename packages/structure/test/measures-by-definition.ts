/**
 * What is measured inside Source Files, and the propagation cost of a level, the slow way,
 * straight from their definitions (docs/structure-format.md, section 5): what `structure` is
 * checked against, as the metrics of section 5 are by `metrics-by-definition.ts`. Never used
 * by the app.
 */
import type { Level } from '../src/levels'
import type { FunctionMeasure, MethodUses } from '../src/measures'

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

/** Code without its comments and string literals, for counting its words: Python's and Go's. */
function codeOf(text: string, comment: RegExp): string {
  return text
    .replace(/[rRbBuUfF]{0,2}("""|\'\'\')[\s\S]*?\1/g, '""')
    .replace(/`[^`]*`/g, '""')
    .replace(/[rRbBuUfF]{0,2}"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/[rRbBuUfF]{0,2}'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(comment, '')
}

/**
 * The complexity of a Python function from its words, as radon counts it: 1, and one for each
 * `if`, `elif`, `for`, `while`, `except`, `case`, `and`, `or` and `assert` of its body — not
 * the `if` of a `case` guard, not what an `assert` tests, nothing of a `try` with `except*` —,
 * one for each `else:` of a loop or a `try`, and one less for a `match` with an irrefutable
 * `case`. `body` is the function's body, with the functions and classes inside it taken out.
 */
export function pythonComplexityByWords(body: string): number {
  const lines = codeOf(body, /#[^\n]*/g).split('\n')
  const indent = (line: string): number => line.length - line.trimStart().length
  let complexity = 1
  let grouped = false
  for (const [at, line] of lines.entries()) {
    const code = line.trim()
    if (code === '') continue
    if (/^try\s*:/.test(code)) {
      // A `try` whose handlers are `except*` counts nothing, its `else` neither.
      const own = indent(line)
      const end = lines.findIndex(
        (other, after) =>
          after > at &&
          other.trim() !== '' &&
          indent(other) <= own &&
          !/^(except|else|finally)\b/.test(other.trim())
      )
      grouped = lines
        .slice(at + 1, end === -1 ? undefined : end)
        .some((other) => indent(other) === own && /^except\s*\*/.test(other.trim()))
    }
    if (/^assert\b/.test(code)) {
      complexity++
      continue
    }
    if (/^else\s*:/.test(code)) {
      const header = lines
        .slice(0, at)
        .reverse()
        .find((other) => other.trim() !== '' && indent(other) === indent(line))
        ?.trim()
      if (header !== undefined && /^(?:async\s+)?(for|while)\b/.test(header)) complexity++
      if (header !== undefined && /^except\b/.test(header) && !grouped) complexity++
      continue
    }
    if (/^case\b/.test(code)) {
      complexity++
      // The `if` of a guard decides nothing of its own; what it tests does.
      const guard = code.replace(/^case\b[^:]*?\bif\b/, '')
      complexity += (guard.match(/\b(?:and|or)\b/g) ?? []).length
      continue
    }
    if (/^match\b.*:$/.test(code)) {
      const own = indent(line)
      const cases = lines
        .slice(at + 1)
        .filter((other, after) =>
          lines
            .slice(at + 1, at + 1 + after)
            .every((between) => between.trim() === '' || indent(between) > own)
        )
        .map((other) => other.trim())
        .filter((other) => /^case\b/.test(other))
      if (cases.some((one) => /^case\s+[A-Za-z_]\w*\s*(?:if\b.*)?:$/.test(one))) complexity--
      continue
    }
    if (grouped && /^except\b/.test(code)) continue
    complexity += (code.match(/\b(?:if|elif|for|while|except|and|or)\b/g) ?? []).length
  }
  return complexity
}

/**
 * The body of a function as its lines say it, after a header of one line: without the
 * functions and classes inside it, which are counted on their own.
 */
export function pythonBodyOf(text: string, { line, endLine }: FunctionMeasure): string {
  const lines = text.split('\n').slice(line, endLine)
  const indent = (code: string): number => code.length - code.trimStart().length
  const kept: string[] = []
  for (let at = 0; at < lines.length; at++) {
    const code = lines[at]!
    if (/^\s*(?:@|def |async def |class )/.test(code)) {
      const own = indent(code)
      while (
        at + 1 < lines.length &&
        (lines[at + 1]!.trim() === '' ||
          indent(lines[at + 1]!) > own ||
          /^\s*(?:def |async def )/.test(lines[at + 1]!))
      ) {
        at++
        if (indent(lines[at]!) === own && !/^\s*(?:def |async def )/.test(lines[at]!)) break
      }
      continue
    }
    kept.push(code)
  }
  return kept.join('\n')
}

/**
 * The complexity of a Go function from its words and operators, as gocyclo counts it: 1, and
 * one for each `if`, `for`, `case`, `&&` and `||` written in it — the function literals inside
 * it included —, comments and literals taken out first.
 */
export function goComplexityByWords(text: string): number {
  const code = codeOf(text.replace(/\/\*[\s\S]*?\*\//g, ' '), /\/\/[^\n]*/g)
  const words = code.match(/\b(?:if|for|case)\b/g) ?? []
  const operators = code.match(/&&|\|\|/g) ?? []
  return 1 + words.length + operators.length
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
