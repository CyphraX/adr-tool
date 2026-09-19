import type { WritableFileSystem } from '../fs/port'

/** One file of a change set: its text when the change was planned, and its text afterwards. */
export interface FileChange {
  /** Relative to the repository root. */
  readonly path: string
  /** The text the change was planned against; empty for a file that is being created. */
  readonly before: string
  readonly after: string
  /** The file does not exist yet. It must still not exist when the change is applied. */
  readonly creates?: true
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
  | {
      readonly ok: true
      readonly changeSet: ChangeSet
      /** The ADR the operation creates, so that the caller can show it afterwards. */
      readonly created?: { readonly id: string; readonly path: string }
      /** What the person should look at before confirming. The operation can be done all the same. */
      readonly warnings?: readonly string[]
    }
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
    .filter((file, position) =>
      file.creates ? current[position] !== undefined : current[position] !== file.before
    )
    .map((file) => file.path)
  if (conflicts.length > 0) return { applied: false, conflicts }

  for (const file of changeSet.files) await fs.writeText(file.path, file.after)
  return { applied: true }
}
