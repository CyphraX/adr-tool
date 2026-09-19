/** The types of a Relation between two ADRs. The set is fixed; see Relation in CONTEXT.md. */
export const RELATION_TYPES = ['supersedes', 'amends', 'depends-on', 'relates-to'] as const

export type RelationType = (typeof RELATION_TYPES)[number]

export function isRelationType(value: unknown): value is RelationType {
  return typeof value === 'string' && (RELATION_TYPES as readonly string[]).includes(value)
}

/**
 * The Relation types that are mirrored onto the target ADR as a Back-reference,
 * each with the Metadata key its Back-reference is written under.
 */
export const BACK_REFERENCE_KEYS = {
  supersedes: 'superseded-by',
  amends: 'amended-by'
} as const satisfies Partial<Record<RelationType, string>>
