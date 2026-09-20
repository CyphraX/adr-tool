import type { DeclaredComponent } from './declaration'
import { compilePattern, matcherOf } from './patterns'
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

interface Entry {
  readonly component: DeclaredComponent
  readonly ancestors: readonly string[]
  readonly claims: (path: string) => boolean
  readonly marksTest: (path: string) => boolean
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
        component,
        ancestors,
        claims: matcherOf(component.paths),
        marksTest: matcherOf(component.tests)
      })
      collect(component.children, [...ancestors, component.id])
    }
  }
  collect(components, [])
  const byId = new Map(entries.map((entry) => [entry.component.id, entry]))

  const overlaps = new Map<string, { components: [string, string]; files: string[] }>()
  const sourceFiles = files.map((file): OwnedSourceFile => {
    const claimants = entries.filter((entry) => entry.claims(file.path))
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
    const containing = owner ? [owner, ...owner.ancestors.map((id) => byId.get(id)!)] : []
    const test = file.test || containing.some((entry) => entry.marksTest(file.path))
    return { ...file, test, component: owner?.component.id }
  })

  const problems: StructureProblem[] = []
  for (const { component } of entries) {
    for (const key of ['paths', 'tests'] as const satisfies readonly PatternKey[]) {
      for (const source of component[key]) {
        const pattern = compilePattern(source)
        const found = { component: component.id, key, pattern: source }
        if (!pattern) problems.push({ kind: 'pattern-outside-repository', ...found })
        else if (!pattern.negated && !files.some((file) => pattern.matches(file.path))) {
          problems.push({ kind: 'dead-pattern', ...found })
        }
      }
    }
  }
  for (const overlap of overlaps.values()) {
    problems.push({ kind: 'overlapping-components', ...overlap })
  }
  return { sourceFiles, problems }
}
