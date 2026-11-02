import type { Adr } from '../adr/adr'
import type { Plan } from '../plan'
import { parseAdrTools } from '../foreign/adr-tools'
import { migrationOfMadr } from '../foreign/madr'
import { parseMadrList, readOf } from '../foreign/madr-list'
import type { FileSystem } from '@adr-tool/kernel'
import type { DecisionLog } from '../log/load'
import { MetadataNotWritableError, addToList, renameKey, setScalar } from '../metadata/write'
import { BACK_REFERENCE_KEYS, RELATION_TYPES } from '../relation'
import type { TextEdit } from '@adr-tool/kernel'
import { viewSource, type SourceView, type Span } from '../text/source'
import { Refusal, pendingFiles, plan, type PendingFiles } from './pending'
import { refuse, Warnings, type CoreSaid } from '../sentences'

const LIST_KEYS = [...RELATION_TYPES, ...Object.values(BACK_REFERENCE_KEYS)]

/**
 * Migration (docs/file-format.md, section 8): rewrite one ADR in a foreign format, or every
 * such ADR of a Decision Log when `id` is left out, into the tool's own format. What is
 * written is what was read: the Metadata of the ADR as the log shows it.
 */
export function planMigration(fs: FileSystem, log: DecisionLog, id?: string): Promise<Plan> {
  const warnings = new Warnings()
  const planned = plan(fs, async (pending) => {
    const asked = id === undefined ? undefined : log.adrs.find((adr) => adr.id === id)
    if (id !== undefined && !asked) refuse({ code: 'no-adr', values: { id } })
    if (asked && !asked.metadataWritable) {
      refuse({ code: 'migrate-unreadable', values: { adr: asked.id } })
    }
    if (asked && !asked.foreign) refuse({ code: 'own-format-already', values: { adr: asked.id } })
    const foreign = asked ? [asked] : log.adrs.filter((adr) => adr.foreign)
    if (foreign.length === 0) refuse({ code: 'nothing-foreign', values: {} })

    // MADR names a successor on the superseded ADR only; Migration writes it into both files.
    const successors = new Map<string, Adr>()
    for (const successor of log.adrs) {
      for (const superseded of successor.impliedSupersedes ?? []) {
        if (superseded !== successor.id) successors.set(superseded, successor)
      }
    }

    // An ADR and the successor it names go together, or not at all: a Back-reference without
    // the Relation behind it would be a Problem that Migration made.
    const leftOut = new Map<string, CoreSaid>()
    for (const adr of foreign) {
      const reason = await whyNot(fs, adr, successors.get(adr.id), asked === undefined)
      if (reason === undefined) continue
      if (asked) refuse(reason)
      leftOut.set(adr.id, reason)
    }
    // Leaving one out leaves out the one that names it as its successor, and so on.
    for (let settled = false; !settled;) {
      settled = true
      for (const adr of foreign) {
        const successor = successors.get(adr.id)
        if (leftOut.has(adr.id) || !successor || !leftOut.has(successor.id)) continue
        leftOut.set(adr.id, {
          code: 'waits-for-successor',
          values: { adr: adr.id, successor: successor.id }
        })
        settled = false
      }
    }

    const migrated = foreign.filter((adr) => !leftOut.has(adr.id))
    if (migrated.length === 0) {
      refuse({ code: 'nothing-migrated', values: { reasons: [...leftOut.values()] } })
    }
    warnings.push(...leftOut.values())
    for (const adr of migrated) await migrate(pending, log, adr, warnings)
    // The successors last: by now each of them has the frontmatter its own Migration gave it.
    for (const adr of migrated) await writeSuccessor(pending, adr, successors.get(adr.id))
  })
  return planned.then((result) => (result.ok ? { ...result, ...warnings.outcome() } : result))
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
): Promise<CoreSaid | undefined> {
  if (adr.noMigrationSaid !== undefined) {
    return { code: 'no-migration', values: { adr: adr.id, why: adr.noMigrationSaid } }
  }
  if (successor && !successor.metadataWritable) {
    return { code: 'successor-unreadable', values: { adr: adr.id, successor: successor.id } }
  }
  if (successor?.noMigrationSaid !== undefined) return undefined // the settling takes care of it
  if (successor?.foreign && !wholeLog) {
    return {
      code: 'successor-foreign',
      values: { adr: adr.id, successor: successor.id, format: successor.foreign }
    }
  }

  // Try it on its own first: a file the writer cannot write is named, and does not take the
  // Migration of all the others down with it.
  try {
    const trial = pendingFiles(fs)
    await migrate(trial, undefined, adr, new Warnings())
    await writeSuccessor(trial, adr, successor)
    return undefined
  } catch (error) {
    if (error instanceof Refusal || error instanceof MetadataNotWritableError) {
      return { code: 'cannot-migrate', values: { adr: adr.id, why: error.said ?? error.message } }
    }
    throw error
  }
}

async function writeSuccessor(
  pending: PendingFiles,
  adr: Adr,
  successor: Adr | undefined
): Promise<void> {
  if (!successor) return
  await pending.write(successor.path, (view) => addToList(view, 'supersedes', adr.id))
}

/** `log` is left out for a trial, which collects no warnings that anybody reads. */
async function migrate(
  pending: PendingFiles,
  log: DecisionLog | undefined,
  adr: Adr,
  warnings: Warnings
): Promise<void> {
  const { metadata } = adr
  if (adr.foreign === 'adr-tools') {
    await pending.write(adr.path, (view) => {
      const file = parseAdrTools(view)
      if (!file) refuse({ code: 'changed-on-disk', values: { adr: adr.id } })
      if (file.keeps.length > 0) {
        warnings.push({ code: 'status-section-stays', values: { adr: adr.id, keeps: file.keeps } })
        return [emptyFrontmatter(view, view.bodyStart)]
      }
      const removed = withoutSection(view, file.section)
      return [removed, emptyFrontmatter(view, removed.start === view.bodyStart ? removed.end : 0)]
    })
    // Always a Status, also `accepted`: it is what makes the file one of the tool's own.
    const status = metadata.status ?? metadata.rawStatus ?? 'accepted'
    await pending.write(adr.path, (view) => setScalar(view, 'status', status))
    if (metadata.created !== undefined) {
      const created = metadata.created
      await pending.write(adr.path, (view) => setScalar(view, 'created', created))
    }
  } else if (adr.foreign === 'madr-2') {
    await migrateListed(pending, adr, warnings)
  } else {
    const todo = migrationOfMadr(viewSource(await pending.read(adr.path)))
    if (todo.deciders) {
      await pending.write(adr.path, (view) => renameKey(view, 'deciders', 'decision-makers'))
    }
    if (!todo.status) return
    await pending.write(adr.path, (view) => setScalar(view, 'status', 'superseded'))
  }

  const lists = { ...metadata.relations, ...metadata.backReferences }
  for (const key of LIST_KEYS) {
    if (lists[key].length > 0) {
      await pending.write(adr.path, (view) => addToList(view, key, lists[key]))
    }
  }
  for (const written of metadata.backReferences['superseded-by']) {
    if (adr.foreign !== 'adr-tools' && log && !log.adrs.some((other) => other.id === written)) {
      warnings.push({ code: 'successor-not-in-log', values: { adr: adr.id, successor: written } })
    }
  }
}

/**
 * MADR 2 and log4brains: the items of the list under the title that the Metadata holds go,
 * and so does the Links section when it holds nothing else; then the Metadata is written.
 */
async function migrateListed(pending: PendingFiles, adr: Adr, warnings: Warnings): Promise<void> {
  const { metadata } = adr
  let renamesDeciders = false
  // What the items say that were read, to be written where they were not written before.
  let deciders: string | undefined
  let tags: readonly string[] | undefined
  await pending.write(adr.path, (view) => {
    const file = parseMadrList(view)
    if (!file) refuse({ code: 'changed-on-disk', values: { adr: adr.id } })
    const read = readOf(view, file, () => undefined)
    renamesDeciders = read.renamesDeciders
    if (file.deciders && read.read.includes(file.deciders)) deciders = file.deciders.value
    if (file.tags && read.read.includes(file.tags)) tags = read.tags
    if (file.status && read.rawStatus !== undefined) {
      warnings.push({
        code: 'listed-status-stays',
        values: { adr: adr.id, status: read.rawStatus }
      })
    }
    for (const [name, item] of [
      ['Status', file.status],
      ['Deciders', file.deciders],
      ['Tags', file.tags]
    ] as const) {
      if (item?.repeated) {
        warnings.push({ code: 'listed-twice', values: { adr: adr.id, item: name } })
      }
    }
    const going = read.read.filter((item) => !item.continued && !item.repeated)
    const spans: Span[] =
      going.length === file.list.items ? [file.list.whole] : going.map((item) => item.line)
    if (file.links && file.links.keeps.length === 0) {
      spans.push(file.links.section)
    } else if (file.links) {
      warnings.push({
        code: 'links-section-stays',
        values: { adr: adr.id, keeps: file.links.keeps }
      })
    }
    const edits = deletions(view, spans)
    if (!view.frontmatter) {
      const first = edits.find((edit) => edit.start === view.bodyStart)
      edits.push(emptyFrontmatter(view, first ? first.end : view.bodyStart))
    }
    return edits
  })
  // Always a Status, also `accepted`: it is what makes the file one of the tool's own.
  const status = metadata.status ?? metadata.rawStatus ?? 'accepted'
  await pending.write(adr.path, (view) => setScalar(view, 'status', status))
  if (renamesDeciders) {
    await pending.write(adr.path, (view) => renameKey(view, 'deciders', 'decision-makers'))
  }
  // One value, as it is written: the tool does not split what a person wrote.
  const named = deciders
  if (named !== undefined) {
    await pending.write(adr.path, (view) => setScalar(view, 'decision-makers', named))
  }
  const tagged = tags
  if (tagged !== undefined && tagged.length > 0) {
    await pending.write(adr.path, (view) => addToList(view, 'tags', tagged))
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
 * What `spans` take out of the text, joined where they meet: the list under the title and
 * the Links section after it may — and at the end of the file, the blank lines in front of
 * what goes go with it.
 */
function deletions(view: SourceView, spans: readonly Span[]): TextEdit[] {
  const joined: Span[] = []
  const join = (span: Span): void => {
    const last = joined.at(-1)
    if (last && span.start <= last.end)
      joined[joined.length - 1] = { ...last, end: Math.max(last.end, span.end) }
    else joined.push(span)
  }
  for (const span of [...spans].sort((one, other) => one.start - other.start)) join(span)
  const atEnd = joined.map((span) => withoutSection(view, span))
  joined.length = 0
  for (const edit of atEnd) join(edit)
  return joined.map((span) => ({ start: span.start, end: span.end, insert: '' }))
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
