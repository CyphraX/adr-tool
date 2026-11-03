/**
 * The Snapshot of an Assessment (docs/assessment-format.md, section 4): the metric values of
 * the Components when it was taken, frozen into a file beside the Assessment with the commit,
 * so that its evidence keeps reading the same however the code moves on. It is written by the
 * suite as a whole, and read as data.
 */
import { isMap, isScalar, LineCounter, parseDocument, type YAMLMap } from 'yaml'
import { isDay, isObjectName } from '@adr-tool/kernel'
import { everyComponent, type Metrics, type Structure } from '@adr-tool/structure/model'
import type { MetricSubject, Snapshot, SnapshotValues } from './model'
import type { AssessmentProblem } from './problems'
import { METRIC_NAMES } from './quality'
import type { AssessmentSaid } from './sentences'
import type { Eol } from './text'
import { formatScalar, scalarText } from './yaml'

/**
 * A record keyed by names from a file or from the code: without a prototype, so that
 * `__proto__` is a key like any other, and `constructor` is none until it is set.
 */
const table = <T>(): Record<string, T> => Object.create(null) as Record<string, T>

/** The value of a record's own key: none that `Object.prototype` has. */
export const ownValue = <T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string
): T | undefined => (record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined)

/** What a Snapshot's file name adds to its Assessment's ID. */
export const SNAPSHOT_SUFFIX = '.snapshot.yml'

/** Where the Snapshot of an Assessment is: beside it, with `.snapshot.yml` for `.md`. */
export const snapshotPathOf = (assessmentPath: string): string =>
  `${assessmentPath.replace(/\.md$/, '')}${SNAPSHOT_SUFFIX}`

/**
 * Where Structure keeps each metric of a Component, by the name a Rule gives it. Part 13's
 * abstractness and distance are read where Structure has them, and left out where it does not.
 */
const FIELD_OF: Readonly<Record<string, string>> = {
  files: 'files',
  lines: 'lines',
  'efferent-coupling': 'efferent',
  'afferent-coupling': 'afferent',
  instability: 'instability',
  'fan-out': 'fanOut',
  'fan-in': 'fanIn',
  'relational-cohesion': 'cohesion',
  'internal-share': 'internalShare',
  abstractness: 'abstractness',
  distance: 'distance'
}

/** The metric values of one Component, by name: those it has. */
export function componentValuesOf(metrics: Metrics): Record<string, number> {
  const values = table<number>()
  for (const [name, field] of Object.entries(FIELD_OF)) {
    const value = (metrics as unknown as Record<string, unknown>)[field]
    if (typeof value === 'number' && Number.isFinite(value)) values[name] = value
  }
  return values
}

/**
 * What is measured inside a Source File, as part 13's Structure measures it: each function with
 * its complexity, each class with its LCOM4.
 */
export interface MeasuredInside {
  readonly functions?: readonly { readonly name: string; readonly complexity: number }[]
  readonly classes?: readonly { readonly name: string; readonly lcom4: number | undefined }[]
}

/**
 * The values a Snapshot freezes, from Structure's metrics: every declared Component that has
 * any, and — where `inside` is given — what is measured in each Source File that is not a test.
 * `undefined` on a Draft, whose IDs follow directories and are no names to freeze.
 */
export function snapshotValuesOf(
  structure: Pick<Structure, 'origin' | 'components' | 'sourceFiles'>,
  metrics: ReadonlyMap<string, Metrics>,
  inside?: ReadonlyMap<string, MeasuredInside>
): SnapshotValues | undefined {
  if (structure.origin !== 'declared') return undefined
  const components = table<Record<string, number>>()
  for (const { id } of everyComponent(structure.components)) {
    const known = metrics.get(id)
    const values = known && componentValuesOf(known)
    if (values && Object.keys(values).length > 0) components[id] = values
  }
  const sourceFiles = table<Record<string, Record<string, number>>>()
  for (const file of structure.sourceFiles) {
    const measured = file.test ? undefined : inside?.get(file.path)
    if (!measured) continue
    const names = table<Record<string, number>>()
    for (const { name, complexity } of measured.functions ?? []) {
      names[name] = Object.assign(names[name] ?? table<number>(), { complexity })
    }
    for (const { name, lcom4 } of measured.classes ?? []) {
      if (lcom4 !== undefined)
        names[name] = Object.assign(names[name] ?? table<number>(), { lcom4 })
    }
    if (Object.keys(names).length > 0) sourceFiles[file.path] = names
  }
  return { components, ...(Object.keys(sourceFiles).length > 0 && { sourceFiles }) }
}

/** The value a Snapshot — or the values now — holds for a metric of a subject. */
export function metricValueIn(
  values: SnapshotValues,
  metric: string,
  subject: MetricSubject
): number | undefined {
  if ('component' in subject)
    return ownValue(ownValue(values.components, subject.component), metric)
  const inFile = ownValue(values.sourceFiles, subject.file)
  return ownValue(ownValue(inFile, subject.name), metric)
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The metric names of a subject in the order a Snapshot writes them: the known ones first. */
function metricOrder(names: readonly string[]): string[] {
  const known: readonly string[] = METRIC_NAMES
  return [...names].sort((a, b) => {
    const [x, y] = [known.indexOf(a), known.indexOf(b)]
    if (x !== -1 || y !== -1) return x === -1 ? 1 : y === -1 ? -1 : x - y
    return compare(a, b)
  })
}

/** The number as a Snapshot writes it: the shortest decimal that reads back as the same number. */
const numberText = (value: number): string => (Object.is(value, -0) ? '0' : String(value))

/** What a Snapshot to be written holds. */
export interface NewSnapshot {
  /** `YYYY-MM-DD`: the day it is taken. */
  readonly date: string
  /** The commit HEAD points at, by its full name; absent where there is none. */
  readonly commit?: string
  readonly values: SnapshotValues
}

/** The text of a Snapshot, as the suite writes it (docs/assessment-format.md, section 4). */
export function snapshotText(assessment: string, snapshot: NewSnapshot, eol: Eol): string {
  const lines = [
    `# The Snapshot of ${assessment}, taken by the suite: the metric values when it was taken.`,
    ...(snapshot.commit !== undefined ? [`commit: ${snapshot.commit}`] : []),
    `date: ${snapshot.date}`,
    'components:'
  ]
  const ids = Object.keys(snapshot.values.components).sort(compare)
  if (ids.length === 0) lines[lines.length - 1] = 'components: {}'
  for (const id of ids) {
    const values = snapshot.values.components[id]!
    lines.push(`  ${formatScalar(id)}:`)
    for (const name of metricOrder(Object.keys(values))) {
      lines.push(`    ${formatScalar(name)}: ${numberText(values[name]!)}`)
    }
  }
  const files = Object.keys(snapshot.values.sourceFiles ?? {}).sort(compare)
  if (files.length > 0) lines.push('source-files:')
  for (const file of files) {
    lines.push(`  ${formatScalar(file)}:`)
    const names = snapshot.values.sourceFiles![file]!
    for (const name of Object.keys(names)) {
      lines.push(`    ${formatScalar(name)}:`)
      for (const metric of metricOrder(Object.keys(names[name]!))) {
        lines.push(`      ${formatScalar(metric)}: ${numberText(names[name]![metric]!)}`)
      }
    }
  }
  return lines.map((line) => line + eol).join('')
}

/** A mapping of names to numbers; `undefined` where it is not one. */
function numbersOf(node: unknown): Record<string, number> | undefined {
  if (!isMap(node)) return undefined
  const values = table<number>()
  for (const pair of node.items) {
    const name = scalarText(pair.key)
    const value = pair.value
    if (name === undefined || !isScalar(value) || typeof value.value !== 'number') return undefined
    if (!Number.isFinite(value.value)) return undefined
    values[name] = value.value
  }
  return values
}

/** Read the Snapshot of an Assessment. Never throws: what cannot be read is a Problem. */
export function readSnapshot(
  path: string,
  assessment: string,
  text: string
): { snapshot?: Snapshot; problems: AssessmentProblem[] } {
  const unreadable = (detail: AssessmentSaid): { problems: AssessmentProblem[] } => ({
    problems: [{ kind: 'unreadable-snapshot' as const, path, assessment, detail }]
  })
  const doc = parseDocument(text, { lineCounter: new LineCounter() })
  if (doc.errors.length > 0) {
    const message = doc.errors[0]!.message.split('\n')[0]!.replace(/[:.]$/, '')
    return unreadable({ code: 'snapshot-not-valid-yaml', values: { message } })
  }
  if (!isMap(doc.contents)) return unreadable({ code: 'snapshot-no-mapping', values: {} })
  const top = doc.contents as YAMLMap
  const get = (key: string): unknown =>
    top.items.find((pair) => scalarText(pair.key) === key)?.value ?? undefined
  const commit = get('commit')
  const commitText = commit === undefined || commit === null ? undefined : scalarText(commit)
  if (commit !== undefined && commit !== null && (!commitText || !isObjectName(commitText))) {
    return unreadable({ code: 'snapshot-commit-name', values: {} })
  }
  const date = get('date')
  const dateText = date === undefined || date === null ? undefined : scalarText(date)
  if (date !== undefined && date !== null && (!dateText || !isDay(dateText))) {
    return unreadable({ code: 'snapshot-day', values: {} })
  }
  const components = table<Record<string, number>>()
  const listed = get('components')
  if (listed !== undefined && listed !== null) {
    if (!isMap(listed))
      return unreadable({ code: 'snapshot-numbers', values: { key: 'components' } })
    for (const pair of listed.items) {
      const id = scalarText(pair.key)
      const values = numbersOf(pair.value)
      if (id === undefined || !values) {
        return unreadable({ code: 'snapshot-numbers', values: { key: 'components' } })
      }
      components[id] = values
    }
  }
  const sourceFiles = table<Record<string, Record<string, number>>>()
  const inside = get('source-files')
  if (inside !== undefined && inside !== null) {
    const wrong = unreadable({ code: 'snapshot-numbers', values: { key: 'source-files' } })
    if (!isMap(inside)) return wrong
    for (const file of inside.items) {
      const name = scalarText(file.key)
      if (name === undefined || !isMap(file.value)) return wrong
      const names = table<Record<string, number>>()
      for (const pair of file.value.items) {
        const subject = scalarText(pair.key)
        const values = numbersOf(pair.value)
        if (subject === undefined || !values) return wrong
        names[subject] = values
      }
      sourceFiles[name] = names
    }
  }
  return {
    snapshot: {
      path,
      ...(commitText !== undefined && { commit: commitText }),
      ...(dateText !== undefined && { date: dateText }),
      components,
      sourceFiles
    },
    problems: []
  }
}
