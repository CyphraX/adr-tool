import { joinPath, type FileSystem } from '@adr-tool/kernel'
import { isMap, isSeq, parseDocument, type Node, type YAMLMap } from 'yaml'
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
export async function locateProblem(
  fs: FileSystem,
  problem: Problem,
  log?: DecisionLog
): Promise<ProblemPlace> {
  if (problem.kind === 'invalid-configuration' || problem.kind === 'missing-log-directory') {
    return { path: problem.path }
  }
  const id = 'adr' in problem ? problem.adr : problem.adrs[0]!
  const path = log?.adrs.find((adr) => adr.id === id)?.path ?? joinPath(log?.path ?? '', `${id}.md`)
  // Two ADRs share a number by their file names; no line of either says it.
  if (problem.kind === 'duplicate-number') return { path }
  const text = await fs.readText(path)
  return text === undefined ? { path } : { path, line: lineOf(problem, text) }
}

/** The line of `text` that `problem` is about. */
function lineOf(problem: Problem, text: string): number {
  const view = viewSource(text)
  const lineAt = (offset: number): number => text.slice(0, offset).split('\n').length
  if (view.unterminatedFrontmatter || !view.frontmatter) {
    // A file of a foreign format keeps its Metadata in its text: what the Problem names is
    // looked for there.
    return view.unterminatedFrontmatter ? 1 : (lineInText(problem, text) ?? 1)
  }

  const start = view.frontmatter.start
  const doc = parseDocument(text.slice(start, view.frontmatter.end))
  if (problem.kind === 'invalid-frontmatter') {
    const error = doc.errors[0]
    return lineAt(start + (error?.pos[0] ?? 0))
  }
  const map = isMap(doc.contents) ? doc.contents : undefined
  const at = (node: Node | undefined): number | undefined =>
    node?.range ? lineAt(start + node.range[0]) : undefined
  const key = (name: string): number | undefined => at(pairOf(map, name)?.key as Node)
  const item = (name: string, value: string): number | undefined => {
    const node = pairOf(map, name)?.value
    if (isSeq(node)) return at(node.items.find((one) => scalarText(one) === value) as Node)
    return scalarText(node) === value ? at(node as Node) : undefined
  }

  switch (problem.kind) {
    case 'invalid-metadata':
      return key(problem.key) ?? 1
    case 'status-not-lowercase':
    case 'not-marked-superseded':
    case 'superseded-without-successor':
      return key('status') ?? lineInText(problem, text) ?? 1
    case 'unknown-target':
      return item(problem.key, problem.target) ?? key(problem.key) ?? textLine(text, problem.target)
    case 'self-reference':
      return item(problem.key, problem.adr) ?? key(problem.key) ?? 1
    case 'unknown-component':
      return item('affects', problem.component) ?? key('affects') ?? 1
    case 'missing-back-reference':
      return key(problem.key) ?? 1
    case 'unfounded-back-reference':
      return item(problem.key, problem.source) ?? key(problem.key) ?? 1
    case 'supersedes-cycle': {
      const others = problem.adrs.slice(1)
      return (
        others.map((other) => item('supersedes', other)).find((line) => line !== undefined) ??
        key('supersedes') ??
        lineInText(problem, text) ??
        1
      )
    }
    default:
      return 1
  }
}

function pairOf(
  map: YAMLMap | undefined,
  name: string
): { key: unknown; value: unknown } | undefined {
  return map?.items.find((pair) => scalarText(pair.key) === name)
}

/** In a file without frontmatter: the line that names what the Problem is about. */
function lineInText(problem: Problem, text: string): number | undefined {
  switch (problem.kind) {
    case 'unknown-target':
      return textLine(text, problem.target)
    case 'self-reference':
      return textLine(text, problem.adr)
    case 'unfounded-back-reference':
    case 'missing-back-reference':
      return 'source' in problem ? textLine(text, problem.source) : undefined
    case 'supersedes-cycle':
      return problem.adrs
        .slice(1)
        .map((other) => textLine(text, other))
        .find((line) => line > 1)
    case 'invalid-metadata':
    case 'status-not-lowercase':
    case 'not-marked-superseded':
    case 'superseded-without-successor':
      return textLine(text, /status/i)
    default:
      return undefined
  }
}

/** The first line that holds `what`, or 1. */
function textLine(text: string, what: string | RegExp): number {
  const lines = text.split('\n')
  const found = lines.findIndex((line) =>
    typeof what === 'string' ? line.includes(what) : what.test(line)
  )
  return found === -1 ? 1 : found + 1
}
