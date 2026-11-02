/**
 * The history of a repository as git keeps it, as the cores read it: read-only, and only
 * what a core needs — Review to find an Anchor again, the history analysis to count what
 * changed when (docs/adr/0020-git-is-a-port-of-the-kernel-implemented-once-for-node.md). A
 * core never runs git itself: the app, the command line and the tests each plug in their own
 * implementation, as they do for the file system.
 *
 * A commit is named by its full object name, 40 or 64 hexadecimal digits, as git writes it.
 * Paths are relative to the directory that was opened, with forward slashes, as on the
 * file-system port. Without git, outside a repository or when git fails, every method says
 * "nothing": no commit, no text, no history.
 */
export interface Git {
  /** The commit HEAD points at; `undefined` before the first commit, or without git. */
  headCommit(): Promise<string | undefined>
  /**
   * Whether the repository has this commit. A commit a rebase left behind is there as long as
   * git keeps it; one a clone never fetched, or a garbage collection removed, is not.
   */
  hasCommit(commit: string): Promise<boolean>
  /** A file's text as a commit has it; `undefined` when the commit has no such file. */
  textAt(commit: string, path: string): Promise<string | undefined>
  /**
   * How the files differ from one commit to another, with renames found as git finds them
   * (`-M`, half the content the same). The commits need not be related. `undefined` when git
   * cannot tell, a commit being gone, say.
   */
  changes(from: string, to: string): Promise<readonly ChangedFile[] | undefined>
  /**
   * The commits HEAD reaches, newest first, each with the files it changed against its first
   * parent. Merges are left out: what they bring in is in the commits they merge. `undefined`
   * when git cannot tell; empty before the first commit.
   */
  log(options?: LogOptions): Promise<readonly LogEntry[] | undefined>
}

/** Which commits `log` reads. */
export interface LogOptions {
  /**
   * Only the commits that changed this file, followed back through its renames (`--follow`);
   * `changes` then holds that file alone, under the name it had in that commit.
   */
  readonly path?: string
  /**
   * Only commits made on or after this day, `YYYY-MM-DD`, from its start in UTC: when they were
   * committed, so that a rebased commit counts as new. git stops at the first commits older
   * than that, as `git log --since` does.
   */
  readonly since?: string
  /** At most this many commits, the newest. */
  readonly limit?: number
}

/** One commit, as `log` reads it. */
export interface LogEntry {
  readonly commit: string
  /** Its first parent; `undefined` for a commit that starts the history. */
  readonly parent: string | undefined
  /** The author's name, as the commit records it. */
  readonly author: string
  /** When the author made it, ISO 8601. */
  readonly date: string
  /** The first line of its message. */
  readonly subject: string
  readonly changes: readonly ChangedFile[]
}

/** A file one commit changed, or that differs between two commits. */
export type ChangedFile =
  | { readonly kind: 'added' | 'modified' | 'deleted'; readonly path: string }
  /** The file is at `path` now and was at `from` before, with much the same text. */
  | { readonly kind: 'renamed'; readonly path: string; readonly from: string }

/** Whether a text is the full name of a git object: 40 hexadecimal digits, or 64 for SHA-256. */
export function isObjectName(text: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(text)
}

/** Whether a text is a calendar day, `YYYY-MM-DD`, as `since` takes it. */
export function isDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}
