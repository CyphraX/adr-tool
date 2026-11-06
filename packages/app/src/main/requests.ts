import {
  fingerprintFrom,
  METRICS,
  RULE_KIND_NAMES,
  type ConformanceRepair,
  type ExceptionDraft,
  type RuleDraft
} from '@adr-tool/conformance'
import { BACK_REFERENCE_KEYS, METADATA_KEYS, RELATION_TYPES, type Repair } from '@adr-tool/core'
import type { StructureProblem } from '@adr-tool/structure/model'
import { drawingRefused } from '../shared/drawing'
import type {
  CreateRequest,
  DrawnDiagram,
  MetadataEditRequest,
  MigrationRequest,
  RenameRequest,
  RepairRequest,
  RuleRequest
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
    // Sanitized in the window already; its markup is looked at again here, against what a
    // drawing may hold, before anything of it is written to disk (docs/adr/0016-…).
    if (text.length > DIAGRAM_LIMIT || drawingRefused(text) !== undefined) continue
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

/**
 * A Rule to add, change or remove. Whether its ID, its patterns and its keys make a Rule is
 * `conformance`'s question; here only their types are looked at.
 */
export function ruleRequest(request: unknown): RuleRequest | undefined {
  const { action, id, draft } = record(request)
  if (action === 'remove') return typeof id === 'string' ? { action, id } : undefined
  const rule = ruleDraft(draft)
  if (rule === undefined) return undefined
  if (action === 'add') return { action, draft: rule }
  return action === 'change' && typeof id === 'string' ? { action, id, draft: rule } : undefined
}

function ruleDraft(value: unknown): RuleDraft | undefined {
  const given = record(value)
  const { id, why, kind, tests, ignoreTypeOnly } = given
  if (typeof id !== 'string' || typeof why !== 'string') return undefined
  if (typeof kind !== 'string' || !(RULE_KIND_NAMES as readonly string[]).includes(kind)) {
    return undefined
  }
  if (tests !== undefined && typeof tests !== 'boolean') return undefined
  if (ignoreTypeOnly !== undefined && typeof ignoreTypeOnly !== 'boolean') return undefined
  const common = {
    id,
    why,
    ...(tests === true && { tests }),
    ...(ignoreTypeOnly === true && kind !== 'threshold' && { ignoreTypeOnly })
  }
  const isNumber = (item: unknown): item is number =>
    typeof item === 'number' && Number.isFinite(item)
  switch (kind) {
    case 'must-not-depend':
    case 'may-only-depend':
      return isStrings(given['from']) && isStrings(given['to'])
        ? ({ ...common, kind, from: given['from'], to: given['to'] } as RuleDraft)
        : undefined
    case 'layers': {
      const { layers, mode } = given
      const valid =
        Array.isArray(layers) &&
        layers.every(isStrings) &&
        (mode === 'relaxed' || mode === 'strict')
      return valid ? ({ ...common, kind, layers, mode } as RuleDraft) : undefined
    }
    case 'no-cycles': {
      const { scope, components } = given
      const valid = (scope === 'among' || scope === 'inside') && isStrings(components)
      return valid ? ({ ...common, kind, scope, components } as RuleDraft) : undefined
    }
    case 'threshold': {
      const { metric, max, min, of } = given
      const valid =
        typeof metric === 'string' &&
        (METRICS as readonly string[]).includes(metric) &&
        (max === undefined || isNumber(max)) &&
        (min === undefined || isNumber(min)) &&
        isStrings(of)
      if (!valid) return undefined
      return {
        ...common,
        kind,
        metric,
        ...(max !== undefined && { max }),
        ...(min !== undefined && { min }),
        of
      } as RuleDraft
    }
    default:
      return undefined
  }
}

/** The Violation an Exception is to accept, why, and the ADR that justifies it. */
export function exceptionRequest(request: unknown): ExceptionDraft | undefined {
  const { fingerprint, reason, justifiedBy } = record(request)
  const named = fingerprintFrom(fingerprint)
  if (named === undefined || typeof reason !== 'string') return undefined
  if (justifiedBy !== undefined && typeof justifiedBy !== 'string') return undefined
  return { fingerprint: named, reason, ...(justifiedBy !== undefined && { justifiedBy }) }
}

/** A Repair of the Rules file, as `repairOf` made it. */
export function conformanceRepairRequest(request: unknown): ConformanceRepair | undefined {
  const { kind, line, fingerprint, members } = record(request)
  const named = fingerprintFrom(fingerprint)
  if (named === undefined || typeof line !== 'number' || !Number.isInteger(line)) return undefined
  if (kind === 'remove-exception') return { kind, line, fingerprint: named }
  // Narrowed to a Cycle: two members at least, which `conformance` holds against the Exception.
  if (kind === 'narrow-exception' && isStrings(members) && (members as string[]).length >= 2) {
    return { kind, line, fingerprint: named, members: members as string[] }
  }
  return undefined
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
