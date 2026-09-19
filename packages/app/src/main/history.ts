import { correctionsIn, type FileChange } from '@adr-tool/core'
import { WORKING_TREE, type HistoryEntry } from '../shared/ipc'
import type { Git } from './git'

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/**
 * The history of one ADR's file, newest first: its commits through every rename, and on top
 * what is on disk and not committed yet. Every entry says how many Corrections the file
 * records at that point — that is how a Correction finds the commit that recorded it,
 * exactly, and without searching commit messages.
 */
export async function historyOf(
  git: Git,
  path: string,
  onDisk: string | undefined
): Promise<HistoryEntry[]> {
  const commits = await git.history(path)
  const entries = await Promise.all(
    commits.map(async (commit): Promise<HistoryEntry> => {
      const { after } = await git.change(commit)
      return {
        id: commit.sha,
        subject: commit.subject,
        author: commit.author,
        date: commit.date,
        ...(commit.previousPath !== commit.path && { renamedFrom: fileName(commit.previousPath) }),
        corrections: correctionsIn(after).length
      }
    })
  )
  if (onDisk === undefined || onDisk === (await git.head(path))) return entries
  // Outside a repository there is no history to put this on top of.
  if ((await git.state()) === undefined) return []
  return [
    { id: WORKING_TREE, subject: 'Not committed yet', corrections: correctionsIn(onDisk).length },
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
  if (entryId === WORKING_TREE) {
    if (onDisk === undefined) return undefined
    return { path, before: (await git.head(path)) ?? '', after: onDisk }
  }
  const commit = (await git.history(path)).find((candidate) => candidate.sha === entryId)
  return commit && git.change(commit)
}
