import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
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
    const parsed = parse(args)
    if (parsed === 'help') {
      console.out(USAGE)
      return 0
    }
    const { command, path, format } = parsed
    if (command === undefined) throw new Usage('A command is missing.')
    if (command !== 'lint') throw new Usage(`Unknown command "${command}".`)
    const root = resolve(console.cwd, path ?? '.')
    const info = await stat(root).catch(() => undefined)
    if (!info?.isDirectory()) {
      console.err(`adr lint: ${root} is not a directory.\n`)
      return 2
    }
    const warn = (text: string): void => console.err(`adr lint: ${text}\n`)
    const report = await lint(repositoryFiles(root, warn))
    if (!report) {
      console.err(
        `adr lint: No Decision Log found in ${root}: none is configured in .adr/config.yml or .adr-dir, and none of docs/adr, doc/adr, docs/decisions exists.\n`
      )
      return 2
    }
    report.notes.forEach(warn)
    // GitHub names files from the directory the command runs in, the checkout.
    const checkout = relative(console.cwd, root).split(sep).join('/')
    const inside = checkout !== '' && !checkout.startsWith('..') && !isAbsolute(checkout)
    console.out(render(report, format, inside ? checkout : ''))
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

/**
 * The command line: the command, then its path, options anywhere. `--` ends the options, so
 * that a path may begin with `-`; `--help` anywhere but as the value of an option asks for help.
 */
function parse(
  args: readonly string[]
): 'help' | { command?: string; path?: string; format: Format } {
  const words: string[] = []
  let format: Format = 'text'
  let options = true
  let help = false
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]!
    if (!options || !arg.startsWith('-') || arg === '-') {
      words.push(arg)
    } else if (arg === '--') {
      options = false
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--format' || arg.startsWith('--format=')) {
      const value = arg === '--format' ? args[++at] : arg.slice('--format='.length)
      if (!FORMATS.includes(value as Format)) {
        throw new Usage(`--format takes ${FORMATS.join(', ')}, not "${value ?? ''}".`)
      }
      format = value as Format
    } else {
      throw new Usage(`Unknown option "${arg}".`)
    }
  }
  if (help) return 'help'
  const [command, path, ...more] = words
  if (more.length > 0) throw new Usage('adr lint takes one path, the root of the repository.')
  return {
    ...(command !== undefined && { command }),
    ...(path !== undefined && { path }),
    format
  }
}
