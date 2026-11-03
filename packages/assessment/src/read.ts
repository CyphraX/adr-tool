/**
 * Where the Assessments, the Risks and the Technical Debt Items of a repository are, and what is
 * found there (docs/assessment-format.md, section 1). Never writes.
 */
import {
  CONFIG_PATH,
  joinPath,
  normalizePath,
  openConfig,
  type Config,
  type FileSystem
} from '@adr-tool/kernel'
import { readAssessment } from './document'
import type { Assessment, Register, Risk, TechnicalDebtItem } from './model'
import type { AssessmentProblem, DirectoryKey } from './problems'
import { readRegisterEntry } from './register'
import { readSnapshot, SNAPSHOT_SUFFIX } from './snapshot'

/** The keys of `.arch/config.yml` that are Assessment's own (docs/configuration.md). */
export const DIRECTORY_KEYS = ['assessments', 'risks', 'debt'] as const satisfies DirectoryKey[]

/** Where each directory is when the configuration does not say. */
export const DEFAULT_DIRECTORIES: Readonly<Record<DirectoryKey, string>> = {
  assessments: 'docs/architecture/assessments',
  risks: 'docs/architecture/risks',
  debt: 'docs/architecture/debt'
}

export interface AssessmentLocations {
  /**
   * Each directory; `undefined` while `.arch/config.yml` cannot be read, or its key cannot be
   * used: then nothing of it is read or written.
   */
  readonly directories: Readonly<Record<DirectoryKey, string | undefined>>
  /** What is wrong with the keys. */
  readonly problems: readonly AssessmentProblem[]
}

/**
 * Where the settings say the directories are. Assessment reads its three keys and no other.
 * While the file cannot be read, nothing is read or written, and the Problem is the file's:
 * the kernel's, which the caller reports once for every module (docs/configuration.md).
 */
export function readLocations(config: Config): AssessmentLocations {
  if (!config.readable) {
    return { directories: { assessments: undefined, risks: undefined, debt: undefined }, problems: [] }
  }
  const problems: AssessmentProblem[] = []
  const directories = {} as Record<DirectoryKey, string | undefined>
  for (const key of DIRECTORY_KEYS) {
    const setting = config.settings.get(key)
    if (setting === undefined || setting.value === null) {
      directories[key] = DEFAULT_DIRECTORIES[key]
      continue
    }
    // A path is a text: `123` or `true` is a number or a truth value as YAML reads it.
    const directory = typeof setting.value === 'string' ? normalizePath(setting.value) : undefined
    if (directory === undefined || directory === '') {
      directories[key] = undefined
      problems.push({ kind: 'invalid-directory-setting', path: CONFIG_PATH, line: setting.line, key })
    } else directories[key] = directory
  }
  return { directories, problems }
}

/** Where the directories of the repository are. Never writes. */
export async function locateAssessments(
  fs: FileSystem,
  config?: Config
): Promise<AssessmentLocations> {
  return readLocations(config ?? (await openConfig(fs)))
}

/**
 * Whether a text is the ID of an entry of a directory: the name of its file without `.md`, one
 * part of a path on every system (docs/assessment-format.md, section 1). `README` is the
 * directory's own file.
 */
export function isFileId(id: string): boolean {
  return /^[^/\\\p{Cc}]*[^/\\\p{Cc}. ]$/u.test(id) && id.toLowerCase() !== 'readme'
}

export interface AssessmentsReading extends AssessmentLocations {
  /** By date, then by ID; those without a date after them, by ID. */
  readonly assessments: readonly Assessment[]
  /** By ID. */
  readonly risks: readonly Risk[]
  readonly debtItems: readonly TechnicalDebtItem[]
  /**
   * What is wrong with the keys and with each file. The Traces are checked apart
   * (`traceProblems`), against what the other modules know.
   */
  readonly problems: readonly AssessmentProblem[]
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The `.md` files directly in a directory that are entries, by ID, with their texts. */
async function entriesIn(
  fs: FileSystem,
  directory: string | undefined
): Promise<{ id: string; path: string; text: string }[]> {
  if (directory === undefined) return []
  const listed = (await fs.list(directory)) ?? []
  const found: { id: string; path: string; text: string }[] = []
  for (const name of listed
    .filter((entry) => entry.kind === 'file' && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort(compare)) {
    const id = name.slice(0, -'.md'.length)
    if (!isFileId(id)) continue
    const path = joinPath(directory, name)
    const text = await fs.readText(path)
    if (text !== undefined) found.push({ id, path, text })
  }
  return found
}

/** Read the entries of a register. */
async function readRegister<R extends Register>(
  fs: FileSystem,
  register: R,
  directory: string | undefined,
  problems: AssessmentProblem[]
): Promise<(R extends 'risks' ? Risk : TechnicalDebtItem)[]> {
  const entries: (R extends 'risks' ? Risk : TechnicalDebtItem)[] = []
  for (const { id, path, text } of await entriesIn(fs, directory)) {
    const read = readRegisterEntry(register, id, path, text)
    entries.push(read.entry)
    problems.push(...read.problems)
  }
  return entries
}

/**
 * Read the Assessments of a repository with their Snapshots, and its Risks and Technical Debt
 * Items (docs/assessment-format.md, sections 1 to 5). `config` is `.arch/config.yml` as the
 * caller read it for every module; without it, it is read here. Never throws, never writes:
 * what cannot be read becomes a Problem.
 */
export async function openAssessments(
  fs: FileSystem,
  config?: Config
): Promise<AssessmentsReading> {
  const location = await locateAssessments(fs, config)
  const { directories } = location
  const problems: AssessmentProblem[] = [...location.problems]

  const assessments: Assessment[] = []
  for (const { id, path, text } of await entriesIn(fs, directories.assessments)) {
    const read = readAssessment(id, path, text)
    problems.push(...read.problems)
    const snapshotPath = joinPath(directories.assessments!, `${id}${SNAPSHOT_SUFFIX}`)
    const snapshotText = await fs.readText(snapshotPath)
    if (snapshotText === undefined) {
      assessments.push(read.assessment)
      continue
    }
    const snapshot = readSnapshot(snapshotPath, id, snapshotText)
    problems.push(...snapshot.problems)
    assessments.push(
      snapshot.snapshot ? { ...read.assessment, snapshot: snapshot.snapshot } : read.assessment
    )
  }
  // A Snapshot whose Assessment is not there: removed by hand, or renamed without it.
  if (directories.assessments !== undefined) {
    const ids = new Set(assessments.map((assessment) => assessment.id))
    const listed = (await fs.list(directories.assessments)) ?? []
    for (const entry of [...listed].sort((a, b) => compare(a.name, b.name))) {
      if (entry.kind !== 'file' || !entry.name.endsWith(SNAPSHOT_SUFFIX)) continue
      const id = entry.name.slice(0, -SNAPSHOT_SUFFIX.length)
      if (ids.has(id)) continue
      problems.push({
        kind: 'snapshot-without-assessment',
        path: joinPath(directories.assessments, entry.name),
        assessment: id
      })
    }
  }
  assessments.sort((a, b) =>
    a.date !== undefined && b.date !== undefined
      ? compare(a.date, b.date) || compare(a.id, b.id)
      : a.date !== undefined
        ? -1
        : b.date !== undefined
          ? 1
          : compare(a.id, b.id)
  )
  const risks = await readRegister(fs, 'risks', directories.risks, problems)
  const debtItems = await readRegister(fs, 'debt', directories.debt, problems)
  return { directories, assessments, risks, debtItems, problems }
}

/** The last Assessment: the latest by date, then by ID, of those with a date. */
export function lastAssessment(assessments: readonly Assessment[]): Assessment | undefined {
  return assessments.filter((assessment) => assessment.date !== undefined).at(-1)
}
