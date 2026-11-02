import {
  absoluteReference,
  type Adr,
  type DecisionLog,
  type FileChange,
  type Repository
} from '@adr-tool/core'
import { posix } from 'node:path'
import type { CommitPlan, RelatedChange } from '../shared/ipc'
import type { WorkingTree } from './git'
import { t } from './strings'

/** An ADR as a commit message names it: by the number its file name begins with, or its day. */
function prefixOf(adr: Pick<Adr, 'id' | 'number'>): string {
  const digits = /^\d+/.exec(adr.id)?.[0] ?? adr.id
  if (adr.number !== undefined || digits.length !== 8) return digits
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

/** The Status a file's frontmatter writes, as it is written; nothing for a file without one. */
function statusIn(text: string | undefined): string | undefined {
  // Frontmatter opens the file; a `---` block further down is part of the body.
  const front =
    text === undefined ? undefined : /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  return front ? /^status:[ \t]*["']?([A-Za-z]+)/m.exec(front[1]!)?.[1]?.toLowerCase() : undefined
}

const VERB: Readonly<Record<string, string>> = {
  accepted: 'Accept',
  rejected: 'Reject',
  deprecated: 'Deprecate'
}

/**
 * The message a commit of an ADR proposes: what happened to it, from its file as the last
 * commit has it (`before`, none for a new one) and as it is now. The person can change it.
 */
export function commitMessage(
  adr: Pick<Adr, 'id' | 'number' | 'title'>,
  before: string | undefined,
  after: string,
  renumberedFrom?: string
): string {
  const prefix = prefixOf(adr)
  const title = adr.title ?? adr.id
  if (renumberedFrom !== undefined) {
    return `Renumber ADR ${prefixOf({ id: renumberedFrom, number: adr.number })} to ${prefix}: ${title}`
  }
  const now = statusIn(after)
  if (before === undefined) {
    return `${now === 'proposed' ? 'Propose' : 'Add'} ADR ${prefix}: ${title}`
  }
  const then = statusIn(before)
  if (now !== then && now === 'superseded') return `Mark ADR ${prefix} as superseded: ${title}`
  const verb = now !== then && now !== undefined ? VERB[now] : undefined
  return `${verb ?? 'Update'} ADR ${prefix}: ${title}`
}

/** The slug of an ID: what follows the number or the day. */
const slugOf = (path: string): string => posix.basename(path).replace(/^\d+-/, '')

/**
 * Whether two texts are the same file, one renamed into the other: at least half their lines
 * that say something are the same, much as git judges a rename. A Renumber changes a line or
 * two, if any.
 */
function similar(a: string, b: string): boolean {
  const lines = (text: string): string[] => text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const left = lines(a)
  const right = lines(b)
  const count = new Map<string, number>()
  for (const line of left) count.set(line, (count.get(line) ?? 0) + 1)
  let shared = 0
  for (const line of right) {
    const left = count.get(line) ?? 0
    if (left > 0) {
      shared++
      count.set(line, left - 1)
    }
  }
  return shared * 2 >= Math.max(left.length, right.length)
}

/**
 * A file as the last commit has it, with the line breaks it has on disk: where git stores LF
 * and checks out CRLF (`core.autocrlf`), every line would seem changed.
 */
function asOnDisk(stored: string | undefined, onDisk: string): string | undefined {
  if (stored === undefined || stored.includes('\r') || !onDisk.includes('\r\n')) return stored
  return stored.replaceAll('\n', '\r\n')
}

/** Every ADR an ADR names in its Relations and Back-references, as `<log>\0<ID>`. */
function named(adr: Adr, log: string): Set<string> {
  const lists = { ...adr.metadata.relations, ...adr.metadata.backReferences }
  return new Set(
    Object.values(lists)
      .flat()
      .map((item) => {
        const { log: where, id } = absoluteReference(log, item)
        return `${where}\0${id}`
      })
  )
}

export type CommitPlanOf =
  | ({ readonly ok: true } & Omit<CommitPlan, 'planId'>)
  | { readonly ok: false; readonly reason: string }

/**
 * What a commit of one ADR takes (docs/adr/0012-…): its file — with the file it had before a
 * Renumber —, and, offered, the files of other ADRs with uncommitted changes that it names or
 * that name it, each with the file it had before a Renumber too. `head` reads a file as the
 * last commit has it, `read` as it is now.
 */
export async function planCommitOf(input: {
  repository: Repository
  logPath: string
  adrId: string
  tree: WorkingTree
  head: (path: string) => Promise<string | undefined>
  read: (path: string) => Promise<string | undefined>
}): Promise<CommitPlanOf> {
  const { repository, logPath, adrId, tree, head, read } = input
  const log = repository.logs.find((one) => one.path === logPath)
  const adr = log?.adrs.find((one) => one.id === adrId)
  if (!log || !adr) return { ok: false, reason: t.commit.noAdr(adrId) }
  if (!tree.changed.includes(adr.path)) return { ok: false, reason: t.commit.nothing(adrId) }

  /**
   * A file as a commit of it takes it: with the file it had before a Renumber — one git
   * already sees as a rename, or a deleted file of the same slug and much the same text that
   * is gone from the disk —, as a new file, or as a changed one.
   */
  const changeOf = async (path: string): Promise<FileChange> => {
    const after = (await read(path)) ?? ''
    const before = asOnDisk(await head(path), after)
    if (before !== undefined) return { path, before, after }
    const staged = tree.renamedFrom[path]
    const candidates =
      staged !== undefined
        ? [staged]
        : tree.deleted.filter(
            (one) =>
              one !== path &&
              posix.dirname(one) === posix.dirname(path) &&
              slugOf(one) === slugOf(path)
          )
    for (const candidate of candidates) {
      // Still on disk, it was not moved.
      if ((await read(candidate)) !== undefined) continue
      const earlier = asOnDisk(await head(candidate), after)
      if (earlier === undefined) continue
      if (staged !== undefined || similar(earlier, after)) {
        return { path: candidate, renameTo: path, before: earlier, after }
      }
    }
    return { path, before: '', after, creates: true }
  }

  const file = await changeOf(adr.path)
  const previous = file.renameTo === undefined ? undefined : file.path

  // What it names, and what names it: Accept wrote a Back-reference into the other file.
  const self = `${log.path}\0${adr.id}`
  const names = named(adr, log.path)
  const changed = new Set(tree.changed)
  const related: RelatedChange[] = []
  const others: readonly DecisionLog[] = repository.logs
  for (const other of others) {
    for (const candidate of other.adrs) {
      if (candidate.path === adr.path || !changed.has(candidate.path)) continue
      const linked =
        names.has(`${other.path}\0${candidate.id}`) || named(candidate, other.path).has(self)
      if (!linked) continue
      related.push({
        file: await changeOf(candidate.path),
        logPath: other.path,
        adrId: candidate.id,
        ...(candidate.title !== undefined && { title: candidate.title }),
        ...(candidate.number !== undefined && { number: candidate.number })
      })
    }
  }

  // Every file a commit can take, so that what is left is the rest of the working tree.
  const taken = new Set<string>()
  for (const one of [file, ...related.map((one) => one.file)]) {
    taken.add(one.path)
    if (one.renameTo !== undefined) taken.add(one.renameTo)
  }
  return {
    ok: true,
    files: [file],
    related,
    message: commitMessage(
      adr,
      file.creates ? undefined : file.before,
      file.after,
      previous === undefined ? undefined : posix.basename(previous).replace(/\.md$/i, '')
    ),
    others: tree.changed.filter((path) => !taken.has(path)).length,
    branch: tree.branch
  }
}
