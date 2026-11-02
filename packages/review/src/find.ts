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

/** How far from where the Anchor was the lines are looked for without history: lines before and after. */
export const WINDOW = 50

/** How many commits of a Source File's history are looked at for the text an Anchor was read in. */
export const STAND_IN_COMMITS = 50

/** How many commits are followed for renames when neither the Anchor's commit nor its day is known. */
export const RENAME_COMMITS = 1000

/** What finding Anchors again reads; what it reads once it keeps, for every Annotation of a run. */
export interface Finding {
  readonly fs: FileSystem
  readonly git: Git
  /** What is read once and shared: HEAD, the changes since a commit, the log since a day. */
  readonly cache?: FindingCache
}

export interface FindingCache {
  head?: Promise<string | undefined>
  readonly changes: Map<string, Promise<readonly ChangedFile[] | undefined>>
  readonly logs: Map<string, Promise<readonly LogEntry[] | undefined>>
  readonly commits: Map<string, Promise<boolean>>
}

export const findingCache = (): FindingCache => ({
  changes: new Map(),
  logs: new Map(),
  commits: new Map()
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

const sameLines = (lines: readonly string[], anchor: Anchor): boolean =>
  anchor.quote.every((line, offset) => lines[anchor.start - 1 + offset] === line)

/**
 * Find an Anchor again in the code as it is on disk now (docs/review-format.md, section 4).
 * `date` is the day the Annotation was written, which bounds the commits whose renames are
 * followed when the Anchor's commit is gone. Never writes.
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
    const history = head === undefined ? undefined : await historyOf(anchor, path, known, git)
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
 * the commit, and otherwise through the renames of the commits since the day before `date`.
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
  const log = await once(cache.logs, since ?? '', () =>
    git.log(since === undefined ? { limit: RENAME_COMMITS } : { since })
  )
  let path = anchor.path
  for (const entry of [...(log ?? [])].reverse()) {
    for (const change of entry.changes) {
      if (change.kind === 'renamed' && change.from === path) path = change.path
    }
  }
  return path === anchor.path ? undefined : path
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
  git: Git
): Promise<string[] | undefined> {
  if (known) {
    const text = await git.textAt(anchor.commit!, anchor.path)
    const lines = text === undefined ? undefined : sourceLines(text)
    if (lines && sameLines(lines, anchor)) return lines
  }
  for (const entry of (await git.log({ path, limit: STAND_IN_COMMITS })) ?? []) {
    const change = entry.changes[0]
    if (!change || change.kind === 'deleted') continue
    const text = await git.textAt(entry.commit, change.path)
    const lines = text === undefined ? undefined : sourceLines(text)
    if (lines && sameLines(lines, anchor)) return lines
  }
  return undefined
}

/**
 * Where the quoted lines are in `lines`: the quoted lines themselves, the nearest to where the
 * Anchor was; otherwise, with history, the block that holds the quoted lines the diff kept, if
 * it is similar enough; otherwise the most similar block that is similar enough. With history,
 * only lines that are new since, quoted lines kept, or lines the diff cannot place are looked at.
 */
function locate(
  anchor: Anchor,
  lines: readonly string[],
  history: readonly string[] | undefined
): Block | undefined {
  const quote = anchor.quote.map(normalized)
  const plain = lines.map(normalized)
  const [start, end] = [anchor.start - 1, anchor.end]
  const matches = history && matchLines(history, lines)

  // Which lines may belong to the Anchor's block, and where the Anchor would be now.
  let allowed: (index: number) => boolean = () => true
  let near = start
  if (history && matches) {
    const { ofOld, ofNew } = matches
    // A line the old text has more than once — a closing brace, a blank line — the diff may
    // pair with any of them: that it kept one elsewhere says nothing about where it belongs.
    const times = new Map<string, number>()
    for (const line of history) times.set(line, (times.get(line) ?? 0) + 1)
    allowed = (index) => {
      const old = ofNew[index]!
      return old === -1 || (old >= start && old < end) || times.get(history[old]!)! > 1
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
  // among them belongs to the block, and a kept line is not left out for a shorter one.
  if (matches) {
    const pinned = quote.map((_, offset) => {
      const now = matches.ofOld[start + offset]!
      return now >= 0 ? now : undefined
    })
    const kept = pinned.filter((now) => now !== undefined)
    if (kept.length > 0) {
      let [from, to] = [kept[0]!, kept[kept.length - 1]! + 1]
      let between = true
      for (let at = from; at < to && between; at++) between = allowed(at)
      if (between) {
        while (from > 0 && allowed(from - 1)) from--
        while (to < plain.length && allowed(to)) to++
        const block = mostSimilarBlock(quote, plain, from, to, near, pinned)
        if (block && block.similarity >= SIMILAR_ENOUGH) return block
      }
    }
  }

  // The most similar block, in the runs of lines that may belong to it.
  const runs: [number, number][] = []
  if (matches) {
    for (let at = 0; at < plain.length;) {
      if (!allowed(at)) {
        at++
        continue
      }
      const from = at
      while (at < plain.length && allowed(at)) at++
      runs.push([from, at])
    }
  } else {
    runs.push([Math.max(0, start - WINDOW), Math.min(plain.length, end + WINDOW)])
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
  for (const annotation of annotations) {
    if (!annotation.anchor) continue
    const result = await findAnchor(annotation.anchor, shared, annotation.date)
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
