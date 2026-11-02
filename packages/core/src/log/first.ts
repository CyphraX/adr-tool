import type { FileSystem } from '@adr-tool/kernel'
import { englishOf, type CoreSaid } from '../sentences'
import { DEFAULT_LOG_PATHS, discoverLogs } from './discover'
import type { DecisionLog } from './load'

/**
 * Where the first ADR of a repository without a Decision Log goes (docs/file-format.md,
 * section 6): the directory its configuration — `.adr/config.yml` or `.adr-dir` — names and
 * that does not exist yet, or else `docs/adr`. With configuration that cannot be used, nowhere:
 * the reason says what to repair, since an ADR created elsewhere would not be found once it is.
 */
export async function firstLog(
  fs: FileSystem
): Promise<{ readonly log: DecisionLog } | { readonly reason: string; readonly said: CoreSaid }> {
  const discovery = await discoverLogs(fs)
  // Configuration that cannot be used is the one Problem discovery reports.
  const problem = discovery.problems.find((one) => one.kind === 'invalid-configuration')
  if (problem) {
    const said: CoreSaid = {
      code: 'configuration-first',
      values: {
        path: problem.path,
        detail: problem.said ?? problem.detail
      }
    }
    return { reason: englishOf(said), said }
  }
  const location = discovery.locations[0]
  return {
    log: {
      path: location?.path ?? DEFAULT_LOG_PATHS[0]!,
      naming: location?.naming ?? 'sequential',
      adrs: [],
      relations: [],
      guests: [],
      problems: []
    }
  }
}
