import { isMap, isScalar, parseDocument } from 'yaml'
import { joinPath, normalizePath, type FileSystem } from '@adr-tool/kernel'
import { readAnnotation, readReply, scalarText, type Annotation, type Reply } from './annotation'
import type { ReviewProblem } from './problems'

/** Where a repository says its Annotations are; other modules keep their settings beside it. */
export const CONFIGURATION_PATH = '.arch/config.yml'

/** Where the Annotations are when the configuration does not say (docs/review-format.md, section 1). */
export const DEFAULT_ANNOTATIONS_DIRECTORY = 'docs/architecture/annotations'

/** The directory of the Annotations, or the Problem that keeps them from being read. */
export type AnnotationsDirectory =
  | { readonly directory: string }
  | { readonly directory?: undefined; readonly problem: ReviewProblem }

/** Read `annotations` from `.arch/config.yml`. Never writes. */
export async function annotationsDirectory(fs: FileSystem): Promise<AnnotationsDirectory> {
  const text = await fs.readText(CONFIGURATION_PATH)
  if (text === undefined) return { directory: DEFAULT_ANNOTATIONS_DIRECTORY }
  const doc = parseDocument(text)
  const unreadable = (
    detail: Extract<ReviewProblem, { kind: 'unreadable-configuration' }>['detail']
  ): AnnotationsDirectory => ({
    problem: { kind: 'unreadable-configuration', path: CONFIGURATION_PATH, detail } as const
  })
  if (doc.errors.length > 0) {
    const message = doc.errors[0]!.message.split('\n')[0]!.replace(/:$/, '')
    return unreadable({ code: 'config-not-yaml', values: { message } })
  }
  if (doc.contents === null) return { directory: DEFAULT_ANNOTATIONS_DIRECTORY }
  if (!isMap(doc.contents)) return unreadable({ code: 'config-not-mapping', values: {} })
  const value = doc.contents.items.find((pair) => scalarText(pair.key) === 'annotations')?.value
  if (value === undefined || value === null || (isScalar(value) && value.value === null)) {
    return { directory: DEFAULT_ANNOTATIONS_DIRECTORY }
  }
  const written = isScalar(value) ? scalarText(value) : undefined
  const directory = written === undefined ? undefined : normalizePath(written)
  if (directory === undefined || directory === '') {
    const shown = written ?? String(doc.contents.get('annotations'))
    return {
      problem: { kind: 'invalid-annotations-directory', path: CONFIGURATION_PATH, value: shown }
    }
  }
  return { directory }
}

export interface AnnotationsReading {
  /** Where the Annotations are; `undefined` while the configuration cannot be used. */
  readonly directory: string | undefined
  /** By their IDs. */
  readonly annotations: readonly Annotation[]
  /** What is wrong with the configuration and with each file. Orphaned Annotations are found apart (`findAnchors`). */
  readonly problems: readonly ReviewProblem[]
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

/**
 * Read the Annotations of a repository with their Replies (docs/review-format.md, sections 1 to
 * 3). Never throws, never writes: what cannot be read becomes a Problem.
 */
export async function readAnnotations(fs: FileSystem): Promise<AnnotationsReading> {
  const where = await annotationsDirectory(fs)
  if (where.directory === undefined) {
    return { directory: undefined, annotations: [], problems: [where.problem] }
  }
  const { directory } = where
  const entries = [...((await fs.list(directory)) ?? [])].sort(byName)
  const files = entries.filter(
    (entry) =>
      entry.kind === 'file' &&
      entry.name.endsWith('.md') &&
      entry.name.toLowerCase() !== 'readme.md'
  )
  const ids = new Set(files.map((entry) => entry.name.slice(0, -'.md'.length)))

  const annotations: Annotation[] = []
  const problems: ReviewProblem[] = []
  for (const entry of files) {
    const id = entry.name.slice(0, -'.md'.length)
    const path = joinPath(directory, entry.name)
    const text = await fs.readText(path)
    if (text === undefined) continue
    const replies: Reply[] = []
    const replyProblems: ReviewProblem[] = []
    const folder = joinPath(directory, id)
    for (const reply of [...((await fs.list(folder)) ?? [])].sort(byName)) {
      if (reply.kind !== 'file' || !reply.name.endsWith('.md')) continue
      const replyPath = joinPath(folder, reply.name)
      const replyText = await fs.readText(replyPath)
      if (replyText === undefined) continue
      const read = readReply(replyPath, id, replyText)
      replies.push(read.reply)
      replyProblems.push(...read.problems)
    }
    const read = readAnnotation(id, path, text, replies)
    annotations.push(read.annotation)
    problems.push(...read.problems, ...replyProblems)
  }

  // A directory of Replies whose Annotation is not there: removed by hand, or never written.
  for (const entry of entries) {
    if (entry.kind !== 'directory' || ids.has(entry.name)) continue
    const folder = joinPath(directory, entry.name)
    const held = (await fs.list(folder)) ?? []
    if (held.some((file) => file.kind === 'file' && file.name.endsWith('.md'))) {
      problems.push({ kind: 'replies-without-annotation', path: folder, annotation: entry.name })
    }
  }
  return { directory, annotations, problems }
}
