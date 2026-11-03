import {
  CONFIG_PATH,
  joinPath,
  normalizePath,
  openConfig,
  type Config,
  type FileSystem
} from '@adr-tool/kernel'
import { readAnnotation, readReply, type Annotation, type Reply } from './annotation'
import type { ReviewProblem } from './problems'

/** The key of `.arch/config.yml` that is Review's own (docs/configuration.md). */
export const ANNOTATIONS_KEY = 'annotations'

/** Where the Annotations are when the configuration does not say (docs/review-format.md, section 1). */
export const DEFAULT_ANNOTATIONS_DIRECTORY = 'docs/architecture/annotations'

export interface AnnotationsLocation {
  /**
   * The directory of the Annotations; `undefined` while `.arch/config.yml` cannot be read, or
   * its key `annotations` cannot be used.
   */
  readonly directory: string | undefined
  /** What is wrong with the key `annotations`: while there is something, no Annotation is read. */
  readonly problems: readonly ReviewProblem[]
}

/**
 * Where the settings say the Annotations are. Review reads its own key and no other. While the
 * file cannot be read, no Annotation is read or written, and the Problem is the file's: the
 * kernel's, which the caller reports once for every module (docs/configuration.md).
 */
export function readLocation(config: Config): AnnotationsLocation {
  if (!config.readable) return { directory: undefined, problems: [] }
  const setting = config.settings.get(ANNOTATIONS_KEY)
  if (setting === undefined || setting.value === null) {
    return { directory: DEFAULT_ANNOTATIONS_DIRECTORY, problems: [] }
  }
  // A path is a text: `123` or `true` is a number or a truth value as YAML reads it, and other
  // tools that read the file would take it so.
  const directory = typeof setting.value === 'string' ? normalizePath(setting.value) : undefined
  if (directory === undefined || directory === '') {
    return {
      directory: undefined,
      problems: [{ kind: 'invalid-annotations-directory', path: CONFIG_PATH, line: setting.line }]
    }
  }
  return { directory, problems: [] }
}

/**
 * Where the Annotations of the repository are. `config` is `.arch/config.yml` as the caller read
 * it for every module; without it, it is read here. Never writes.
 */
export async function locateAnnotations(
  fs: FileSystem,
  config?: Config
): Promise<AnnotationsLocation> {
  return readLocation(config ?? (await openConfig(fs)))
}

/**
 * Whether a text is the ID of an Annotation the suite reads: the name of its file without `.md`,
 * and the name of the directory of its Replies, on every system (docs/review-format.md,
 * section 1). One part of a path, inside the directory: no `/` or `\`, no control character,
 * not ending in a dot — `.` and `..` among them — or a space, which Windows drops from a name.
 * `README` is the directory's own file.
 */
export function isAnnotationId(id: string): boolean {
  return /^[^/\\\p{Cc}]*[^/\\\p{Cc}. ]$/u.test(id) && id.toLowerCase() !== 'readme'
}

export interface AnnotationsReading extends AnnotationsLocation {
  /** By their IDs; empty while the directory is not looked into. */
  readonly annotations: readonly Annotation[]
  /**
   * What is wrong with the key `annotations` and with each file. Orphaned Annotations are found
   * apart (`findAnchors`); a `.arch/config.yml` that cannot be read is the kernel's Problem.
   */
  readonly problems: readonly ReviewProblem[]
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

/**
 * Read the Annotations of a repository with their Replies (docs/review-format.md, sections 1 to
 * 3). `config` is `.arch/config.yml` as the caller read it for every module; without it, it is
 * read here. Never throws, never writes: what cannot be read becomes a Problem.
 */
export async function readAnnotations(
  fs: FileSystem,
  config?: Config
): Promise<AnnotationsReading> {
  const location = await locateAnnotations(fs, config)
  const { directory } = location
  if (directory === undefined) return { ...location, annotations: [] }
  const entries = [...((await fs.list(directory)) ?? [])].sort(byName)
  const files = entries.filter(
    (entry) =>
      entry.kind === 'file' &&
      entry.name.endsWith('.md') &&
      isAnnotationId(entry.name.slice(0, -'.md'.length))
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
