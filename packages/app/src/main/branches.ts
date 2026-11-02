import {
  branchChanges,
  type Adr,
  type MergeBase,
  numberTakenOn,
  openRepository,
  type DirectoryEntry,
  type FileSystem,
  type Repository
} from '@adr-tool/core'
import type { BranchOverview, OtherBranch } from '../shared/ipc'
import type { Branch, Git, TreeEntry } from './git'
import { t } from './strings'

/**
 * What is read once and kept: a tree, a blob and a commit's Decision Logs do not change.
 * Trees and blobs are shared by every commit that has them.
 */
export interface BranchCache {
  /** The Decision Logs of a directory, by its tree: the commits that do not change it share them. */
  readonly repositories: Map<string, Promise<Repository | undefined>>
  readonly trees: Map<string, readonly TreeEntry[]>
  /** A blob's text; `null` for one too large to be an ADR. */
  readonly blobs: Map<string, string | null>
  /** The directory's tree in a commit; `null` when the commit does not have the directory. */
  readonly directories: Map<string, string | null>
  /** The merge base of HEAD and a commit, by both; `null` when they have none. */
  readonly bases: Map<string, string | null>
}

/** How many of each are kept: the least recently used go first. */
const MAX_CACHED = { repositories: 200, trees: 20_000, blobs: 20_000, commits: 2_000 }

export function branchCache(): BranchCache {
  return {
    repositories: new Map(),
    trees: new Map(),
    blobs: new Map(),
    directories: new Map(),
    bases: new Map()
  }
}

/** Keep `value` under `key`, and drop what was used least recently beyond `limit`. */
function remember<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.delete(key)
  map.set(key, value)
  for (const oldest of map.keys()) {
    if (map.size <= limit) break
    map.delete(oldest)
  }
}

/** What is kept under `key`, now used most recently. */
function recall<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key)
  if (value !== undefined) remember(map, key, value, Infinity)
  return value
}

/**
 * A directory as a commit has it, as `core` reads a repository: read-only, and read from git
 * without checking anything out. A directory is listed when `core` asks for it, and reading a
 * file reads the Markdown files of its directory with it in one go, which is how `core` reads
 * a Decision Log. `failed` says that something could not be read: what was read is then
 * incomplete.
 */
export function treeFileSystem(
  root: string | null,
  git: Pick<Git, 'treeEntries' | 'blobs'>,
  cache: Pick<BranchCache, 'trees' | 'blobs'>
): FileSystem & { readonly failed: boolean } {
  let failed = false
  // What this read has seen, whatever the shared cache drops in the meantime.
  const trees = new Map<string, readonly TreeEntry[] | undefined>()
  const blobs = new Map<string, string | null>()

  const treeOf = async (tree: string): Promise<readonly TreeEntry[] | undefined> => {
    if (trees.has(tree)) return trees.get(tree)
    let entries = recall(cache.trees, tree)
    if (entries === undefined) {
      entries = await git.treeEntries(tree)
      if (entries === undefined) failed = true
      else remember(cache.trees, tree, entries, MAX_CACHED.trees)
    }
    trees.set(tree, entries)
    return entries
  }
  const listing = new Map<string, Promise<readonly TreeEntry[] | undefined>>()
  const entriesOf = (path: string): Promise<readonly TreeEntry[] | undefined> => {
    const listed = listing.get(path)
    if (listed) return listed
    const listingOf = async (): Promise<readonly TreeEntry[] | undefined> => {
      if (root === null) return undefined
      if (path === '') return treeOf(root)
      const cut = path.lastIndexOf('/')
      const parent = await entriesOf(cut < 0 ? '' : path.slice(0, cut))
      const entry = parent?.find(
        (candidate) => candidate.kind === 'directory' && candidate.name === path.slice(cut + 1)
      )
      return entry && treeOf(entry.object)
    }
    const pending = listingOf()
    listing.set(path, pending)
    return pending
  }

  const known = (blob: string): boolean => {
    if (blobs.has(blob)) return true
    const text = recall(cache.blobs, blob)
    if (text !== undefined) blobs.set(blob, text)
    return text !== undefined
  }
  const read = async (names: readonly string[]): Promise<void> => {
    const wanted = [...new Set(names)].filter((name) => !known(name))
    if (wanted.length === 0) return
    const texts = await git.blobs(wanted)
    // A blob git could not read, or does not have: a partial clone lacks it.
    if (texts === undefined || wanted.some((name) => !texts.has(name))) failed = true
    for (const [name, text] of texts ?? []) {
      blobs.set(name, text)
      remember(cache.blobs, name, text, MAX_CACHED.blobs)
    }
  }
  // `core` reads the files of a directory all at once: one read of git serves them all.
  const reading = new Map<string, Promise<void>>()
  const readDirectory = (directory: string, entries: readonly TreeEntry[]): Promise<void> => {
    let pending = reading.get(directory)
    if (!pending) {
      const markdown = entries.filter(
        (entry) => entry.kind === 'file' && entry.name.endsWith('.md')
      )
      pending = read(markdown.map((entry) => entry.object))
      reading.set(directory, pending)
    }
    return pending
  }

  return {
    get failed() {
      return failed
    },
    async list(path) {
      const entries = await entriesOf(path)
      return entries?.map((entry): DirectoryEntry => ({ name: entry.name, kind: entry.kind }))
    },
    async readText(path) {
      const cut = path.lastIndexOf('/')
      const directory = cut < 0 ? '' : path.slice(0, cut)
      const name = path.slice(cut + 1)
      const entries = await entriesOf(directory)
      const blob = entries?.find((entry) => entry.kind === 'file' && entry.name === name)?.object
      if (entries === undefined || blob === undefined) return undefined
      if (!known(blob) && name.endsWith('.md')) await readDirectory(directory, entries)
      // A file the directory's read did not cover: one that is not Markdown.
      if (!known(blob)) await read([blob])
      // `null`: too large to be an ADR, as good as not there.
      return blobs.get(blob) ?? undefined
    }
  }
}

/**
 * The Decision Logs as a commit has them, without the Components: Traces are not checked.
 * `undefined` when not everything could be read: what is incomplete is not kept either.
 */
async function repositoryAt(
  git: Git,
  sha: string,
  cache: BranchCache
): Promise<Repository | undefined> {
  let root = recall(cache.directories, sha)
  if (root === undefined) {
    root = await git.directoryTree(sha)
    if (root === undefined) return undefined
    remember(cache.directories, sha, root, MAX_CACHED.commits)
  }
  const key = root ?? ''
  const known = recall(cache.repositories, key)
  if (known) return known
  const directory = root
  const reading = (async (): Promise<Repository | undefined> => {
    const files = treeFileSystem(directory, git, cache)
    const repository = await openRepository(files)
    return files.failed ? undefined : repository
  })().catch(() => undefined)
  remember(cache.repositories, key, reading, MAX_CACHED.repositories)
  const repository = await reading
  if (repository === undefined && cache.repositories.get(key) === reading) {
    cache.repositories.delete(key)
  }
  return repository
}

/** At most this many branches are read at once. */
const PARALLEL = 4

/**
 * The ADRs that branches which are not checked out add or decide, against the working tree
 * (docs/plan-roadmap.md, part 8). A branch that does nothing to the ADRs is not listed; one
 * that is merged already does nothing. A branch git could not read is named in `unread`.
 */
export async function branchOverview(
  git: Git,
  here: Repository,
  cache: BranchCache
): Promise<BranchOverview> {
  const [head, listed, shallow] = await Promise.all([
    git.headCommit(),
    git.branches(),
    git.shallow()
  ])
  if (listed === undefined) return { branches: [], unread: [], failed: true }

  /** What a branch did; `undefined` when it does nothing, `null` when it could not be read. */
  const changesOn = async (branch: Branch): Promise<OtherBranch | null | undefined> => {
    // Before the first commit, nothing is in common with anything.
    let base: string | null | undefined = null
    if (head !== undefined) {
      const key = `${head} ${branch.sha}`
      base = recall(cache.bases, key)
      if (base === undefined) {
        base = await git.mergeBase(branch.sha)
        if (base !== undefined) remember(cache.bases, key, base, MAX_CACHED.commits)
      }
    }
    if (base === branch.sha) return undefined
    const [there, before] = await Promise.all([
      repositoryAt(git, branch.sha, cache),
      typeof base === 'string' ? repositoryAt(git, base, cache) : undefined
    ])
    if (!there) return null
    // A shallow clone may end before the merge base: who changed a Status cannot be told then.
    const against: MergeBase = before ?? (base === null && !shallow ? 'unrelated' : 'unknown')
    const adrs = branchChanges(there, here, against)
    return adrs.length > 0 ? { ...branch, adrs } : undefined
  }

  const results: (OtherBranch | null | undefined)[] = []
  for (let start = 0; start < listed.length; start += PARALLEL) {
    results.push(...(await Promise.all(listed.slice(start, start + PARALLEL).map(changesOn))))
  }
  return {
    branches: results.filter((result) => result !== null && result !== undefined),
    unread: listed
      .filter((_, position) => results[position] === null)
      .map((branch) => branch.names[0]!)
  }
}

/** An ADR as a commit has it, read from git: only an ADR of one of its Decision Logs. */
export async function branchAdr(
  git: Git,
  sha: string,
  path: string,
  cache: BranchCache
): Promise<Adr | undefined> {
  const repository = await repositoryAt(git, sha, cache)
  return repository?.logs.flatMap((log) => log.adrs).find((adr) => adr.path === path)
}

/**
 * What a new or renumbered ADR is warned about: other branches add an ADR with its number to
 * the same log, and whichever is merged second has to be renumbered. One warning for each of
 * those ADRs, with every branch that has it.
 */
export function numberWarnings(
  overview: BranchOverview,
  log: string,
  id: string,
  naming: 'sequential' | 'date'
): string[] {
  const prefix = /^\d+/.exec(id)?.[0]
  if (naming !== 'sequential' || prefix === undefined) return []
  const branches = overview.branches.map((branch) => ({
    name: branch.names[0]!,
    adrs: branch.adrs
  }))
  const number = Number(prefix)
  const byId = new Map<string, string[]>()
  for (const taken of numberTakenOn(branches, log, id, number)) {
    byId.set(taken.id, [...(byId.get(taken.id) ?? []), taken.branch])
  }
  return [...byId].map(([other, names]) => t.branches.numberTaken(number, names, other))
}
