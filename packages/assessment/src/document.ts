/**
 * Reading an Assessment (docs/assessment-format.md, section 2): its frontmatter, its title, and
 * its entries — a heading with a fenced YAML block below it that says `scenario` or `finding`.
 * Everything else in the document is the author's, and is not looked at. Never throws: what
 * cannot be read becomes a Problem.
 */
import { isMap, isScalar, isSeq, type YAMLMap } from 'yaml'
import type { Evidence, Finding, NamedViolation, QualityScenario, Assessment } from './model'
import { EVIDENCE_KINDS } from './model'
import type { AssessmentProblem } from './problems'
import {
  ASSESSMENT_STATUSES,
  LEVELS,
  RATINGS,
  qualityAttributeOf,
  type QualityAttribute
} from './quality'
import type { AssessmentSaid } from './sentences'
import {
  outlineOf,
  trimmedText,
  viewFile,
  type Fence,
  type FileView,
  type Heading
} from './text'
import { frontmatterOf, valuesOf, type Values } from './values'
import { pairOf, parseRegion, scalarText, type Region } from './yaml'

/** The suite's keys of an Assessment's frontmatter, in the order it writes them. */
export const ASSESSMENT_KEYS = ['date', 'status', 'authors', 'scope', 'previous'] as const

/** The keys of a Quality Scenario's block, in the order the suite writes them. */
export const SCENARIO_KEYS = [
  'scenario',
  'attribute',
  'source',
  'stimulus',
  'artifact',
  'environment',
  'response',
  'measure',
  'importance',
  'difficulty',
  'rating'
] as const

/** The keys of a Finding's block, in the order the suite writes them. */
export const FINDING_KEYS = ['finding', 'scenarios', 'evidence'] as const

/** What a Quality Scenario needs to be checkable: its attribute, stimulus, response and measure. */
const REQUIRED = ['attribute', 'stimulus', 'response', 'measure'] as const

/** Whether a text is an entry ID: letters, digits, `.`, `_` and `-`, from a letter or a digit. */
export const isEntryId = (id: string): boolean => /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(id)

/** A line that begins an entry's ID key: what says that a block that cannot be read is one. */
const ENTRY_KEY = /^(scenario|finding)[ \t]*:/m

/** Where an entry stands in its document: what the writers splice into. */
export interface EntryPlace {
  readonly kind: 'scenario' | 'finding'
  readonly id: string
  readonly heading: Heading
  readonly fence: Fence & { readonly close: NonNullable<Fence['close']> }
  readonly region: Region
  /** Where its section ends: the start of the next heading of its level or higher, or the end. */
  readonly end: number
}

export interface Outline {
  readonly view: FileView
  /** The first level-one heading, outside every code block. */
  readonly title?: Heading
  /** Every heading of the body, in order. */
  readonly headings: readonly Heading[]
  /** The entries that can be read, in the order of the document; the first of an ID. */
  readonly entries: readonly EntryPlace[]
  /** What is wrong with the form of an entry. */
  readonly problems: readonly AssessmentProblem[]
}

/** The entries of an Assessment's text, with the Problems of their form. */
export function outlineAssessment(id: string, path: string, text: string): Outline {
  const view = viewFile(text)
  const items = outlineOf(text, view.bodyStart)
  const headings = items.filter((item): item is Heading => item.kind === 'heading')
  const problems: AssessmentProblem[] = []
  const entries: EntryPlace[] = []
  const seen = { scenario: new Set<string>(), finding: new Set<string>() }
  const about = { path, assessment: id }

  items.forEach((item, index) => {
    if (item.kind !== 'fence' || !['yaml', 'yml'].includes(item.language.toLowerCase())) return
    const line = item.open.number
    const content = text.slice(item.content.start, item.content.end)
    if (!item.close) {
      if (ENTRY_KEY.test(content)) {
        problems.push({
          kind: 'unreadable-entry',
          ...about,
          line,
          detail: { code: 'block-never-closed', values: {} }
        })
      }
      return
    }
    const region = parseRegion(text, item.content, view.eol, path)
    if (region.errors.length > 0) {
      if (ENTRY_KEY.test(content)) {
        problems.push({
          kind: 'unreadable-entry',
          ...about,
          line,
          detail: { code: 'block-not-valid-yaml', values: { message: region.errors[0]! } }
        })
      }
      return
    }
    const scenario = pairOf(region.map, 'scenario')
    const finding = pairOf(region.map, 'finding')
    if (!scenario && !finding) return
    if (scenario && finding) {
      problems.push({ kind: 'entry-of-two-kinds', ...about, line })
      return
    }
    const kind = scenario ? 'scenario' : 'finding'
    const value = (scenario ?? finding)!.value
    const written = isScalar(value) ? (scalarText(value) ?? '') : ''
    const before = items[index - 1]
    const heading =
      before?.kind === 'heading' &&
      before.level >= 2 &&
      text.slice(before.line.next, item.open.start).trim() === ''
        ? before
        : undefined
    if (!heading) {
      problems.push({ kind: 'entry-without-heading', ...about, line, entry: written })
      return
    }
    if (!isEntryId(written)) {
      problems.push({ kind: 'invalid-entry-id', ...about, line, entry: written })
      return
    }
    if (seen[kind].has(written)) {
      problems.push({ kind: 'duplicate-entry', ...about, line, entry: written, of: kind })
      return
    }
    seen[kind].add(written)
    const next = items
      .slice(index + 1)
      .find((later): later is Heading => later.kind === 'heading' && later.level <= heading.level)
    entries.push({
      kind,
      id: written,
      heading,
      fence: item as EntryPlace['fence'],
      region,
      end: next ? next.line.start : text.length
    })
  })
  const title = headings.find((heading) => heading.level === 1)
  return { view, ...(title && { title }), headings, entries, problems }
}

/** The text of an entry: after its block, up to the end of its section. */
export const entryText = (place: EntryPlace): string =>
  trimmedText(place.region.text, place.fence.close.next, place.end)

/** Read an Assessment file tolerantly. Never throws: what cannot be read becomes a Problem. */
export function readAssessment(
  id: string,
  path: string,
  text: string
): { assessment: Assessment; problems: AssessmentProblem[] } {
  const problems: AssessmentProblem[] = []
  const view = viewFile(text)
  const frontmatter = frontmatterOf(view, path)
  const base = { id, path, authors: [], scenarios: [], findings: [] }
  if (frontmatter.unreadable) {
    problems.push({ kind: 'unreadable-assessment', path, id, detail: frontmatter.unreadable })
    const outline = view.unterminated ? undefined : outlineAssessment(id, path, text)
    return {
      assessment: {
        ...base,
        ...(outline?.title && { title: outline.title.text }),
        status: undefined,
        writable: false
      },
      problems
    }
  }
  const region = frontmatter.region
  const values = region
    ? valuesOf(region, region.map, (key, line, detail) =>
        problems.push({ kind: 'invalid-frontmatter-value', path, id, line, key, detail })
      )
    : undefined
  const date = values?.day('date')
  if (!values?.has('date')) problems.push({ kind: 'assessment-without-date', path, id })
  const status = values
    ? values.oneOf('status', ASSESSMENT_STATUSES, { code: 'must-be-status', values: {} }, 'draft')
    : 'draft'
  const authors = values?.texts('authors', { code: 'must-be-texts', values: {} }) ?? []
  const scope = values?.texts('scope', { code: 'must-be-component-ids', values: {} })
  const previous = values?.text('previous', { code: 'must-be-assessment-id', values: {} })

  const outline = outlineAssessment(id, path, text)
  problems.push(...outline.problems)
  const scenarios: QualityScenario[] = []
  const findings: Finding[] = []
  for (const place of outline.entries) {
    if (place.kind === 'scenario') scenarios.push(readScenario(place, path, id, problems))
    else findings.push(readFinding(place, path, id, problems))
  }
  return {
    assessment: {
      ...base,
      ...(outline.title && { title: outline.title.text }),
      ...(date !== undefined && { date }),
      status,
      authors,
      ...(scope !== undefined && { scope }),
      ...(previous !== undefined && { previous }),
      scenarios,
      findings,
      writable: true
    },
    problems
  }
}

/** The values of an entry's block, with what is wrong with them as Problems of the entry. */
function entryValues(
  place: EntryPlace,
  path: string,
  assessment: string,
  problems: AssessmentProblem[]
): Values {
  return valuesOf(place.region, place.region.map, (key, line, detail) =>
    problems.push({
      kind: 'invalid-entry-value',
      path,
      assessment,
      line,
      entry: place.id,
      key,
      detail
    })
  )
}

const common = (place: EntryPlace) => ({
  id: place.id,
  title: place.heading.text,
  line: place.heading.line.number,
  level: place.heading.level,
  text: entryText(place)
})

function readScenario(
  place: EntryPlace,
  path: string,
  assessment: string,
  problems: AssessmentProblem[]
): QualityScenario {
  const values = entryValues(place, path, assessment, problems)
  for (const key of REQUIRED) {
    if (!values.has(key)) {
      problems.push({
        kind: 'missing-entry-key',
        path,
        assessment,
        line: place.fence.open.number,
        entry: place.id,
        key
      })
    }
  }
  const written = values.text('attribute')
  let attribute: QualityAttribute | undefined
  if (written !== undefined) {
    attribute = qualityAttributeOf(written)
    if (!attribute) {
      problems.push({
        kind: 'unknown-quality-attribute',
        path,
        assessment,
        line: values.line('attribute'),
        entry: place.id,
        value: written
      })
    }
  }
  const optional = (key: string): { [key: string]: string } => {
    const value = values.text(key)
    return value === undefined ? {} : { [key]: value }
  }
  const level: AssessmentSaid = { code: 'must-be-level', values: {} }
  const importance = values.oneOf('importance', LEVELS, level)
  const difficulty = values.oneOf('difficulty', LEVELS, level)
  const rating = values.oneOf('rating', RATINGS, { code: 'must-be-rating', values: {} })
  return {
    ...common(place),
    ...(attribute && { attribute }),
    ...optional('source'),
    ...optional('stimulus'),
    ...optional('artifact'),
    ...optional('environment'),
    ...optional('response'),
    ...optional('measure'),
    ...(importance && { importance }),
    ...(difficulty && { difficulty }),
    ...(rating && { rating })
  }
}

function readFinding(
  place: EntryPlace,
  path: string,
  assessment: string,
  problems: AssessmentProblem[]
): Finding {
  const values = entryValues(place, path, assessment, problems)
  const scenarios = values.texts('scenarios', { code: 'must-be-scenario-ids', values: {} }) ?? []
  const evidence: Evidence[] = []
  const list = pairOf(place.region.map, 'evidence')?.value
  if (values.has('evidence') && !isSeq(list)) {
    problems.push({
      kind: 'invalid-entry-value',
      path,
      assessment,
      line: values.line('evidence'),
      entry: place.id,
      key: 'evidence',
      detail: { code: 'must-be-evidence-list', values: {} }
    })
  } else if (isSeq(list)) {
    for (const item of list.items) {
      const read = evidenceOf(place.region, item)
      if ('detail' in read) {
        problems.push({
          kind: 'invalid-evidence',
          path,
          assessment,
          line: read.line,
          entry: place.id,
          detail: read.detail
        })
      } else evidence.push(read)
    }
  }
  return { ...common(place), scenarios, evidence }
}

/** A piece of evidence, or what is wrong with it (docs/assessment-format.md, section 2). */
export function evidenceOf(
  region: Region,
  item: unknown
): Evidence | { readonly line: number; readonly detail: AssessmentSaid } {
  const at = (item as { range?: number[] } | null)?.range?.[0]
  const line = at === undefined ? region.lineOf(0) : region.lineOf(at)
  const wrong = (detail: AssessmentSaid) => ({ line, detail })
  if (!isMap(item)) return wrong({ code: 'evidence-not-a-mapping', values: {} })
  const map = item as YAMLMap
  const kinds = EVIDENCE_KINDS.filter((kind) => pairOf(map, kind) !== undefined)
  if (kinds.length === 0) return wrong({ code: 'evidence-of-no-kind', values: {} })
  if (kinds.length > 1) return wrong({ code: 'evidence-of-two-kinds', values: {} })
  const kind = kinds[0]!
  const text = (key: string): string | undefined => {
    const value = pairOf(map, key)?.value
    return isScalar(value) ? scalarText(value) : undefined
  }
  const has = (key: string): boolean => pairOf(map, key) !== undefined
  const needs = (key: string) => wrong({ code: 'evidence-needs-key', values: { key } })
  const named = text(kind)
  if (named === undefined) return needs(kind)

  if (kind === 'violation') {
    const violation = violationOf(named, map, text, has)
    if ('detail' in violation) return wrong(violation.detail)
    return { kind, violation, line }
  }
  if (kind === 'metric') {
    if (has('component')) {
      const component = text('component')
      return component === undefined
        ? needs('component')
        : { kind, metric: named, subject: { component }, line }
    }
    if (has('file') || has('name')) {
      const [file, name] = [text('file'), text('name')]
      if (file === undefined) return needs('file')
      if (name === undefined) return needs('name')
      return { kind, metric: named, subject: { file, name }, line }
    }
    return wrong({ code: 'evidence-needs-metric-subject', values: {} })
  }
  return { kind, id: named, line }
}

/** The fingerprint a `violation` names, by the keys it has (docs/conformance-format.md, section 3). */
function violationOf(
  rule: string,
  map: YAMLMap,
  text: (key: string) => string | undefined,
  has: (key: string) => boolean
): NamedViolation | { readonly detail: AssessmentSaid } {
  const needs = (key: string) => ({
    detail: { code: 'evidence-needs-key', values: { key } } as AssessmentSaid
  })
  if (has('from') || has('to')) {
    const [from, to] = [text('from'), text('to')]
    if (from === undefined) return needs('from')
    if (to === undefined) return needs('to')
    return { kind: 'dependency', rule, from, to }
  }
  if (has('cycle')) {
    const value = pairOf(map, 'cycle')?.value
    const members = isSeq(value)
      ? value.items.map((member) => (isScalar(member) ? scalarText(member) : undefined))
      : []
    if (members.length < 2 || members.some((member) => member === undefined)) {
      return { detail: { code: 'evidence-needs-members', values: {} } }
    }
    return { kind: 'cycle', rule, cycle: members as string[] }
  }
  if (has('component')) {
    const component = text('component')
    return component === undefined ? needs('component') : { kind: 'component', rule, component }
  }
  if (has('file') || has('name')) {
    const [file, name] = [text('file'), text('name')]
    if (file === undefined) return needs('file')
    if (name === undefined) return needs('name')
    return { kind: 'inside', rule, file, name }
  }
  return { detail: { code: 'evidence-needs-subject', values: {} } }
}
