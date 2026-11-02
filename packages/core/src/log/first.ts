import type { FileSystem } from '@adr-tool/kernel'
import { describeProblem } from '../problems/wording'
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
): Promise<{ readonly log: DecisionLog } | { readonly reason: string }> {
  const discovery = await discoverLogs(fs)
  const problem = discovery.problems[0]
  if (problem)
    return { reason: `${describeProblem(problem).replace(/\.?$/, '.')} Repair it first.` }
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
