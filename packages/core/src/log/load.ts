import { readAdr, type Adr, type GuestAdr } from '../adr/adr'
import { joinPath, type FileSystem } from '@adr-tool/kernel'
import { checkConsistency, checkTraces } from '../problems/check'
import type { Problem } from '../problems/problem'
import { relationsOf, type Relation } from '../relations/graph'
import { discoverLogs, type Discovery, type LogLocation } from './discover'
import { detectNamingScheme, numberOf, parseAdrFileName, type NamingScheme } from './naming'

/** A Decision Log as read from its directory. */
export interface DecisionLog {
  /** The directory, relative to the repository root. */
  readonly path: string
  readonly naming: NamingScheme
  /** Sorted by ID. */
  readonly adrs: readonly Adr[]
  readonly relations: readonly Relation[]
  readonly problems: readonly Problem[]
  /**
   * The ADRs of the repository's other Decision Logs, without their bodies: what a Relation
   * across logs names (`docs/adr/0002-old`), and what the picker offers.
   */
  readonly guests: readonly GuestAdr[]
}

export interface Repository {
  /** Which step found the Decision Logs. `none`: nothing found, the app has to ask. */
  readonly discoveredBy: Discovery['by']
  readonly logs: readonly DecisionLog[]
  /** Problems of the repository as a whole: configuration that cannot be used, a missing directory. */
  readonly problems: readonly Problem[]
}

/**
 * What the reader is told beyond the files of the Decision Logs. `core` does not know
 * Structure: whoever opens the repository says which Components it declares.
 */
export interface OpenOptions {
  /**
   * The IDs of the Components the repository declares, which the Traces in `affects` are
   * checked against. Left out, they are not checked: there is no declaration that can be read.
   */
  readonly components?: readonly string[]
}

/** Read every Decision Log of the repository behind `fs`. Reads only; never writes. */
export async function openRepository(
  fs: FileSystem,
  options: OpenOptions = {}
): Promise<Repository> {
  const discovery = await discoverLogs(fs)
  const problems = [...discovery.problems]
  const read: ReadLog[] = []
  for (const location of discovery.locations) {
    const log = await readLog(fs, location)
    if (log) read.push(log)
    else problems.push({ kind: 'missing-log-directory', path: location.path })
  }
  // Relations cross logs: each log is checked with the ADRs of all the others as its guests.
  const guests = read.map((log) => log.adrs.map((adr) => guestOf(log.path, adr)))
  const logs = read.map((log, position) =>
    checkLog(
      log,
      guests.flatMap((ones, other) => (other === position ? [] : ones)),
      options
    )
  )
  return { discoveredBy: discovery.by, logs, problems }
}

/** Read one Decision Log on its own, or `undefined` when its directory does not exist. */
export async function loadDecisionLog(
  fs: FileSystem,
  location: LogLocation,
  options: OpenOptions = {}
): Promise<DecisionLog | undefined> {
  const log = await readLog(fs, location)
  return log && checkLog(log, [], options)
}

/** A Decision Log as its files say it, before it is checked. */
interface ReadLog {
  readonly path: string
  readonly naming: NamingScheme
  readonly adrs: readonly Adr[]
  readonly problems: readonly Problem[]
}

function guestOf(log: string, adr: Adr): GuestAdr {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { body, ...rest } = adr
  return { ...rest, reference: `${log}/${adr.id}`, log }
}

function checkLog(log: ReadLog, guests: readonly GuestAdr[], options: OpenOptions): DecisionLog {
  const context = { path: log.path, guests }
  const graph = relationsOf(log.adrs, context)
  const problems = [
    ...log.problems,
    ...graph.problems,
    ...checkConsistency(log.adrs, graph.relations, log.naming, context)
  ]
  if (options.components) problems.push(...checkTraces(log.adrs, options.components))
  return {
    path: log.path,
    naming: log.naming,
    adrs: log.adrs,
    relations: graph.relations,
    problems,
    guests
  }
}

async function readLog(fs: FileSystem, location: LogLocation): Promise<ReadLog | undefined> {
  const entries = await fs.list(location.path)
  if (!entries) return undefined

  // Only files directly in the directory whose name follows a naming scheme are ADRs.
  // Directory listings come in no particular order; sorting keeps every result stable.
  const names = entries
    .filter((entry) => entry.kind === 'file')
    .flatMap((entry) => parseAdrFileName(entry.name) ?? [])
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const naming = location.naming ?? detectNamingScheme(names)

  // "ADR-0005" in a file of MADR 4 names the one ADR with that number, if there is exactly one.
  const numbered = new Map<number, string[]>()
  for (const name of names) {
    const number = numberOf(name, naming)
    if (number !== undefined) numbered.set(number, [...(numbered.get(number) ?? []), name.id])
  }
  const byNumber = (number: number): string | undefined => {
    const named = numbered.get(number) ?? []
    return named.length === 1 ? named[0] : undefined
  }

  const read: Adr[] = []
  const successors = new Map<string, string>()
  const problems: Problem[] = []
  const texts = await Promise.all(
    names.map((name) => fs.readText(joinPath(location.path, `${name.id}.md`)))
  )
  names.forEach((name, position) => {
    const text = texts[position]
    if (text === undefined) return // deleted between listing and reading
    const one = readAdr(name, joinPath(location.path, `${name.id}.md`), text, naming, byNumber)
    read.push(one.adr)
    if (one.successor !== undefined) successors.set(one.adr.id, one.successor)
    problems.push(...one.problems)
  })

  return {
    path: location.path,
    naming,
    adrs: withImpliedSupersessions(read, successors),
    problems
  }
}

/**
 * MADR records a supersession on the superseded ADR only. The Relation is what counts here,
 * so the successor a file of MADR names is read as superseding it (docs/file-format.md,
 * section 8) — next to its Metadata, which stays what its own file says.
 */
function withImpliedSupersessions(
  adrs: readonly Adr[],
  successors: ReadonlyMap<string, string>
): Adr[] {
  const implied = new Map<string, string[]>()
  for (const [superseded, successor] of successors) {
    if (successor !== superseded)
      implied.set(successor, [...(implied.get(successor) ?? []), superseded])
  }
  return adrs.map((adr) => {
    const written = adr.metadata.relations.supersedes
    const read = (implied.get(adr.id) ?? []).filter((id) => !written.includes(id))
    return read.length > 0 ? { ...adr, impliedSupersedes: read } : adr
  })
}
