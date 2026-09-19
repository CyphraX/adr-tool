import { readAdr, type Adr } from '../adr/adr'
import { joinPath, type FileSystem } from '../fs/port'
import { checkConsistency } from '../problems/check'
import type { Problem } from '../problems/problem'
import { relationsOf, type Relation } from '../relations/graph'
import { discoverLogs, type Discovery, type LogLocation } from './discover'
import { detectNamingScheme, parseAdrFileName, type NamingScheme } from './naming'

/** A Decision Log as read from its directory. */
export interface DecisionLog {
  /** The directory, relative to the repository root. */
  readonly path: string
  readonly naming: NamingScheme
  /** Sorted by ID. */
  readonly adrs: readonly Adr[]
  readonly relations: readonly Relation[]
  readonly problems: readonly Problem[]
}

export interface Repository {
  /** Which step found the Decision Logs. `none`: nothing found, the app has to ask. */
  readonly discoveredBy: Discovery['by']
  readonly logs: readonly DecisionLog[]
  /** Problems of the repository as a whole: configuration that cannot be used, a missing directory. */
  readonly problems: readonly Problem[]
}

/** Read every Decision Log of the repository behind `fs`. Reads only; never writes. */
export async function openRepository(fs: FileSystem): Promise<Repository> {
  const discovery = await discoverLogs(fs)
  const problems = [...discovery.problems]
  const logs: DecisionLog[] = []
  for (const location of discovery.locations) {
    const log = await loadDecisionLog(fs, location)
    if (log) logs.push(log)
    else problems.push({ kind: 'missing-log-directory', path: location.path })
  }
  return { discoveredBy: discovery.by, logs, problems }
}

/** Read one Decision Log, or `undefined` when its directory does not exist. */
export async function loadDecisionLog(
  fs: FileSystem,
  location: LogLocation
): Promise<DecisionLog | undefined> {
  const entries = await fs.list(location.path)
  if (!entries) return undefined

  // Only files directly in the directory whose name follows a naming scheme are ADRs.
  // Directory listings come in no particular order; sorting keeps every result stable.
  const names = entries
    .filter((entry) => entry.kind === 'file')
    .flatMap((entry) => parseAdrFileName(entry.name) ?? [])
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const naming = location.naming ?? detectNamingScheme(names)

  const adrs: Adr[] = []
  const problems: Problem[] = []
  const texts = await Promise.all(
    names.map((name) => fs.readText(joinPath(location.path, `${name.id}.md`)))
  )
  names.forEach((name, position) => {
    const text = texts[position]
    if (text === undefined) return // deleted between listing and reading
    const read = readAdr(name, joinPath(location.path, `${name.id}.md`), text, naming)
    adrs.push(read.adr)
    problems.push(...read.problems)
  })

  const graph = relationsOf(adrs)
  problems.push(...graph.problems, ...checkConsistency(adrs, graph.relations, naming))
  return { path: location.path, naming, adrs, relations: graph.relations, problems }
}
