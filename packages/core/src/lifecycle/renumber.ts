import type { Adr } from '../adr/adr'
import type { Plan } from '../change/change-set'
import { namesNumber } from '../foreign/madr'
import { joinPath, type FileSystem } from '../fs/port'
import type { DecisionLog } from '../log/load'
import { nextPrefix } from '../log/new-id'
import { replaceInList } from '../metadata/write'
import { BACK_REFERENCE_KEYS, RELATION_TYPES } from '../relation'
import { titleOf } from '../text/title'
import { Refusal, plan } from './draft'
import { requireOwnFormat } from './rules'

/** Every Metadata key whose items are IDs of other ADRs. */
const NAMING_KEYS = [...RELATION_TYPES, ...Object.values(BACK_REFERENCE_KEYS)]
type NamingKey = (typeof NAMING_KEYS)[number]

/** The keys under which `adr` names the ADR `id`. */
function namingKeys(adr: Adr, id: string): NamingKey[] {
  const lists = { ...adr.metadata.relations, ...adr.metadata.backReferences }
  return NAMING_KEYS.filter((key) => lists[key].includes(id))
}

/**
 * Renumber an ADR that shares its number with another one (docs/file-format.md, section 5):
 * its file gets the next number of the log, and every Relation and Back-reference of the
 * log that names the old ID is rewritten where it stands. No body is touched; the ADRs
 * whose text mentions the old ID come back as warnings.
 */
export function planRenumber(fs: FileSystem, log: DecisionLog, id: string): Promise<Plan> {
  let renamed: { from: string; to: string } | undefined
  const warnings: string[] = []

  const planned = plan(fs, async (drafts) => {
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
    const own = namingKeys(adr, id)
    if (own.length > 0) {
      throw new Refusal(`${id} names itself in ${own[0]}. Remove that before it is renumbered.`)
    }

    const digits = /^\d+/.exec(id)![0]
    const to = nextPrefix(log, '') + id.slice(digits.length)
    await drafts.rename(adr.path, joinPath(log.path, `${to}.md`))

    for (const other of log.adrs) {
      if (other.id === id) continue
      if (!other.metadataWritable) {
        // Nobody can tell what this file says about the old ID, so nothing may be left behind in it.
        if ((await fs.readText(other.path))?.includes(id)) {
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
            ` It names its successor by the number ${number}, which would mean another ADR afterwards. Change that in the file first.`
          )
        }
      }
      const mentions = namingKeys(other, id).length > 0
      if (other.foreign && (mentions || (await fs.readText(other.path))?.includes(id))) {
        requireOwnFormat(
          other,
          ` It mentions ${id}: renumber the other ADR, or change the file by hand.`
        )
      }
      for (const key of namingKeys(other, id)) {
        await drafts.write(other.path, (view) => replaceInList(view, key, id, to))
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
