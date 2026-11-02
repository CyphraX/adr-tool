import type { LintedGroup, LintedProblem, LintReport } from './lint'

export const FORMATS = ['text', 'json', 'github'] as const
export type Format = (typeof FORMATS)[number]

/** What `adr lint` prints for a report, in one of its formats (docs/cli.md, "What it prints"). */
export function render(report: LintReport, format: Format): string {
  switch (format) {
    case 'text':
      return text(report)
    case 'json':
      return `${JSON.stringify(json(report))}\n`
    case 'github':
      return github(report)
  }
}

const where = (problem: LintedProblem): string =>
  problem.line === undefined ? problem.path : `${problem.path}:${problem.line}`

const said = (problem: LintedProblem): string =>
  `${where(problem)}: ${problem.code}: ${problem.message}`

function text(report: LintReport): string {
  const lines = report.problems.flatMap((group) => [
    said(group),
    ...(group.lead === undefined ? [] : [`  ${group.lead}`]),
    ...group.consequences.map((consequence) => `  ${said(consequence)}`)
  ])
  return [...lines, ...(lines.length > 0 ? [''] : []), summary(report), ''].join('\n')
}

/** The last line: how many Problems, where, and how many follow from them. */
export function summary(report: LintReport): string {
  const problems = report.problems.length
  const following = report.problems.reduce((sum, group) => sum + group.consequences.length, 0)
  const logs = report.logs.length
  const counted = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? '' : 's'}`
  if (problems === 0) return `No Problems in ${counted(logs, 'Decision Log')}.`
  const found = `${counted(problems, 'Problem')}`
  const rest =
    following === 0
      ? ''
      : `, and ${following} that ${following === 1 ? 'follows' : 'follow'} from ${problems === 1 ? 'it' : 'them'}`
  return logs === 0
    ? `${found}, and no Decision Log that could be checked.`
    : `${found} in ${counted(logs, 'Decision Log')}${rest}.`
}

function json(report: LintReport): object {
  const one = ({ code, message, path, line, log, problem }: LintedProblem): object => ({
    code,
    message,
    path,
    ...(line !== undefined && { line }),
    ...(log !== undefined && { log }),
    problem
  })
  return {
    logs: report.logs,
    problems: report.problems.map((group: LintedGroup) => ({
      ...one(group),
      consequences: group.consequences.map(one)
    }))
  }
}

/** Escaped as the workflow commands of GitHub Actions want it. */
const data = (value: string): string =>
  value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
const property = (value: string): string =>
  data(value).replaceAll(':', '%3A').replaceAll(',', '%2C')

function command(kind: 'error' | 'notice', problem: LintedProblem, message: string): string {
  const properties = [
    `file=${property(problem.path)}`,
    ...(problem.line === undefined ? [] : [`line=${problem.line}`]),
    `title=${property(problem.code)}`
  ]
  return `::${kind} ${properties.join(',')}::${data(message)}`
}

function github(report: LintReport): string {
  const lines = report.problems.flatMap((group) => [
    command('error', group, group.message),
    ...group.consequences.map((consequence) =>
      command('notice', consequence, `${consequence.message} ${group.lead ?? ''}`.trimEnd())
    )
  ])
  return [...lines, summary(report), ''].join('\n')
}
