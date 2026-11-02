import type { ChangedFile, Git, LogEntry } from './port'
import { isDay } from './port'

/** One commit of a scripted history: the whole tree it leaves, and who made it when. */
export interface ScriptedCommit {
  readonly commit: string
  /** The commit before it. Absent: the one before it in the list; `null`: none. */
  readonly parent?: string | null
  readonly author?: string
  /** ISO 8601; when it was authored and committed alike. */
  readonly date?: string
  readonly subject?: string
  /** Every file of the commit, by its path. */
  readonly files: Readonly<Record<string, string>>
}

export interface ScriptedHistory {
  readonly commits: readonly ScriptedCommit[]
  /** The commit HEAD points at. Absent: the last of the list; `null`: before the first commit. */
  readonly head?: string | null
}

/** The share of lines two texts have in common, from 0 to 1: how git's `-M` is approximated. */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const lines = (text: string): string[] => text.split('\n')
  const left = lines(a)
  const right = lines(b)
  const counts = new Map<string, number>()
  for (const line of left) counts.set(line, (counts.get(line) ?? 0) + 1)
  let common = 0
  for (const line of right) {
    const count = counts.get(line) ?? 0
    if (count > 0) {
      common++
      counts.set(line, count - 1)
    }
  }
  return (2 * common) / (left.length + right.length)
}

/** The differences of two trees, with a file that went and one that came paired as a rename. */
function diff(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>
): ChangedFile[] {
  const gone = Object.keys(before)
    .filter((path) => !(path in after))
    .sort()
  const come = Object.keys(after)
    .filter((path) => !(path in before))
    .sort()
  const changes: ChangedFile[] = Object.keys(after)
    .filter((path) => path in before && before[path] !== after[path])
    .map((path) => ({ kind: 'modified', path }))

  // As git does: half the content the same at least, the most similar pairs first.
  const pairs = gone
    .flatMap((from) =>
      come.map((path) => ({ from, path, score: similarity(before[from]!, after[path]!) }))
    )
    .filter((pair) => pair.score >= 0.5)
    .sort((a, b) => b.score - a.score)
  const paired = new Set<string>()
  for (const { from, path } of pairs) {
    if (paired.has(from) || paired.has(path)) continue
    paired.add(from)
    paired.add(path)
    changes.push({ kind: 'renamed', path, from })
  }
  for (const path of come) if (!paired.has(path)) changes.push({ kind: 'added', path })
  for (const path of gone) if (!paired.has(path)) changes.push({ kind: 'deleted', path })
  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/**
 * A history held in memory, for tests: commits with their trees, as the git port reads them.
 * A rebase is scripted as a history in which the old commits are gone and new ones stand in
 * their place.
 */
export function memoryGit(history: ScriptedHistory): Git {
  const commits = new Map<string, ScriptedCommit & { readonly parent: string | null }>()
  history.commits.forEach((commit, position) => {
    const parent =
      commit.parent === undefined ? (history.commits[position - 1]?.commit ?? null) : commit.parent
    commits.set(commit.commit, { ...commit, parent })
  })
  const head = history.head === undefined ? history.commits.at(-1)?.commit : history.head

  const entryOf = (commit: string): LogEntry => {
    const scripted = commits.get(commit)!
    const before = scripted.parent === null ? {} : (commits.get(scripted.parent)?.files ?? {})
    return {
      commit,
      parent: scripted.parent ?? undefined,
      author: scripted.author ?? 'Someone',
      date: scripted.date ?? '2026-01-01T00:00:00Z',
      subject: scripted.subject ?? '',
      changes: diff(before, scripted.files)
    }
  }

  return {
    async headCommit() {
      return head ?? undefined
    },
    async hasCommit(commit) {
      return commits.has(commit)
    },
    async textAt(commit, path) {
      return commits.get(commit)?.files[path]
    },
    async changes(from, to) {
      const [before, after] = [commits.get(from), commits.get(to)]
      return before && after ? diff(before.files, after.files) : undefined
    },
    async log(options = {}) {
      if (options.since !== undefined && !isDay(options.since)) return undefined
      const since = options.since === undefined ? -Infinity : Date.parse(`${options.since}T00:00Z`)
      const entries: LogEntry[] = []
      let followed = options.path
      for (let at = head ?? null; at !== null && commits.has(at); at = commits.get(at)!.parent) {
        const entry = entryOf(at)
        if (Date.parse(entry.date) < since) continue
        if (followed === undefined) {
          entries.push(entry)
        } else {
          const change = entry.changes.find((one) => one.path === followed)
          if (!change) continue
          entries.push({ ...entry, changes: [change] })
          if (change.kind === 'renamed') followed = change.from
        }
        if (options.limit !== undefined && entries.length >= options.limit) break
      }
      return entries
    }
  }
}
