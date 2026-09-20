import { isMap, isSeq, parseDocument } from 'yaml'
import { normalizePath, type FileSystem } from '@adr-tool/kernel'
import { scalarText } from '../metadata/scalar'
import type { Problem } from '../problems/problem'
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
}

/**
 * Find the Decision Logs of a repository (docs/file-format.md, section 6): the tool's own
 * configuration, then adr-tools' `.adr-dir`, then the well-known directories. The first
 * step that yields something wins. Configuration that exists but cannot be used is a
 * Problem and ends the search — falling through would hide the mistake.
 */
export async function discoverLogs(fs: FileSystem): Promise<Discovery> {
  const config = await fs.readText(CONFIG_PATH)
  if (config !== undefined) {
    const found = readConfig(config)
    if (found.problems.length > 0 || found.locations.length > 0) return { by: 'config', ...found }
  }

  const adrDir = await fs.readText(ADR_DIR_PATH)
  if (adrDir !== undefined) {
    const path = normalizePath(adrDir.split(/\r?\n/)[0] ?? '')
    if (path === undefined) {
      const detail = 'The directory must be a relative path inside the repository'
      const problem: Problem = { kind: 'invalid-configuration', path: ADR_DIR_PATH, detail }
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

function readConfig(text: string): Pick<Discovery, 'locations' | 'problems'> {
  const invalid = (detail: string): Pick<Discovery, 'locations' | 'problems'> => ({
    locations: [],
    problems: [{ kind: 'invalid-configuration', path: CONFIG_PATH, detail }]
  })

  const doc = parseDocument(text)
  if (doc.errors.length > 0) return invalid(doc.errors[0]!.message.split('\n')[0]!)
  if (doc.contents === null) return { locations: [], problems: [] }
  if (!isMap(doc.contents)) return invalid('Expected a mapping')

  const logs = doc.contents.get('logs', true)
  if (logs === undefined || logs === null) return { locations: [], problems: [] }
  if (!isSeq(logs)) return invalid('"logs" must be a list')

  const locations: LogLocation[] = []
  for (const entry of logs.items) {
    const written = isMap(entry) ? scalarText(entry.get('path', true)) : undefined
    const path = written === undefined ? undefined : normalizePath(written)
    if (!isMap(entry) || path === undefined) {
      return invalid('Every log needs a "path" that is relative and inside the repository')
    }
    const naming = scalarText(entry.get('naming', true))
    if (naming !== undefined && naming !== 'sequential' && naming !== 'date') {
      return invalid(`"naming" must be sequential or date, not "${naming}"`)
    }
    locations.push({ path, ...(naming !== undefined && { naming }) })
  }
  return { locations, problems: [] }
}
