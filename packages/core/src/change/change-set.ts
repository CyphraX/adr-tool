import type { WritableFileSystem } from '../fs/port'

/** One file of a change set: its text when the change was planned, and its text afterwards. */
export interface FileChange {
  /** Relative to the repository root. */
  readonly path: string
  readonly before: string
  readonly after: string
}

/**
 * Everything one operation wants to write, across all the files it affects. An operation
 * never writes itself: it returns a change set, which can be shown as a diff, applied as
 * a whole, or dropped. `after` is always `before` with splice edits applied (ADR-0002).
 */
export interface ChangeSet {
  readonly files: readonly FileChange[]
}

/** What planning an operation yields: a change set, or the reason why it cannot be done. */
export type Plan =
  | { readonly ok: true; readonly changeSet: ChangeSet }
  | { readonly ok: false; readonly reason: string }

export type Applied =
  | { readonly applied: true }
  /** These files are no longer what the change set was planned against. Nothing was written. */
  | { readonly applied: false; readonly conflicts: readonly string[] }

/**
 * Write a change set. Every file is compared with what the change set was planned against
 * first; if git, an editor or an agent changed one in the meantime, nothing is written.
 */
export async function applyChangeSet(
  fs: WritableFileSystem,
  changeSet: ChangeSet
): Promise<Applied> {
  const current = await Promise.all(changeSet.files.map((file) => fs.readText(file.path)))
  const conflicts = changeSet.files
    .filter((file, position) => current[position] !== file.before)
    .map((file) => file.path)
  if (conflicts.length > 0) return { applied: false, conflicts }

  for (const file of changeSet.files) await fs.writeText(file.path, file.after)
  return { applied: true }
}
