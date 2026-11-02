import {
  branchChanges,
  type Adr,
  numberTakenOn,
  openRepository,
  type DirectoryEntry,
  type FileSystem,
  type Repository
} from '@adr-tool/core'
import type { BranchOverview, OtherBranch } from '../shared/ipc'
import type { Git, TreeFile } from './git'
import { t } from './strings'

/**
 * A commit's files below the opened directory, as `core` reads a repository: read-only, and
 * read from git without checking anything out. Reading a file reads the files of its
 * directory with it in one go, which is how `core` reads a Decision Log; blobs are shared by
 * every commit that has them.
 */
export function treeFileSystem(
  files: readonly TreeFile[],
  blobs: Map<string, string>,
  read: (names: readonly string[]) => Promise<Map<string, string>>
): FileSystem {
  const byPath = new Map(files.map((file) => [file.path, file.blob]))
  const directories = new Map<string, Map<string, DirectoryEntry>>()
  for (const { path } of files) {
    const parts = path.split('/')
    for (let depth = 0; depth < parts.length; depth++) {
      const directory = parts.slice(0, depth).join('/')
      const name = parts[depth]!
      const entries = directories.get(directory) ?? new Map<string, DirectoryEntry>()
      if (!entries.has(name)) {
        entries.set(name, { name, kind: depth === parts.length - 1 ? 'file' : 'directory' })
      }
      directories.set(directory, entries)
    }
  }
  const directoryOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')))
  // `core` reads the files of a directory all at once: one read of git serves them all.
  const reading = new Map<string, Promise<void>>()
  const readDirectory = (directory: string, blob: string): Promise<void> => {
    const pending = reading.get(directory)
    if (pending) return pending
    const wanted = new Set(
      files
        .filter((file) => directoryOf(file.path) === directory && file.path.endsWith('.md'))
        .map((file) => file.blob)
    )
    wanted.add(blob)
    const done = read([...wanted].filter((name) => !blobs.has(name))).then((texts) => {
      for (const [name, text] of texts) blobs.set(name, text)
    })
    reading.set(directory, done)
    return done
  }

  return {
    async list(path) {
      const entries = directories.get(path)
      return entries && [...entries.values()]
    },
    async readText(path) {
      const blob = byPath.get(path)
      if (blob === undefined) return undefined
      if (!blobs.has(blob)) await readDirectory(directoryOf(path), blob)
      // A file the directory's read did not cover: one that is not Markdown.
      if (!blobs.has(blob)) {
        for (const [name, text] of await read([blob])) blobs.set(name, text)
      }
      return blobs.get(blob)
    }
  }
}

/** What is read once and kept: a commit's Decision Logs do not change, nor does a blob. */
export interface BranchCache {
  readonly repositories: Map<string, Repository>
  readonly blobs: Map<string, string>
}

/** More commits than this, and the cache starts afresh. */
const MAX_CACHED_COMMITS = 200

export function branchCache(): BranchCache {
  return { repositories: new Map(), blobs: new Map() }
}

/** The Decision Logs as a commit has them, without the Components: Traces are not checked. */
async function repositoryAt(
  git: Git,
  sha: string,
  cache: BranchCache
): Promise<Repository | undefined> {
  const known = cache.repositories.get(sha)
  if (known) return known
  const files = await git.tree(sha)
  if (!files) return undefined
  const repository = await openRepository(
    treeFileSystem(files, cache.blobs, (names) => git.blobs(names))
  )
  if (cache.repositories.size >= MAX_CACHED_COMMITS) {
    cache.repositories.clear()
    cache.blobs.clear()
  }
  cache.repositories.set(sha, repository)
  return repository
}

/**
 * The ADRs that branches which are not checked out add or decide, against the working tree
 * (docs/plan-roadmap.md, part 8). A branch that does nothing to the ADRs is not listed; one
 * that is merged already does nothing.
 */
export async function branchOverview(
  git: Git,
  here: Repository,
  cache: BranchCache
): Promise<BranchOverview> {
  const branches: OtherBranch[] = []
  for (const branch of await git.branches()) {
    const base = await git.mergeBase(branch.sha)
    if (base === branch.sha) continue
    const [there, before] = await Promise.all([
      repositoryAt(git, branch.sha, cache),
      base === undefined ? undefined : repositoryAt(git, base, cache)
    ])
    if (!there) continue
    const adrs = branchChanges(there, here, before)
    if (adrs.length > 0) branches.push({ ...branch, adrs })
  }
  return { branches }
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
 * the same log, and whichever is merged second has to be renumbered.
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
  return numberTakenOn(branches, log, id, number).map((taken) =>
    t.branches.numberTaken(number, taken.branch, taken.id)
  )
}
