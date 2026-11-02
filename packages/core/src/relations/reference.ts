import { normalizePath } from '@adr-tool/kernel'

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

/** The name a repository gives itself (docs/file-format.md, section 6). */
export const REPOSITORY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** An ADR of another repository, as a Relation names it: `<name>:<log>/<ID>`. */
export interface OutsideReference {
  /** The name of the repository. */
  readonly repository: string
  /** The directory of its Decision Log, `''` for the root. */
  readonly log: string
  readonly id: string
}

/**
 * The ADR of another repository a reference names (docs/file-format.md, section 3), or
 * `undefined` for one of this repository. Only `depends-on` and `relates-to` may name one.
 *
 * Only the form the format defines is one: a name, a colon, the directory of a log as the
 * tool writes it (`.` for the root) and an ID. Anything else with a colon in it — an ID like
 * `0001-use-http:2`, a web address, `payments:0001-x` without its log, a path with `..` —
 * is read as a reference of this repository, which names an ADR or is a Problem.
 */
export function outsideReference(reference: string): OutsideReference | undefined {
  const colon = reference.indexOf(':')
  if (colon <= 0) return undefined
  const repository = reference.slice(0, colon)
  if (!REPOSITORY_NAME.test(repository)) return undefined
  const rest = reference.slice(colon + 1)
  const slash = rest.lastIndexOf('/')
  if (slash === -1) return undefined
  const written = rest.slice(0, slash)
  const id = rest.slice(slash + 1)
  const log = written === '.' ? '' : normalizePath(written)
  if (log === undefined || (written !== '.' && (log === '' || log !== written))) return undefined
  if (id === '' || id.includes(':') || /\.md$/i.test(id)) return undefined
  return { repository, log, id }
}

/** How a repository names the ADR `id` of the log `log` of the repository `repository`. */
export function outsideTo(repository: string, log: string, id: string): string {
  return `${repository}:${qualified(log, id)}`
}
