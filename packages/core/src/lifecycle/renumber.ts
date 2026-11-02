import type { Adr } from '../adr/adr'
import type { Plan } from '../plan'
import { namesNumber } from '../foreign/madr'
import { joinPath, type FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { nextPrefix } from '../log/new-id'
import { replaceInList } from '../metadata/write'
import { BACK_REFERENCE_KEYS, RELATION_TYPES } from '../relation'
import { normalReference, qualified } from '../relations/reference'
import { titleOf } from '../text/title'
import { Refusal, plan } from './pending'
import { requireOwnFormat } from './rules'

/** Every Metadata key whose items are IDs of other ADRs. */
const NAMING_KEYS = [...RELATION_TYPES, ...Object.values(BACK_REFERENCE_KEYS)]
type NamingKey = (typeof NAMING_KEYS)[number]

/**
 * Where `adr`, of the log `from`, names the ADR `reference` — as that log names it —, and how
 * it writes it there: `0002-b`, or `docs/adr/0002-b` in the log `docs/adr` itself.
 */
function naming(
  adr: Pick<Adr, 'metadata'>,
  from: string,
  reference: string
): { key: NamingKey; written: string }[] {
  const lists = { ...adr.metadata.relations, ...adr.metadata.backReferences }
  return NAMING_KEYS.flatMap((key) =>
    lists[key]
      .filter((item) => normalReference(from, item) === reference)
      .map((written) => ({ key, written }))
  )
}

/** The same item, naming the ADR `to` where it named `from`: the ID is its last part. */
const withId = (written: string, from: string, to: string): string =>
  written.slice(0, written.length - from.length) + to

/** Whether `text` mentions `reference` as a whole, not as a part of a longer name. */
function mentions(text: string | undefined, reference: string): boolean {
  if (text === undefined) return false
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w-])`).test(text)
}

/**
 * Renumber an ADR that shares its number with another one (docs/file-format.md, section 5):
 * its file gets the next number of the log, and every Relation and Back-reference that names
 * the old ID — in this log, and as `<log>/<ID>` in the others — is rewritten where it stands. No body is touched; the ADRs
 * whose text mentions the old ID come back as warnings.
 */
export function planRenumber(fs: FileSystem, log: DecisionLog, id: string): Promise<Plan> {
  let renamed: { from: string; to: string } | undefined
  const warnings: string[] = []

  const planned = plan(fs, async (pending) => {
    const adr = log.adrs.find((candidate) => candidate.id === id)
    if (!adr) throw new Refusal(`There is no ADR ${id} in this Decision Log.`)
    if (log.naming !== 'sequential' || adr.number === undefined) {
      throw new Refusal('Only an ADR of a sequential Decision Log has a number.')
    }
    if (!log.adrs.some((other) => other.id !== id && other.number === adr.number)) {
      throw new Refusal(
        `Renumber is for an ADR that shares its number with another one. ${id} has its number to itself, and its ID stays as it is.`
      )
    }
    const own = naming(adr, log.path, id)
    if (own.length > 0) {
      throw new Refusal(
        `${id} names itself in ${own[0]!.key}. Remove that before it is renumbered.`
      )
    }

    const digits = /^\d+/.exec(id)![0]
    const to = nextPrefix(log, '') + id.slice(digits.length)
    await pending.rename(adr.path, joinPath(log.path, `${to}.md`))

    for (const other of log.adrs) {
      if (other.id === id) continue
      if (!other.metadataWritable) {
        // Nobody can tell what this file says about the old ID, so nothing may be left behind in it.
        if (mentions(await fs.readText(other.path), id)) {
          throw new Refusal(
            `The frontmatter of ${other.id} cannot be read, and the file mentions ${id}. Fix it before ${id} is renumbered.`
          )
        }
        continue
      }
      // A foreign file keeps its Relations in its text, and the tool does not write that.
      // MADR 4 names an ADR by its number: the one that is about to be free, or to be taken.
      for (const number of [adr.number, Number(/^\d+/.exec(to)![0])]) {
        if (namesNumber(other, number)) {
          requireOwnFormat(
            other,
            ` It names its successor by the number ${number}, which would mean another ADR afterwards. Migrate it first.`
          )
        }
      }
      const items = naming(other, log.path, id)
      if (other.foreign && (items.length > 0 || mentions(await fs.readText(other.path), id))) {
        requireOwnFormat(other, ` It mentions ${id}: migrate it first, or renumber the other ADR.`)
      }
      for (const { key, written } of items) {
        await pending.write(other.path, (view) =>
          replaceInList(view, key, written, withId(written, id, to))
        )
      }
    }

    // The other logs of the repository name it with this log's directory.
    const before = qualified(log.path, id)
    for (const guest of log.guests ?? []) {
      const items = naming(guest, guest.log, before)
      if (!guest.metadataWritable) {
        if (mentions(await fs.readText(guest.path), before)) {
          throw new Refusal(
            `The frontmatter of ${guest.reference} cannot be read, and the file mentions ${before}. Fix it before ${id} is renumbered.`
          )
        }
        continue
      }
      if (guest.foreign && items.length > 0) {
        requireOwnFormat(guest, ` It mentions ${before}: migrate it first.`)
      }
      for (const { key, written } of items) {
        await pending.write(guest.path, (view) =>
          replaceInList(view, key, written, withId(written, id, to))
        )
      }
    }

    if (titleOf(adr.body) !== titleOf(adr.body, adr.number)) {
      warnings.push(
        `The heading of ${id} carries the number ${adr.number}. It stays as it is, and is shown as part of the title from now on.`
      )
    }
    for (const candidate of log.adrs) {
      if (candidate.body.includes(id)) warnings.push(`${candidate.id} mentions ${id} in its text.`)
    }
    renamed = { from: id, to }
  })

  return planned.then((result) =>
    result.ok && renamed ? { ...result, renamed, ...(warnings.length > 0 && { warnings }) } : result
  )
}
