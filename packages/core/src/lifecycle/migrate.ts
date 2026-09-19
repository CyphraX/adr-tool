import { FOREIGN_FORMAT_NAMES, type Adr } from '../adr/adr'
import type { Plan } from '../change/change-set'
import { parseAdrTools } from '../foreign/adr-tools'
import { migrationOfMadr } from '../foreign/madr'
import type { FileSystem } from '../fs/port'
import type { DecisionLog } from '../log/load'
import { MetadataNotWritableError, addToList, renameKey, setScalar } from '../metadata/write'
import { BACK_REFERENCE_KEYS, RELATION_TYPES } from '../relation'
import type { TextEdit } from '../text/edit'
import { viewSource, type SourceView, type Span } from '../text/source'
import { Drafts, Refusal, plan } from './draft'

const LIST_KEYS = [...RELATION_TYPES, ...Object.values(BACK_REFERENCE_KEYS)]

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
    if (asked && !asked.metadataWritable) {
      throw new Refusal(
        `The frontmatter of ${asked.id} cannot be read, so nobody can tell which format it is in. Fix it first.`
      )
    }
    if (asked && !asked.foreign) {
      throw new Refusal(`${asked.id} is in the tool's own format already.`)
    }
    const foreign = asked ? [asked] : log.adrs.filter((adr) => adr.foreign)
    if (foreign.length === 0) {
      throw new Refusal('There is no ADR in a foreign format in this Decision Log.')
    }

    // MADR names a successor on the superseded ADR only; Migration writes it into both files.
    const successors = new Map<string, Adr>()
    for (const successor of log.adrs) {
      for (const superseded of successor.impliedSupersedes ?? []) {
        if (superseded !== successor.id) successors.set(superseded, successor)
      }
    }

    // An ADR and the successor it names go together, or not at all: a Back-reference without
    // the Relation behind it would be a Problem that Migration made.
    const leftOut = new Map<string, string>()
    for (const adr of foreign) {
      const reason = await whyNot(fs, adr, successors.get(adr.id), asked === undefined)
      if (reason === undefined) continue
      if (asked) throw new Refusal(reason)
      leftOut.set(adr.id, reason)
    }
    // Leaving one out leaves out the one that names it as its successor, and so on.
    for (let settled = false; !settled;) {
      settled = true
      for (const adr of foreign) {
        const successor = successors.get(adr.id)
        if (leftOut.has(adr.id) || !successor || !leftOut.has(successor.id)) continue
        leftOut.set(adr.id, `${adr.id} waits for its successor ${successor.id}.`)
        settled = false
      }
    }

    const migrated = foreign.filter((adr) => !leftOut.has(adr.id))
    if (migrated.length === 0) {
      throw new Refusal(['Nothing can be migrated.', ...leftOut.values()].join(' '))
    }
    warnings.push(...leftOut.values())
    for (const adr of migrated) await migrate(drafts, log, adr, warnings)
    // The successors last: by now each of them has the frontmatter its own Migration gave it.
    for (const adr of migrated) await writeSuccessor(drafts, adr, successors.get(adr.id))
  })
  return planned.then((result) =>
    result.ok && warnings.length > 0 ? { ...result, warnings } : result
  )
}

/**
 * Why an ADR cannot be migrated right now, in words that name it; `undefined` when it can.
 * Asked for a whole Decision Log, such an ADR is left out, with these words.
 */
async function whyNot(
  fs: FileSystem,
  adr: Adr,
  successor: Adr | undefined,
  wholeLog: boolean
): Promise<string | undefined> {
  if (adr.noMigration !== undefined) return `${adr.id} ${adr.noMigration}`
  if (successor && !successor.metadataWritable) {
    return `${adr.id} is superseded by ${successor.id}, whose frontmatter cannot be read. Fix that file first.`
  }
  if (successor?.noMigration !== undefined) return undefined // the settling takes care of it
  if (successor?.foreign && !wholeLog) {
    return `${adr.id} is superseded by ${successor.id}, which is written in the format of ${FOREIGN_FORMAT_NAMES[successor.foreign]} itself. Migrate ${successor.id} first, or the whole Decision Log.`
  }

  // Try it on its own first: a file the writer cannot write is named, and does not take the
  // Migration of all the others down with it.
  try {
    const trial = new Drafts(fs)
    await migrate(trial, undefined, adr, [])
    await writeSuccessor(trial, adr, successor)
    return undefined
  } catch (error) {
    if (error instanceof Refusal || error instanceof MetadataNotWritableError) {
      return `${adr.id} cannot be migrated: ${error.message}`
    }
    throw error
  }
}

async function writeSuccessor(drafts: Drafts, adr: Adr, successor: Adr | undefined): Promise<void> {
  if (!successor) return
  await drafts.write(successor.path, (view) => addToList(view, 'supersedes', adr.id))
}

/** `log` is left out for a trial, which collects no warnings that anybody reads. */
async function migrate(
  drafts: Drafts,
  log: DecisionLog | undefined,
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
        return [emptyFrontmatter(view, view.bodyStart)]
      }
      const removed = withoutSection(view, file.section)
      return [removed, emptyFrontmatter(view, removed.start === view.bodyStart ? removed.end : 0)]
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
    if (lists[key].length > 0) {
      await drafts.write(adr.path, (view) => addToList(view, key, lists[key]))
    }
  }
  for (const written of metadata.backReferences['superseded-by']) {
    if (adr.foreign === 'madr' && log && !log.adrs.some((other) => other.id === written)) {
      warnings.push(
        `${adr.id} names "${written}" as its successor, which is no ADR of this Decision Log. It is written as it is, and stays a Problem.`
      )
    }
  }
}

/**
 * The two fence lines of a frontmatter that has no key yet, and a blank line between it and
 * the text — unless the text begins with one, or there is no text. `textAt` is where the
 * text begins once the Status section is gone.
 */
function emptyFrontmatter(view: SourceView, textAt: number): TextEdit {
  const { text, eol, bodyStart: at } = view
  const from = Math.max(textAt, at)
  const blank = from >= text.length || text.startsWith('\n', from) || text.startsWith('\r\n', from)
  return { start: at, end: at, insert: `---${eol}---${eol}${blank ? '' : eol}` }
}

/**
 * Take the Status section out, from its heading to the next heading. At the end of the file
 * the blank lines in front of it go as well — whole lines, never the end of a line of text.
 */
function withoutSection(view: SourceView, section: Span): TextEdit {
  const { text, bodyStart } = view
  let start = section.start
  while (section.end === text.length && start > bodyStart) {
    const before = start < 2 ? -1 : text.lastIndexOf('\n', start - 2)
    const line = Math.max(before + 1, bodyStart)
    if (text.slice(line, start).trim() !== '') break
    start = line
  }
  return { start, end: section.end, insert: '' }
}
