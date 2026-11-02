import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { repositoryFiles } from './files'
import { lint } from './lint'
import { FORMATS, render, type Format } from './report'

/** Where the command prints, and where it runs. */
export interface Console {
  readonly out: (text: string) => void
  readonly err: (text: string) => void
  readonly cwd: string
}

const USAGE = `Usage: adr lint [path] [--format text|json|github]

Checks the Decision Logs of the repository at path (the current directory by default) and
prints every Problem with its file, line and code. See docs/cli.md.

Exit codes: 0 no Problem, 1 Problems found, 2 nothing could be checked.
`

/** A command line that is not understood. */
class Usage extends Error {}

/** Runs `adr` with `args`, and answers with its exit code (docs/cli.md, "How it ends"). */
export async function run(args: readonly string[], console: Console): Promise<number> {
  try {
    if (args.includes('--help') || args.includes('-h')) {
      console.out(USAGE)
      return 0
    }
    const [command, ...rest] = args
    if (command === undefined) throw new Usage('A command is missing.')
    if (command !== 'lint') throw new Usage(`Unknown command "${command}".`)
    const { path, format } = options(rest)
    const root = resolve(console.cwd, path ?? '.')
    const info = await stat(root).catch(() => undefined)
    if (!info?.isDirectory()) {
      console.err(`adr lint: ${root} is not a directory.\n`)
      return 2
    }
    const report = await lint(repositoryFiles(root))
    if (!report) {
      console.err(
        `adr lint: No Decision Log found in ${root}: none is configured in .adr/config.yml or .adr-dir, and none of docs/adr, doc/adr, docs/decisions exists.\n`
      )
      return 2
    }
    console.out(render(report, format))
    return report.problems.length > 0 ? 1 : 0
  } catch (error) {
    if (error instanceof Usage) {
      console.err(`adr: ${error.message}\n\n${USAGE}`)
    } else {
      console.err(`adr: ${error instanceof Error ? error.message : String(error)}\n`)
    }
    return 2
  }
}

function options(args: readonly string[]): { path?: string; format: Format } {
  let path: string | undefined
  let format: Format = 'text'
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]!
    if (arg === '--format' || arg.startsWith('--format=')) {
      const value = arg === '--format' ? args[++at] : arg.slice('--format='.length)
      if (!FORMATS.includes(value as Format)) {
        throw new Usage(`--format takes ${FORMATS.join(', ')}, not "${value ?? ''}".`)
      }
      format = value as Format
    } else if (arg.startsWith('-')) {
      throw new Usage(`Unknown option "${arg}".`)
    } else if (path !== undefined) {
      throw new Usage('adr lint takes one path, the root of the repository.')
    } else path = arg
  }
  return { ...(path !== undefined && { path }), format }
}
