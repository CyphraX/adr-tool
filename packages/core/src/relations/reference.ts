/**
 * A reference to an ADR, as a Relation or a Back-reference writes it (docs/file-format.md,
 * section 3): a bare ID names an ADR of the same Decision Log, `<log>/<ID>` one of another
 * log of the repository. IDs are file names and never hold a `/`, so the last one splits.
 */
export interface Reference {
  /** The directory of the other Decision Log; absent for the same log. */
  readonly log?: string
  readonly id: string
}

export function parseReference(reference: string): Reference {
  const slash = reference.lastIndexOf('/')
  return slash === -1
    ? { id: reference }
    : { log: reference.slice(0, slash), id: reference.slice(slash + 1) }
}

/**
 * The reference as it reads from the log `from`: a reference that names `from` itself with its
 * directory is the bare ID, which is what the tool writes.
 */
export function normalReference(from: string, reference: string): string {
  const { log, id } = parseReference(reference)
  return log === from ? id : reference
}

/** How an ADR of the log `from` names the ADR `id` of the log `to`. */
export function referenceTo(from: string, to: string, id: string): string {
  return from === to ? id : `${to}/${id}`
}

/** Whether a reference names an ADR of another log than the one it is written in. */
export function isQualified(reference: string): boolean {
  return reference.includes('/')
}
