import { BACK_REFERENCE_KEYS, METADATA_KEYS, RELATION_TYPES, type Repair } from '@adr-tool/core'
import type { StructureProblem } from '@adr-tool/structure/model'
import type {
  CreateRequest,
  DrawnDiagram,
  MetadataEditRequest,
  MigrationRequest,
  RenameRequest,
  RepairRequest
} from '../shared/ipc'

/**
 * What the renderer sends is untrusted until it has been looked at: the renderer shows ADRs
 * from foreign repositories. A request that is not exactly what the contract says is dropped.
 */
export function metadataEditRequest(request: unknown): MetadataEditRequest | undefined {
  const given = record(request)
  const relations = record(given['relations'])
  const valid =
    ['repositoryId', 'logPath', 'adrId'].every((field) => typeof given[field] === 'string') &&
    isStrings(given['decisionMakers']) &&
    isStrings(given['tags']) &&
    RELATION_TYPES.every((type) => isStrings(relations[type])) &&
    isStrings(given['affects'])
  if (!valid) return undefined
  // Only what is named here goes on: whatever else the request carries is left behind.
  return {
    repositoryId: given['repositoryId'],
    logPath: given['logPath'],
    adrId: given['adrId'],
    decisionMakers: given['decisionMakers'],
    tags: given['tags'],
    relations: Object.fromEntries(RELATION_TYPES.map((type) => [type, relations[type]])),
    affects: given['affects']
  } as MetadataEditRequest
}

/**
 * A new ADR: which log, its title and Template, and the ADR it supersedes or amends, if any.
 * Whether the Template exists and the target can be superseded is `core`'s question.
 */
export function createRequest(request: unknown): CreateRequest | undefined {
  const { repositoryId, logPath, title, template, relation } = record(request)
  if (typeof repositoryId !== 'string' || typeof title !== 'string') return undefined
  if (typeof template !== 'string') return undefined
  if (logPath !== undefined && typeof logPath !== 'string') return undefined
  const asked = { repositoryId, logPath, title, template }
  if (relation === undefined) return asked
  const { type, target } = record(relation)
  const valid = (type === 'supersedes' || type === 'amends') && typeof target === 'string'
  return valid ? { ...asked, relation: { type, target } } : undefined
}

/** Which Component, and its new segment. Whether either is valid is `structure`'s question. */
export function renameRequest(
  repositoryId: unknown,
  component: unknown,
  segment: unknown
): RenameRequest | undefined {
  if (typeof repositoryId !== 'string' || typeof component !== 'string') return undefined
  return typeof segment === 'string' ? { repositoryId, component, segment } : undefined
}

/** A repair is rebuilt field by field. Whether the log has a Problem it repairs is `core`'s question. */
export function repairRequest(request: unknown): RepairRequest | undefined {
  const given = record(request)
  const repair = repairOf(record(given['repair']))
  if (
    typeof given['repositoryId'] !== 'string' ||
    typeof given['logPath'] !== 'string' ||
    !repair
  ) {
    return undefined
  }
  return { repositoryId: given['repositoryId'], logPath: given['logPath'], repair }
}

/** Which ADR, or none for the whole Decision Log. Whether there is anything to migrate is `core`'s question. */
export function migrationRequest(request: unknown): MigrationRequest | undefined {
  const { repositoryId, logPath, adrId } = record(request)
  if (typeof repositoryId !== 'string' || typeof logPath !== 'string') return undefined
  if (adrId !== undefined && typeof adrId !== 'string') return undefined
  return { repositoryId, logPath, ...(adrId !== undefined && { adrId }) }
}

/**
 * A Problem of the declaration to repair, rebuilt field by field. Only a pattern that matches
 * nothing has a Repair; whether the declaration still has it is `structure`'s question.
 */
export function structureRepairRequest(problem: unknown): StructureProblem | undefined {
  const { kind, component, key, pattern } = record(problem)
  if (kind !== 'dead-pattern' || typeof component !== 'string' || typeof pattern !== 'string') {
    return undefined
  }
  return key === 'paths' || key === 'tests' ? { kind, component, key, pattern } : undefined
}

/** A drawing larger than this is no drawing of a block of an ADR. */
const DIAGRAM_LIMIT = 4 * 1024 * 1024
/** More drawings than this are no export of Decision Logs. */
const DIAGRAMS_AT_MOST = 2000
/**
 * What a sanitized drawing never holds (docs/adr/0016-…): a script, an element of HTML, a handler
 * of an event, a `javascript:` address. Sanitized in the window already; looked at again here,
 * before anything of it is written to disk.
 */
const NEVER_IN_A_DRAWING =
  /<\s*(?:script|foreignObject|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:/i

/**
 * The Mermaid blocks the window drew for an export, by their source. A drawing that is not an
 * SVG and nothing else is left out: its block stays a code block.
 */
export function diagramsRequest(diagrams: unknown): Map<string, string> {
  const drawn = new Map<string, string>()
  if (!Array.isArray(diagrams)) return drawn
  for (const given of diagrams.slice(0, DIAGRAMS_AT_MOST)) {
    const { source, svg } = record(given) as Partial<Record<keyof DrawnDiagram, unknown>>
    if (typeof source !== 'string' || typeof svg !== 'string') continue
    const text = svg.trim()
    const whole = text.startsWith('<svg') && text.endsWith('</svg>')
    if (!whole || text.length > DIAGRAM_LIMIT || NEVER_IN_A_DRAWING.test(text)) continue
    drawn.set(source, text)
  }
  return drawn
}

function repairOf(given: Record<string, unknown>): Repair | undefined {
  const { kind, adr, key, item, status } = given
  if (typeof adr !== 'string') return undefined
  const isKey = (keys: readonly string[]): boolean => typeof key === 'string' && keys.includes(key)
  switch (kind) {
    case 'lowercase-status':
    case 'renumber':
      return { kind, adr }
    case 'remove-item':
      if (!isKey(METADATA_KEYS) || typeof item !== 'string') return undefined
      return { kind, adr, key, item } as Repair
    case 'add-back-reference':
      if (!isKey(Object.values(BACK_REFERENCE_KEYS)) || typeof item !== 'string') return undefined
      return { kind, adr, key, item } as Repair
    case 'set-status':
      return status === 'superseded' || status === 'accepted' ? { kind, adr, status } : undefined
    default:
      return undefined
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function isStrings(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
