import type { ChangedFile, Git, LogEntry } from './port'
import { isDay } from './port'

/**
 * One commit of a scripted history: the whole tree it leaves, and who made it when. It has one
 * parent at most: a merge cannot be scripted, and the log leaves merges out as git's does.
 */
export interface ScriptedCommit {
  readonly commit: string
  /** The commit before it. Absent: the one before it in the list; `null`: none. */
  readonly parent?: string | null
  readonly author?: string
  /** When it was authored, ISO 8601: the date of its log entry. */
  readonly date?: string
  /**
   * When it was committed, ISO 8601, which `since` goes by; absent: when it was authored. A
   * rebased commit keeps the day it was authored and is committed anew.
   */
  readonly committed?: string
  readonly subject?: string
  /** Every file of the commit, by its path. */
  readonly files: Readonly<Record<string, string>>
}

export interface ScriptedHistory {
  readonly commits: readonly ScriptedCommit[]
  /** The commit HEAD points at. Absent: the last of the list; `null`: before the first commit. */
  readonly head?: string | null
}

/**
 * How much of a file another one is, from 0 to 1, as git's `-M` scores a rename: the bytes of
 * `a` that are found again in `b`, line by line, over the size of the larger of the two. As in
 * git, a pair whose sizes differ by more than half the larger one — a file that more than
 * doubled — and an empty file are never a rename.
 */
function similarity(a: string, b: string): number {
  // Bytes in UTF-8: a code point below U+0080 is one, below U+0800 two, a surrogate pair four.
  const size = (text: string): number => {
    let bytes = 0
    for (const character of text) {
      const code = character.codePointAt(0)!
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    }
    return bytes
  }
  const [left, right] = [size(a), size(b)]
  if (left === 0 || right === 0) return 0
  if (a === b) return 1
  const larger = Math.max(left, right)
  if (2 * Math.min(left, right) < larger) return 0
  // Each line with its line break, as git hashes a file in chunks that end at one.
  const lines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const counts = new Map<string, number>()
  for (const line of lines(b)) counts.set(line, (counts.get(line) ?? 0) + 1)
  let copied = 0
  for (const line of lines(a)) {
    const count = counts.get(line) ?? 0
    if (count === 0) continue
    copied += size(line)
    counts.set(line, count - 1)
  }
  return copied / larger
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
        // As git's `--since`: the walk stops at the first commit committed before the day.
        const scripted = commits.get(at)!
        if (Date.parse(scripted.committed ?? entry.date) < since) break
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
