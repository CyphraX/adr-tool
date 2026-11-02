import type { Said } from './said'
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
      /** The warnings as codes, in the same order, where each has one (`Said`). */
      readonly warned?: readonly Said[]
    } & Outcome)
  | {
      readonly ok: false
      readonly reason: string
      /** The reason as a code, where it has one. */
      readonly said?: Said
    }

/**
 * One change set out of several, as one operation: the halves of an operation that more than
 * one module plans — a Rename of a Component, with the declaration and the ADRs that name it.
 * The halves must not touch the same file, nor a file one of them moves to: each was planned
 * against the disk as it is, not against the other.
 */
export function joinChangeSets(...changeSets: readonly ChangeSet[]): ChangeSet {
  const files = changeSets.flatMap((changeSet) => changeSet.files)
  const seen = new Set<string>()
  for (const file of files) {
    for (const path of file.renameTo === undefined ? [file.path] : [file.path, file.renameTo]) {
      if (seen.has(path)) throw new Error(`Two change sets that are joined both change ${path}.`)
      seen.add(path)
    }
  }
  return { files }
}

/** A file that a failed change set left other than it was: undoing a step failed as well. */
export interface Stranded {
  /** The file that is not as it was: changed, gone, or there when it was not before. */
  readonly path: string
  /** Where the text it had is kept now. Absent for a file that was not there before. */
  readonly textAt?: string
}

export type Applied =
  | { readonly applied: true }
  /** These files are no longer what the change set was planned against. Nothing was written. */
  | { readonly applied: false; readonly conflicts: readonly string[] }
  /**
   * The file system refused a step; `failed` is what it said. What was done is undone, and
   * every file is as it was — except the ones in `stranded`, where undoing failed too.
   */
  | { readonly applied: false; readonly failed: string; readonly stranded: readonly Stranded[] }

/**
 * A name beside `path` for one apply only, `docs/adr/.0001-a.md.k2x9q10.new`: beside it, so
 * that renaming it into place stays on one file system and is one step; hidden, and named
 * after the file, so that one a crash leaves behind says what it is. A long name is cut, so
 * that a file whose own name is near the limit of the file system still has one beside it.
 */
function besideName(path: string, token: string, kind: 'new' | 'old'): string {
  const slash = path.lastIndexOf('/')
  const name = Array.from(path.slice(slash + 1))
  const short = name.length > 64 ? `${name.slice(0, 63).join('')}…` : name.join('')
  return `${path.slice(0, slash + 1)}.${short}.${token}.${kind}`
}

/** One step of the commit: a rename, and the rename that takes it back. */
interface Step {
  readonly run: () => Promise<void>
  readonly undo: () => Promise<void>
  /** What stays other than it was when the step was done and cannot be taken back. */
  readonly stranded: Stranded
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Remove what an apply made beside the files, as far as the file system lets it. */
async function removeAll(fs: WritableFileSystem, paths: readonly string[]): Promise<void> {
  for (const path of paths) await fs.remove(path).catch(() => undefined)
}

/**
 * Write a change set, all of it or nothing (ADR-0015). Every file is compared with what the
 * change set was planned against first; if git, an editor or an agent changed one in the
 * meantime, nothing is written.
 *
 * Then every new text is written beside the file it is for, under a name of its own, and
 * made durable, and each file that a new text replaces gets a second name — a hard link,
 * which needs no room on a full disk. Nothing a reader sees has changed so far; when one of
 * these writes fails, they are removed again. Only then are the new texts renamed into
 * place, one rename per file, each of which replaces a file in one step. Files that move go
 * first: a rename is what another program is most likely to stand in the way of, an editor
 * holding the file open on Windows, say. When a rename fails, the ones before it are
 * renamed back, from the second names, and every file is as it was.
 *
 * What remains: each rename is one step, but all of them together are not. A crash or a
 * power cut between the first and the last leaves some files new and some old, with the
 * new texts and the second names beside them, for a person to put right. And when renaming
 * back fails as well, the result names the files that are not as they were, and where the
 * text each had is kept.
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

  const token = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
  /** The names the preparation writes beside the files: removed at the end, whatever happens. */
  const made: string[] = []
  const prepare: (() => Promise<void>)[] = []
  const moves: Step[] = []
  const placements: Step[] = []
  const step = (from: string, to: string, stranded: Stranded): Step => ({
    run: () => fs.rename(from, to),
    undo: () => fs.rename(to, from),
    stranded
  })

  for (const [index, file] of changeSet.files.entries()) {
    const target = file.renameTo ?? file.path
    const writes = file.creates === true || file.after !== file.before
    // Numbered, so that two names that are cut alike stay apart.
    const fresh = besideName(target, `${token}${index}`, 'new')
    const old = besideName(file.path, `${token}${index}`, 'old')
    if (writes) {
      made.push(fresh)
      const options = file.creates ? undefined : { like: file.path }
      prepare.push(() => fs.writeText(fresh, file.after, options))
    }
    if (file.renameTo !== undefined) {
      // A file that moves with a new text moves out of the way, and the new text takes its new place.
      const away = writes ? old : file.renameTo
      if (writes) made.push(old)
      moves.push(step(file.path, away, { path: file.path, textAt: away }))
      if (writes) placements.push(step(fresh, target, { path: target }))
    } else if (file.creates) {
      placements.push(step(fresh, file.path, { path: file.path }))
    } else if (writes) {
      made.push(old)
      prepare.push(() => fs.link(file.path, old))
      placements.push({
        run: () => fs.rename(fresh, file.path),
        undo: () => fs.rename(old, file.path),
        stranded: { path: file.path, textAt: old }
      })
    }
  }

  try {
    for (const write of prepare) await write()
  } catch (error) {
    await removeAll(fs, made)
    return { applied: false, failed: messageOf(error), stranded: [] }
  }

  const done: Step[] = []
  try {
    for (const next of [...moves, ...placements]) {
      await next.run()
      done.push(next)
    }
  } catch (error) {
    const stranded: Stranded[] = []
    for (const undone of done.toReversed()) {
      await undone.undo().catch(() => stranded.unshift(undone.stranded))
    }
    const kept = new Set(stranded.flatMap((file) => file.textAt ?? []))
    await removeAll(
      fs,
      made.filter((path) => !kept.has(path))
    )
    return { applied: false, failed: messageOf(error), stranded }
  }
  await removeAll(fs, made)
  return { applied: true }
}
