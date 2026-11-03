import type { ChangedFile, FileSystem, Git, LogEntry } from '@adr-tool/kernel'
import { linesText, type Anchor, type Annotation } from './annotation'
import { matchLines } from './line-diff'
import type { ReviewProblem } from './problems'
import { mostSimilarBlock, normalized, SIMILAR_ENOUGH, type Block } from './similarity'
import { sourceLines } from './text'

/**
 * What became of an Anchor (docs/review-format.md, section 4): its lines are where it says, or
 * they are found elsewhere — the place to offer as Update the Anchor —, or not at all.
 */
export type Found =
  | { readonly kind: 'unchanged'; readonly anchor: Anchor }
  | {
      readonly kind: 'moved'
      /** Where the lines are now, as they are now, with the commit HEAD points at. */
      readonly anchor: Anchor
      /** 1 where the quoted lines are found as they were; less where they were edited. */
      readonly similarity: number
      /** The Source File's path before it was renamed, when it was. */
      readonly renamedFrom?: string
    }
  | {
      readonly kind: 'orphaned'
      /** Whether the Source File, or a file it was renamed to, is there at all. */
      readonly file: 'there' | 'gone'
    }

/**
 * How far from where the Anchor is expected the most similar lines are looked for: lines before
 * and after — where it was, without history, or where the diff takes it.
 */
export const WINDOW = 50

/** How many commits of a Source File's history are looked at for the text an Anchor was read in. */
export const STAND_IN_COMMITS = 50

/** How many of the last commits are followed for renames when the Anchor's commit is gone. */
export const RENAME_COMMITS = 1000

/** What finding Anchors again reads; what it reads once it keeps, for every Annotation of a run. */
export interface Finding {
  readonly fs: FileSystem
  readonly git: Git
  /**
   * What is read once and shared: HEAD, whether a commit is there, the changes since a commit,
   * the last commits, the log of a file, a file at a commit.
   */
  readonly cache?: FindingCache
}

export interface FindingCache {
  head?: Promise<string | undefined>
  readonly commits: Map<string, Promise<boolean>>
  readonly changes: Map<string, Promise<readonly ChangedFile[] | undefined>>
  /** The last commits, by the day since which they are read too. */
  readonly logs: Map<string, Promise<readonly LogEntry[] | undefined>>
  /** The last commits of a file, by its path. */
  readonly fileLogs: Map<string, Promise<readonly LogEntry[] | undefined>>
  /** A file at a commit, by `<commit>:<path>`. */
  readonly texts: Map<string, Promise<string | undefined>>
}

export const findingCache = (): FindingCache => ({
  commits: new Map(),
  changes: new Map(),
  logs: new Map(),
  fileLogs: new Map(),
  texts: new Map()
})

const once = <T>(map: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> => {
  let value = map.get(key)
  if (value === undefined) map.set(key, (value = read()))
  return value
}

/** The day before a `YYYY-MM-DD`: commits in another time zone are not cut off. */
function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/** Whether `lines` have the quoted lines at the Anchor's lines: as they are, trailing whitespace aside. */
const sameLines = (lines: readonly string[], anchor: Anchor): boolean =>
  anchor.quote.every(
    (line, offset) => lines[anchor.start - 1 + offset]?.trimEnd() === line.trimEnd()
  )

/**
 * A line that tells nothing about where it stands: blank, or without a letter or a digit — a
 * closing brace, a lone `});`. The diff may pair it with any of its copies.
 */
const weak = (line: string): boolean => !/[\p{L}\p{N}]/u.test(line)

/**
 * Find an Anchor again in the code as it is on disk now (docs/review-format.md, section 4).
 * `date` is the day the Annotation was written, or any day before it: when the Anchor's commit
 * is gone, the renames of the commits since the day before it are followed, besides those of
 * the last `RENAME_COMMITS`. Never writes.
 */
export async function findAnchor(anchor: Anchor, finding: Finding, date?: string): Promise<Found> {
  const { fs, git } = finding
  const cache = finding.cache ?? findingCache()
  const head = await (cache.head ??= git.headCommit())
  const known =
    anchor.commit !== undefined &&
    (await once(cache.commits, anchor.commit, () => git.hasCommit(anchor.commit!)))

  const renamed =
    head === undefined ? undefined : await renamedTo(anchor, known, head, git, cache, date)
  const paths = [
    anchor.path,
    ...(renamed !== undefined && renamed !== anchor.path ? [renamed] : [])
  ]
  let there = false
  for (const path of paths) {
    const text = await fs.readText(path)
    if (text === undefined) continue
    there = true
    const lines = sourceLines(text)
    if (path === anchor.path && sameLines(lines, anchor)) return { kind: 'unchanged', anchor }
    const history =
      head === undefined ? undefined : await historyOf(anchor, path, known, git, cache)
    const block = locate(anchor, lines, history)
    if (!block) continue
    return {
      kind: 'moved',
      anchor: {
        path,
        start: block.start + 1,
        end: block.end,
        quote: lines.slice(block.start, block.end),
        ...(head !== undefined && { commit: head })
      },
      similarity: block.similarity,
      ...(path !== anchor.path && { renamedFrom: anchor.path })
    }
  }
  return { kind: 'orphaned', file: there ? 'there' : 'gone' }
}

/**
 * Where git says the Source File went: from the Anchor's commit to HEAD when the repository has
 * the commit. Otherwise through the renames of the last commits — the last `RENAME_COMMITS`,
 * and every one since the day before `date` when those are more —, from the last rename away
 * from the Anchor's path on: the file may have been renamed upstream before the Annotation was
 * written on a branch that was rebased onto it.
 */
async function renamedTo(
  anchor: Anchor,
  known: boolean,
  head: string,
  git: Git,
  cache: FindingCache,
  date: string | undefined
): Promise<string | undefined> {
  if (known) {
    const changes = await once(cache.changes, anchor.commit!, () =>
      git.changes(anchor.commit!, head)
    )
    return changes?.find((change) => change.kind === 'renamed' && change.from === anchor.path)?.path
  }
  const since = date === undefined ? undefined : dayBefore(date)
  const log = (await once(cache.logs, since ?? '', () => recentCommits(git, since))) ?? []
  const renamedFrom = (entry: LogEntry, path: string): ChangedFile | undefined =>
    entry.changes.find((change) => change.kind === 'renamed' && change.from === path)
  // Newest first: the last time the file left the Anchor's path, and from there on, forward.
  const last = log.findIndex((entry) => renamedFrom(entry, anchor.path) !== undefined)
  if (last === -1) return undefined
  let path = anchor.path
  for (let at = last; at >= 0; at--) path = renamedFrom(log[at]!, path)?.path ?? path
  return path === anchor.path ? undefined : path
}

/** The last `RENAME_COMMITS` commits, and all since `since` when those are more; newest first. */
async function recentCommits(
  git: Git,
  since: string | undefined
): Promise<readonly LogEntry[] | undefined> {
  const [recent, dated] = await Promise.all([
    git.log({ limit: RENAME_COMMITS }),
    since === undefined ? undefined : git.log({ since })
  ])
  if (recent === undefined || dated === undefined) return recent ?? dated
  const [longer, shorter] = recent.length >= dated.length ? [recent, dated] : [dated, recent]
  const seen = new Set(longer.map((entry) => entry.commit))
  return [...longer, ...shorter.filter((entry) => !seen.has(entry.commit))]
}

/**
 * The lines of the Source File as the Anchor read them: as its commit has them, or — the commit
 * gone after a rebase, or the lines read before they were committed — as the newest of the last
 * commits of the file has them where it has the quoted lines at the Anchor's lines.
 */
async function historyOf(
  anchor: Anchor,
  path: string,
  known: boolean,
  git: Git,
  cache: FindingCache
): Promise<string[] | undefined> {
  const linesAt = async (commit: string, path: string): Promise<string[] | undefined> => {
    const text = await once(cache.texts, `${commit}:${path}`, () => git.textAt(commit, path))
    const lines = text === undefined ? undefined : sourceLines(text)
    return lines && sameLines(lines, anchor) ? lines : undefined
  }
  if (known) {
    const lines = await linesAt(anchor.commit!, anchor.path)
    if (lines) return lines
  }
  const log = await once(cache.fileLogs, path, () => git.log({ path, limit: STAND_IN_COMMITS }))
  for (const entry of log ?? []) {
    const change = entry.changes[0]
    if (!change || change.kind === 'deleted') continue
    const lines = await linesAt(entry.commit, change.path)
    if (lines) return lines
  }
  return undefined
}

/**
 * Where the quoted lines are in `lines`: the quoted lines themselves, the nearest to where the
 * Anchor was; otherwise, with history, the block that holds the quoted lines the diff kept, if
 * it is similar enough; otherwise the most similar block that is similar enough. With history,
 * only lines that are new since, quoted lines kept, or weak lines the diff cannot place are
 * looked at.
 */
function locate(
  anchor: Anchor,
  lines: readonly string[],
  history: readonly string[] | undefined
): Block | undefined {
  const quote = anchor.quote.map(normalized)
  const plain = lines.map(normalized)
  const [start, end] = [anchor.start - 1, anchor.end]
  // Compared whitespace aside: a file that is re-indented keeps its lines.
  const before = history?.map(normalized)
  const matches = before && matchLines(before, plain)

  // Which lines may belong to the Anchor's block, and where the Anchor would be now.
  let allowed: (index: number) => boolean = () => true
  let near = start
  if (before && matches) {
    const { ofOld, ofNew } = matches
    // A weak line the old text has more than once — a closing brace, a blank line — the diff
    // may pair with any of them: that it kept one elsewhere says nothing about where it
    // belongs. Any other line it kept elsewhere is other code, a copy of the quoted lines too.
    const times = new Map<string, number>()
    for (const line of before) times.set(line, (times.get(line) ?? 0) + 1)
    allowed = (index) => {
      const old = ofNew[index]!
      if (old === -1 || (old >= start && old < end)) return true
      return weak(before[old]!) && times.get(before[old]!)! > 1
    }
    near = expectedStart(ofOld, start)
  }

  // The quoted lines, as they were, whitespace aside.
  let exact: number | undefined
  for (let at = 0; at + quote.length <= plain.length; at++) {
    let same = true
    for (let offset = 0; offset < quote.length && same; offset++) {
      same = allowed(at + offset) && plain[at + offset] === quote[offset]
    }
    if (same && (exact === undefined || Math.abs(at - near) < Math.abs(exact - near))) exact = at
  }
  if (exact !== undefined) return { start: exact, end: exact + quote.length, similarity: 1 }

  // The block that holds the quoted lines the diff kept, each where it is now: a line inserted
  // among them belongs to the block, and a kept line is not left out for a shorter one. Kept
  // lines scattered further apart than a block and its window are no block.
  if (matches) {
    const pinned = quote.map((_, offset) => {
      const now = matches.ofOld[start + offset]!
      return now >= 0 ? now : undefined
    })
    const kept = pinned.filter((now) => now !== undefined)
    const [first, last] = [kept[0], kept.at(-1)]
    if (first !== undefined && last !== undefined && last - first < 2 * quote.length + WINDOW) {
      let [from, to] = [first, last + 1]
      let between = true
      for (let at = from; at < to && between; at++) between = allowed(at)
      if (between) {
        while (from > Math.max(0, first - WINDOW) && allowed(from - 1)) from--
        while (to < Math.min(plain.length, last + 1 + WINDOW) && allowed(to)) to++
        const block = mostSimilarBlock(quote, plain, from, to, near, pinned)
        if (block && block.similarity >= SIMILAR_ENOUGH) return block
      }
    }
  }

  // The most similar block within the window around where the Anchor is expected, in the runs
  // of lines that may belong to it: the cost of the search grows with the lines it looks at.
  const [low, high] = [
    Math.max(0, near - WINDOW),
    Math.min(plain.length, near + quote.length + WINDOW)
  ]
  const runs: [number, number][] = []
  for (let at = low; at < high;) {
    if (!allowed(at)) {
      at++
      continue
    }
    const from = at
    while (at < high && allowed(at)) at++
    runs.push([from, at])
  }
  let best: Block | undefined
  for (const [from, to] of runs) {
    const block = mostSimilarBlock(quote, plain, from, to, near)
    if (!block) continue
    const nearer = best && Math.abs(block.start - near) < Math.abs(best.start - near)
    if (
      !best ||
      block.similarity > best.similarity ||
      (block.similarity === best.similarity && nearer)
    ) {
      best = block
    }
  }
  return best && best.similarity >= SIMILAR_ENOUGH ? best : undefined
}

/** Where the diff takes the Anchor's first line: by the nearest line kept after it, or before it. */
function expectedStart(ofOld: Int32Array, start: number): number {
  for (let old = start; old < ofOld.length; old++) {
    if (ofOld[old]! >= 0) return ofOld[old]! - (old - start)
  }
  for (let old = start - 1; old >= 0; old--) {
    if (ofOld[old]! >= 0) return ofOld[old]! + (start - old)
  }
  return start
}

/** What became of each Annotation's Anchor, and the Problem of each that is orphaned. */
export async function findAnchors(
  annotations: readonly Annotation[],
  finding: Finding
): Promise<{
  readonly found: ReadonlyMap<string, Found>
  readonly problems: readonly ReviewProblem[]
}> {
  const shared = { ...finding, cache: finding.cache ?? findingCache() }
  const found = new Map<string, Found>()
  const problems: ReviewProblem[] = []
  // One read of the last commits for all: since the earliest day an Annotation was written.
  const days = annotations.flatMap((annotation) =>
    annotation.anchor && annotation.date !== undefined ? [annotation.date] : []
  )
  const earliest = days.length === 0 ? undefined : days.reduce((a, b) => (b < a ? b : a))
  for (const annotation of annotations) {
    if (!annotation.anchor) continue
    const result = await findAnchor(annotation.anchor, shared, earliest)
    found.set(annotation.id, result)
    if (result.kind === 'orphaned') {
      problems.push({
        kind: 'orphaned',
        path: annotation.path,
        annotation: annotation.id,
        source: annotation.anchor.path,
        lines: linesText(annotation.anchor),
        file: result.file
      })
    }
  }
  return { found, problems }
}
