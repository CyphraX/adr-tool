/**
 * Where the Decision Logs and the Rules meet (ADR-0006): `conformance` does not know Decisions
 * and is told which ADRs there are by whoever checks the Rules. `adr check`, the app and the
 * MCP server check them through this one composition, so that the three say the same of the
 * same files. It reads nothing itself, and loads no parser: the app imports it into its main
 * process (`@adr-tool/cli/conformance`), as it imports the export.
 */
import type { Repository } from '@adr-tool/core'
import {
  checkConformance,
  type ConformanceReport,
  type Decisions,
  type Model,
  type RulesFile
} from '@adr-tool/conformance'
import type { Structure } from '@adr-tool/structure/model'

/** The Decision Logs of a repository and their ADRs, as `conformance` is told about them. */
export function decisionsOf(repository: Pick<Repository, 'logs'>): Decisions {
  return {
    logs: repository.logs.map((log) => log.path),
    adrs: repository.logs.flatMap((log) => log.adrs.map((adr) => ({ log: log.path, id: adr.id })))
  }
}

/**
 * Check the Rules of `.arch/rules.yml` (`readRules`) against Structure's model of the
 * repository and its Decision Logs. `model` is needed where `needsModel` says so.
 */
export function conformanceOf(
  rules: RulesFile,
  structure: Pick<Structure, 'origin' | 'components' | 'sourceFiles'>,
  model: Omit<Model, 'structure'> | undefined,
  repository: Pick<Repository, 'logs'>
): ConformanceReport {
  return checkConformance(rules, structure, model, decisionsOf(repository))
}
