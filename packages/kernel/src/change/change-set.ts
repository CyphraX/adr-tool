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
  /** The file moves here. Nothing may be there when the change is applied. */
  readonly renameTo?: string
}

/**
 * Everything one operation wants to write, across all the files it affects. An operation
 * never writes itself: it returns a change set, which can be shown as a diff, applied as
 * a whole, or dropped. `after` is always `before` with splice edits applied (ADR-0002).
 */
export interface ChangeSet {
  readonly files: readonly FileChange[]
}

/**
 * What planning an operation yields: a change set, or the reason why it cannot be done.
 * `Outcome` is what a module's operations tell their caller beyond the change set.
 */
export type Plan<Outcome extends object = object> =
  | ({
      readonly ok: true
      readonly changeSet: ChangeSet
      /** What the person should look at before confirming. The operation can be done all the same. */
      readonly warnings?: readonly string[]
    } & Outcome)
  | { readonly ok: false; readonly reason: string }

export type Applied =
  | { readonly applied: true }
  /** These files are no longer what the change set was planned against. Nothing was written. */
  | { readonly applied: false; readonly conflicts: readonly string[] }

/**
 * Write a change set. Every file is compared with what the change set was planned against
 * first; if git, an editor or an agent changed one in the meantime, nothing is written.
 *
 * Renames come before writes. A rename is what another program is most likely to stand in
 * the way of, an editor holding the file open on Windows, say; when it fails, it fails
 * before anything was written.
 */
export async function applyChangeSet(
  fs: WritableFileSystem,
  changeSet: ChangeSet
): Promise<Applied> {
  const conflicts: string[] = []
  for (const file of changeSet.files) {
    const current = await fs.readText(file.path)
    if (file.creates ? current !== undefined : current !== file.before) conflicts.push(file.path)
    if (file.renameTo !== undefined && (await fs.readText(file.renameTo)) !== undefined) {
      conflicts.push(file.renameTo)
    }
  }
  if (conflicts.length > 0) return { applied: false, conflicts }

  for (const file of changeSet.files) {
    if (file.renameTo !== undefined) await fs.rename(file.path, file.renameTo)
  }
  for (const file of changeSet.files) {
    if (file.creates || file.after !== file.before) {
      await fs.writeText(file.renameTo ?? file.path, file.after)
    }
  }
  return { applied: true }
}
