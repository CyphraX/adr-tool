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
  const front =
    text === undefined ? undefined : /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?$/m.exec(text)
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
 * Renumber that git has not seen as a rename yet —, and, offered, the files of other ADRs with
 * uncommitted changes that it names or that name it. `head` reads a file as the last commit
 * has it, `read` as it is now.
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

  const before = await head(adr.path)
  const after = (await read(adr.path)) ?? ''
  const previous =
    tree.renamedFrom[adr.path] ??
    (before === undefined
      ? tree.deleted.find(
          (path) =>
            path !== adr.path &&
            posix.dirname(path) === posix.dirname(adr.path) &&
            slugOf(path) === slugOf(adr.path)
        )
      : undefined)
  const earlier = previous === undefined ? undefined : await head(previous)
  const file: FileChange =
    previous !== undefined
      ? { path: previous, renameTo: adr.path, before: earlier ?? '', after }
      : before === undefined
        ? { path: adr.path, before: '', after, creates: true }
        : { path: adr.path, before, after }

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
      const was = await head(candidate.path)
      related.push({
        file: {
          path: candidate.path,
          before: was ?? '',
          after: (await read(candidate.path)) ?? '',
          ...(was === undefined && { creates: true as const })
        },
        logPath: other.path,
        adrId: candidate.id,
        ...(candidate.title !== undefined && { title: candidate.title }),
        ...(candidate.number !== undefined && { number: candidate.number })
      })
    }
  }

  const taken = new Set([adr.path, ...(previous === undefined ? [] : [previous])])
  for (const one of related) taken.add(one.file.path)
  return {
    ok: true,
    files: [file],
    related,
    message: commitMessage(
      adr,
      previous === undefined ? before : earlier,
      after,
      previous === undefined ? undefined : posix.basename(previous).replace(/\.md$/i, '')
    ),
    others: tree.changed.filter((path) => !taken.has(path)).length
  }
}
