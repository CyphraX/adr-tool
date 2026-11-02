import type { Problem } from '@adr-tool/core'
import type { LintedGroup, LintedProblem, LintReport } from './lint'

export const FORMATS = ['text', 'json', 'github'] as const
export type Format = (typeof FORMATS)[number]

/**
 * What `adr lint` prints for a report, in one of its formats (docs/cli.md, "What it prints").
 * `checkout` is where the repository lies, seen from the directory GitHub names files from:
 * the paths of `--format github` start there.
 */
export function render(report: LintReport, format: Format, checkout = ''): string {
  switch (format) {
    case 'text':
      return text(report)
    case 'json':
      return `${JSON.stringify(json(report))}\n`
    case 'github':
      return github(report, checkout)
  }
}

/**
 * One line, whatever a value in it holds: a line break or another control character is
 * written as its escape, and a line never begins with `::`, which GitHub Actions would take
 * for a workflow command.
 */
const oneLine = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  const escaped = text.replace(/[\u0000-\u001f\u007f]/g, (char) =>
    JSON.stringify(char).slice(1, -1)
  )
  return escaped.startsWith('::') ? `./${escaped}` : escaped
}

const where = (problem: LintedProblem): string =>
  problem.line === undefined ? problem.path : `${problem.path}:${problem.line}`

const said = (problem: LintedProblem): string =>
  oneLine(`${where(problem)}: ${problem.code}: ${problem.message}`)

function text(report: LintReport): string {
  const lines = report.problems.flatMap((group) => [
    said(group),
    ...(group.lead === undefined ? [] : [`  ${oneLine(group.lead)}`]),
    ...group.consequences.map((consequence) => `  ${said(consequence)}`)
  ])
  return [...lines, ...(lines.length > 0 ? [''] : []), summary(report), ''].join('\n')
}

/** The last line: how many Problems, where, and how many follow from them. */
export function summary(report: LintReport): string {
  const problems = report.problems.length
  const following = report.problems.reduce((sum, group) => sum + group.consequences.length, 0)
  const logs = report.logs.length
  // A Problem of the repository as a whole is one of its configuration, not of a log.
  const configured = report.problems.some((group) => group.log === undefined)
  const counted = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`
  if (problems === 0) return `No Problems in ${counted(logs, 'Decision Log')}.`
  const found = `${counted(problems, 'Problem')}`
  const rest =
    following === 0
      ? ''
      : `, and ${following} that ${following === 1 ? 'follows' : 'follow'} from ${problems === 1 ? 'it' : 'them'}`
  if (logs === 0) return `${found}, and no Decision Log that could be checked.`
  const places = `${configured ? 'the configuration and ' : ''}${counted(logs, 'Decision Log')}`
  return `${found} in ${places}${rest}.`
}

function json(report: LintReport): object {
  const one = ({ code, message, path, line, log, problem }: LintedProblem): object => ({
    code,
    message,
    path,
    ...(line !== undefined && { line }),
    ...(log !== undefined && { log }),
    problem: withoutSaid(problem)
  })
  return {
    logs: report.logs,
    problems: report.problems.map((group: LintedGroup) => ({
      ...one(group),
      consequences: group.consequences.map(one)
    }))
  }
}

/**
 * The Problem as the document gives it (docs/cli.md): what `core` reports, without the code of
 * its detail that a window in another language words it by. The message is in English.
 */
function withoutSaid(problem: Problem): Problem {
  if (!('said' in problem)) return problem
  const rest: Record<string, unknown> = { ...problem }
  delete rest['said']
  return rest as Problem
}

/** Escaped as the workflow commands of GitHub Actions want it. */
const data = (value: string): string =>
  value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
const property = (value: string): string =>
  data(value).replaceAll(':', '%3A').replaceAll(',', '%2C')

function command(
  kind: 'error' | 'notice',
  problem: LintedProblem,
  message: string,
  checkout: string
): string {
  const file = checkout === '' ? problem.path : `${checkout}/${problem.path}`
  const properties = [
    `file=${property(file)}`,
    ...(problem.line === undefined ? [] : [`line=${problem.line}`]),
    `title=${property(problem.code)}`
  ]
  return `::${kind} ${properties.join(',')}::${data(message)}`
}

function github(report: LintReport, checkout: string): string {
  const lines = report.problems.flatMap((group) => [
    command('error', group, group.message, checkout),
    ...group.consequences.map((consequence) =>
      command(
        'notice',
        consequence,
        `${consequence.message} ${group.lead ?? ''}`.trimEnd(),
        checkout
      )
    )
  ])
  return [...lines, summary(report), ''].join('\n')
}
