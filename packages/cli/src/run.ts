import { stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { check } from './check'
import { fails, renderCheck } from './check-report'
import { describeRefusal, exportTo } from './export'
import { repositoryFiles } from './files'
import { lint } from './lint'
import { listRepository } from './listing'
import { FORMATS, render, type Format } from './report'
import { version } from '../package.json'

/** Where the command prints, and where it runs. */
export interface Console {
  readonly out: (text: string) => void
  readonly err: (text: string) => void
  readonly cwd: string
}

const USAGE = `Usage: adr lint [path] [--format text|json|github]
       adr check [path] [--format text|json|github]
       adr export [path] --out <directory> [--log <directory>]...
       adr --version

adr lint checks the Decision Logs of the repository at path (the current directory by
default) and prints every Problem with its file, line and code.
Exit codes: 0 no Problem, 1 Problems found, 2 nothing could be checked.

adr check does what adr lint does, checks .arch/components.yml, and checks the Rules of
.arch/rules.yml against the code: every Violation without an Exception is printed at the
line of the import that causes it.
Exit codes: 0 no Problem and no Violation without an Exception, 1 there is one,
2 nothing could be checked.

adr export writes the Decision Logs of the repository at path, or those named with --log, as
HTML pages that open from disk into the directory --out: an empty one, or one an earlier
export wrote. Nothing of the repository is changed.
Exit codes: 0 exported, 2 nothing could be exported.

adr --version prints the version of the command.

See docs/cli.md.
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
    if (parsed === 'version') {
      console.out(`${version}\n`)
      return 0
    }
    const { command, path } = parsed
    if (command === undefined) throw new Usage('A command is missing.')
    if (command !== 'lint' && command !== 'check' && command !== 'export') {
      throw new Usage(`Unknown command "${command}".`)
    }
    if (command !== 'export' && (parsed.out !== undefined || parsed.logs.length > 0)) {
      throw new Usage('--out and --log are options of adr export.')
    }
    if (command === 'export' && parsed.format !== undefined) {
      throw new Usage('--format is an option of adr lint and adr check.')
    }
    const root = resolve(console.cwd, path ?? '.')
    const info = await stat(root).catch(() => undefined)
    if (!info?.isDirectory()) {
      console.err(`adr ${command}: ${root} is not a directory.\n`)
      return 2
    }
    const warn = (text: string): void => console.err(`adr ${command}: ${text}\n`)
    if (command === 'export') {
      if (parsed.out === undefined)
        throw new Usage('adr export needs --out, the directory to write to.')
      const out = resolve(console.cwd, parsed.out)
      const result = await exportTo({
        root,
        out,
        ...(parsed.logs.length > 0 && { logs: parsed.logs }),
        title: basename(root),
        date: localDate(),
        warn
      })
      if (!result.ok) {
        console.err(`adr export: ${describeRefusal(result.reason)}\n`)
        return 2
      }
      const adrs = `${result.adrs} ${result.adrs === 1 ? 'ADR' : 'ADRs'}`
      const logs = `${result.logs} Decision ${result.logs === 1 ? 'Log' : 'Logs'}`
      console.out(`Exported ${adrs} of ${logs} to ${out}. Open ${join(out, 'index.html')}.\n`)
      return 0
    }
    // GitHub names files from the directory the command runs in, the checkout.
    const checkout = relative(console.cwd, root).split(sep).join('/')
    const inside = checkout !== '' && !checkout.startsWith('..') && !isAbsolute(checkout)
    if (command === 'check') {
      const checked = await check(repositoryFiles(root, warn), await listRepository(root))
      if (!checked) {
        console.err(
          `adr check: Nothing to check in ${root}: no Decision Log is found there, neither .arch/components.yml nor .arch/rules.yml is there, and no Diagram is.\n`
        )
        return 2
      }
      checked.notes.forEach(warn)
      console.out(renderCheck(checked, parsed.format ?? 'text', inside ? checkout : ''))
      return fails(checked) ? 1 : 0
    }
    const report = await lint(repositoryFiles(root, warn))
    if (!report) {
      console.err(
        `adr lint: No Decision Log found in ${root}: none is configured in .adr/config.yml or .adr-dir, and none of docs/adr, doc/adr, docs/decisions exists.\n`
      )
      return 2
    }
    report.notes.forEach(warn)
    console.out(render(report, parsed.format ?? 'text', inside ? checkout : ''))
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

interface Parsed {
  readonly command?: string
  readonly path?: string
  readonly format?: Format
  readonly out?: string
  readonly logs: readonly string[]
}

/**
 * The command line: the command, then its path, options anywhere. `--` ends the options, so
 * that a path may begin with `-`; `--help` anywhere but as the value of an option asks for help,
 * and `--version` for the version, where help is not asked for too.
 */
function parse(args: readonly string[]): 'help' | 'version' | Parsed {
  const words: string[] = []
  let format: Format | undefined
  let out: string | undefined
  const logs: string[] = []
  let options = true
  let help = false
  let versionAsked = false
  /** The value of an option: `--name value` or `--name=value`. */
  const valueOf = (name: string, arg: string, at: number): [string | undefined, number] =>
    arg === name ? [args[at + 1], at + 1] : [arg.slice(name.length + 1), at]
  for (let at = 0; at < args.length; at++) {
    const arg = args[at]!
    if (!options || !arg.startsWith('-') || arg === '-') {
      words.push(arg)
    } else if (arg === '--') {
      options = false
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--version' || arg === '-v') {
      versionAsked = true
    } else if (arg === '--format' || arg.startsWith('--format=')) {
      const [value, next] = valueOf('--format', arg, at)
      at = next
      if (!FORMATS.includes(value as Format)) {
        throw new Usage(`--format takes ${FORMATS.join(', ')}, not "${value ?? ''}".`)
      }
      format = value as Format
    } else if (arg === '--out' || arg.startsWith('--out=')) {
      const [value, next] = valueOf('--out', arg, at)
      at = next
      if (!value) throw new Usage('--out takes a directory.')
      out = value
    } else if (arg === '--log' || arg.startsWith('--log=')) {
      const [value, next] = valueOf('--log', arg, at)
      at = next
      if (value === undefined) throw new Usage('--log takes the directory of a Decision Log.')
      logs.push(value)
    } else {
      throw new Usage(`Unknown option "${arg}".`)
    }
  }
  if (help) return 'help'
  if (versionAsked) return 'version'
  const [command, path, ...more] = words
  if (more.length > 0) throw new Usage(`adr ${command} takes one path, the root of the repository.`)
  return {
    ...(command !== undefined && { command }),
    ...(path !== undefined && { path }),
    ...(format !== undefined && { format }),
    ...(out !== undefined && { out }),
    logs
  }
}

/** Today's date as the person sees it on their calendar, not in UTC. */
function localDate(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
