import { correctionsIn, type FileChange } from '@adr-tool/core'
import { WORKING_TREE, type HistoryEntry } from '../shared/ipc'
import type { FileCommit, Git, WorkingTree } from './git'
import { t } from './strings'

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/**
 * A blob as git would check it out next to the file on disk: with `core.autocrlf` the
 * working tree has CRLF where the commit has LF, and that is not a change.
 */
function checkedOutLike(blob: string, onDisk: string): string {
  return onDisk.includes('\r\n') && !blob.includes('\r\n') ? blob.replaceAll('\n', '\r\n') : blob
}

/**
 * Where the committed history of a file is when the file itself is new to git: a rename
 * that is staged says so; one that is not — a Renumber the app just made — shows as a
 * file that is gone and a new one with the same text.
 */
async function originOf(
  git: Git,
  tree: WorkingTree,
  path: string,
  onDisk: string | undefined
): Promise<string | undefined> {
  const staged = tree.renamedFrom[path]
  if (staged !== undefined || onDisk === undefined || !tree.changed.includes(path)) return staged
  if ((await git.head(path)) !== undefined) return undefined
  for (const gone of tree.deleted) {
    const blob = await git.head(gone)
    if (blob !== undefined && checkedOutLike(blob, onDisk) === onDisk) return gone
  }
  return undefined
}

/** A commit's change as the dialog shows it; a rename shows as one. */
function changeOf(commit: FileCommit, before: string, after: string): FileChange {
  return commit.previousPath === commit.path
    ? { path: commit.path, before, after }
    : { path: commit.previousPath, before, after, renameTo: commit.path }
}

/**
 * The history of one ADR's file, newest first: its commits through every rename, and on top
 * what is on disk and not committed yet. Every entry carries the Corrections the file
 * records at that point — that is how a Correction finds the commit that recorded it,
 * without any convention for commit messages.
 */
export async function historyOf(
  git: Git,
  path: string,
  onDisk: string | undefined
): Promise<HistoryEntry[]> {
  const tree = await git.workingTree()
  if (!tree) return []
  const origin = await originOf(git, tree, path, onDisk)
  const commits = await git.history(origin ?? path)
  const entries = await Promise.all(
    commits.map(async (commit): Promise<HistoryEntry> => {
      const text = await git.text(commit, 'after')
      return {
        id: commit.sha,
        subject: commit.subject,
        author: commit.author,
        date: commit.date,
        ...(commit.previousPath !== commit.path && { renamedFrom: fileName(commit.previousPath) }),
        corrections: text === undefined ? [] : correctionsIn(text)
      }
    })
  )
  // Whether something is uncommitted is git's to say: it knows about line-ending conversion.
  if (onDisk === undefined || !tree.changed.includes(path)) return entries
  return [
    {
      id: WORKING_TREE,
      subject: t.notCommittedYet,
      ...(origin !== undefined && { renamedFrom: fileName(origin) }),
      corrections: correctionsIn(onDisk)
    },
    ...entries
  ]
}

/** What one entry of that history did to the file. */
export async function historyChangeOf(
  git: Git,
  path: string,
  onDisk: string | undefined,
  entryId: string
): Promise<FileChange | undefined> {
  const tree = await git.workingTree()
  if (!tree) return undefined
  const origin = await originOf(git, tree, path, onDisk)

  if (entryId === WORKING_TREE) {
    if (onDisk === undefined) return undefined
    const blob = await git.head(origin ?? path)
    const before = blob === undefined ? '' : checkedOutLike(blob, onDisk)
    return origin === undefined
      ? { path, before, after: onDisk }
      : { path: origin, before, after: onDisk, renameTo: path }
  }
  const commit = (await git.history(origin ?? path)).find((candidate) => candidate.sha === entryId)
  if (!commit) return undefined
  const [before, after] = await Promise.all([git.text(commit, 'before'), git.text(commit, 'after')])
  return changeOf(commit, before ?? '', after ?? '')
}
