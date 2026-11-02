/**
 * Component patterns (docs/conformance-format.md, section 1, "Naming Components"): matched
 * against Component IDs segment by segment. `*` matches within one segment, `**` as a whole
 * segment any number of segments, none included. A pattern without a wildcard is an ID.
 */

/** Whether a pattern has a wildcard, and so may name several Components or none. */
export const hasWildcard = (pattern: string): boolean => pattern.includes('*')

const escape = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

function expressionOf(pattern: string): RegExp {
  // `**/**` says no more than `**`.
  const parts = pattern
    .split('/')
    .filter((part, index, all) => !(part === '**' && all[index - 1] === '**'))
  let expression = ''
  parts.forEach((part, index) => {
    if (part === '**') {
      // Alone it matches every ID; first, any segments before the rest; elsewhere, any after.
      expression +=
        parts.length === 1 ? '[^/]+(?:/[^/]+)*' : index === 0 ? '(?:[^/]+/)*' : '(?:/[^/]+)*'
      return
    }
    // A leading `**` has taken the slash before this segment already.
    if (index > 0 && !(index === 1 && parts[0] === '**')) expression += '/'
    expression += escape(part).replace(/\*+/g, '[^/]*')
  })
  return new RegExp(`^${expression}$`)
}

/** Whether a list of patterns matches an ID: one of them does. */
export function matcherOf(patterns: readonly string[]): (id: string) => boolean {
  const exact = new Set(patterns.filter((pattern) => !hasWildcard(pattern)))
  const expressions = patterns.filter(hasWildcard).map(expressionOf)
  return (id) => exact.has(id) || expressions.some((expression) => expression.test(id))
}

/**
 * The pattern as it reads after a Rename of `from` to `to`: rewritten where its leading
 * segments, before the first wildcard, are `from` or begin with it; otherwise as it was
 * (docs/conformance-format.md, section 7).
 */
export function renamedPattern(pattern: string, from: string, to: string): string {
  if (pattern === from) return to
  if (!pattern.startsWith(`${from}/`)) return pattern
  return to + pattern.slice(from.length)
}
