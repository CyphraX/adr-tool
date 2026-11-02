import { joinPath, type FileSystem } from '@adr-tool/kernel'
import { isMap, isSeq, parseDocument, type Node, type YAMLMap } from 'yaml'
import type { Adr } from '../adr/adr'
import { parseAdrTools } from '../foreign/adr-tools'
import { parseMadrList } from '../foreign/madr-list'
import type { DecisionLog } from '../log/load'
import { scalarText } from '../metadata/scalar'
import { viewSource } from '../text/source'
import type { Problem } from './problem'

/** Where a Problem is: the file it is reported on, and the line in it (docs/cli.md). */
export interface ProblemPlace {
  /** Relative to the root of the repository. */
  readonly path: string
  /** From 1. Absent where no line can be pointed at: a missing directory, a file name. */
  readonly line?: number
}

/**
 * Where `problem`, reported on `log` — or on the repository as a whole, without one — is.
 * Reads the file it is about; a file that cannot be read any more has no line.
 */
export function locateProblem(
  fs: FileSystem,
  problem: Problem,
  log?: DecisionLog
): Promise<ProblemPlace> {
  return problemLocator(fs)(problem, log)
}

/**
 * `locateProblem` for many Problems at once: each file is read and taken apart once, however
 * many Problems are reported on it. For one check of a repository — what it read is kept.
 */
export function problemLocator(
  fs: FileSystem
): (problem: Problem, log?: DecisionLog) => Promise<ProblemPlace> {
  const files = new Map<string, Promise<FileLines | undefined>>()
  return async (problem, log) => {
    if (problem.kind === 'invalid-configuration' || problem.kind === 'missing-log-directory') {
      return { path: problem.path }
    }
    const id = 'adr' in problem ? problem.adr : problem.adrs[0]!
    const adr = log?.adrs.find((one) => one.id === id)
    const path = adr?.path ?? joinPath(log?.path ?? '', `${id}.md`)
    // Two ADRs share a number by their file names; no line of either says it.
    if (problem.kind === 'duplicate-number') return { path }
    if (!files.has(path)) {
      files.set(
        path,
        fs.readText(path).then((text) => (text === undefined ? undefined : fileLines(text, adr)))
      )
    }
    const file = await files.get(path)!
    return file === undefined ? { path } : { path, line: file.lineOf(problem) }
  }
}

interface FileLines {
  lineOf(problem: Problem): number
}

/**
 * The lines of one file that Problems can be about. With a frontmatter, they are its keys and
 * items, and the text below it is never searched: a word in the text says nothing. Without
 * one — a file of a foreign format — they are the lines where that format writes its Status
 * and its links to other ADRs.
 */
function fileLines(text: string, adr: Adr | undefined): FileLines {
  const view = viewSource(text)
  const starts = [0]
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  const lineAt = (offset: number): number => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (starts[middle]! <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }

  const lineText = (line: number): string =>
    text.slice(starts[line - 1], starts[line] ?? text.length)

  // An unterminated frontmatter is about its opening line.
  if (view.unterminatedFrontmatter) return { lineOf: () => 1 }

  const front = view.frontmatter
  const doc = front && parseDocument(text.slice(front.start, front.end))
  const map = doc && isMap(doc.contents) ? doc.contents : undefined
  const at = (node: Node | undefined): number | undefined =>
    front && node?.range ? lineAt(front.start + node.range[0]) : undefined
  const key = (name: string): number | undefined => at(pairOf(map, name)?.key as Node)
  const item = (name: string, value: string): number | undefined => {
    const node = pairOf(map, name)?.value
    if (isSeq(node)) return at(node.items.find((one) => scalarText(one) === value) as Node)
    return scalarText(node) === value ? at(node as Node) : undefined
  }

  // Where the Status is written, and the links of a foreign format with it: the `status` key,
  // the `* Status:` item of the list under the title (MADR 2), or the Status section (adr-tools).
  /** The lines of a section that are not blank, from the line after its heading. */
  const sectionLines = (section: { start: number; end: number }): number[] => {
    const lines: number[] = []
    const last = lineAt(Math.max(section.end - 1, 0))
    for (let line = lineAt(section.start) + 1; line <= last; line++) {
      if (lineText(line).trim() !== '') lines.push(line)
    }
    return lines
  }
  const { status, statusLines } = ((): { status?: number; statusLines: number[] } => {
    const own = key('status')
    if (own !== undefined) return { status: own, statusLines: [own] }
    if (adr?.foreign !== 'adr-tools') {
      // MADR 2 and log4brains: the Status item, and the links of the Links section.
      const listed = parseMadrList(view)
      if (listed) {
        const at = listed.status && lineAt(listed.status.line.start)
        const links = listed.links ? sectionLines(listed.links.section) : []
        return { status: at, statusLines: at === undefined ? links : [at, ...links] }
      }
    }
    if (front) return { statusLines: [] }
    const section = parseAdrTools(view)?.section
    const lines = section ? sectionLines(section) : []
    return { status: lines[0], statusLines: lines }
  })()
  /** In a foreign format: the line of the Status that links to `id`, or the Status itself. */
  const link = (id: string): number | undefined =>
    adr?.foreign === undefined && front
      ? undefined
      : (statusLines.find((line) => lineText(line).includes(id)) ?? status)

  return {
    lineOf(problem) {
      switch (problem.kind) {
        case 'invalid-frontmatter': {
          const error = doc?.errors[0]
          return front ? lineAt(front.start + (error?.pos[0] ?? 0)) : 1
        }
        case 'invalid-metadata':
          return key(problem.key) ?? (problem.key === 'status' ? status : undefined) ?? 1
        case 'status-not-lowercase':
        case 'not-marked-superseded':
        case 'superseded-without-successor':
          return status ?? 1
        case 'unknown-target':
        case 'other-repository':
          return item(problem.key, problem.target) ?? key(problem.key) ?? link(problem.target) ?? 1
        case 'self-reference':
          return item(problem.key, problem.adr) ?? key(problem.key) ?? link(problem.adr) ?? 1
        case 'unknown-component':
          return item('affects', problem.component) ?? key('affects') ?? 1
        case 'missing-back-reference':
          // Missing altogether: there is no line it could be on.
          return key(problem.key) ?? 1
        case 'unfounded-back-reference':
          return item(problem.key, problem.source) ?? key(problem.key) ?? link(problem.source) ?? 1
        case 'supersedes-cycle': {
          const others = problem.adrs.slice(1)
          return (
            others.map((other) => item('supersedes', other)).find(Boolean) ??
            key('supersedes') ??
            others.map((other) => link(other)).find(Boolean) ??
            1
          )
        }
        default:
          return 1
      }
    }
  }
}

function pairOf(
  map: YAMLMap | undefined,
  name: string
): { key: unknown; value: unknown } | undefined {
  return map?.items.find((pair) => scalarText(pair.key) === name)
}
