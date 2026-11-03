import {
  joinPath,
  normalizePath,
  openConfig,
  PendingFiles,
  Refusal,
  isDay,
  type FileSystem,
  type Git,
  type Plan,
  type TextEdit
} from '@adr-tool/kernel'
import { isScalar } from 'yaml'
import { linesText, readAnnotation, type Anchor, type AnnotationType } from './annotation'
import type { Found } from './find'
import {
  addToList,
  asText,
  fillEmptyKey,
  formatScalar,
  frontmatterIn,
  insertKey,
  removeFromList,
  removeKey,
  setValue
} from './frontmatter'
import { saidOf, type ReviewProblem } from './problems'
import { isAnnotationId, readLocation } from './read'
import { refuse, type ReviewSaid } from './sentences'
import { slugOf } from './slug'
import { citedAdr, type AdrReference } from './traces'
import { eolOf, lineAt, quoteBlock, sourceLines, viewFile, type Eol, type FileView } from './text'

/** Run the planning of an operation; a Refusal becomes the reason why it cannot be done. */
async function planning<Outcome extends object>(
  fs: FileSystem,
  build: (pending: PendingFiles<FileView>) => Promise<Outcome>
): Promise<Plan<Outcome>> {
  const pending = new PendingFiles(fs, viewFile)
  try {
    const outcome = await build(pending)
    return { ok: true, changeSet: pending.changeSet(), ...outcome }
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, reason: error.message, ...(error.said && { said: error.said }) }
    }
    throw error
  }
}

/**
 * The directory of the Annotations, or the refusal that it cannot be used: `.arch/config.yml`
 * cannot be read, or its key `annotations` names no directory inside the repository.
 */
async function directoryOf(fs: FileSystem): Promise<string> {
  const config = await openConfig(fs)
  const where = readLocation(config)
  if (where.directory === undefined) {
    const detail = config.readable ? saidOf(where.problems[0]!) : config.problem.said
    refuse({ code: 'annotations-unavailable', values: { detail } })
  }
  return where.directory
}

/** The file of an Annotation by its ID, which must be there. */
async function annotationFile(fs: FileSystem, id: string): Promise<{ path: string; text: string }> {
  const directory = await directoryOf(fs)
  const path = joinPath(directory, `${id}.md`)
  const text = isAnnotationId(id) ? await fs.readText(path) : undefined
  if (text === undefined) refuse({ code: 'no-annotation', values: { id } })
  return { path, text }
}

/** The extension of a file, as the word after a fence that names its language. */
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  return /^[a-z0-9]+$/.test(extension) ? extension : ''
}

/** A fence that none of the quoted lines can close: longer than any run of backticks in them. */
function fenceFor(quote: readonly string[]): string {
  const longest = Math.max(
    0,
    ...quote.flatMap((line) => line.match(/`+/g) ?? []).map((run) => run.length)
  )
  return '`'.repeat(Math.max(3, longest + 1))
}

/** Whether `line` would close a block opened by `fence`. */
const closes = (fence: string, line: string): boolean =>
  new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(line)

/** The lines of a new Annotation's quote block, with the line ending of its file. */
const quoteLines = (anchor: Anchor, eol: Eol): string => {
  const fence = fenceFor(anchor.quote)
  return [`${fence}${extensionOf(anchor.path)}`, ...anchor.quote, fence]
    .map((line) => line + eol)
    .join('')
}

/** Text with its line breaks in the file's line ending, ending in one. */
const inEol = (text: string, eol: Eol): string => {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  return lines === '' ? '' : `${lines.replaceAll('\n', eol)}${eol}`
}

/** The line ending most of these texts have; LF when there are none, or on a tie. */
const mostOf = (texts: readonly string[]): Eol =>
  texts.filter((text) => eolOf(text) === '\r\n').length * 2 > texts.length ? '\r\n' : '\n'

/** Lines of a Source File as a person selects them: the first and the last, counted from 1. */
export interface SelectedLines {
  readonly path: string
  readonly start: number
  readonly end: number
}

/** Quoted lines must be lines: a carriage return that ends no line would end one in the file. */
function checkQuote(anchor: Anchor): void {
  if (anchor.quote.some((line) => /[\r\n]/.test(line))) {
    refuse({
      code: 'carriage-return-in-lines',
      values: { path: anchor.path, lines: linesText(anchor) }
    })
  }
}

/**
 * The Anchor of lines of a Source File as they are on disk now, with the commit HEAD points at:
 * what an Annotation is created with, or attached again to.
 */
export async function anchorAt(
  fs: FileSystem,
  git: Pick<Git, 'headCommit'>,
  path: string,
  start: number,
  end: number
): Promise<Anchor> {
  const lines = linesText({ start, end })
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    refuse({ code: 'no-lines', values: { lines } })
  }
  const source = normalizePath(path)
  const text = source ? await fs.readText(source) : undefined
  if (source === undefined || source === '' || text === undefined) {
    refuse({ code: 'no-source-file', values: { path } })
  }
  const all = sourceLines(text)
  if (end > all.length)
    refuse({ code: 'lines-outside', values: { path, lines, count: all.length } })
  const commit = await git.headCommit()
  const anchor = { path: source, start, end, quote: all.slice(start - 1, end) }
  checkQuote(anchor)
  return { ...anchor, ...(commit && { commit }) }
}

/** The ADRs an Annotation is to cite, each one that names exactly one ADR. */
function checkCites(cites: readonly string[], adrs: readonly AdrReference[]): void {
  for (const adr of cites) {
    const cited = citedAdr(adr, adrs)
    if (cited.ambiguous)
      refuse({ code: 'adr-in-several-logs', values: { adr, candidates: cited.ambiguous } })
    if (!cited.found) refuse({ code: 'no-such-adr', values: { adr } })
  }
}

export interface NewAnnotation {
  readonly type: AnnotationType
  readonly author: string
  /** `YYYY-MM-DD`. */
  readonly date: string
  /** The lines it is about: read from the disk when it is planned, with HEAD's commit. */
  readonly lines: SelectedLines
  /** Markdown. */
  readonly text: string
  /** ADRs, as `cites` names them. */
  readonly cites?: readonly string[]
}

/**
 * Plan a new Annotation, a file of its own (docs/review-format.md, section 5). Its Anchor is
 * read from the disk as it is now; its ID is the day and a slug of its text; `adrs` are the
 * ADRs of the repository, which `cites` is checked against.
 */
export function planAnnotation(
  fs: FileSystem,
  git: Pick<Git, 'headCommit'>,
  annotation: NewAnnotation,
  adrs: readonly AdrReference[] = []
): Promise<Plan<{ readonly id: string }>> {
  return planning(fs, async (pending) => {
    const author = annotation.author.trim()
    if (author === '') refuse({ code: 'annotation-needs-author', values: {} })
    if (!isDay(annotation.date)) refuse({ code: 'not-a-day', values: { date: annotation.date } })
    const cites = [...new Set(annotation.cites ?? [])]
    checkCites(cites, adrs)
    const directory = await directoryOf(fs)
    const { lines } = annotation
    const anchor = await anchorAt(fs, git, lines.path, lines.start, lines.end)

    const listed = (await fs.list(directory)) ?? []
    const taken = new Set(listed.map((entry) => entry.name.replace(/\.md$/, '').toLowerCase()))
    const texts = await Promise.all(
      listed
        .filter((entry) => entry.kind === 'file' && entry.name.endsWith('.md'))
        .map(async (entry) => (await fs.readText(joinPath(directory, entry.name))) ?? '')
    )
    const eol = mostOf(texts)

    const name = anchor.path.slice(anchor.path.lastIndexOf('/') + 1)
    const slug = slugOf(annotation.text) || slugOf(name) || 'annotation'
    const stem = `${annotation.date.replaceAll('-', '')}-${slug}`
    let id = stem
    for (let count = 2; taken.has(id.toLowerCase()); count++) id = `${stem}-${count}`

    const frontmatter = [
      '---',
      `type: ${annotation.type}`,
      'state: open',
      `author: ${formatScalar(author)}`,
      `date: ${annotation.date}`,
      'anchor:',
      `  path: ${formatScalar(anchor.path)}`,
      `  lines: ${linesText(anchor)}`,
      ...(anchor.commit ? [`  commit: ${anchor.commit}`] : []),
      ...(cites.length > 0 ? [`cites: [${cites.map((adr) => formatScalar(adr)).join(', ')}]`] : []),
      '---',
      ''
    ]
    const text = inEol(annotation.text, eol)
    await pending.create(
      joinPath(directory, `${id}.md`),
      frontmatter.map((line) => line + eol).join('') +
        quoteLines(anchor, eol) +
        (text === '' ? '' : eol + text)
    )
    return { id }
  })
}

export interface NewReply {
  readonly author: string
  /** `YYYY-MM-DD`: the day it is written, as its `date`. */
  readonly date: string
  /**
   * The moment it is written, ISO 8601 with `Z` or an offset — `2026-11-03T14:15:02Z`, as
   * `Date.prototype.toISOString` gives it. In UTC, to the second, it names the Reply's file.
   */
  readonly time: string
  /** Markdown. */
  readonly text: string
}

/** A moment as a Reply's file name starts with it: `20261103T141502Z`, in UTC. */
function stampOf(time: string): string | undefined {
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      time
    )
  if (!match || !isDay(match[1]!)) return undefined
  const utc = new Date(Date.parse(time))
  if (Number.isNaN(utc.getTime()) || utc.getUTCFullYear() > 9999) return undefined
  return utc
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/[-:]/g, '')
}

/**
 * Plan a Reply to an Annotation: a file of its own beside it, named by the moment it is written
 * and its author, so that Replies written on two branches meet in a merge without a conflict.
 * The Annotation is not touched.
 */
export function planReply(fs: FileSystem, id: string, reply: NewReply): Promise<Plan> {
  return planning(fs, async (pending) => {
    const author = reply.author.trim()
    if (author === '') refuse({ code: 'reply-needs-author', values: {} })
    if (reply.text.trim() === '') refuse({ code: 'reply-needs-text', values: {} })
    if (!isDay(reply.date)) refuse({ code: 'not-a-day', values: { date: reply.date } })
    const stamp = stampOf(reply.time)
    if (stamp === undefined) refuse({ code: 'not-a-time', values: { time: reply.time } })
    const { path, text } = await annotationFile(fs, id)
    const folder = path.slice(0, -'.md'.length)
    const taken = new Set(
      ((await fs.list(folder)) ?? []).map((entry) => entry.name.replace(/\.md$/, '').toLowerCase())
    )
    const stem = `${stamp}-${slugOf(author) || 'reply'}`
    let name = stem
    for (let count = 2; taken.has(name.toLowerCase()); count++) name = `${stem}-${count}`
    const eol = eolOf(text)
    const lines = ['---', `author: ${formatScalar(author)}`, `date: ${reply.date}`, '---', '']
    await pending.create(
      joinPath(folder, `${name}.md`),
      lines.map((line) => line + eol).join('') + inEol(reply.text, eol)
    )
    return {}
  })
}

/** Plan Resolve (`resolved`) or Reopen (`open`): the `state` of the Annotation, where it stands. */
export function planState(fs: FileSystem, id: string, state: 'open' | 'resolved'): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path, text } = await annotationFile(fs, id)
    const { annotation } = readAnnotation(id, path, text, [])
    if (!annotation.writable) refuse({ code: 'annotation-unreadable', values: { path } })
    if (annotation.state === state) {
      refuse({ code: state === 'resolved' ? 'resolved-already' : 'open-already', values: { id } })
    }
    await pending.write(path, (view) => setValue(frontmatterIn(view, path), 'state', state))
    return {}
  })
}

/** The edits that give an Annotation a new Anchor: its three keys, and its quoted lines. */
function anchorEdits(view: FileView, path: string, anchor: Anchor): TextEdit[] {
  const fm = frontmatterIn(view, path)
  const { text, eol } = view
  const edits: TextEdit[] = []
  const existing = fm.pair('anchor')
  const old = readAnnotation('', path, text, []).annotation.anchor

  const value = existing?.value
  if (!existing || value === null || (isScalar(value) && value.value === null)) {
    // No anchor, or `anchor:` with nothing in it: the three keys, under the key where it stands.
    const lines = [
      `path: ${formatScalar(anchor.path)}`,
      `lines: ${linesText(anchor)}`,
      ...(anchor.commit ? [`commit: ${anchor.commit}`] : [])
    ]
    edits.push(
      ...(existing
        ? fillEmptyKey(fm, existing, lines)
        : [insertKey(fm, 'anchor', ['anchor:', ...lines.map((line) => `  ${line}`)])])
    )
  } else {
    if (!fm.anchor()) refuse({ code: 'key-by-hand', values: { path, key: 'anchor' } })
    edits.push(...setValue(fm, 'path', anchor.path, 'anchor'))
    edits.push(...setValue(fm, 'lines', linesText(anchor), 'anchor', asText))
    if (anchor.commit) edits.push(...setValue(fm, 'commit', anchor.commit, 'anchor', asText))
    else edits.push(...removeKey(fm, 'commit', 'anchor'))
  }

  const block = quoteBlock(text, view.bodyStart)
  if (!block) {
    // No quoted lines to replace: the block comes first in the body, after a blank line and
    // before one, as a new Annotation has it.
    const rest = text.slice(view.bodyStart)
    const blank = rest === '' || lineAt(text, view.bodyStart).content.trim() === ''
    edits.push({
      start: view.bodyStart,
      end: view.bodyStart,
      insert: eol + quoteLines(anchor, eol) + (blank ? '' : eol)
    })
    return edits
  }
  const keeps = !anchor.quote.some((line) => closes(block.fence, line))
  const fence = keeps ? block.fence : fenceFor(anchor.quote)
  const oldExtension = old ? extensionOf(old.path) : ''
  const info =
    block.info.trim() !== '' &&
    block.info.trim() === oldExtension &&
    extensionOf(anchor.path) !== oldExtension
      ? extensionOf(anchor.path)
      : block.info
  if (fence !== block.fence || info !== block.info) {
    edits.push({ start: block.open.start, end: block.open.end, insert: fence + info })
  }
  const from = block.open.next
  edits.push({
    start: from,
    end: block.close.start,
    insert: anchor.quote.map((line) => line + eol).join('')
  })
  if (fence !== block.fence) {
    edits.push({ start: block.close.start, end: block.close.end, insert: fence })
  }
  return edits
}

/** Write a new Anchor into an Annotation. */
async function writeAnchor(
  pending: PendingFiles<FileView>,
  path: string,
  anchor: Anchor
): Promise<void> {
  const text = await pending.read(path)
  if (!viewFile(text).frontmatter || !readAnnotation('', path, text, []).annotation.writable) {
    refuse({ code: 'annotation-unreadable', values: { path } })
  }
  checkQuote(anchor)
  await pending.write(path, (view) => anchorEdits(view, path, anchor))
}

/**
 * Plan Attach again: the Annotation gets the lines a person selected, as they are on disk now,
 * with HEAD's commit.
 */
export function planAttach(
  fs: FileSystem,
  git: Pick<Git, 'headCommit'>,
  id: string,
  lines: SelectedLines
): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path } = await annotationFile(fs, id)
    await writeAnchor(pending, path, await anchorAt(fs, git, lines.path, lines.start, lines.end))
    return {}
  })
}

/**
 * Plan Update the Anchor: write the place a moved Annotation is found at into its Anchor, with
 * the lines as the disk has them there now and the commit it was found at.
 */
export function planUpdateAnchor(fs: FileSystem, id: string, found: Found): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path } = await annotationFile(fs, id)
    if (found.kind !== 'moved') refuse({ code: 'not-moved', values: { id } })
    const { anchor } = found
    const commit = { headCommit: async () => anchor.commit }
    await writeAnchor(
      pending,
      path,
      await anchorAt(fs, commit, anchor.path, anchor.start, anchor.end)
    )
    return {}
  })
}

/** Plan Cite: an ADR added to `cites`. */
export function planCite(
  fs: FileSystem,
  id: string,
  adr: string,
  adrs: readonly AdrReference[]
): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path, text } = await annotationFile(fs, id)
    const { annotation } = readAnnotation(id, path, text, [])
    if (!annotation.writable) refuse({ code: 'annotation-unreadable', values: { path } })
    if (annotation.cites.includes(adr)) refuse({ code: 'cited-already', values: { id, adr } })
    checkCites([adr], adrs)
    await pending.write(path, (view) => addToList(frontmatterIn(view, path), 'cites', adr))
    return {}
  })
}

/** Plan Uncite: an ADR taken out of `cites`, where it stands. */
export function planUncite(fs: FileSystem, id: string, adr: string): Promise<Plan> {
  return planning(fs, async (pending) => {
    const { path, text } = await annotationFile(fs, id)
    const { annotation } = readAnnotation(id, path, text, [])
    if (!annotation.writable) refuse({ code: 'annotation-unreadable', values: { path } })
    if (!annotation.cites.includes(adr)) refuse({ code: 'not-cited', values: { id, adr } })
    await pending.write(path, (view) => removeFromList(frontmatterIn(view, path), 'cites', adr))
    return {}
  })
}

/** Plan the Repair of a Problem: a Trace to an ADR that does not exist is taken out. */
export function planRepair(fs: FileSystem, problem: ReviewProblem): Promise<Plan> {
  if (problem.kind === 'unknown-adr') return planUncite(fs, problem.annotation, problem.adr)
  const said: ReviewSaid = { code: 'without-repair', values: {} }
  return planning(fs, async () => refuse(said))
}
