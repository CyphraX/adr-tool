/** The lifecycle positions of an ADR. The set is fixed; see Status in CONTEXT.md. */
export const STATUSES = ['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'] as const

export type Status = (typeof STATUSES)[number]

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}
