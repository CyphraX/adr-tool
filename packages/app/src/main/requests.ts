import { RELATION_TYPES } from '@adr-tool/core'
import type { MetadataEditRequest } from '../shared/ipc'

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

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function isStrings(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
