import {
  repairOf,
  type ConformanceNote,
  type ConformanceProblem,
  type ConformanceRepair
} from '@adr-tool/conformance'
import { repairsOf, type DecisionLog, type Problem, type Repair } from '@adr-tool/core'
import { hasRepair, type StructureProblem } from '@adr-tool/structure/model'
import type { ConformanceView, OpenRepository, StructureOutline } from '../../../shared/ipc'
import {
  diagramsCount,
  diagramsSection,
  type DiagramsKnown,
  type DiagramsSection
} from './diagrams-problems'
import { problemsAcross, type Placed, type PlacedGroup } from './together'

/**
 * The Problems of the repository in front, of every module, in one list (docs/plan-vision.md,
 * part 2): of each Decision Log, of the declaration of Components, and of every Trace between
 * them. Nothing here reads or writes: it is put together from what the window holds, and each
 * entry says where its artefact opens and which Repairs it has. The Problems of a Decision Log
 * stay where they are as well; this list replaces nothing.
 *
 * A module that brings Problems of its own adds a section here.
 */
export interface RepositoryProblems {
  /** The Problems of the Decision Logs, by log, each root cause once with what follows from it. */
  readonly decisions: {
    /** Problems of the repository as a whole: its configuration, a missing directory. */
    readonly own: readonly Problem[]
    readonly logs: readonly { readonly log: string; readonly groups: readonly LogGroup[] }[]
  }
  /** The Traces of ADRs to Components that are not declared. */
  readonly traces: readonly TraceProblem[]
  /** The Problems of the declaration of Components, as far as Structure knows them. */
  readonly structure: StructureSection
  /** The Problems of `.arch/rules.yml`, and its notes, as far as Conformance knows them. */
  readonly conformance: ConformanceSection
  /** The Problems of the Diagrams, and of `.arch/config.yml` (lib/diagrams-problems.ts). */
  readonly diagrams: DiagramsSection
  /** Every Problem known, each root cause once: what every sidebar shows. A note is none. */
  readonly count: number
}

/** A Problem or a note of the Rules file, at its line, with its Repair where there is one. */
export interface ConformanceEntry {
  readonly found: ConformanceProblem | ConformanceNote
  /** What could be better and fails nothing (docs/conformance-format.md, section 5). */
  readonly note: boolean
  readonly repair: ConformanceRepair | undefined
}

export type ConformanceSection =
  | { readonly state: 'reading' }
  | { readonly state: 'failed'; readonly reason: string }
  | {
      readonly state: 'known'
      readonly entries: readonly ConformanceEntry[]
      /** The Rules are checked again: what is shown is the last answer. */
      readonly again: boolean
    }

/** What the window knows of the Rules of the repository: the last answer, and whether one is asked for. */
export interface ConformanceKnown {
  readonly view: ConformanceView | undefined
  readonly reading: boolean
  readonly failed: string | undefined
}

/** A Problem of a Decision Log, with the Repairs that `core` offers for it. */
export interface LogGroup extends PlacedGroup {
  readonly repairs: readonly Repair[]
}

/** An ADR's Trace to a Component that is not declared, with its Repair: to take the item out. */
export interface TraceProblem {
  readonly problem: Extract<Problem, { kind: 'unknown-component' }>
  readonly log: string
  /** The ADR the Trace is written on. */
  readonly subject: Placed | undefined
  readonly repairs: readonly Repair[]
}

/** A Problem of the declaration, with the Components it opens at, and whether it has a Repair. */
export interface StructureEntry {
  readonly problem: StructureProblem
  /** The Components it names that are there to show; none for the declaration as a whole. */
  readonly components: readonly string[]
  readonly repairable: boolean
}

export type StructureSection =
  /** Structure has not answered yet: its Problems follow. */
  | { readonly state: 'reading' }
  /** The analysis failed, and why. */
  | { readonly state: 'failed'; readonly reason: string }
  | {
      readonly state: 'known'
      readonly origin: 'declared' | 'draft'
      readonly entries: readonly StructureEntry[]
      /** An analysis runs again: what is shown is the last one's. */
      readonly again: boolean
    }

/** What the window knows of Structure for the repository: the last outline, and whether one is asked for. */
export interface OutlineKnown {
  readonly known: StructureOutline | undefined
  readonly reading: boolean
  readonly failed: string | undefined
}

/** The Components a Problem of the declaration names. */
function componentsOf(problem: StructureProblem): string[] {
  switch (problem.kind) {
    case 'unreadable-declaration':
      return []
    case 'overlapping-components':
      return [...problem.components]
    default:
      return [problem.component]
  }
}

const isTrace = (problem: Problem): problem is TraceProblem['problem'] =>
  problem.kind === 'unknown-component'

export function repositoryProblems(
  repository: OpenRepository,
  outline: OutlineKnown,
  conformance: ConformanceKnown = { view: undefined, reading: true, failed: undefined },
  diagramsKnown: DiagramsKnown = { overview: undefined, reading: false, failed: undefined }
): RepositoryProblems {
  const [across] = problemsAcross([repository])
  const logOf = (path: string): DecisionLog | undefined =>
    repository.repository.logs.find((log) => log.path === path)

  const traces: TraceProblem[] = []
  const logs = across!.logs
    .map(({ log, groups }) => {
      const decisionLog = logOf(log)
      const kept: LogGroup[] = []
      for (const group of groups) {
        const repairs = decisionLog ? repairsOf(decisionLog, group.problem) : []
        if (isTrace(group.problem)) {
          traces.push({ problem: group.problem, log, subject: group.subjects[0], repairs })
        } else {
          kept.push({ ...group, repairs })
        }
      }
      return { log, groups: kept }
    })
    .filter(({ groups }) => groups.length > 0)

  const structure = structureSection(outline)
  const rules = conformanceSection(conformance)
  const decisionsCount = across!.own.length + logs.reduce((sum, log) => sum + log.groups.length, 0)
  const structureCount = structure.state === 'known' ? structure.entries.length : 0
  const rulesCount =
    rules.state === 'known' ? rules.entries.filter((entry) => !entry.note).length : 0
  const diagrams = diagramsSection(diagramsKnown)
  return {
    decisions: { own: across!.own, logs },
    traces,
    structure,
    conformance: rules,
    diagrams,
    count: decisionsCount + traces.length + structureCount + rulesCount + diagramsCount(diagrams)
  }
}

function conformanceSection({ view, reading, failed }: ConformanceKnown): ConformanceSection {
  if (!view) {
    return failed !== undefined && !reading
      ? { state: 'failed', reason: failed }
      : { state: 'reading' }
  }
  // In the order of their lines, notes among the Problems.
  const found = [
    ...view.problems.map((problem) => ({ found: problem, note: false })),
    ...view.notes.map((note) => ({ found: note, note: true }))
  ].sort((a, b) => a.found.line - b.found.line)
  return {
    state: 'known',
    entries: found.map((entry) => ({ ...entry, repair: repairOf(entry.found) })),
    again: reading
  }
}

function structureSection({ known, reading, failed }: OutlineKnown): StructureSection {
  if (!known) {
    return failed !== undefined && !reading
      ? { state: 'failed', reason: failed }
      : { state: 'reading' }
  }
  const declared = new Set(known.components.map((component) => component.id))
  return {
    state: 'known',
    origin: known.origin,
    // What the checks find on a Draft are hints: nothing is declared there that could be wrong.
    entries: known.problems.map((problem) => ({
      problem,
      components: componentsOf(problem).filter((id) => declared.has(id)),
      repairable: known.origin === 'declared' && hasRepair(problem)
    })),
    again: reading
  }
}
