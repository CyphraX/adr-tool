import type { DeclaredComponent } from './declaration'
import { compilePattern, type Pattern } from './patterns'
import type { PatternKey, StructureProblem } from './problems'
import type { SourceFile } from './source-files'

/** A Source File with the Component that owns it. */
export interface OwnedSourceFile extends SourceFile {
  /** The ID of the Component that owns the file; `undefined` for an Unassigned file. */
  readonly component: string | undefined
}

export interface Ownership {
  readonly sourceFiles: readonly OwnedSourceFile[]
  readonly problems: readonly StructureProblem[]
}

/** One list of patterns of one Component, with what is found out about it on the way. */
interface PatternList {
  readonly key: PatternKey
  readonly patterns: readonly (Pattern | undefined)[]
  readonly sources: readonly string[]
  /**
   * The directories a file must lie in for a pattern of this list to match it: for each
   * pattern the directory part of its text before the first wildcard — `src/cart` for
   * `src/cart/price*.ts`, the root for `**`. A file is only ever asked about the lists whose
   * directory it lies in, which on a large repository are a handful out of thousands.
   */
  readonly directories: readonly string[]
  /** Per pattern: it matched a Source File at least once. */
  readonly matched: boolean[]
}

interface Entry {
  readonly index: number
  readonly component: DeclaredComponent
  readonly ancestors: readonly string[]
  readonly paths: PatternList
  readonly tests: PatternList
}

function patternList(key: PatternKey, sources: readonly string[]): PatternList {
  const patterns = sources.map((source) => compilePattern(source))
  const directories = patterns.flatMap((pattern) => {
    if (!pattern || pattern.negated) return []
    const segments = pattern.source
      .trim()
      .replaceAll('\\', '/')
      .split('/')
      .filter((segment) => segment !== '' && segment !== '.')
    const wildcard = segments.findIndex((segment) => /[*?]/.test(segment))
    // The last literal segment may be a file as well as a directory: leave it to the pattern.
    const literal = wildcard === -1 ? segments.slice(0, -1) : segments.slice(0, wildcard)
    return [literal.join('/')]
  })
  return { key, patterns, sources, directories, matched: sources.map(() => false) }
}

/** Whether a list claims a path: the last pattern that matches decides. Notes which ones matched. */
function claims(list: PatternList, path: string): boolean {
  let claimed = false
  list.patterns.forEach((pattern, index) => {
    if (!pattern?.matches(path)) return
    claimed = !pattern.negated
    if (!pattern.negated) list.matched[index] = true
  })
  return claimed
}

/** The entries to ask about a file, by the directories it lies in. */
function candidatesBy(
  entries: readonly Entry[],
  listOf: (entry: Entry) => PatternList
): (path: string) => Entry[] {
  const byDirectory = new Map<string, Entry[]>()
  for (const entry of entries) {
    for (const directory of new Set(listOf(entry).directories)) {
      byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), entry])
    }
  }
  return (path) => {
    const found = new Set(byDirectory.get('') ?? [])
    for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1)) {
      for (const entry of byDirectory.get(path.slice(0, slash)) ?? []) found.add(entry)
    }
    // In the order of the declaration, so that what is reported does not depend on the lookup.
    return [...found].sort((a, b) => a.index - b.index)
  }
}

/**
 * Who owns which Source File (docs/structure-format.md, "Claims, owns, contains"), and what
 * is wrong with the patterns once they meet the files.
 */
export function assign(
  components: readonly DeclaredComponent[],
  files: readonly SourceFile[]
): Ownership {
  const entries: Entry[] = []
  const collect = (list: readonly DeclaredComponent[], ancestors: readonly string[]): void => {
    for (const component of list) {
      entries.push({
        index: entries.length,
        component,
        ancestors,
        paths: patternList('paths', component.paths),
        tests: patternList('tests', component.tests)
      })
      collect(component.children, [...ancestors, component.id])
    }
  }
  collect(components, [])
  const byId = new Map(entries.map((entry) => [entry.component.id, entry]))
  const mayClaim = candidatesBy(entries, (entry) => entry.paths)
  const mayMark = candidatesBy(entries, (entry) => entry.tests)

  const overlaps = new Map<string, { components: [string, string]; files: string[] }>()
  const sourceFiles = files.map((file): OwnedSourceFile => {
    const claimants = mayClaim(file.path).filter((entry) => claims(entry.paths, file.path))
    // Of a Component and its descendant the descendant owns the file, however deep.
    const deepest = claimants.filter(
      (entry) => !claimants.some((other) => other.ancestors.includes(entry.component.id))
    )
    if (deepest.length > 1) {
      for (const [index, first] of deepest.entries()) {
        for (const second of deepest.slice(index + 1)) {
          const pair: [string, string] = [first.component.id, second.component.id]
          const overlap = overlaps.get(pair.join('\n')) ?? { components: pair, files: [] }
          overlap.files.push(file.path)
          overlaps.set(pair.join('\n'), overlap)
        }
      }
    }
    const owner = deepest.length === 1 ? deepest[0]! : undefined
    // A `tests` pattern marks what its Component contains: what it or a descendant owns.
    // Every list that may match is asked, so that it is known which patterns never matched.
    const marking = mayMark(file.path).filter((entry) => claims(entry.tests, file.path))
    const containing = owner ? [owner, ...owner.ancestors.map((id) => byId.get(id)!)] : []
    const test = file.test || marking.some((entry) => containing.includes(entry))
    return { ...file, test, component: owner?.component.id }
  })

  const problems: StructureProblem[] = []
  for (const { component, paths, tests } of entries) {
    for (const list of [paths, tests]) {
      list.sources.forEach((source, index) => {
        const pattern = list.patterns[index]
        const found = { component: component.id, key: list.key, pattern: source }
        if (!pattern) problems.push({ kind: 'pattern-outside-repository', ...found })
        else if (!pattern.negated && !list.matched[index]) {
          problems.push({ kind: 'dead-pattern', ...found })
        }
      })
    }
  }
  for (const overlap of overlaps.values()) {
    problems.push({ kind: 'overlapping-components', ...overlap })
  }
  return { sourceFiles, problems }
}
