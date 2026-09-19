import { FOREIGN_FORMAT_NAMES, type Adr } from '../adr/adr'
import type { Plan } from '../change/change-set'
import { parseAdrTools } from '../foreign/adr-tools'
import { migrationOfMadr } from '../foreign/madr'
import type { FileSystem } from '../fs/port'
import type { DecisionLog } from '../log/load'
import { addToList, renameKey, setScalar } from '../metadata/write'
import { BACK_REFERENCE_KEYS, RELATION_TYPES } from '../relation'
import type { TextEdit } from '../text/edit'
import { viewSource, type SourceView, type Span } from '../text/source'
import { Refusal, plan, type Drafts } from './draft'

const LIST_KEYS = [...RELATION_TYPES, ...Object.values(BACK_REFERENCE_KEYS)]

/** Why an ADR cannot be migrated right now; for a whole Decision Log it is left out, with these words. */
class NotYet extends Error {}

/**
 * Migration (docs/file-format.md, section 8): rewrite one ADR in a foreign format, or every
 * such ADR of a Decision Log when `id` is left out, into the tool's own format. What is
 * written is what was read: the Metadata of the ADR as the log shows it.
 */
export function planMigration(fs: FileSystem, log: DecisionLog, id?: string): Promise<Plan> {
  const warnings: string[] = []
  const planned = plan(fs, async (drafts) => {
    const asked = id === undefined ? undefined : log.adrs.find((adr) => adr.id === id)
    if (id !== undefined && !asked) throw new Refusal(`There is no ADR ${id} in this Decision Log.`)
    if (asked && !asked.foreign) {
      throw new Refusal(`${asked.id} is in the tool's own format already.`)
    }
    const foreign = asked ? [asked] : log.adrs.filter((adr) => adr.foreign)
    if (foreign.length === 0) {
      throw new Refusal('There is no ADR in a foreign format in this Decision Log.')
    }

    // An ADR and the successor it names go together, or not at all: a Back-reference without
    // the Relation behind it would be a Problem that Migration made.
    const leftOut = new Map<string, string>()
    for (const adr of foreign) {
      try {
        await requireMigratable(fs, log, adr, asked === undefined)
      } catch (error) {
        if (!(error instanceof NotYet)) throw error
        if (asked) throw new Refusal(error.message)
        leftOut.set(adr.id, error.message)
      }
    }
    // Leaving one out can leave the one that names it as its successor without it, and so on.
    for (let settled = false; !settled;) {
      settled = true
      for (const adr of foreign) {
        const successor = successorOf(log, adr)
        if (leftOut.has(adr.id) || !successor || !leftOut.has(successor.id)) continue
        leftOut.set(adr.id, `${adr.id} waits for its successor ${successor.id}.`)
        settled = false
      }
    }
    warnings.push(...leftOut.values())

    const migrated = foreign.filter((adr) => !leftOut.has(adr.id))
    if (migrated.length === 0)
      throw new Refusal(['Nothing can be migrated.', ...warnings].join(' '))
    for (const adr of migrated) await migrate(drafts, log, adr, warnings)
    // The successors last: by now each of them has the frontmatter its own Migration gave it.
    for (const adr of migrated) {
      const successor = successorOf(log, adr)
      if (successor?.impliedSupersedes?.includes(adr.id)) {
        await drafts.write(successor.path, (view) => addToList(view, 'supersedes', adr.id))
      }
    }
  })
  return planned.then((result) =>
    result.ok && warnings.length > 0 ? { ...result, warnings } : result
  )
}

/** The ADR that a file of MADR names as its successor, when the log has it. */
function successorOf(log: DecisionLog, adr: Adr): Adr | undefined {
  return log.adrs.find(
    (candidate) => candidate.id !== adr.id && candidate.impliedSupersedes?.includes(adr.id)
  )
}

async function requireMigratable(
  fs: FileSystem,
  log: DecisionLog,
  adr: Adr,
  wholeLog: boolean
): Promise<void> {
  const text = await fs.readText(adr.path)
  if (text === undefined) throw new Refusal(`${adr.path} no longer exists.`)
  if (adr.foreign === 'madr' && migrationOfMadr(viewSource(text)).listed) {
    throw new NotYet(
      `${adr.id} keeps its Status in the list under its title, as MADR 2 does. There is no Migration for that yet; it stays as it is.`
    )
  }
  const successor = successorOf(log, adr)
  if (!successor) return
  if (!successor.metadataWritable) {
    throw new NotYet(
      `${adr.id} is superseded by ${successor.id}, whose frontmatter cannot be read. Fix that file first.`
    )
  }
  if (successor.foreign && !wholeLog) {
    throw new NotYet(
      `${adr.id} is superseded by ${successor.id}, which is written in the format of ${FOREIGN_FORMAT_NAMES[successor.foreign]} itself. Migrate ${successor.id} first, or the whole Decision Log.`
    )
  }
}

async function migrate(
  drafts: Drafts,
  log: DecisionLog,
  adr: Adr,
  warnings: string[]
): Promise<void> {
  const { metadata } = adr
  if (adr.foreign === 'adr-tools') {
    await drafts.write(adr.path, (view) => {
      const file = parseAdrTools(view)
      if (!file) throw new Refusal(`${adr.id} changed on disk. Look at it again.`)
      if (file.keeps !== undefined) {
        warnings.push(
          `The Status section of ${adr.id} stays in its text: the Metadata does not hold "${file.keeps}".`
        )
      }
      return [
        ...(file.keeps === undefined ? [withoutSection(view, file.section)] : []),
        emptyFrontmatter(view)
      ]
    })
    // Always a Status, also `accepted`: it is what makes the file one of the tool's own.
    const status = metadata.status ?? metadata.rawStatus ?? 'accepted'
    await drafts.write(adr.path, (view) => setScalar(view, 'status', status))
    if (metadata.created !== undefined) {
      const created = metadata.created
      await drafts.write(adr.path, (view) => setScalar(view, 'created', created))
    }
  } else {
    const todo = migrationOfMadr(viewSource(await drafts.read(adr.path)))
    if (todo.deciders) {
      await drafts.write(adr.path, (view) => renameKey(view, 'deciders', 'decision-makers'))
    }
    if (!todo.status) return
    await drafts.write(adr.path, (view) => setScalar(view, 'status', 'superseded'))
  }

  const lists = { ...metadata.relations, ...metadata.backReferences }
  for (const key of LIST_KEYS) {
    for (const item of lists[key]) {
      await drafts.write(adr.path, (view) => addToList(view, key, item))
    }
  }
  for (const written of metadata.backReferences['superseded-by']) {
    if (adr.foreign === 'madr' && !log.adrs.some((other) => other.id === written)) {
      warnings.push(
        `${adr.id} names "${written}" as its successor, which is no ADR of this Decision Log. It is written as it is, and stays a Problem.`
      )
    }
  }
}

/** The two fence lines of a frontmatter that has no key yet, and a blank line between it and the text. */
function emptyFrontmatter(view: SourceView): TextEdit {
  const { text, eol, bodyStart: at } = view
  const blank = text.startsWith('\n', at) || text.startsWith('\r\n', at)
  return { start: at, end: at, insert: `---${eol}---${eol}${blank ? '' : eol}` }
}

/**
 * Take the Status section out, from its heading to the next heading. At the end of the file
 * the blank lines in front of it go as well: the file ends where its text ends.
 */
function withoutSection(view: SourceView, section: Span): TextEdit {
  const { text } = view
  let start = section.start
  if (section.end === text.length) {
    while (start > view.bodyStart && ' \t\r\n'.includes(text[start - 1]!)) start--
    start += text.startsWith('\r\n', start) ? 2 : text[start] === '\n' ? 1 : 0
  }
  return { start, end: section.end, insert: '' }
}
