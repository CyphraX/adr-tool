/**
 * Metrics (docs/structure-format.md, section 5), per Component, on the Source Files it
 * contains: one pass over the Dependencies, each counted for every Component on the way
 * from its two files up to the Component that contains both.
 */
import type { DeclaredComponent } from './declaration'
import type { Dependency } from './dependencies'
import { withDirectories } from './directories'
import type { LevelOptions } from './levels'
import type { Structure } from './structure'

/** What every node of a level has: the Source Files it stands for, and their lines. */
export interface Size {
  readonly files: number
  readonly lines: number
}

export interface Metrics extends Size {
  /** Ce: Source Files inside that depend on at least one Source File outside. */
  readonly efferent: number
  /** Ca: Source Files outside that depend on at least one Source File inside. */
  readonly afferent: number
  /** I = Ce / (Ca + Ce); `undefined` when both are zero. */
  readonly instability: number | undefined
  /** Components with the same parent, or directories of the same level, that it depends on. */
  readonly fanOut: number
  /** Components with the same parent, or directories of the same level, that depend on it. */
  readonly fanIn: number
  /** H = (R + 1) / N: R Dependencies among the N Source Files inside. */
  readonly cohesion: number
  /** R divided by every Dependency that starts or ends inside; `undefined` when there is none. */
  readonly internalShare: number | undefined
}

export function sizeOf(files: readonly string[], lineCounts: ReadonlyMap<string, number>): Size {
  let lines = 0
  for (const file of files) lines += lineCounts.get(file) ?? 0
  return { files: files.length, lines }
}

interface Tally {
  files: number
  lines: number
  readonly efferent: Set<string>
  readonly afferent: Set<string>
  readonly fanOut: Set<string>
  readonly fanIn: Set<string>
  /** Dependencies among the files inside, going out, coming in. */
  internal: number
  out: number
  in: number
}

/**
 * The metrics of every Component that contains a Source File, and of every directory node,
 * in the order of the declaration, parents before their children. Test files are left out unless asked for;
 * Unassigned files count as outside.
 */
export function metricsOf(
  structure: Pick<Structure, 'components' | 'sourceFiles'>,
  dependencies: readonly Dependency[],
  lineCounts: ReadonlyMap<string, number>,
  options: LevelOptions = {}
): Map<string, Metrics> {
  // The directories below a Component without children have metrics as well.
  structure = withDirectories(structure)
  // The Components from the top down to each one: the chain a file's owner stands at the end of.
  const chains = new Map<string, readonly string[]>()
  const tallies = new Map<string, Tally>()
  const walk = (components: readonly DeclaredComponent[], above: readonly string[]): void => {
    for (const component of components) {
      const chain = [...above, component.id]
      chains.set(component.id, chain)
      tallies.set(component.id, {
        files: 0,
        lines: 0,
        efferent: new Set(),
        afferent: new Set(),
        fanOut: new Set(),
        fanIn: new Set(),
        internal: 0,
        out: 0,
        in: 0
      })
      walk(component.children, chain)
    }
  }
  walk(structure.components, [])

  const NONE: readonly string[] = []
  /** The chain of each Source File that counts; Unassigned files have an empty one. */
  const chainOf = new Map<string, readonly string[]>()
  for (const file of structure.sourceFiles) {
    if (file.test && !options.tests) continue
    const chain = (file.component !== undefined && chains.get(file.component)) || NONE
    chainOf.set(file.path, chain)
    for (const id of chain) {
      const tally = tallies.get(id)!
      tally.files++
      tally.lines += lineCounts.get(file.path) ?? 0
    }
  }

  for (const { from, to } of dependencies) {
    const source = chainOf.get(from)
    const target = chainOf.get(to)
    if (source === undefined || target === undefined) continue
    let common = 0
    while (common < source.length && common < target.length && source[common] === target[common]) {
      common++
    }
    for (let at = 0; at < common; at++) tallies.get(source[at]!)!.internal++
    for (let at = common; at < source.length; at++) {
      const tally = tallies.get(source[at]!)!
      tally.efferent.add(from)
      tally.out++
    }
    for (let at = common; at < target.length; at++) {
      const tally = tallies.get(target[at]!)!
      tally.afferent.add(from)
      tally.in++
    }
    // The two Components below the one that contains both are siblings. Where one file lies
    // in that Component's own files, or is Unassigned, there is no such pair.
    if (common < source.length && common < target.length) {
      tallies.get(source[common]!)!.fanOut.add(target[common]!)
      tallies.get(target[common]!)!.fanIn.add(source[common]!)
    }
  }

  const metrics = new Map<string, Metrics>()
  for (const [id, tally] of tallies) {
    if (tally.files === 0) continue
    const efferent = tally.efferent.size
    const afferent = tally.afferent.size
    const touching = tally.internal + tally.out + tally.in
    metrics.set(id, {
      files: tally.files,
      lines: tally.lines,
      efferent,
      afferent,
      instability: efferent + afferent === 0 ? undefined : efferent / (efferent + afferent),
      fanOut: tally.fanOut.size,
      fanIn: tally.fanIn.size,
      cohesion: (tally.internal + 1) / tally.files,
      internalShare: touching === 0 ? undefined : tally.internal / touching
    })
  }
  return metrics
}
