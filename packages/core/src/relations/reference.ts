/**
 * A reference to an ADR, as a Relation or a Back-reference writes it (docs/file-format.md,
 * section 3): a bare ID names an ADR of the same Decision Log, `<log>/<ID>` one of another
 * log of the repository — `./<ID>` one of a log at the root of the repository. IDs are file
 * names and never hold a `/`, so the last one splits.
 */
export interface Reference {
  /** The directory of the other Decision Log, `''` for the root; absent for the same log. */
  readonly log?: string
  readonly id: string
}

export function parseReference(reference: string): Reference {
  const slash = reference.lastIndexOf('/')
  if (slash === -1) return { id: reference }
  const log = reference.slice(0, slash)
  return { log: log === '.' ? '' : log, id: reference.slice(slash + 1) }
}

/** How any other log names the ADR `id` of the log `log`. */
export function qualified(log: string, id: string): string {
  return `${log === '' ? '.' : log}/${id}`
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
  return from === to ? id : qualified(to, id)
}

/**
 * Where a reference written in the log `from` leads: the log and the ID, wherever it is read.
 */
export function absoluteReference(from: string, reference: string): { log: string; id: string } {
  const { log, id } = parseReference(reference)
  return { log: log ?? from, id }
}

/** Whether a reference names an ADR of another log than the one it is written in. */
export function isQualified(reference: string): boolean {
  return reference.includes('/')
}
