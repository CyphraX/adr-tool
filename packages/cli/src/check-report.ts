import {
  conformanceEnglishOf,
  fingerprintText,
  RULES_PATH,
  saidAt,
  sentenceAt,
  sentenceAtUse,
  wordingOf,
  type CheckedViolation
} from '@adr-tool/conformance'
import { DECLARATION_PATH } from '@adr-tool/structure/model'
import type { CheckReport } from './check'
import {
  data,
  githubLines,
  json as lintJson,
  oneLine,
  property,
  summary as lintSummary,
  textLines,
  type Format
} from './report'

/** One line `adr check` prints about something that fails it: where, which code, and why. */
interface Entry {
  readonly path: string
  readonly line?: number
  /** The code of a Problem; the ID of the Rule of a Violation. */
  readonly code: string
  readonly message: string
  /** A note fails nothing: GitHub shows it as a notice. */
  readonly note?: true
}

/**
 * What `adr check` prints for a report, in one of its formats (docs/cli.md, "adr check").
 * `checkout` is where the repository lies, seen from the directory GitHub names files from.
 */
export function renderCheck(report: CheckReport, format: Format, checkout = ''): string {
  switch (format) {
    case 'text': {
      const lines = [...(report.lint ? textLines(report.lint) : []), ...entries(report).map(said)]
      return [...lines, ...(lines.length > 0 ? [''] : []), ...summaries(report), ''].join('\n')
    }
    case 'json':
      return `${JSON.stringify(json(report))}\n`
    case 'github':
      return [
        ...(report.lint ? githubLines(report.lint, checkout) : []),
        ...entries(report).map((entry) => command(entry, checkout)),
        ...summaries(report),
        ''
      ].join('\n')
  }
}

/** Whether the check fails: a Problem of any module, or a Violation without an Exception. */
export function fails(report: CheckReport): boolean {
  return (
    (report.lint?.problems.length ?? 0) > 0 ||
    report.declaration.length > 0 ||
    report.conformance.problems.length > 0 ||
    report.conformance.violations.some((violation) => violation.exception === undefined)
  )
}

/** The Problems of the declaration and of the Rules, and every import of a Violation that fails. */
function entries(report: CheckReport): Entry[] {
  const { conformance } = report
  return [
    ...report.declaration.map(({ path, line, code, message }) => ({
      path,
      ...(line !== undefined && { line }),
      code,
      message
    })),
    ...conformance.problems.map((problem) => ({
      path: RULES_PATH,
      line: problem.line,
      code: problem.kind,
      message: wordingOf(problem)
    })),
    ...conformance.notes.map((note) => ({
      path: RULES_PATH,
      line: note.line,
      code: note.kind,
      message: wordingOf(note),
      note: true as const
    })),
    ...conformance.violations
      .filter((violation) => violation.exception === undefined)
      .flatMap(violationEntries)
  ]
}

/**
 * A Violation at each line of each import behind it — where Jonas reads it — with the reason
 * the Rule gives; of a function or a class, at its line; a Violation of neither, at its Rule.
 */
function violationEntries(violation: CheckedViolation): Entry[] {
  const { rule } = violation
  // A Rule about Libraries: at each line of each import of the Library.
  if (violation.uses !== undefined && violation.uses.length > 0) {
    return violation.uses.flatMap((use) =>
      use.lines.map((line) => ({
        path: use.file,
        line,
        code: rule.id,
        message: `${sentenceAtUse(violation, use, line)} ${rule.why}`
      }))
    )
  }
  if (violation.dependencies.length === 0) {
    const message = `${sentenceAt(violation)} ${rule.why}`
    return [{ ...placeOf(violation), code: rule.id, message }]
  }
  return violation.dependencies.flatMap((dependency) =>
    dependency.lines.map((line) => ({
      path: dependency.from,
      line,
      code: rule.id,
      message: `${sentenceAt(violation, dependency, line)} ${rule.why}`
    }))
  )
}

/** Where a Violation without imports is: its function or class, or else its Rule. */
const placeOf = (violation: CheckedViolation): { path: string; line: number } =>
  violation.file !== undefined && violation.line !== undefined
    ? { path: violation.file, line: violation.line }
    : { path: RULES_PATH, line: violation.rule.line }

const said = (entry: Entry): string =>
  oneLine(
    `${entry.line === undefined ? entry.path : `${entry.path}:${entry.line}`}: ${entry.code}: ${entry.message}`
  )

function command(entry: Entry, checkout: string): string {
  const file = checkout === '' ? entry.path : `${checkout}/${entry.path}`
  const properties = [
    `file=${property(file)}`,
    ...(entry.line === undefined ? [] : [`line=${entry.line}`]),
    `title=${property(entry.code)}`
  ]
  return `::${entry.note ? 'notice' : 'error'} ${properties.join(',')}::${data(entry.message)}`
}

const counted = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

/** The last lines: one for the Decision Logs, one for the declaration if needed, one for the Rules. */
function summaries(report: CheckReport): string[] {
  const { conformance } = report
  const lines = [report.lint ? lintSummary(report.lint) : 'No Decision Log.']
  if (report.declaration.length > 0) {
    lines.push(`${counted(report.declaration.length, 'Problem')} in ${DECLARATION_PATH}.`)
  }
  if (!conformance.present) {
    lines.push(`No Rules: ${RULES_PATH} is not there.`)
    return lines
  }
  const rules = conformance.rules.length
  const open = conformance.violations.filter((violation) => !violation.exception).length
  const accepted = conformance.violations.length - open
  const asExceptions = `accepted as ${accepted === 1 ? 'an Exception' : 'Exceptions'}`
  let line =
    rules === 0
      ? `No Rules in ${RULES_PATH}`
      : !conformance.evaluated
        ? `${counted(rules, 'Rule')}, not checked`
        : open > 0
          ? `${counted(open, 'Violation')} of ${counted(rules, 'Rule')}${accepted > 0 ? `, and ${accepted} ${asExceptions}` : ''}`
          : `${counted(rules, 'Rule')} ${rules === 1 ? 'holds' : 'hold'}${accepted > 0 ? `, but for ${counted(accepted, 'Violation')} ${asExceptions}` : ''}`
  if (conformance.problems.length > 0) {
    line += `; ${counted(conformance.problems.length, 'Problem')} in ${RULES_PATH}`
  }
  lines.push(`${line}.`)
  return lines
}

/** The document of `--format json` (docs/cli.md, "adr check"). */
function json(report: CheckReport): object {
  const { conformance } = report
  const decisions = report.lint ? lintJson(report.lint) : { logs: [], problems: [] }
  return {
    logs: decisions.logs,
    problems: [
      ...decisions.problems.map((problem) => ({ module: 'decisions', ...problem })),
      ...report.declaration.map(({ code, message, path, line, problem }) => ({
        module: 'structure',
        code,
        message,
        path,
        ...(line !== undefined && { line }),
        problem
      })),
      ...conformance.problems.map((problem) => ({
        module: 'conformance',
        code: problem.kind,
        message: wordingOf(problem),
        path: RULES_PATH,
        line: problem.line,
        problem
      }))
    ],
    notes: conformance.notes.map((note) => ({
      module: 'conformance',
      code: note.kind,
      message: wordingOf(note),
      path: RULES_PATH,
      line: note.line,
      note
    })),
    rules: conformance.rules.map(({ id, kind, why, line }) => ({
      id,
      kind,
      why,
      path: RULES_PATH,
      line
    })),
    violations: conformance.violations.map((violation) => {
      const first = violation.dependencies[0]
      const use = violation.uses?.[0]
      const { exception } = violation
      return {
        code: violation.rule.kind,
        rule: violation.rule.id,
        message: conformanceEnglishOf(saidAt(violation)),
        why: violation.rule.why,
        fingerprint: violation.fingerprint,
        fingerprintText: fingerprintText(violation.fingerprint),
        ...(first ? { path: first.from, line: first.lines[0] } : placeOf(violation)),
        ...(violation.value !== undefined && { value: violation.value }),
        dependencies: violation.dependencies,
        // A Rule about Libraries: at its first import, with every use behind it.
        ...(use && { path: use.file, line: use.lines[0], uses: violation.uses }),
        ...(exception && {
          exception: {
            reason: exception.reason,
            ...(exception.justifiedBy && { 'justified-by': exception.justifiedBy.adr }),
            path: RULES_PATH,
            line: exception.line
          }
        })
      }
    })
  }
}
