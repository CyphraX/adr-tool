/**
 * The patterns of `.arch/components.yml` (docs/structure-format.md, section 1): globs matched
 * against the whole path of a file from the repository root. The subset is small and is ours,
 * so it has a matcher of its own rather than a library whose defaults would have to be pinned.
 */
export interface Pattern {
  /** As written. */
  readonly source: string
  /** Begins with `!`: takes out again what an earlier pattern of the same list matched. */
  readonly negated: boolean
  matches(path: string): boolean
}

/**
 * `undefined` for a pattern that is absolute or leaves the repository.
 *
 * `exact` switches off that a pattern naming a directory claims everything beneath it. That is
 * for the globs of other tools, a workspace file's `packages/*` say, which name directories.
 */
export function compilePattern(source: string, exact = false): Pattern | undefined {
  const trimmed = source.trim()
  const negated = trimmed.startsWith('!')
  const glob = (negated ? trimmed.slice(1) : trimmed).trim().replaceAll('\\', '/')
  if (glob.startsWith('/') || /^[A-Za-z]:/.test(glob)) return undefined

  const segments = glob.split('/').filter((segment) => segment !== '' && segment !== '.')
  if (segments.includes('..')) return undefined
  if (glob === '') return { source, negated, matches: () => false }

  let expression = ''
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1
    if (segment === '**') {
      expression += last ? '.*' : '(?:[^/]+/)*'
      return
    }
    expression += segment
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '[^/]*')
      .replaceAll('?', '[^/]')
    if (!last) expression += '/'
  })
  // What names a directory claims everything beneath it. `.` alone is the repository.
  const beneath = exact ? '' : '(?:/.*)?'
  const whole = new RegExp(segments.length === 0 ? '^' : `^${expression}${beneath}$`)
  return { source, negated, matches: (path) => whole.test(path) }
}

/** Whether a list of patterns claims a path: the last pattern that matches decides. */
export function matcherOf(sources: readonly string[], exact = false): (path: string) => boolean {
  const patterns = sources.flatMap((source) => compilePattern(source, exact) ?? [])
  return (path) => {
    let claimed = false
    for (const pattern of patterns) {
      if (pattern.matches(path)) claimed = !pattern.negated
    }
    return claimed
  }
}
