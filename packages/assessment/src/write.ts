/**
 * The operations of Assessment (docs/assessment-format.md, section 6). Each plans a change set
 * and never writes (ADR-0004); each splices what it changes, so that nothing else in a file
 * moves (ADR-0002): a key replaced where it stands or inserted in the order of the format, an
 * entry inserted between two lines, an item appended to a list. What is checked against the
 * other modules is handed in by the caller, as for the Traces (ADR-0006).
 */
import {
  applyEdits,
  isDay,
  isObjectName,
  joinPath,
  openConfig,
  PendingFiles,
  Refusal,
  type FileSystem,
  type Git,
  type Plan,
  type TextEdit
} from '@adr-tool/kernel'
import {
  ASSESSMENT_KEYS,
  FINDING_KEYS,
  isEntryId,
  outlineAssessment,
  readAssessment,
  SCENARIO_KEYS,
  type EntryPlace,
  type Outline
} from './document'
import { evidenceKey, evidenceName, namesViolation, type NewEvidence } from './evidence'
import type { Assessment, Register, Risk, SnapshotValues, TechnicalDebtItem } from './model'
import { saidOf, type DirectoryKey } from './problems'
import {
  attributeText,
  DEBT_STATES,
  LEVELS,
  qualityAttributeOf,
  RATINGS,
  RISK_STATES,
  type DebtState,
  type Level,
  type Rating,
  type RiskState
} from './quality'
import { isFileId, lastAssessment, openAssessments, readLocations } from './read'
import { ENTRY_KEYS, readRegisterEntry } from './register'
import { refuse } from './sentences'
import { slugOf } from './slug'
import { readSnapshot, snapshotPathOf, snapshotText } from './snapshot'
import {
  closingSequenceAt,
  eolOf,
  isBlank,
  linesOf,
  outlineOf,
  viewFile,
  type Eol,
  type FileView
} from './text'
import { citedAdr, metricValueOf, type Known } from './traces'
import {
  appendBlockItem,
  asText,
  formatScalar,
  pairOf,
  parseRegion,
  regionFor,
  removeKey,
  setScalar,
  type Region
} from './yaml'

/** Run the planning of an operation; a Refusal becomes the reason why it cannot be done. */
export async function planning<Outcome extends object>(
  fs: FileSystem,
  build: (pending: PendingFiles<FileView>) => Promise<Outcome>
): Promise<Plan<Outcome>> {
  const pending = new PendingFiles(fs, viewFile)
  try {
    const outcome = await build(pending)
    return { ok: true, changeSet: pending.changeSet(), ...outcome }
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, reason: error.message, ...(error.said && { said: error.said }) }
    }
    throw error
  }
}

/**
 * A directory of the module, or the refusal that it cannot be used: `.arch/config.yml` cannot
 * be read, or its key names no directory inside the repository.
 */
export async function directoryOf(fs: FileSystem, key: DirectoryKey): Promise<string> {
  const config = await openConfig(fs)
  const where = readLocations(config)
  const directory = where.directories[key]
  if (directory === undefined) {
    const problem = where.problems.find(
      (one) => one.kind === 'invalid-directory-setting' && one.key === key
    )
    const detail = config.readable ? saidOf(problem!) : config.problem.said
    refuse({ code: 'directory-unavailable', values: { key, detail } })
  }
  return directory
}

/** Text with its line breaks in the file's line ending, ending in one; empty stays empty. */
const inEol = (text: string, eol: Eol): string => {
  const lf = text.replace(/\r\n?/g, '\n')
  // The line breaks around it, counted by hand: a run of them is no reason to backtrack.
  let start = 0
  let end = lf.length
  while (start < end && lf[start] === '\n') start++
  while (end > start && lf[end - 1] === '\n') end--
  const lines = lf.slice(start, end)
  return lines.trim() === '' ? '' : `${lines.replaceAll('\n', eol)}${eol}`
}

/** The line ending most of these texts have; LF when there are none, or on a tie. */
const mostOf = (texts: readonly string[]): Eol =>
  texts.filter((text) => eolOf(text) === '\r\n').length * 2 > texts.length ? '\r\n' : '\n'

/** The lines of a file, each with the line ending. */
const linesText = (lines: readonly string[], eol: Eol): string =>
  lines.map((line) => line + eol).join('')

/** A new file's ID in a directory: the stem, or with `-2`, `-3`, … where it is taken; and its line ending. */
async function newFileIn(
  fs: FileSystem,
  directory: string,
  stem: string
): Promise<{ id: string; eol: Eol }> {
  const listed = (await fs.list(directory)) ?? []
  // A Snapshot left behind would become the new Assessment's: its name is taken too.
  const taken = new Set(
    listed.map((entry) => entry.name.toLowerCase().replace(/(\.snapshot\.yml|\.md)$/, ''))
  )
  let id = stem
  for (let count = 2; taken.has(id.toLowerCase()); count++) id = `${stem}-${count}`
  const texts = await Promise.all(
    listed
      .filter((entry) => entry.kind === 'file' && entry.name.endsWith('.md'))
      .map(async (entry) => (await fs.readText(joinPath(directory, entry.name))) ?? '')
  )
  return { id, eol: mostOf(texts) }
}

/** The stem of a new ID: the day and a slug of the title, or the refusal that there is none. */
function stemOf(date: string, title: string): string {
  if (!isDay(date)) refuse({ code: 'date-not-a-day', values: { date } })
  const slug = slugOf(title)
  if (slug === '') refuse({ code: 'title-without-slug', values: { title } })
  return `${date.replaceAll('-', '')}-${slug}`
}

/** A title on one line, or the refusal that there is none. */
function titleOf(title: string): string {
  const text = title.replace(/\s+/g, ' ').trim()
  if (text === '') refuse({ code: 'entry-needs-title', values: {} })
  return text
}

/**
 * An ATX heading with this text. A run of `#`s at its end would be read as a closing sequence,
 * none of the title: one more `#` after it is that sequence, and keeps the title as it is.
 */
function headingLine(level: number, title: string): string {
  const text = closingSequenceAt(title) < title.length ? `${title} #` : title
  return `${'#'.repeat(level)} ${text}`
}

/** A fence that none of the lines can close: longer than any run of backticks in them. */
function fenceFor(lines: readonly string[]): string {
  const longest = lines
    .flatMap((line) => line.match(/`+/g) ?? [])
    .reduce((most, run) => Math.max(most, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** A fenced YAML block of these lines. */
function blockText(lines: readonly string[], eol: Eol): string {
  const fence = fenceFor(lines)
  return linesText([`${fence}yaml`, ...lines, fence], eol)
}

/** A list of texts in flow style. */
const flowList = (items: readonly string[]): string =>
  `[${items.map((item) => formatScalar(item)).join(', ')}]`

/** The Components a file is to name, each once, every one declared. */
function checkedComponents(
  components: readonly string[] | undefined,
  declared: readonly string[] | undefined
): string[] {
  const unique = [...new Set(components ?? [])]
  if (unique.length === 0) return []
  if (!declared) refuse({ code: 'components-need-declaration', values: {} })
  for (const component of unique) {
    if (!declared.includes(component))
      refuse({ code: 'component-not-known', values: { component } })
  }
  return unique
}

/** The authors of a new Assessment, at least one. */
function checkedAuthors(authors: readonly string[]): string[] {
  const named = [
    ...new Set(authors.map((author) => author.trim()).filter((author) => author !== ''))
  ]
  if (named.length === 0) refuse({ code: 'assessment-needs-author', values: {} })
  return named
}

// ————————————————————————————————————————————————————————————————— Assessments

/** An Assessment's file by its ID, which must be there and readable. */
interface AssessmentFile {
  readonly path: string
  readonly text: string
  /** The Assessment, with its Snapshot where it has one that can be read. */
  readonly assessment: Assessment
  /** Whether a Snapshot is beside it that cannot be read: nothing is checked against it. */
  readonly snapshotUnreadable: boolean
}

async function assessmentFile(fs: FileSystem, id: string): Promise<AssessmentFile> {
  const directory = await directoryOf(fs, 'assessments')
  const path = joinPath(directory, `${id}.md`)
  const text = isFileId(id) ? await fs.readText(path) : undefined
  if (text === undefined) refuse({ code: 'no-assessment', values: { id } })
  const { assessment } = readAssessment(id, path, text)
  if (!assessment.writable) refuse({ code: 'file-needs-fixing', values: { path } })
  const snapshotAt = snapshotPathOf(path)
  const frozen = await fs.readText(snapshotAt)
  if (frozen === undefined) return { path, text, assessment, snapshotUnreadable: false }
  const { snapshot } = readSnapshot(snapshotAt, id, frozen)
  return {
    path,
    text,
    assessment: snapshot ? { ...assessment, snapshot } : assessment,
    snapshotUnreadable: snapshot === undefined
  }
}

/** An Assessment that takes new entries: one that is not final. */
async function draftFile(fs: FileSystem, id: string): Promise<AssessmentFile> {
  const file = await assessmentFile(fs, id)
  if (file.assessment.status === 'final') refuse({ code: 'assessment-final', values: { id } })
  return file
}

export interface NewAssessment {
  /** Its title, the text of its `# ` heading, and the slug of its ID. */
  readonly title: string
  /** `YYYY-MM-DD`: the day of the Assessment. */
  readonly date: string
  readonly authors: readonly string[]
  /** The Components it assesses; none for the whole repository. */
  readonly scope?: readonly string[]
  /** The ID of the Assessment it follows. */
  readonly previous?: string
}

/** The text of a new Assessment: its frontmatter, its title, and what follows. */
function assessmentText(
  values: {
    readonly date: string
    readonly authors: readonly string[]
    readonly scope: readonly string[]
    readonly previous?: string
  },
  title: string,
  eol: Eol,
  rest = ''
): string {
  const lines = [
    '---',
    `date: ${values.date}`,
    'status: draft',
    `authors: ${flowList(values.authors)}`,
    ...(values.scope.length > 0 ? [`scope: ${flowList(values.scope)}`] : []),
    ...(values.previous !== undefined ? [`previous: ${formatScalar(values.previous)}`] : []),
    '---',
    '',
    headingLine(1, title)
  ]
  return linesText(lines, eol) + rest
}

/**
 * Plan a new Assessment, a draft (docs/assessment-format.md, section 6). `declared` are the
 * Component IDs of the declaration, which `scope` is checked against; without them, on a
 * Draft, no scope can be named.
 */
export function planAssessment(
  fs: FileSystem,
  assessment: NewAssessment,
  declared?: readonly string[]
): Promise<Plan<{ readonly id: string }>> {
  return planning(fs, async (pending) => {
    const title = titleOf(assessment.title)
    const stem = stemOf(assessment.date, title)
    const authors = checkedAuthors(assessment.authors)
    const scope = checkedComponents(assessment.scope, declared)
    const directory = await directoryOf(fs, 'assessments')
    const previous = assessment.previous
    if (previous !== undefined) {
      const there = isFileId(previous)
        ? await fs.readText(joinPath(directory, `${previous}.md`))
        : undefined
      if (there === undefined) refuse({ code: 'no-assessment', values: { id: previous } })
    }
    const { id, eol } = await newFileIn(fs, directory, stem)
    await pending.create(
      joinPath(directory, `${id}.md`),
      assessmentText(
        { date: assessment.date, authors, scope, ...(previous !== undefined && { previous }) },
        title,
        eol
      )
    )
    return { id }
  })
}

/** The block of a Scenario carried over: as it is, without `rating`, in the new file's line ending. */
function carriedBlock(place: EntryPlace, eol: Eol): string {
  const { text, span, path } = place.region
  const content = text.slice(span.start, span.end)
  const region = parseRegion(content, { start: 0, end: content.length }, eolOf(content), path)
  const lines = applyEdits(content, removeKey(region, 'rating'))
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
  return blockText(lines, eol)
}

/**
 * Plan a new Assessment from the last one — the latest by `date`, then by ID: it follows it,
 * has its scope, and its Quality Scenarios under `## Quality Scenarios`, each with its heading
 * and its block without `rating`, under the same IDs. Their texts, the ratings and the Findings
 * stay behind.
 */
export function planAssessmentFromLast(
  fs: FileSystem,
  assessment: Omit<NewAssessment, 'scope' | 'previous'>,
  declared?: readonly string[]
): Promise<Plan<{ readonly id: string; readonly previous: string }>> {
  return planning(fs, async (pending) => {
    const title = titleOf(assessment.title)
    const stem = stemOf(assessment.date, title)
    const authors = checkedAuthors(assessment.authors)
    const directory = await directoryOf(fs, 'assessments')
    const reading = await openAssessments(fs)
    const last = lastAssessment(reading.assessments)
    if (!last) refuse({ code: 'no-assessment-to-follow', values: {} })
    // Its scope is checked as a new one's: a Component no longer declared is not carried over.
    const scope = checkedComponents(last.scope, declared)
    const lastText = (await fs.readText(last.path)) ?? ''
    const { id, eol } = await newFileIn(fs, directory, stem)
    const scenarios = outlineAssessment(last.id, last.path, lastText).entries.filter(
      (place) => place.kind === 'scenario'
    )
    const rest =
      scenarios.length === 0
        ? ''
        : eol +
          linesText(['## Quality Scenarios'], eol) +
          scenarios
            .map(
              (place) =>
                eol +
                linesText([headingLine(3, place.heading.text), ''], eol) +
                carriedBlock(place, eol)
            )
            .join('')
    await pending.create(
      joinPath(directory, `${id}.md`),
      assessmentText({ date: assessment.date, authors, scope, previous: last.id }, title, eol, rest)
    )
    return { id, previous: last.id }
  })
}

/** The IDs an entry of a kind cannot take: its entries', and those of blocks that cannot be read as one. */
function takenIds(outline: Outline, kind: 'scenario' | 'finding'): Set<string> {
  const taken = new Set(
    outline.entries.filter((place) => place.kind === kind).map((place) => place.id)
  )
  for (const problem of outline.problems) {
    if ('entry' in problem) taken.add(problem.entry)
  }
  // An ID that stands where no entry is read — in a comment, in a list item, in a block that
  // cannot be read — is taken all the same: it may become an entry again.
  for (const line of outline.view.text.slice(outline.view.bodyStart).split('\n')) {
    const key = ID_LINE.exec(line.trimStart())
    if (key?.[1] === kind) taken.add(key[2]!)
  }
  return taken
}

/** A line that may give an entry its ID: `scenario: S1`, quoted or not. */
const ID_LINE = /^(scenario|finding)[ \t]*:[ \t]*['"]?([^\s'"#]+)/

/** The ID of a new entry: the one given, checked, or `S`/`F` and the number after the highest. */
function entryIdFor(
  outline: Outline,
  assessment: string,
  kind: 'scenario' | 'finding',
  given: string | undefined
): string {
  const taken = takenIds(outline, kind)
  if (given !== undefined) {
    if (!isEntryId(given)) refuse({ code: 'entry-id-invalid', values: { id: given } })
    if (taken.has(given)) refuse({ code: 'entry-id-taken', values: { assessment, id: given } })
    return given
  }
  const prefix = kind === 'scenario' ? 'S' : 'F'
  let highest = 0
  for (const id of taken) {
    const number = new RegExp(`^${prefix}(\\d+)$`).exec(id)?.[1]
    if (number !== undefined) highest = Math.max(highest, Number(number))
  }
  return `${prefix}${highest + 1}`
}

/** Where the text of an entry's section ends: after its last line that is not blank. */
function afterSection(text: string, place: EntryPlace): number {
  const lines = linesOf(text, place.heading.line.start, place.end)
  return lines.findLast((line) => !isBlank(line.content))!.next
}

/** Whether the text before an offset ends in a blank line, or is nothing at all. */
function blankBefore(view: FileView, at: number): boolean {
  // A frontmatter is followed by a blank line, as a new file has it.
  if (at <= view.bodyStart) return view.frontmatter === undefined
  const before = linesOf(view.text, view.bodyStart, at)
  const last = before.at(-1)
  return last === undefined || isBlank(last.content)
}

/**
 * Refuse the text of a new entry where it would not read back as the entry's own: a heading
 * of the entry's level or higher would end the entry; a code block or a comment it opens and
 * does not close would hide what follows it.
 */
function checkedText(text: string, level: number): void {
  for (const item of outlineOf(text, 0)) {
    if (item.kind === 'heading' && item.level <= level) {
      refuse({ code: 'text-ends-entry', values: { level } })
    }
    // A block in a list item or a quote ends with its container, before what follows.
    const open = item.kind === 'comment' || (item.kind === 'fence' && !item.contained)
    if (open && !item.close) refuse({ code: 'text-left-open', values: {} })
  }
}

/** What a new entry is written as: its heading, its block, and its text. */
interface NewEntry {
  readonly kind: 'scenario' | 'finding'
  readonly title: string
  readonly lines: readonly string[]
  readonly text: string
}

/**
 * The edit that puts a new entry into an Assessment: after the last entry of its kind, at its
 * level; the first Scenario before the Findings' section, the first of a kind otherwise at the
 * end of the document — each first one under a section of its own.
 */
function entryEdit(outline: Outline, entry: NewEntry): TextEdit {
  const { view } = outline
  const { text, eol } = view
  const body = inEol(entry.text, eol)
  const entryLines = (level: number): string => {
    checkedText(body, level)
    return (
      linesText([headingLine(level, entry.title), ''], eol) +
      blockText(entry.lines, eol) +
      (body === '' ? '' : eol + body)
    )
  }
  const section = entry.kind === 'scenario' ? '## Quality Scenarios' : '## Findings'

  const same = outline.entries.filter((place) => place.kind === entry.kind)
  const last = same.at(-1)
  if (last) {
    const at = afterSection(text, last)
    const lead = text[at - 1] === '\n' ? '' : eol
    return { start: at, end: at, insert: lead + eol + entryLines(last.heading.level) }
  }

  const firstFinding = outline.entries.find((place) => place.kind === 'finding')
  if (entry.kind === 'scenario' && firstFinding) {
    // Before the outermost section below the title that holds the first Finding: not inside
    // one of its subsections.
    let before = firstFinding.heading
    for (const heading of outline.headings.toReversed()) {
      if (heading.line.start >= firstFinding.heading.line.start || heading.level >= before.level) {
        continue
      }
      if (heading.level < 2) break
      before = heading
    }
    const at = before.line.start
    return {
      start: at,
      end: at,
      insert:
        (blankBefore(view, at) ? '' : eol) + linesText([section, ''], eol) + entryLines(3) + eol
    }
  }

  const at = text.length
  const lead =
    text === '' ? '' : text.endsWith('\n') ? (blankBefore(view, at) ? '' : eol) : eol + eol
  return { start: at, end: at, insert: lead + linesText([section, ''], eol) + entryLines(3) }
}

export interface NewScenario {
  /** Its ID; `S` and the next number when none is given. */
  readonly id?: string
  /** The text of its heading. */
  readonly title: string
  /** A characteristic of ISO/IEC 25010, or one with a sub-characteristic: `maintainability/modifiability`. */
  readonly attribute: string
  readonly source?: string
  readonly stimulus: string
  readonly artifact?: string
  readonly environment?: string
  readonly response: string
  readonly measure: string
  readonly importance?: Level
  readonly difficulty?: Level
  readonly rating?: Rating
  /** Markdown below its block: the reasons for its rating. */
  readonly text?: string
}

/** The lines of a new Scenario's block, in the order of the format; checked. */
function scenarioLines(id: string, scenario: NewScenario): string[] {
  for (const key of ['attribute', 'stimulus', 'response', 'measure'] as const) {
    if ((scenario[key] ?? '').trim() === '') refuse({ code: 'scenario-needs-key', values: { key } })
  }
  const attribute = qualityAttributeOf(scenario.attribute)
  if (!attribute) refuse({ code: 'not-a-quality-attribute', values: { value: scenario.attribute } })
  for (const key of ['importance', 'difficulty'] as const) {
    const value = scenario[key]
    if (value !== undefined && !(LEVELS as readonly string[]).includes(value)) {
      refuse({ code: 'not-a-level', values: { value } })
    }
  }
  const rating = scenario.rating
  if (rating !== undefined && !(RATINGS as readonly string[]).includes(rating)) {
    refuse({ code: 'not-a-rating', values: { value: rating } })
  }
  const values: Record<string, string | undefined> = {
    scenario: id,
    attribute: attributeText(attribute),
    source: scenario.source,
    stimulus: scenario.stimulus,
    artifact: scenario.artifact,
    environment: scenario.environment,
    response: scenario.response,
    measure: scenario.measure,
    importance: scenario.importance,
    difficulty: scenario.difficulty,
    rating
  }
  return SCENARIO_KEYS.flatMap((key) => {
    const value = values[key]
    return value === undefined || value.trim() === '' ? [] : [`${key}: ${formatScalar(value)}`]
  })
}

/** Plan Add a Scenario: an entry of the Assessment, after the Scenarios before it. */
export function planScenario(
  fs: FileSystem,
  assessment: string,
  scenario: NewScenario
): Promise<Plan<{ readonly id: string }>> {
  return planning(fs, async (pending) => {
    const { path, text } = await draftFile(fs, assessment)
    const outline = outlineAssessment(assessment, path, text)
    const title = titleOf(scenario.title)
    const id = entryIdFor(outline, assessment, 'scenario', scenario.id)
    const lines = scenarioLines(id, scenario)
    await pending.write(path, () => [
      entryEdit(outline, { kind: 'scenario', title, lines, text: scenario.text ?? '' })
    ])
    return { id }
  })
}

/** An entry of an Assessment by its ID, whose block can be read. */
function entryIn(
  outline: Outline,
  path: string,
  assessment: string,
  kind: 'scenario' | 'finding',
  id: string
): EntryPlace {
  const place = outline.entries.find((one) => one.kind === kind && one.id === id)
  if (place) return place
  if (outline.problems.some((problem) => 'entry' in problem && problem.entry === id)) {
    refuse({ code: 'entry-needs-fixing', values: { path, id } })
  }
  return refuse({
    code: kind === 'scenario' ? 'no-scenario' : 'no-finding',
    values: { assessment, id }
  })
}

/**
 * Plan Rate a Scenario: `rating` in its block, where it stands or inserted in the order of the
 * format; `undefined` takes it out, to rate it no longer.
 */
export function planRating(
  fs: FileSystem,
  assessment: string,
  scenario: string,
  rating: Rating | undefined
): Promise<Plan> {
  return planning(fs, async (pending) => {
    if (rating !== undefined && !(RATINGS as readonly string[]).includes(rating)) {
      refuse({ code: 'not-a-rating', values: { value: rating } })
    }
    const { path, text, assessment: read } = await draftFile(fs, assessment)
    const outline = outlineAssessment(assessment, path, text)
    const block = entryIn(outline, path, assessment, 'scenario', scenario)
    const now = read.scenarios.find((one) => one.id === scenario)
    // Taken out, a rating is unchanged only where there is none: one that is no value counts.
    const unchanged =
      rating === undefined
        ? pairOf(block.region.map, 'rating') === undefined
        : now?.rating === rating
    if (unchanged) refuse({ code: 'rating-unchanged', values: { id: scenario } })
    await pending.write(path, (view) => {
      const place = entryIn(
        outlineAssessment(assessment, path, view.text),
        path,
        assessment,
        'scenario',
        scenario
      )
      return rating === undefined
        ? removeKey(place.region, 'rating')
        : setScalar(place.region, 'rating', rating, SCENARIO_KEYS, asText)
    })
    return {}
  })
}

export interface NewFinding {
  /** Its ID; `F` and the next number when none is given. */
  readonly id?: string
  /** The text of its heading. */
  readonly title: string
  /** The Scenarios of the Assessment it concerns. */
  readonly scenarios?: readonly string[]
  readonly evidence?: readonly NewEvidence[]
  /** Markdown below its block: the judgement. */
  readonly text?: string
}

/** The lines of a piece of evidence as an item of `evidence` has them, without `- `. */
export function evidenceLines(evidence: NewEvidence): string[] {
  const text = formatScalar
  if (evidence.kind === 'metric') {
    const subject = evidence.subject
    return [
      `metric: ${text(evidence.metric)}`,
      ...('component' in subject
        ? [`component: ${text(subject.component)}`]
        : [`file: ${text(subject.file)}`, `name: ${text(subject.name)}`])
    ]
  }
  if (evidence.kind !== 'violation') return [`${evidence.kind}: ${text(evidence.id)}`]
  const violation = evidence.violation
  const first = `violation: ${text(violation.rule)}`
  switch (violation.kind) {
    case 'dependency':
      return [first, `from: ${text(violation.from)}`, `to: ${text(violation.to)}`]
    case 'cycle':
      return [first, `cycle: ${flowList(violation.cycle)}`]
    case 'component':
      return [first, `component: ${text(violation.component)}`]
    case 'inside':
      return [first, `file: ${text(violation.file)}`, `name: ${text(violation.name)}`]
  }
}

/** Whether every text a piece of evidence needs is there. */
function isComplete(evidence: NewEvidence): boolean {
  const all = (...texts: readonly string[]): boolean => texts.every((one) => one.trim() !== '')
  if (evidence.kind === 'metric') {
    const subject = evidence.subject
    return (
      all(evidence.metric) &&
      ('component' in subject ? all(subject.component) : all(subject.file, subject.name))
    )
  }
  if (evidence.kind !== 'violation') return all(evidence.id)
  const violation = evidence.violation
  if (!all(violation.rule)) return false
  switch (violation.kind) {
    case 'dependency':
      return all(violation.from, violation.to)
    case 'cycle':
      return violation.cycle.length >= 2 && all(...violation.cycle)
    case 'component':
      return all(violation.component)
    case 'inside':
      return all(violation.file, violation.name)
  }
}

/**
 * The refusal of evidence that names nothing: a Risk or a Technical Debt Item that is not in
 * its register, and — where the caller hands in what there is — a Violation the code does not
 * have, a metric the Snapshot or the code does not hold, an Annotation, an ADR.
 */
function checkEvidence(
  evidence: NewEvidence,
  { assessment, snapshotUnreadable }: AssessmentFile,
  known: Known,
  registers: { readonly risks?: readonly Risk[]; readonly debt?: readonly TechnicalDebtItem[] }
): void {
  if (!isComplete(evidence))
    refuse({ code: 'evidence-incomplete', values: { kind: evidence.kind } })
  const notThere = (): never =>
    refuse({
      code: 'evidence-not-there',
      values: { kind: evidence.kind, name: evidenceName(evidence) }
    })
  switch (evidence.kind) {
    case 'violation':
      if (
        known.violations &&
        !known.violations.some((one) => namesViolation(evidence.violation, one))
      ) {
        notThere()
      }
      return
    case 'metric':
      // With a Snapshot, its value is what the Finding cites, however the code moved on; one
      // that cannot be read is a Problem of its own, and nothing is checked against it.
      if (snapshotUnreadable) return
      if (
        (assessment.snapshot || known.metrics) &&
        metricValueOf(assessment, evidence, known.metrics) === undefined
      ) {
        notThere()
      }
      return
    case 'annotation':
      if (known.annotations && !known.annotations.includes(evidence.id)) notThere()
      return
    case 'adr': {
      if (!known.adrs) return
      const cited = citedAdr(evidence.id, known.adrs)
      if (cited.ambiguous) {
        refuse({
          code: 'evidence-ambiguous-adr',
          values: { adr: evidence.id, candidates: cited.ambiguous }
        })
      }
      if (!cited.found) notThere()
      return
    }
    case 'risk':
      if (registers.risks && !registers.risks.some((risk) => risk.id === evidence.id)) notThere()
      return
    case 'debt':
      if (registers.debt && !registers.debt.some((item) => item.id === evidence.id)) notThere()
      return
  }
}

/** The registers that evidence is checked against: those whose directory can be read. */
async function registersOf(
  fs: FileSystem
): Promise<{ readonly risks?: readonly Risk[]; readonly debt?: readonly TechnicalDebtItem[] }> {
  const reading = await openAssessments(fs)
  return {
    ...(reading.directories.risks !== undefined && { risks: reading.risks }),
    ...(reading.directories.debt !== undefined && { debt: reading.debtItems })
  }
}

/**
 * Plan Add a Finding: an entry of the Assessment after the Findings before it, with the
 * Scenarios it concerns and its evidence, each checked; `known` is what the other modules
 * know, as for the Traces.
 */
export function planFinding(
  fs: FileSystem,
  assessment: string,
  finding: NewFinding,
  known: Known = {}
): Promise<Plan<{ readonly id: string }>> {
  return planning(fs, async (pending) => {
    const file = await draftFile(fs, assessment)
    const { path, text, assessment: read } = file
    const outline = outlineAssessment(assessment, path, text)
    const title = titleOf(finding.title)
    const id = entryIdFor(outline, assessment, 'finding', finding.id)
    const scenarios = [...new Set(finding.scenarios ?? [])]
    for (const scenario of scenarios) {
      if (!read.scenarios.some((one) => one.id === scenario)) {
        refuse({ code: 'no-scenario', values: { assessment, id: scenario } })
      }
    }
    const evidence = finding.evidence ?? []
    const registers = evidence.some((one) => one.kind === 'risk' || one.kind === 'debt')
      ? await registersOf(fs)
      : {}
    const seen = new Set<string>()
    for (const one of evidence) {
      checkEvidence(one, file, known, registers)
      const key = evidenceKey(one)
      if (seen.has(key)) {
        refuse({
          code: 'evidence-there-already',
          values: { finding: id, kind: one.kind, name: evidenceName(one) }
        })
      }
      seen.add(key)
    }
    const lines = [
      `finding: ${formatScalar(id)}`,
      ...(scenarios.length > 0 ? [`scenarios: ${flowList(scenarios)}`] : []),
      ...(evidence.length > 0 ? ['evidence:'] : []),
      ...evidence.flatMap((one) =>
        evidenceLines(one).map((line, index) => `  ${index === 0 ? '- ' : '  '}${line}`)
      )
    ]
    await pending.write(path, () => [
      entryEdit(outline, { kind: 'finding', title, lines, text: finding.text ?? '' })
    ])
    return { id }
  })
}

/** Plan Add evidence: an item at the end of the Finding's `evidence`, in block style. */
export function planEvidence(
  fs: FileSystem,
  assessment: string,
  finding: string,
  evidence: NewEvidence,
  known: Known = {}
): Promise<Plan> {
  return planning(fs, async (pending) => {
    const file = await draftFile(fs, assessment)
    const { path, text, assessment: read } = file
    entryIn(outlineAssessment(assessment, path, text), path, assessment, 'finding', finding)
    const now = read.findings.find((one) => one.id === finding)!
    if (now.evidence.some((one) => evidenceKey(one) === evidenceKey(evidence))) {
      refuse({
        code: 'evidence-there-already',
        values: { finding, kind: evidence.kind, name: evidenceName(evidence) }
      })
    }
    const registers =
      evidence.kind === 'risk' || evidence.kind === 'debt' ? await registersOf(fs) : {}
    checkEvidence(evidence, file, known, registers)
    await pending.write(path, (view) => {
      const place = entryIn(
        outlineAssessment(assessment, path, view.text),
        path,
        assessment,
        'finding',
        finding
      )
      return appendBlockItem(place.region, 'evidence', evidenceLines(evidence), FINDING_KEYS)
    })
    return {}
  })
}

/**
 * Plan Take a Snapshot: the file beside the Assessment, written as a whole with the values
 * given — `snapshotValuesOf` of Structure's metrics, `undefined` on a Draft — and the commit
 * HEAD points at.
 */
export function planSnapshot(
  fs: FileSystem,
  git: Pick<Git, 'headCommit'>,
  assessment: string,
  snapshot: { readonly date: string; readonly values: SnapshotValues | undefined }
): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path, text } = await draftFile(fs, assessment)
    if (!isDay(snapshot.date)) refuse({ code: 'date-not-a-day', values: { date: snapshot.date } })
    const values = snapshot.values
    if (!values || Object.keys(values.components).length === 0) {
      refuse({ code: 'snapshot-without-values', values: {} })
    }
    const commit = await git.headCommit()
    const written = (eol: Eol): string =>
      snapshotText(
        assessment,
        {
          date: snapshot.date,
          ...(commit !== undefined && isObjectName(commit) && { commit }),
          values
        },
        eol
      )
    const at = snapshotPathOf(path)
    if ((await fs.readText(at)) === undefined) {
      await pending.create(at, written(eolOf(text)))
      return {}
    }
    // The Snapshot is the suite's as a whole: all of it is written anew, in its own line
    // ending, a byte order mark kept.
    await pending.write(at, (view) => {
      const start = view.text.startsWith('\uFEFF') ? 1 : 0
      return [{ start, end: view.text.length, insert: written(view.eol) }]
    })
    return {}
  })
}

/**
 * Keys of a frontmatter set to texts, each where it stands or inserted in the order of the
 * format; a file without frontmatter gets one at its top.
 */
function frontmatterEdits(
  view: FileView,
  path: string,
  values: readonly (readonly [key: string, value: string])[],
  order: readonly string[]
): TextEdit[] {
  if (!view.frontmatter) {
    const { eol, text, bodyStart } = view
    const first = linesOf(text, bodyStart, text.length)[0]
    const lines = ['---', ...values.map(([key, value]) => `${key}: ${asText(value)}`), '---']
    const blank = first !== undefined && !isBlank(first.content) ? eol : ''
    return [{ start: bodyStart, end: bodyStart, insert: linesText(lines, eol) + blank }]
  }
  const region: Region = regionFor(view.text, view.frontmatter, view.eol, path)
  return values.flatMap(([key, value]) => setScalar(region, key, value, order, asText))
}

/** Plan Finish: `status: final`. What a final Assessment records is complete. */
export function planFinish(fs: FileSystem, assessment: string): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path, assessment: read } = await assessmentFile(fs, assessment)
    if (read.status === 'final') refuse({ code: 'final-already', values: { id: assessment } })
    await pending.write(path, (view) =>
      frontmatterEdits(view, path, [['status', 'final']], ASSESSMENT_KEYS)
    )
    return {}
  })
}

// ————————————————————————————————————————————————————————————————— Risks and Technical Debt Items

export interface NewRegisterEntry {
  /** Its title, the text of its `# ` heading, and the slug of its ID. */
  readonly title: string
  /** `YYYY-MM-DD`: the day it is recorded. */
  readonly date: string
  readonly owner?: string
  /** The Components it concerns. */
  readonly components?: readonly string[]
  /** Markdown: what it is, below its title. */
  readonly description?: string
}

/**
 * Plan a new Risk or Technical Debt Item, a file of its own in its register, `open`.
 * `declared` are the Component IDs of the declaration, which `components` is checked against.
 */
export function planRegisterEntry(
  fs: FileSystem,
  register: Register,
  entry: NewRegisterEntry,
  declared?: readonly string[]
): Promise<Plan<{ readonly id: string }>> {
  return planning(fs, async (pending) => {
    const title = titleOf(entry.title)
    const stem = stemOf(entry.date, title)
    const components = checkedComponents(entry.components, declared)
    const directory = await directoryOf(fs, register)
    const { id, eol } = await newFileIn(fs, directory, stem)
    const owner = entry.owner?.trim()
    const lines = [
      '---',
      'state: open',
      `date: ${entry.date}`,
      ...(owner ? [`owner: ${formatScalar(owner)}`] : []),
      ...(components.length > 0 ? [`components: ${flowList(components)}`] : []),
      '---',
      '',
      headingLine(1, title)
    ]
    const description = inEol(entry.description ?? '', eol)
    await pending.create(
      joinPath(directory, `${id}.md`),
      linesText(lines, eol) + (description === '' ? '' : eol + description)
    )
    return { id }
  })
}

/** Plan a new Risk. */
export const planRisk = (
  fs: FileSystem,
  risk: NewRegisterEntry,
  declared?: readonly string[]
): Promise<Plan<{ readonly id: string }>> => planRegisterEntry(fs, 'risks', risk, declared)

/** Plan a new Technical Debt Item. */
export const planDebtItem = (
  fs: FileSystem,
  item: NewRegisterEntry,
  declared?: readonly string[]
): Promise<Plan<{ readonly id: string }>> => planRegisterEntry(fs, 'debt', item, declared)

/**
 * Plan Change the state of a Risk or a Technical Debt Item: `state`, and `changed` the day it
 * changes, each where it stands or inserted in the order of the format.
 */
export function planState(
  fs: FileSystem,
  register: Register,
  id: string,
  state: RiskState | DebtState,
  date: string
): Promise<Plan> {
  return planning(fs, async (pending) => {
    const states: readonly string[] = register === 'risks' ? RISK_STATES : DEBT_STATES
    if (!states.includes(state)) {
      refuse({
        code: register === 'risks' ? 'not-a-risk-state' : 'not-a-debt-state',
        values: { state }
      })
    }
    if (!isDay(date)) refuse({ code: 'date-not-a-day', values: { date } })
    const directory = await directoryOf(fs, register)
    const path = joinPath(directory, `${id}.md`)
    const text = isFileId(id) ? await fs.readText(path) : undefined
    if (text === undefined) {
      refuse({ code: register === 'risks' ? 'no-risk' : 'no-debt-item', values: { id } })
    }
    const { entry } = readRegisterEntry(register, id, path, text)
    if (!entry.writable) refuse({ code: 'file-needs-fixing', values: { path } })
    if (entry.state === state) refuse({ code: 'state-unchanged', values: { id, state } })
    await pending.write(path, (view) =>
      frontmatterEdits(
        view,
        path,
        [
          ['state', state],
          ['changed', date]
        ],
        ENTRY_KEYS
      )
    )
    return {}
  })
}
