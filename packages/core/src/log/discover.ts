import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import { normalizePath, type FileSystem } from '@adr-tool/kernel'
import { scalarText } from '../metadata/scalar'
import type { Problem } from '../problems/problem'
import { REPOSITORY_NAME } from '../relations/reference'
import { detailed, type CoreSaid } from '../sentences'
import type { NamingScheme } from './naming'

export const CONFIG_PATH = '.adr/config.yml'
export const ADR_DIR_PATH = '.adr-dir'
export const DEFAULT_LOG_PATHS = ['docs/adr', 'doc/adr', 'docs/decisions']

export interface LogLocation {
  /** The directory of the Decision Log, relative to the repository root. */
  readonly path: string
  /** The naming scheme from the configuration. Detected from the files when absent. */
  readonly naming?: NamingScheme
}

export interface Discovery {
  /** Which step found the Decision Logs. `none`: nothing found, the app has to ask. */
  readonly by: 'config' | 'adr-dir' | 'default' | 'none'
  readonly locations: readonly LogLocation[]
  readonly problems: readonly Problem[]
  /** The name the repository gives itself in `.adr/config.yml`, which other repositories use. */
  readonly name?: string
}

/**
 * Find the Decision Logs of a repository (docs/file-format.md, section 6): the tool's own
 * configuration, then adr-tools' `.adr-dir`, then the well-known directories. The first
 * step that yields something wins. Configuration that exists but cannot be used is a
 * Problem and ends the search — falling through would hide the mistake.
 */
export async function discoverLogs(fs: FileSystem): Promise<Discovery> {
  const config = await fs.readText(CONFIG_PATH)
  const found = config === undefined ? undefined : readConfig(config)
  // A name that cannot be one is a Problem, and ends nothing: it matters to other
  // repositories only, and the Decision Logs are found as if there were none.
  const aside = found?.aside ?? []
  if (found && (found.problems.length > 0 || found.locations.length > 0)) {
    const { locations, problems, name } = found
    return {
      by: 'config',
      locations,
      problems: [...aside, ...problems],
      ...(name !== undefined && { name })
    }
  }
  // A configuration that names the repository and no Decision Log still names it.
  const named = found?.name === undefined ? {} : { name: found.name }
  const elsewhere = await discoverElsewhere(fs)
  return { ...elsewhere, problems: [...aside, ...elsewhere.problems], ...named }
}

/** Steps 2 and 3 of section 6: adr-tools' `.adr-dir`, then the well-known directories. */
async function discoverElsewhere(fs: FileSystem): Promise<Discovery> {
  const adrDir = await fs.readText(ADR_DIR_PATH)
  if (adrDir !== undefined) {
    const path = normalizePath(adrDir.split(/\r?\n/)[0] ?? '')
    if (path === undefined) {
      const problem: Problem = {
        kind: 'invalid-configuration',
        path: ADR_DIR_PATH,
        ...detailed({ code: 'adr-dir-outside', values: {} })
      }
      return { by: 'adr-dir', locations: [], problems: [problem] }
    }
    return { by: 'adr-dir', locations: [{ path }], problems: [] }
  }

  const existing: LogLocation[] = []
  for (const path of DEFAULT_LOG_PATHS) {
    if ((await fs.list(path)) !== undefined) existing.push({ path })
  }
  return { by: existing.length > 0 ? 'default' : 'none', locations: existing, problems: [] }
}

/** What the configuration says, and the Problems that end nothing (`aside`). */
type Configured = Pick<Discovery, 'locations' | 'problems' | 'name'> & {
  readonly aside: readonly Problem[]
}

function readConfig(text: string): Configured {
  const problem = (said: CoreSaid): Problem => ({
    kind: 'invalid-configuration',
    path: CONFIG_PATH,
    ...detailed(said)
  })
  let aside: Problem[] = []
  const invalid = (said: CoreSaid): Configured => ({
    locations: [],
    problems: [problem(said)],
    aside
  })

  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    return invalid({
      code: 'yaml-error',
      values: { message: doc.errors[0]!.message.split('\n')[0]! }
    })
  }
  if (doc.contents === null) return { locations: [], problems: [], aside }
  if (!isMap(doc.contents)) return invalid({ code: 'expected-mapping', values: {} })

  // An empty `name:` is none: the name of the directory counts.
  const named = doc.contents.get('name', true)
  const name = scalarText(named)
  const empty = named === undefined || named === null || (isScalar(named) && named.value === null)
  const fits = name !== undefined && REPOSITORY_NAME.test(name)
  if (!empty && !fits) aside = [problem({ code: 'repository-name', values: {} })]
  const withName = fits ? { name } : {}

  const logs = doc.contents.get('logs', true)
  if (logs === undefined || logs === null) {
    return { locations: [], problems: [], aside, ...withName }
  }
  if (!isSeq(logs)) return invalid({ code: 'logs-not-a-list', values: {} })

  const locations: LogLocation[] = []
  for (const entry of logs.items) {
    const written = isMap(entry) ? scalarText(entry.get('path', true)) : undefined
    const path = written === undefined ? undefined : normalizePath(written)
    if (!isMap(entry) || path === undefined) {
      return invalid({ code: 'log-needs-path', values: {} })
    }
    const naming = scalarText(entry.get('naming', true))
    if (naming !== undefined && naming !== 'sequential' && naming !== 'date') {
      return invalid({ code: 'naming-unknown', values: { naming } })
    }
    // A directory listed twice is one Decision Log; the first entry for it counts.
    if (locations.some((location) => location.path === path)) continue
    locations.push({ path, ...(naming !== undefined && { naming }) })
  }
  return { locations, problems: [], aside, ...withName }
}
