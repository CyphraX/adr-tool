import { BACK_REFERENCE_KEYS, METADATA_KEYS, RELATION_TYPES, type Repair } from '@adr-tool/core'
import type { MetadataEditRequest, MigrationRequest, RepairRequest } from '../shared/ipc'

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
    RELATION_TYPES.every((type) => isStrings(relations[type]))
  if (!valid) return undefined
  // Only what is named here goes on: whatever else the request carries is left behind.
  return {
    repositoryId: given['repositoryId'],
    logPath: given['logPath'],
    adrId: given['adrId'],
    decisionMakers: given['decisionMakers'],
    tags: given['tags'],
    relations: Object.fromEntries(RELATION_TYPES.map((type) => [type, relations[type]]))
  } as MetadataEditRequest
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
